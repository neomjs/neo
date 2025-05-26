import fs              from 'fs';
import path            from 'path';
import {minify}        from 'terser';
import {fileURLToPath} from 'url';

const
    __filename       = fileURLToPath(import.meta.url),
    __dirname        = path.dirname(__filename),
    inputDirectories = ['apps', 'docs', 'examples', 'src'],
    outputBasePath   = '../dist/esm/';

async function minifyDirectory(inputDir, outputDir) {
    fs.mkdirSync(outputDir, {recursive: true});

    const dirents = fs.readdirSync(inputDir, {recursive: true, withFileTypes: true});

    for (const dirent of dirents) {
        const filePath = path.join(dirent.path, dirent.name);

        if (dirent.isFile() && filePath.endsWith('.mjs')) {
            const
                relativePath = path.relative(inputDir, filePath),
                outputPath   = path.join(outputDir, relativePath),
                code         = fs.readFileSync(filePath, 'utf8');

            try {
                const result = await minify(code, {
                    module: true,
                    compress: {
                        dead_code: true
                    },
                    mangle: {
                        toplevel: true
                    }
                });

                fs.mkdirSync(path.dirname(outputPath), {recursive: true});
                fs.writeFileSync(outputPath, result.code);

                console.log(`Minified: ${filePath} -> ${outputPath}`);
            } catch (e) {
                console.error(`Error minifying ${filePath}:`, e);
            }
        }
    }
}

// Execute the minification
inputDirectories.forEach(folder => {
    minifyDirectory(path.resolve(__dirname, '../' + folder), path.resolve(__dirname, outputBasePath, folder))
        .then(() => console.log('Minification complete.'))
        .catch(err => {
            console.error('Minification failed:', err);
            process.exit(1); // Exit with error code
        });
});
