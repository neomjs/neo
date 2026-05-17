import fs from 'fs';
import path from 'path';

const files = process.argv.slice(2);
let hasErrors = false;

for (const file of files) {
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
