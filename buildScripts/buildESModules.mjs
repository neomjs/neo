import fs                   from 'fs-extra';
import path                 from 'path';
import {minify as minifyJs} from 'terser';
import {minifyHtml}         from './util/minifyHtml.mjs';

const
    outputBasePath   = 'dist/esm/',
    // Regex to find import statements with 'node_modules' in the path
    // It captures the entire import statement (excluding the leading 'import') and the path itself.
    regexImport      = /(import(?:\s*(?:[\w*{}\n\r\t, ]+from\s*)?|\s*\(\s*)?)(["'`])((?:(?!\2).)*node_modules(?:(?!\2).)*)\2/g,
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
 *
 * @param {String} inputDir
 * @param {String} outputDir
 * @returns {Promise<void>}
 */
async function minifyDirectory(inputDir, outputDir) {
    if (fs.existsSync(inputDir)) {
        fs.mkdirSync(outputDir, {recursive: true});

        const dirents = fs.readdirSync(inputDir, {recursive: true, withFileTypes: true});

        for (const dirent of dirents) {
            // Intended to skip the docs/output folder, since the content is already minified
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
            }
            // Copy resources folders
            else if (dirent.name === 'resources') {
                const
                    inputPath    = path.join(dirent.path, dirent.name),
                    relativePath = path.relative(inputDir, inputPath),
                    outputPath   = path.join(outputDir, relativePath);

                fs.mkdirSync(path.dirname(outputPath), {recursive: true});

                fs.copySync(inputPath, outputPath);

                // Minify all JSON files inside the copied folder
                const resourcesEntries = fs.readdirSync(outputPath, {recursive: true, withFileTypes: true});

                for (const resource of resourcesEntries) {
                    if (resource.isFile()) {
                        if (resource.name.endsWith('.json')) {
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

            const result = await minifyJs(adjustedContent, {
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
    swContent = fs.readFileSync(path.resolve(root, 'ServiceWorker.mjs'), 'utf8'),
    promises  = [minifyFile(swContent, path.resolve(root, outputBasePath, 'ServiceWorker.mjs'))];

// Execute the minification
inputDirectories.forEach(folder => {
    const outputPath = path.resolve(root, outputBasePath, folder.replace('node_modules/neo.mjs/', ''));

    promises.push(minifyDirectory(path.resolve(root, folder), outputPath)
        .catch(err => {
            console.error('dist/esm Minification failed:', err);
            process.exit(1) // Exit with error code
        })
    )
});

Promise.all(promises).then(() => {
    // Copying the already skipped and minified docs/output folder
    const docsOutputPath = path.resolve(root, 'docs/output');

    if (fs.existsSync(docsOutputPath)) {
        fs.copySync(docsOutputPath, path.resolve(root, outputBasePath, 'docs/output'))
    }

    const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
    console.log(`\nTotal time for dist/esm: ${processTime}s`);
    process.exit()
})
