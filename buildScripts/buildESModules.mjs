import fs              from 'fs';
import path            from 'path';
import {minify}        from 'terser';
import {fileURLToPath} from 'url';

// Helper to get __dirname equivalent in ES modules
const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename);

// Define input and output directories relative to your project root
// Adjust these paths as needed for your project structure
const INPUT_BASE_DIR  = path.resolve(__dirname, '../src');
const OUTPUT_BASE_DIR = path.resolve(__dirname, '../dist/esm/src');

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
minifyDirectory(INPUT_BASE_DIR, OUTPUT_BASE_DIR)
    .then(() => console.log('Minification complete.'))
    .catch(err => {
        console.error('Minification failed:', err);
        process.exit(1); // Exit with error code
    });
