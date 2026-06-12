import {test, expect} from '@playwright/test';
import fs   from 'fs/promises';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const REPO_ROOT  = path.resolve(__dirname, '../../../../../..');

const DAEMON_DIR = path.join(REPO_ROOT, 'ai/daemons');

const NEO_TEAM_IDENTITY_LITERAL_RE   = /['"`]@neo-(?:opus-4-7|gpt|gemini-3-1-pro)['"`]/g;
const NEO_TEAM_PROJECT_LITERAL_RE    = /['"`]Project 12['"`]|['"`]v13['"`]|['"`]release:v\d+['"`]/g;
const OPERATOR_ABSOLUTE_PATH_RE      = /\/Users\/Shared\/github\/neomjs\/neo|\/Users\/tobiasuhlig/g;

/**
 * Recursively walks a directory and returns absolute paths for files matching the extensions filter.
 * Skips `node_modules`, `dist`, `.git`, and any `.neo-ai-data` substrate directories so the scan
 * targets active source code only.
 */
async function walkSourceFiles(rootDir, extensions = ['.mjs', '.js', '.cjs']) {
    const results = [];

    async function recurse(dir) {
        let entries;
        try {
            entries = await fs.readdir(dir, {withFileTypes: true});
        } catch {
            return;
        }

        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git' || entry.name === '.neo-ai-data') {
                    continue;
                }
                await recurse(full);
            } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
                results.push(full);
            }
        }
    }

    await recurse(rootDir);
    return results;
}

/**
 * Strips block comments and line comments from JS-shaped source while preserving string literals,
 * so source-grep invariants don't false-positive against JSDoc / inline-comment mentions of the
 * patterns they're guarding against. String-literal content is deliberately preserved because
 * AC1-3 specifically target string-literal occurrences (e.g., `'@neo-opus-4-7'` would be a
 * violation, but a comment mentioning the same handle would not). Output preserves line structure
 * for line-aware regex anchors.
 */
function stripCommentsAndStrings(source) {
    let out = '';
    let i = 0;
    const len = source.length;

    while (i < len) {
        const c = source[i];
        const next = source[i + 1];

        if (c === '/' && next === '*') {
            const end = source.indexOf('*/', i + 2);
            if (end === -1) break;
            for (let j = i; j < end + 2; j++) {
                out += source[j] === '\n' ? '\n' : ' ';
            }
            i = end + 2;
            continue;
        }

        if (c === '/' && next === '/') {
            const end = source.indexOf('\n', i);
            const stop = end === -1 ? len : end;
            for (let j = i; j < stop; j++) out += ' ';
            i = stop;
            continue;
        }

        if (c === '\'' || c === '"' || c === '`') {
            const quote = c;
            out += quote;
            i++;
            while (i < len) {
                out += source[i];
                if (source[i] === '\\') {
                    if (i + 1 < len) {
                        out += '';
                        i += 1;
                    }
                    i++;
                    continue;
                }
                if (source[i] === quote) {
                    i++;
                    break;
                }
                i++;
            }
            continue;
        }

        out += c;
        i++;
    }
    return out;
}

/**
 * Scans the source files for a regex pattern; returns array of `{file, line, match}` findings.
 * Strings literals are preserved (this is exactly the surface we WANT to scan for AC1-3).
 * JSDoc / line comments are stripped to avoid false-positives from documentation prose.
 */
async function scanForPattern(files, pattern) {
    const findings = [];
    for (const file of files) {
        const raw = await fs.readFile(file, 'utf8');
        const codeOnly = stripCommentsAndStrings(raw);
        // codeOnly preserves string literals; we re-derive matches by walking original source
        // but excluding comment offsets — for simplicity we scan codeOnly with literals retained,
        // which is the exact policy AC1-3 specify.
        const lines = codeOnly.split('\n');
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const lineRe = new RegExp(pattern.source, pattern.flags.replace('g', ''));
            const match = lines[lineIdx].match(lineRe);
            if (match) {
                findings.push({
                    file: path.relative(REPO_ROOT, file),
                    line: lineIdx + 1,
                    match: match[0]
                });
            }
        }
    }
    return findings;
}

test.describe('Orchestrator external-config audit invariants (#11837 AC1-3)', () => {
    test('AC1: no Neo-team identity literals (@neo-opus-4-7 / @neo-gpt / @neo-gemini-3-1-pro) across the ai/daemons/ subtree (includes the orchestrator-daemon entrypoint)', async () => {
        const files = await walkSourceFiles(DAEMON_DIR);

        const findings = await scanForPattern(files, NEO_TEAM_IDENTITY_LITERAL_RE);

        expect(
            findings,
            `Neo-team identity literals are operator-specific substrate that don't survive external deployments (forks, npx neo-app workspaces, cloud tenants). They belong only in ai/graph/identityRoots.mjs (the canonical registry) — daemon code MUST resolve identities via the registry, never via hardcoded string literals. Offending lines:\n${findings.map(f => `  ${f.file}:${f.line} — ${f.match}`).join('\n')}`
        ).toEqual([]);
    });

    test('AC2: no hardcoded Project 12 / v13 / release:v* literals across the ai/daemons/ subtree (includes the orchestrator-daemon entrypoint)', async () => {
        const files = await walkSourceFiles(DAEMON_DIR);

        const findings = await scanForPattern(files, NEO_TEAM_PROJECT_LITERAL_RE);

        expect(
            findings,
            `Hardcoded "Project 12" / "v13" / "release:v*" literals are Neo-release-cycle substrate that don't survive external deployments or post-v13 release transitions. Use \`aiConfig.currentReleaseProject\` or the substrate resolver instead. Offending lines:\n${findings.map(f => `  ${f.file}:${f.line} — ${f.match}`).join('\n')}`
        ).toEqual([]);
    });

    test('AC3: no operator absolute paths (/Users/Shared/github/neomjs/neo or /Users/tobiasuhlig) across the ai/daemons/ subtree (includes the orchestrator-daemon entrypoint)', async () => {
        const files = await walkSourceFiles(DAEMON_DIR);

        const findings = await scanForPattern(files, OPERATOR_ABSOLUTE_PATH_RE);

        expect(
            findings,
            `Operator-specific absolute paths break on every external checkout (forks, CI runners, npx neo-app workspaces, cloud containers). All paths in daemon code MUST resolve relative to checkout root via existing Neo path helpers (path.resolve(...), path.join(neoRootDir, ...), etc.). Offending lines:\n${findings.map(f => `  ${f.file}:${f.line} — ${f.match}`).join('\n')}`
        ).toEqual([]);
    });
});
