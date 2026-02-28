import fs                   from 'fs-extra';
import path                 from 'path';
import * as Terser          from 'terser';
import {minifyHtml}         from '../util/minifyHtml.mjs';
import {processFileContent} from '../util/astTemplateProcessor.mjs';

const
    outputBasePath = 'dist/esm/',
    regexImport    = /(import(?:\s*(?:[\w*{}\n\r\t, ]+from\s*)?|\s*\(\s*)?)(["`])((?:(?!\2).)*node_modules(?:(?!\2).)*)\2/g,
    root           = path.resolve(),
    requireJson    = path => JSON.parse(fs.readFileSync(path, 'utf-8')),
    packageJson    = requireJson(path.join(root, 'package.json')),
    insideNeo      = packageJson.name.includes('neo.mjs'),
    startDate      = new Date();

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
            if (!dirent.isFile()) {
                continue;
            }

            const currentPath = dirent.parentPath || dirent.path;
            const inputPath = path.join(currentPath, dirent.name);
            const normalizedInput = inputPath.replace(/\\/g, '/');

            if (normalizedInput.includes('/docs/output/')) {
                continue;
            }

            // Exception for devindex app: Do not deploy the data folder.
            if (normalizedInput.includes('/apps/devindex/resources/data/')) {
                continue;
            }

            const relativePath = path.relative(inputDir, inputPath);
            const outputPath   = path.join(outputDir, relativePath);

            if (dirent.name.endsWith('.mjs') || dirent.name.endsWith('.json') || dirent.name.endsWith('.html')) {
                const content = fs.readFileSync(inputPath, 'utf8');
                await minifyFile(content, outputPath);
            } else if (normalizedInput.includes('/resources/')) {
                fs.mkdirSync(path.dirname(outputPath), {recursive: true});
                fs.copyFileSync(inputPath, outputPath);
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
            const result = processFileContent(adjustedContent, outputPath);

            const minifiedResult = await Terser.minify(result.content, {
                module: true,
                compress: {dead_code: true},
                mangle: {toplevel: true}
            });

            fs.writeFileSync(outputPath, minifiedResult.code);
            console.log(`Minified JS: ${outputPath}`)
        }
    } catch (e) {
        console.error(`Error minifying ${outputPath}:`, e)
    }
}

const promises = [];
const swPath = path.resolve(root, 'ServiceWorker.mjs');

if (fs.existsSync(swPath)) {
    promises.push(minifyFile(fs.readFileSync(swPath, 'utf8'), path.resolve(root, outputBasePath, 'ServiceWorker.mjs')));
}

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
