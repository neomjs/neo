import fs                   from 'fs-extra';
import path                 from 'path';
import * as Terser from 'terser';
import { processHtmlTemplateLiteral } from './util/templateBuildProcessor.mjs';
import { vdomToString } from './util/vdomToString.mjs';
import {minifyHtml}         from './util/minifyHtml.mjs';

const
    outputBasePath   = 'dist/esm/',
    // Regex to find import statements with 'node_modules' in the path
    // It captures the entire import statement (excluding the leading 'import') and the path itself.
    regexImport      = /(import(?:\s*(?:[\w*{}\n\r\t, ]+from\s*)?|\s*\(\s*)?)(["\'`])((?:(?!\2).)*node_modules(?:(?!\2).)*)\2/g,
    root             = path.resolve(),
    requireJson      = path => JSON.parse(fs.readFileSync(path, 'utf-8')),
    packageJson      = requireJson(path.join(root, 'package.json')),
    insideNeo        = packageJson.name.includes('neo.mjs'),
    startDate        = new Date();

/**
 * @param {String} match
 * @param {String} p1 will be "import {marked}    from " (or similar, including the 'import' keyword and everything up to the first quote)
 * @param {String} p2 will be the quote character (', ", or `)
 * @param {String} p3 will be the original path string (e.g., '../../../../node_modules/marked/lib/marked.esm.js')
 * @returns {String}
 */
function adjustImportPathHandler(match, p1, p2, p3) {
    let newPath;

    if (p3.includes('/node_modules/neo.mjs/')) {
        newPath = p3.replace('/node_modules/neo.mjs/', '/')
    } else {
        newPath = '../../' + p3; // Prepend 2 levels up
    }

    // Reconstruct the import statement with the new path
    return p1 + p2 + newPath + p2
}

/**
 * @param {String} content
 * @param {String} outputPath
 * @returns {Promise<void>}
 */
async function minifyFile(content, outputPath) {
    fs.mkdirSync(path.dirname(outputPath), {recursive: true});

    try {
        // Minify JSON files
        if (outputPath.endsWith('.json')) {
            const jsonContent = JSON.parse(content);

            if (outputPath.endsWith('neo-config.json')) {
                Object.assign(jsonContent, {
                    basePath      : '../../' + jsonContent.basePath,
                    environment   : 'dist/esm',
                    mainPath      : './Main.mjs',
                    workerBasePath: jsonContent.basePath + 'src/worker/'
                });

                if (!insideNeo) {
                    jsonContent.appPath = jsonContent.appPath.substring(6)
                }
            }

            fs.writeFileSync(outputPath, JSON.stringify(jsonContent));
            console.log(`Minified JSON: ${outputPath}`)
        }
        // Minify HTML files
        else if (outputPath.endsWith('.html')) {
            const minifiedContent = await minifyHtml(content);

            fs.writeFileSync(outputPath, minifiedContent);
            console.log(`Minified HTML: ${outputPath}`)
        }
        // Minify JS files
        else if (outputPath.endsWith('.mjs')) {
            let adjustedContent = content.replace(regexImport, adjustImportPathHandler);

            const htmlTemplateRegex = /html(`[\s\S]*?`)/g;
            const replacements = [];

            // Find all matches and store their promises
            let match;
            while ((match = htmlTemplateRegex.exec(adjustedContent)) !== null) {
                const templateLiteral = match[1]; // This is the full template literal: `...`
                const templateContent = templateLiteral.substring(1, templateLiteral.length - 1); // Remove backticks

                // Split the templateContent into strings and expressions
                const parts = templateContent.split(/(\${[\s\S]*?})/g); // Split by ${...} expressions

                const strings = [];
                const expressionCodeStrings = [];
                const componentNameMap = {};

                // The first part is always a string
                strings.push(parts[0]);

                for (let i = 1; i < parts.length; i += 2) {
                    const exprPart = parts[i];
                    const stringPart = parts[i + 1] || '';

                    const exprCode = exprPart.substring(2, exprPart.length - 1); // Remove ${ and }
                    expressionCodeStrings.push(exprCode);

                    // Heuristic: If the expression is a single PascalCase identifier, assume it's a component name
                    if (/^[A-Z][a-zA-Z0-9]*$/.test(exprCode.trim())) {
                        componentNameMap[exprCode.trim()] = { __neo_component_name__: exprCode.trim() };
                    }

                    strings.push(stringPart);
                }

                // Store the promise and the original match to replace later
                replacements.push({
                    original: `html${templateLiteral}`,
                    promise: processHtmlTemplateLiteral(strings, expressionCodeStrings, componentNameMap)
                });
            }

            // Await all replacements
            const resolvedReplacements = await Promise.all(replacements.map(r => r.promise));

            // Perform the actual string replacement synchronously
            let currentContent = adjustedContent;
            for (let i = 0; i < replacements.length; i++) {
                // Use our new robust serializer
                const finalVdomString = vdomToString(resolvedReplacements[i]);

                // Create a regex from the original match string, escaping special characters
                const regexToReplace = new RegExp(replacements[i].original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                currentContent = currentContent.replace(regexToReplace, finalVdomString);
            }

            console.log('--- Content before Terser.minify ---');
            console.log(currentContent);
            console.log('------------------------------------');

            const result = await Terser.minify(currentContent, {
                module: true,
                compress: {
                    dead_code: true
                },
                mangle: {
                    toplevel: true
                }
            });

            fs.writeFileSync(outputPath, result.code);
            console.log(`Minified JS: ${outputPath}`)
        }
    } catch (e) {
        console.error(`Error minifying ${outputPath}:`, e)
    }
}

const
    inputFilePath = path.resolve(root, 'examples/functional/templateComponent/Component.mjs'),
    outputFilePath = path.resolve(root, outputBasePath, 'examples/functional/templateComponent/Component.mjs');

minifyFile(fs.readFileSync(inputFilePath, 'utf8'), outputFilePath)
    .then(() => {
        const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
        console.log(`\nTotal time for buildSingleFile: ${processTime}s`);
        process.exit();
    })
    .catch(err => {
        console.error('buildSingleFile failed:', err);
        process.exit(1);
    });