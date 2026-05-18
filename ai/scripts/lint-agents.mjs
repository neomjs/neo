#!/usr/bin/env node
/**
 * Pre-Flight (structural fast-path): authoring `ai/scripts/lint-agents.mjs` matches
 * sibling pattern of `ai/scripts/lint-skill-manifest.mjs` and `ai/scripts/check-retired-primitives.mjs`
 * in `ai/scripts/`; all three are mechanical-enforcement / CI scripts for agent substrate
 * validation; sibling-file-lift applies; no novel directory choice.
 *
 * @summary PR-diff-scoped lint that flags NEW live positional `§N` references in
 * `.agents/skills/**` markdown per ADR 0011 (Substrate Numbering Convention).
 *
 * Active references must target stable semantic anchors. Historical / archaeology
 * references remain permitted when the same line explicitly classifies them
 * (case-insensitive `historical`, `archaeology`, `errata`).
 *
 * Scope is intentionally diff-scoped: pre-existing positional references remain
 * (264+ across `.agents/skills/` at lint introduction time) and migrate under
 * sibling Epic #11558 sub-tickets #11561, #11562, #11564. This script is the
 * regression gate that prevents new positional refs from re-entering live
 * substrate after migration.
 *
 * @see learn/agentos/decisions/0011-substrate-numbering-convention.md §2.4
 * @see #11558 (epic) / #11560 (this ticket) / #11557 (graduating discussion)
 */
import {execFileSync} from 'node:child_process';
import path           from 'node:path';
import process        from 'node:process';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, '../..');

/**
 * Files matching this prefix are in scope. Lint operates on NEW lines added
 * inside `.agents/skills/` markdown only. Other substrate (AGENTS.md / ATLAS /
 * ADRs / general docs) migrates under separate Epic #11558 children and may
 * eventually carry its own guard.
 */
const SCOPE_PREFIX = '.agents/skills/';
const SCOPE_SUFFIX = '.md';

/**
 * Regex for live positional references. Matches `§N` where N is one or more
 * digits with optional dotted sub-section (e.g. `§5.2.3`). Anchored on `§`
 * to avoid false matches against `#` heading anchors or `Section N` prose.
 */
const POSITIONAL_REF_PATTERN = /§\d+(?:\.\d+)*\b/g;

/**
 * Same-line classification cues that explicitly mark a reference as historical /
 * archaeology per ADR 0011 §2.3. Case-insensitive substring match keeps the
 * heuristic simple and grep-auditable.
 */
const HISTORICAL_MARKERS = ['historical', 'archaeology', 'errata'];

/**
 * Parses simple `--base <branch>` / `--base=<branch>` CLI args. Default base is
 * `origin/dev` to match `lint-skill-manifest.mjs` and CI workflow conventions.
 * @param {string[]} argv
 * @returns {{base: string}}
 */
function parseArgs(argv = process.argv.slice(2)) {
    const options = {base: 'origin/dev'};

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === '--base') {
            options.base = argv[++i];
        } else if (arg.startsWith('--base=')) {
            options.base = arg.slice('--base='.length);
        } else if (arg === '--help' || arg === '-h') {
            options.help = true;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

/**
 * Runs `git diff --unified=0 <base>...HEAD -- <pathspec>` and returns the raw diff text.
 * Empty string when no diff or when base ref doesn't exist locally.
 * @param {string} base Git ref to compare HEAD against.
 * @returns {string}
 */
function gitDiff(base) {
    try {
        return execFileSync(
            'git',
            ['diff', '--unified=0', `${base}...HEAD`, '--', SCOPE_PREFIX],
            {cwd: ROOT_DIR, encoding: 'utf8'}
        );
    } catch (error) {
        // git diff exits non-zero on missing base ref; treat as "no diff" rather than fatal
        // so the lint runs cleanly on first-author scenarios + isolated worktrees.
        if (error.status === 128 || error.status === 129) {
            console.warn(`[lint-agents] Warning: could not diff against '${base}' (${error.message.trim()}). Treating as empty diff.`);
            return '';
        }
        throw error;
    }
}

/**
 * Parses a unified diff into a flat list of added-line records. Each record carries
 * the file path (relative to repo root), the new-file line number, and the line text
 * without the leading `+`.
 *
 * Diff header parsing is intentionally minimal — we only need the new-file path
 * (`+++ b/...`) and the `@@ -... +newStart[,newCount] @@` hunk locator to count
 * lines forward inside each hunk.
 *
 * @param {string} diffText
 * @returns {Array<{file: string, line: number, text: string}>}
 */
function parseAddedLines(diffText) {
    const added = [];

    let currentFile = null;
    let newLine     = 0;

    for (const rawLine of diffText.split('\n')) {
        if (rawLine.startsWith('+++ b/')) {
            currentFile = rawLine.slice('+++ b/'.length);
            newLine     = 0;
            continue;
        }

        if (rawLine.startsWith('+++ /dev/null') || rawLine.startsWith('--- ')) {
            // Deletion or pre-image header; skip without resetting currentFile.
            continue;
        }

        const hunkMatch = rawLine.match(/^@@ [^+]*\+(\d+)(?:,\d+)? @@/);
        if (hunkMatch) {
            newLine = parseInt(hunkMatch[1], 10);
            continue;
        }

        if (!currentFile) continue;

        if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
            added.push({
                file: currentFile,
                line: newLine,
                text: rawLine.slice(1)
            });
            newLine++;
            continue;
        }

        if (rawLine.startsWith('-') || rawLine.startsWith('---')) {
            // Removed line — does NOT advance new-file line number.
            continue;
        }

        if (rawLine.startsWith(' ')) {
            // Unchanged context line — advances new-file line number.
            newLine++;
        }
    }

    return added;
}

