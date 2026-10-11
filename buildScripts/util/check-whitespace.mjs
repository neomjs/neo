import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'node:url';

import {createInheritedFromMergeFilter, resolveGitRoot} from './mergeInheritance.mjs';

// binary artifact classes a TEXT lint must never parse (their bytes read as phantom whitespace)
const BINARY_EXTENSIONS = new Set([
    '.eot', '.gif', '.ico', '.jpeg', '.jpg', '.otf', '.pdf', '.png', '.ttf', '.wasm', '.webp',
    '.woff', '.woff2', '.zip'
]);

// A merge stages every file it brings in, and the sync pipeline's own content legitimately carries
// trailing whitespace — it is how markdown encodes a hard line break, so GitHub discussion bodies
// are full of it. The pipeline commits that content with `--no-verify` for exactly this reason
// (`.github/workflows/data-sync-pipeline.yml`), but that escape is a trusted CI job's; it does not
// extend to a maintainer who later INHERITS those commits through `git merge origin/dev`. Skipping
// inherited files keeps the check on everything actually authored here — including a file
// hand-edited during the merge, which stays authored and stays checked.
const gitRoot     = resolveGitRoot(path.dirname(fileURLToPath(import.meta.url))),
      isInherited = gitRoot ? createInheritedFromMergeFilter(gitRoot) : () => false;

const files     = process.argv.slice(2);
let   hasErrors = false;

for (const file of files) {
    if (BINARY_EXTENSIONS.has(path.extname(file).toLowerCase())) {
        continue;
    }

    if (isInherited(file)) {
        continue;
    }

    try {
        const content = fs.readFileSync(file, 'utf-8');
        const lines   = content.split('\n');

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
