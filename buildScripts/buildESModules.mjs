import {generate}           from 'astring';
import fs                   from 'fs-extra';
import path                 from 'path';
import * as acorn           from 'acorn';
import * as Terser          from 'terser';
import {minifyHtml}         from './util/minifyHtml.mjs';
import { processHtmlTemplateLiteral } from './util/templateBuildProcessor.mjs';

// A simple JSON to AST converter
function jsonToAst(json) {
    if (json === null) {
        return { type: 'Literal', value: null };
    }
    switch (typeof json) {
        case 'string':
            const exprMatch = json.match(/##__NEO_EXPR__(.*)##__NEO_EXPR__##/);
            if (exprMatch) {
                // This is a raw expression, parse it as a standalone expression
                try {
                    const body = acorn.parse(exprMatch[1], {ecmaVersion: 'latest'}).body;
                    if (body.length > 0 && body[0].type === 'ExpressionStatement') {
                        return body[0].expression;
                    }
                } catch (e) {
                    console.error(`Failed to parse expression: ${exprMatch[1]}`, e);
                    // Fallback to literal string if parsing fails
                    return { type: 'Literal', value: json };
                }
            }
            return { type: 'Literal', value: json };
        case 'number':
        case 'boolean':
            return { type: 'Literal', value: json };
        case 'object':
            if (json.__neo_component_name__) {
                return { type: 'Identifier', name: json.__neo_component_name__ };
            }
            if (Array.isArray(json)) {
                return {
                    type: 'ArrayExpression',
                    elements: json.map(jsonToAst)
                };
            }
            const properties = Object.entries(json).map(([key, value]) => {
                const keyNode = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
                    ? { type: 'Identifier', name: key }
                    : { type: 'Literal', value: key };
                return {
                    type: 'Property',
                    key: keyNode,
                    value: jsonToAst(value),
                    kind: 'init',
                    computed: keyNode.type === 'Literal'
                };
            });
            return { type: 'ObjectExpression', properties };
        default:
            return { type: 'Literal', value: null }; // for undefined, function, etc.
    }
}

const
    outputBasePath   = 'dist/esm/',
    regexImport      = /(import(?:\s*(?:[\w*{}\n\r\t, ]+from\s*)?|\s*\(\s*)?)(["\'`])((?:(?!\2).)*node_modules(?:(?!\2).)*)\2/g,
    root             = path.resolve(),
    requireJson      = path => JSON.parse(fs.readFileSync(path, 'utf-8')),
    packageJson      = requireJson(path.join(root, 'package.json')),
    insideNeo        = packageJson.name.includes('neo.mjs'),
    startDate        = new Date();

let inputDirectories;

if (insideNeo) {
    inputDirectories = ['apps', 'docs', 'examples', 'src']
} else {
    inputDirectories = ['apps', 'docs', 'node_modules/neo.mjs/src', 'src']
}

function adjustImportPathHandler(match, p1, p2, p3) {
    let newPath;
    if (p3.includes('/node_modules/neo.mjs/')) {
        newPath = p3.replace('/node_modules/neo.mjs/', '/')
    } else {
        newPath = '../../' + p3;
    }
    return p1 + p2 + newPath + p2
}

async function minifyDirectory(inputDir, outputDir) {
    if (fs.existsSync(inputDir)) {
        fs.mkdirSync(outputDir, {recursive: true});
        const dirents = fs.readdirSync(inputDir, {recursive: true, withFileTypes: true});
        for (const dirent of dirents) {
            if (dirent.path.includes('/docs/output/')) {
                continue
            }
            if (dirent.isFile()) {
                const
                    inputPath    = path.join(dirent.path, dirent.name),
                    relativePath = path.relative(inputDir, inputPath),
                    outputPath   = path.join(outputDir, relativePath),
                    content      = fs.readFileSync(inputPath, 'utf8');
                await minifyFile(content, outputPath)
            } else if (dirent.name === 'resources') {
                const
                    inputPath    = path.join(dirent.path, dirent.name),
                    relativePath = path.relative(inputDir, inputPath),
                    outputPath   = path.join(outputDir, relativePath);
                fs.mkdirSync(path.dirname(outputPath), {recursive: true});
                fs.copySync(inputPath, outputPath);
                const resourcesEntries = fs.readdirSync(outputPath, {recursive: true, withFileTypes: true});
                for (const resource of resourcesEntries) {
                    if (resource.isFile() && resource.name.endsWith('.json')) {
                        const
                            resourcePath = path.join(resource.path, resource.name),
                            content      = fs.readFileSync(resourcePath, 'utf8');
                        fs.writeFileSync(resourcePath, JSON.stringify(JSON.parse(content)))
                    }
                }
            }
        }
    }
}

async function minifyFile(content, outputPath) {
    fs.mkdirSync(path.dirname(outputPath), {recursive: true});

    try {
        if (outputPath.endsWith('.json')) {
            const jsonContent = JSON.parse(content);
            if (outputPath.endsWith('neo-config.json')) {
                Object.assign(jsonContent, {
                    basePath: '../../' + jsonContent.basePath,
                    environment: 'dist/esm',
                    mainPath: './Main.mjs',
                    workerBasePath: jsonContent.basePath + 'src/worker/'
                });
                if (!insideNeo) {
                    jsonContent.appPath = jsonContent.appPath.substring(6)
                }
            }
            fs.writeFileSync(outputPath, JSON.stringify(jsonContent));
            console.log(`Minified JSON: ${outputPath}`)
        } else if (outputPath.endsWith('.html')) {
            const minifiedContent = await minifyHtml(content);
            fs.writeFileSync(outputPath, minifiedContent);
            console.log(`Minified HTML: ${outputPath}`)
        } else if (outputPath.endsWith('.mjs')) {
            let adjustedContent = content.replace(regexImport, adjustImportPathHandler);

            // AST-based processing for html templates
            const ast = acorn.parse(adjustedContent, {ecmaVersion: 'latest', sourceType: 'module'});

            function addParentLinks(node, parent) {
                if (!node || typeof node !== 'object') return;
                node.parent = parent;
                for (const key in node) {
                    if (key === 'parent') continue;
                    const child = node[key];
                    if (Array.isArray(child)) {
                        child.forEach(c => addParentLinks(c, node));
                    } else {
                        addParentLinks(child, node);
                    }
                }
            }
            addParentLinks(ast, null);

            const nodesToProcess = [];
            function walk(node) {
                if (!node) return;
                nodesToProcess.push(node);
                Object.entries(node).forEach(([key, value]) => {
                    if (key === 'parent') return;
                    if (Array.isArray(value)) {
                        value.forEach(child => walk(child));
                    } else if (typeof value === 'object' && value !== null) {
                        walk(value);
                    }
                });
            }
            walk(ast);

            let hasChanges = false;
            const templatePromises = [];

            for (const node of nodesToProcess) {
                if (node.type === 'TaggedTemplateExpression' && node.tag.type === 'Identifier' && node.tag.name === 'html') {
                    hasChanges = true;

                    let current = node;
                    while (current.parent) {
                        // Handle class methods: class MyClass { render() { ... } }
                        if (current.parent.type === 'MethodDefinition' && current.parent.key.name === 'render') {
                            current.parent.key.name = 'createVdom';
                            console.log(`Renamed render() to createVdom() in ${outputPath}`);
                            break;
                        }
                        // Handle object properties: { render: function() { ... } } or { render() { ... } }
                        if (current.parent.type === 'Property' && current.parent.key.name === 'render') {
                            current.parent.key.name = 'createVdom';
                            console.log(`Renamed render property to createVdom() in ${outputPath}`);
                            break;
                        }
                        current = current.parent;
                    }

                    const templateLiteral = node.quasi;
                    const strings = templateLiteral.quasis.map(q => q.value.cooked);
                    const expressionCodeStrings = templateLiteral.expressions.map(expr => adjustedContent.substring(expr.start, expr.end));

                    const componentNameMap = {};
                    expressionCodeStrings.forEach(exprCode => {
                        if (/^[A-Z][a-zA-Z0-9]*$/.test(exprCode.trim())) {
                            componentNameMap[exprCode.trim()] = {__neo_component_name__: exprCode.trim()};
                        }
                    });

                    const promise = processHtmlTemplateLiteral(strings, expressionCodeStrings, componentNameMap)
                        .then(vdom => {
                            const vdomAst = jsonToAst(vdom);
                            for (const key in node.parent) {
                                if (node.parent[key] === node) {
                                    node.parent[key] = vdomAst;
                                    break;
                                } else if (Array.isArray(node.parent[key])) {
                                    const index = node.parent[key].indexOf(node);
                                    if (index > -1) {
                                        node.parent[key][index] = vdomAst;
                                        break;
                                    }
                                }
                            }
                        });

                    templatePromises.push(promise);
                }
            }

            await Promise.all(templatePromises);

            let currentContent = hasChanges ? generate(ast) : adjustedContent;

            const result = await Terser.minify(currentContent, {
                module: true,
                compress: {dead_code: true},
                mangle: {toplevel: true}
            });

            fs.writeFileSync(outputPath, result.code);
            console.log(`Minified JS: ${outputPath}`)
        }
    } catch (e) {
        console.error(`Error minifying ${outputPath}:`, e)
    }
}

const
    swContent = fs.readFileSync(path.resolve(root, 'ServiceWorker.mjs'), 'utf8'),
    promises  = [minifyFile(swContent, path.resolve(root, outputBasePath, 'ServiceWorker.mjs'))];

inputDirectories.forEach(folder => {
    const outputPath = path.resolve(root, outputBasePath, folder.replace('node_modules/neo.mjs/', ''));
    promises.push(minifyDirectory(path.resolve(root, folder), outputPath)
        .catch(err => {
            console.error('dist/esm Minification failed:', err);
            process.exit(1)
        })
    )
});

Promise.all(promises).then(() => {
    const docsOutputPath = path.resolve(root, 'docs/output');
    if (fs.existsSync(docsOutputPath)) {
        fs.copySync(docsOutputPath, path.resolve(root, outputBasePath, 'docs/output'))
    }
    const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
    console.log(`\nTotal time for dist/esm: ${processTime}s`);
    process.exit()
})