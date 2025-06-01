import fs                   from 'fs-extra';
import path                 from 'path';
import {minify as minifyJs} from 'terser';
import {minifyHtml}         from './util/minifyHtml.mjs';
import {fileURLToPath}      from 'url';

const
    __filename       = fileURLToPath(import.meta.url),
    __dirname        = path.dirname(__filename),
    inputDirectories = ['apps', 'docs', 'examples', 'src'],
    outputBasePath   = '../dist/esm/';

async function minifyDirectory(inputDir, outputDir) {
    if (fs.existsSync(inputDir)) {
        fs.mkdirSync(outputDir, {recursive: true});

        const dirents = fs.readdirSync(inputDir, {recursive: true, withFileTypes: true});

        for (const dirent of dirents) {
            if (dirent.isFile()) {
                const
                    inputPath    = path.join(dirent.path, dirent.name),
                    relativePath = path.relative(inputDir, inputPath),
                    outputPath   = path.join(outputDir, relativePath),
                    content      = fs.readFileSync(inputPath, 'utf8');

                fs.mkdirSync(path.dirname(outputPath), {recursive: true});

                try {
                    // Minify JSON files
                    if (dirent.name.endsWith('.json')) {
                        const jsonContent = JSON.parse(content);

                        if (dirent.name === 'neo-config.json') {
                            jsonContent.environment = 'dist/esm';
                        }

                        fs.writeFileSync(outputPath, JSON.stringify(jsonContent));
                        console.log(`Minified JSON: ${inputPath} -> ${outputPath}`);
                    }
                    // Minify HTML files
                    else if (dirent.name.endsWith('.html')) {
                        const minifiedContent = await minifyHtml(content);

                        fs.writeFileSync(outputPath, minifiedContent);
                        console.log(`Minified HTML: ${inputPath} -> ${outputPath}`);
                    }
                    // Minify JS files
                    else if (dirent.name.endsWith('.mjs')) {
                        const result = await minifyJs(content, {
                            module: true,
                            compress: {
                                dead_code: true
                            },
                            mangle: {
                                toplevel: true
                            }
                        });

                        fs.writeFileSync(outputPath, result.code);
                        console.log(`Minified JS: ${inputPath} -> ${outputPath}`);
                    }
                } catch (e) {
                    console.error(`Error minifying ${inputPath}:`, e);
                }
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

                            fs.writeFileSync(resourcePath, JSON.stringify(JSON.parse(content)));
                        }
                    }
                }
            }
        }
    }
}

const promises = [];

// Execute the minification
inputDirectories.forEach(folder => {
    promises.push(minifyDirectory(path.resolve(__dirname, '../' + folder), path.resolve(__dirname, outputBasePath, folder))
        .catch(err => {
            console.error('Minification failed:', err);
            process.exit(1) // Exit with error code
        })
    );
});

Promise.all(promises).then(() => {
    console.log('Minification complete.');
    process.exit()
});
