#!/usr/bin/env node
/**
 * @file checkMemberNames.mjs
 * @description Guard against JSDoc `@member` lines that name a different config than the one
 *              declared directly below the doc block. The API docs are generated from the
 *              `@member` line, so a block that names a neighbouring config documents the wrong
 *              thing (see neomjs/neo#21862: four such lines in `src/form/field/`).
 *
 *              The rule (CODING_GUIDELINES.md, modelled on `src/core/Base.mjs`): inside a
 *              `static config` block, the `@member` name must name the config key declared
 *              on the line right after the closing doc-block marker. A single trailing `_`
 *              (reactive config) is normalised away before comparing: across `src/` both
 *              spellings are used (`isTouched_` in `Base.mjs`, `headers` above `headers_`
 *              in `FileUpload.mjs`), so the underscore alone is not the defect this guard
 *              hunts — naming a *different* config is.
 *
 *              Scope is `src/form/field/` by default: the folder the issue covers. Pass another
 *              directory as the first CLI argument to scan it instead.
 *
 * @usage `node buildScripts/util/checkMemberNames.mjs [dir]`
 */

import {readdirSync, readFileSync} from 'node:fs';
import path                        from 'node:path';
import process                     from 'node:process';
import {fileURLToPath}             from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export const DEFAULT_DIR = path.resolve(__dirname, '../../src/form/field');

/**
 * Finds `@member` lines whose name differs from the config key declared on the next
 * non-empty line after the doc block.
 *
 * @param {String} source File content.
 * @returns {Object[]} Hits: `{line, key, member}` — `line` is 1-based, `key` is the config
 *                     declared below the block, `member` is the name in the `@member` line.
 */
export function findMismatchedMembers(source) {
    const lines = source.split('\n');
    const hits  = [];

    for (let i = 0; i < lines.length; i++) {
        const keyMatch = lines[i].match(/^\s*([A-Za-z_$][\w$]*)\s*:\s/);
        if (!keyMatch) continue;

        // Walk back over blank lines to the end of the doc block directly above, if any.
        let end = i - 1;
        while (end >= 0 && lines[end].trim() === '') end--;
        if (end < 0 || !lines[end].trim().endsWith('*/')) continue;

        // Walk back to the opening `/**` of that block.
        let start = end;
        while (start >= 0 && !lines[start].includes('/**')) start--;
        if (start < 0) continue;

        // The last `@member` line inside the block is the one the docs build reads.
        let memberLine = null, memberLineNo = 0;
        for (let n = start; n <= end; n++) {
            if (/@member\b/.test(lines[n])) {
                memberLine   = lines[n];
                memberLineNo = n;
            }
        }
        if (!memberLine) continue;

        const nameMatch = memberLine.match(/@member\s+(?:\{[^}]*\}\s*)?([A-Za-z_$][\w$]*)/);
        if (!nameMatch) continue;

        // A reactive config's trailing `_` is normalised away: both spellings exist in src/.
        const normalize = name => name.replace(/_$/, '');
        if (normalize(nameMatch[1]) !== normalize(keyMatch[1])) {
            hits.push({
                line  : memberLineNo + 1,
                key   : keyMatch[1],
                member: nameMatch[1]
            });
        }
    }

    return hits;
}

/**
 * Scans every `.mjs` file in `dir` for mismatched `@member` lines.
 *
 * @param {String} dir Absolute directory path.
 * @returns {Object[]} Hits with an added `file` property (path relative to `dir`).
 */
export function scanDir(dir) {
    const hits = [];

    for (const entry of readdirSync(dir)) {
        if (!entry.endsWith('.mjs')) continue;

        const file = path.join(dir, entry);
        for (const hit of findMismatchedMembers(readFileSync(file, 'utf8'))) {
            hits.push({...hit, file: entry});
        }
    }

    return hits;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
    const dir  = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_DIR;
    const hits = scanDir(dir);

    if (hits.length > 0) {
        console.error(`check-member-names: ${hits.length} @member line(s) name a different config than the one below them:`);
        for (const hit of hits) {
            console.error(`  ${hit.file}:${hit.line}  @member ... ${hit.member}  but the config below is '${hit.key}'`);
        }
        process.exit(1);
    }

    console.log(`check-member-names: every @member line in ${path.relative(process.cwd(), dir)} names the config below it.`);
}
