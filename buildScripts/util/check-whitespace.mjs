import fs from 'fs';
import path from 'path';

// binary artifact classes a TEXT lint must never parse (their bytes read as phantom whitespace)
const BINARY_EXTENSIONS = new Set([
    '.eot', '.gif', '.ico', '.jpeg', '.jpg', '.otf', '.pdf', '.png', '.ttf', '.wasm', '.webp',
    '.woff', '.woff2', '.zip'
]);

const files = process.argv.slice(2);
let hasErrors = false;

for (const file of files) {
    if (BINARY_EXTENSIONS.has(path.extname(file).toLowerCase())) {
        continue;
    }

    try {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
            if (line.match(/[ \t]+$/)) {
                console.error(`Trailing whitespace found in ${file}:${index + 1}`);
                hasErrors = true;
            }
        });
    } catch (err) {
        console.error(`Error reading file ${file}:`, err);
    }
}

if (hasErrors) {
    process.exit(1);
}