/**
 * Returns true when the line text contains a same-line historical-classification
 * marker per ADR 0011 §2.3. Match is case-insensitive substring; intentionally
 * permissive so authors can mark refs without learning a strict syntax.
 * @param {string} text
 * @returns {boolean}
 */
function isHistoricalContext(text) {
    const lower = text.toLowerCase();
    return HISTORICAL_MARKERS.some(marker => lower.includes(marker));
}

/**
 * Returns true when the file path falls within the lint scope.
 * Excludes `.agents/skills/skills.manifest.json` and other non-markdown substrate.
 * @param {string} filePath
 * @returns {boolean}
 */
function isInScope(filePath) {
    return filePath.startsWith(SCOPE_PREFIX) && filePath.endsWith(SCOPE_SUFFIX);
}

/**
 * Inspects a single added line for positional references that need migration to
 * a semantic anchor. Returns an array of violation records (empty when clean or
 * when the line is historically-classified).
 * @param {{file: string, line: number, text: string}} record
 * @returns {Array<{file: string, line: number, ref: string, text: string}>}
 */
function findViolationsInLine(record) {
    if (!isInScope(record.file)) return [];
    if (isHistoricalContext(record.text)) return [];

    const violations = [];
    const matches    = record.text.matchAll(POSITIONAL_REF_PATTERN);

    for (const match of matches) {
        violations.push({
            file: record.file,
            line: record.line,
            ref : match[0],
            text: record.text.trim()
        });
    }

    return violations;
}

/**
 * Pure-function lint entry: feed it diff text, get back violations. Exported for
 * unit testing without invoking `git` or the filesystem.
 * @param {string} diffText
 * @returns {Array<{file: string, line: number, ref: string, text: string}>}
 */
function lintDiff(diffText) {
    const violations = [];
    const added      = parseAddedLines(diffText);

    for (const record of added) {
        violations.push(...findViolationsInLine(record));
    }

    return violations;
}

/**
 * CLI entry. Returns numeric exit code so unit tests can drive it without
 * triggering `process.exit`.
 * @param {{base?: string}} options
 * @returns {{exitCode: number, violations: Array}}
 */
function runLint(options = {}) {
    const base       = options.base || 'origin/dev';
    const diffText   = gitDiff(base);
    const violations = lintDiff(diffText);

    if (violations.length === 0) {
        console.log(`[lint-agents] OK — no new positional §N refs in ${SCOPE_PREFIX} diff against ${base}.`);
        return {exitCode: 0, violations};
    }

    console.error(`[lint-agents] FAILED — ${violations.length} new positional reference(s) detected in ${SCOPE_PREFIX} diff against ${base}:\n`);
    for (const v of violations) {
        console.error(`- ${v.file}:${v.line}: ${v.ref}`);
        console.error(`    > ${v.text}`);
    }
    console.error(`\nLive substrate references MUST target stable semantic anchors per ADR 0011.`);
    console.error(`  learn/agentos/decisions/0011-substrate-numbering-convention.md §2`);
    console.error(`\nIf a reference is historical / archaeology / errata, mark it explicitly on the same line`);
    console.error(`(e.g. "historical: §21" or "ADR 0007 recorded the old §21 disposition") so the classification`);
    console.error(`is legible to readers and to this lint per ADR 0011 §2.3.`);
    return {exitCode: 1, violations};
}

function main() {
    const options = parseArgs();

    if (options.help) {
        console.log('Usage: node ai/scripts/lint-agents.mjs [--base <ref>]');
        console.log('  --base <ref>   Git ref to diff HEAD against (default: origin/dev)');
        console.log('');
        console.log('Flags NEW live positional §N references in .agents/skills/** per ADR 0011.');
        console.log('Pre-existing references remain untouched; they migrate under #11561-#11564.');
        process.exit(0);
    }

    const {exitCode} = runLint(options);
    process.exit(exitCode);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main();
}

export {
    HISTORICAL_MARKERS,
    POSITIONAL_REF_PATTERN,
    SCOPE_PREFIX,
    SCOPE_SUFFIX,
    findViolationsInLine,
    isHistoricalContext,
    isInScope,
    lintDiff,
    parseAddedLines,
    parseArgs,
    runLint
};
