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

// `--fix` strips what the check reports, for the case this script otherwise creates: touching one line
// of a file that predates the hook stages the whole file, and every historical trailing space becomes a
// blocker on an unrelated change. Hand-editing dozens of them is where the time goes, and a hand edit
// across a long file is likelier to corrupt it than a mechanical pass.
//
// It fixes only what the check already rejects, so it can never introduce a violation. Note that in
// Markdown two or more trailing spaces encode a hard line break (see the inheritance note above) — such
// a line is already an error under this policy, and the merge-inheritance skip is what protects content
// where the break is meant. Both skips below therefore apply to the fix exactly as they do to the check.
const fix   = process.argv.includes('--fix'),
      files = process.argv.slice(2).filter(arg => arg !== '--fix');
let   fixedCount = 0,
      hasErrors  = false;

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

        if (fix) {
            const stripped = lines.map(line => line.replace(/[ \t]+$/, '')),
                  changed  = stripped.reduce((sum, line, index) => sum + (line === lines[index] ? 0 : 1), 0);

            if (changed > 0) {
                fs.writeFileSync(file, stripped.join('\n'), 'utf-8');
                console.log(`Stripped trailing whitespace from ${changed} line(s) in ${file}`);
                fixedCount += changed;
            }

            continue;
        }

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

if (fix) {
    console.log(`check-whitespace --fix: ${fixedCount} line(s) across ${files.length} file(s).`);
} else if (hasErrors) {
    process.exit(1);
}
