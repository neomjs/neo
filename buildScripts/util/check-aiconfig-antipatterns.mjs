import {execSync, spawnSync}      from 'node:child_process';
import {readFileSync}             from 'node:fs';
import path                       from 'node:path';
import process                    from 'node:process';
import {fileURLToPath}            from 'node:url';
import {codeMask, toRepoRelative} from './check-aiconfig-test-mutation.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const scriptRoot = path.resolve(__dirname, '../..');

// Inline relief valve for a genuinely unavoidable defensive read (judgment-call escape, not a
// blanket bypass). A line carrying this marker is skipped.
export const ESCAPE_MARKER = 'aiconfig-antipattern-ok';

/*
 * Rule B3 — defensive optional-chaining on an AiConfig read. The SSOT is a reactive
 * `Neo.state.Provider` tree whose construction guarantees every declared leaf exists — a `?.`
 * anywhere in an access path rooted at a config singleton silently converts a broken tree into an
 * `undefined` that travels, instead of failing loud at the misread. The pattern anchors on the
 * config roots with word boundaries, so `myAiConfigStub?.x` (a test double) never trips it, while
 * the `?.` may appear at any depth: `aiConfig?.load`, `aiConfig.auth?.mode` and
 * `Memory_Config?.data?.host` all match.
 */
export const B3_DEFENSIVE_CHAIN = new RegExp(
    `\\b(?:aiConfig|AiConfig|Memory_Config)\\b` + // a config root token in code
    `[\\w.$[\\]'"\`-]*` +                         // any access-path characters
    `\\?\\.`                                      // the defensive hop
);

/*
 * Rule A5 — a `hasEnvValue(name)` helper re-implements the env-resolution that
 * `leaf(default, env, type)` already owns inside the ConfigProvider. Zero occurrences exist on
 * `dev` (V-B-A'd census); this pattern is a pure reintroduction ratchet.
 */
export const A5_ENV_HELPER = /\bhasEnvValue\s*\(/;

/*
 * Files that already carry B3 reads, grandfathered while the cleanup subs migrate them to plain
 * fail-loud reads. The ratchet bites only NEW offenders; this set shrinks as the cleanup lands.
 * Paths are repo-relative POSIX. Census: 2026-07-16 against `dev`.
 */
export const ALLOWLIST = new Set([
    'ai/mcp/server/BaseServer.mjs',
    'ai/mcp/server/shared/logger.mjs',
    'ai/scripts/runners/roadmapPlanner.mjs'
]);

const RULES = [
    {id: 'B3', pattern: new RegExp(B3_DEFENSIVE_CHAIN.source, 'g')},
    {id: 'A5', pattern: new RegExp(A5_ENV_HELPER.source, 'g')}
];

/**
 * @summary Scans file content for the B3 / A5 config-read antipatterns whose root token sits in code.
 *
 * Reuses the sibling guard's `codeMask` so an occurrence inside a string literal (a log message, a
 * spec title quoting the pattern) or a comment never flags — only executable defensive reads do.
 * @param {String} content
 * @returns {Object[]} `[{line, rule, text}]` — one entry per offending line/rule (1-based line numbers).
 */
export function findAntipatterns(content) {
    const lines = content.split('\n'),
          state = {inBlock: false},
          hits  = [];

    lines.forEach((line, index) => {
        if (line.includes(ESCAPE_MARKER)) {
            return
        }

        const mask = codeMask(line, state);

        for (const {id, pattern} of RULES) {
            for (const match of line.matchAll(pattern)) {
                // The match starts at the config root / helper name; flag it only when that token is
                // real code, not a string that merely quotes an antipattern-looking sequence.
                if (mask[match.index]) {
                    hits.push({line: index + 1, rule: id, text: line.trim()});
                    break
                }
            }
        }
    });

    return hits
}

function main() {
    let gitRoot;
    try {
        gitRoot = execSync('git rev-parse --show-toplevel', {cwd: scriptRoot, encoding: 'utf-8'}).trim();
    } catch (e) {
        console.error('\x1b[31mError: Could not determine git repository root.\x1b[0m');
        process.exit(1);
    }

    // Minimal argv parse — no external deps, so the standalone CI workflow runs without `npm install`
    // (the dependency-free pattern the other lint workflows follow). lint-staged passes staged paths as
    // positional args; `--quiet` suppresses the per-violation listing.
    const rawArgv   = process.argv.slice(2),
          quiet     = rawArgv.includes('-q') || rawArgv.includes('--quiet'),
          argvFiles = rawArgv.filter(arg => !arg.startsWith('-'));

    function collectDefaultFiles() {
        const result = spawnSync('find', ['ai', '-type', 'f', '-name', '*.mjs'], {cwd: gitRoot, encoding: 'utf-8'});
        if (result.status !== 0) {
            console.error('\x1b[31mError: find command failed.\x1b[0m');
            console.error(result.stderr);
            process.exit(1);
        }
        return result.stdout.trim().split('\n').filter(Boolean);
    }

    const rawFiles = argvFiles.length > 0 ? argvFiles : collectDefaultFiles();
    const files    = rawFiles
        .filter(f => f.endsWith('.mjs'))
        .map(f => toRepoRelative(f, gitRoot))
        .filter(f => f.startsWith('ai/'));

    if (files.length === 0) {
        console.log('check-aiconfig-antipatterns: 0 ai/ .mjs files in scope, nothing to check.');
        process.exit(0);
    }

    const violations = [];
    for (const file of files) {
        if (ALLOWLIST.has(file)) {
            continue
        }

        let content;
        try {
            content = readFileSync(path.resolve(gitRoot, file), 'utf-8');
        } catch (e) {
            console.error(`check-aiconfig-antipatterns: could not read ${file}: ${e.message}`);
            continue
        }

        findAntipatterns(content).forEach(({line, rule, text}) => violations.push(`${file}:${line}: [${rule}] ${text}`));
    }

    if (violations.length > 0) {
        console.error(`\x1b[31mcheck-aiconfig-antipatterns: ${violations.length} ADR-0019 antipattern(s) in ai/:\x1b[0m`);
        if (!quiet) {
            violations.forEach(v => console.error('  ' + v));
            console.error('\nB3: never `?.` on an AiConfig read — the SSOT guarantees the tree; read the leaf and let it');
            console.error('fail loud (ADR-0019 §3/§5.1). A5: never a `hasEnvValue` helper — `leaf(default, env, type)`');
            console.error(`owns the env-check (§5.2). Genuinely unavoidable line: add "${ESCAPE_MARKER}: <reason>".`);
        }
        process.exit(1);
    }

    console.log(`check-aiconfig-antipatterns: ${files.length} ai/ file(s) scanned, 0 new violations.`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (invokedDirectly) {
    main()
}
