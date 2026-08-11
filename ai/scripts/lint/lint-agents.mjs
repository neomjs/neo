#!/usr/bin/env node
/**
 * @summary PR-diff-scoped lint that flags NEW `<a id="...">` / `<a name="...">` HTML
 * anchor-tag insertions in turn-loaded Map substrate, `.agents/skills/**` skill substrate,
 * and `learn/agentos/**` Agent OS substrate.
 *
 * **Rule context:** `§<ref>` text-only stable identifiers are the supported substrate
 * primitive; HTML `<a id>` / `<a name>` anchor-tag scaffolding is substrate damage. Any
 * new `<a>` anchor tags in substrate PRs are review blockers unless a narrow
 * rendered-consumer exception is explicitly justified and operator-approved.
 *
 * **Directionality:** This lint preserves text-only section identifiers in prose substrate.
 * The HTML-anchor failure mode bloats always-loaded instruction surfaces and adds duplicate
 * rendered-navigation scaffolding where renderer-generated heading IDs already cover the
 * clickability contract.
 *
 * **Diff-scoped + historical-marker discipline preserved.** Lint operates on NEW added lines
 * only; same-line historical / archaeology / errata classification keeps existing
 * substrate-archaeology references legitimate. Authors who genuinely need to insert an
 * anchor tag for a narrow rendered-consumer reason can mark the line with `rendered-consumer`
 * (operator-approved exception marker).
 *
 * @see learn/agentos/decisions/0011-substrate-numbering-convention.md (amendment in progress)
 * @see feedback_agents_md_24kib_hard_cap (review discipline anchor)
 * @plane host
 */
import {execFileSync}    from 'node:child_process';
import path              from 'node:path';
import process           from 'node:process';
import {fileURLToPath}   from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, '../../..');

/**
 * Top-level Map substrate files (turn-loaded; AGENTS.md is mechanically capped at
 * 24,576 bytes by `check-substrate-size.mjs:PER_FILE_LIMIT_BYTES` with truncation).
 * Anchor-tag scaffolding here directly compresses future instruction budget.
 */
const TOP_LEVEL_MAP_FILES = new Set([
    'AGENTS.md',
    'AGENTS_STARTUP.md',
    '.agents/ANTIGRAVITY_RULES.md'
]);

/**
 * Skill substrate (skill-loaded; loaded at skill invocation, payloads can grow but
 * carry per-invocation cost). Subject to the operator forward-rule.
 */
const SKILL_PREFIX = '.agents/skills/';

/**
 * Agent OS substrate (mixed turn-load + skill-load + reference-load). Includes
 * `AGENTS_ATLAS.md` (World Atlas Map) and the ADR set under `decisions/`. Subject to
 * the text-only substrate numbering convention.
 */
const AGENTOS_PREFIX = 'learn/agentos/';

/**
 * Only markdown files participate; manifests, JSON, and other non-prose substrate
 * cannot meaningfully carry anchor-tag damage.
 */
const SCOPE_SUFFIX = '.md';

/**
 * Regex for `<a id="...">` / `<a name="...">` HTML anchor-tag insertions. Tolerates
 * intervening attributes (e.g. `<a class="x" id="foo">`) and whitespace. Case-insensitive.
 * Anchored on `<a\b` word-boundary to avoid false matches against `<abbr>`, `<area>`, etc.
 * The `\s(?:id|name)\s*=` clause requires the attribute keyword to be a discrete token,
 * so `<a href="...">` regular hyperlinks (no id/name attribute) are NOT flagged.
 */
const ANCHOR_TAG_PATTERN = /<a\b[^>]*\s(?:id|name)\s*=/gi;

/**
 * Same-line classification cues that explicitly exempt a line per the anchor-tag exception
 * contract. `historical` / `archaeology` / `errata` preserve substrate-archaeology
 * references; `rendered-consumer` covers the narrow operator-approved exception for
 * specific rendered-consumer needs. Case-insensitive substring match.
 */
const EXEMPTION_MARKERS = ['historical', 'archaeology', 'errata', 'rendered-consumer'];

/**
 * Parses simple `--base <branch>` / `--base=<branch>` CLI args. Default base is
 * `origin/dev` to match `lint-skill-manifest.mjs` and CI workflow conventions.
 * @param {string[]} argv
 * @returns {{base: string, help: boolean}} `help` only set when requested.
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
 * Runs `git diff --unified=0 <base>...HEAD` and returns the raw diff text.
 * Pathspecs cover the union of all in-scope substrate roots so the lint catches
 * insertions across Map + skill + Agent OS files in a single diff pass.
 * Empty string when no diff or when base ref doesn't exist locally.
 * @param {string} base Git ref to compare HEAD against.
 * @returns {string}
 */
function gitDiff(base) {
    const pathspecs = [
        ...TOP_LEVEL_MAP_FILES,
        SKILL_PREFIX,
        AGENTOS_PREFIX
    ];

    try {
        return execFileSync(
            'git',
            ['diff', '--unified=0', `${base}...HEAD`, '--', ...pathspecs],
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
 * Returns true when the line text contains a same-line exemption marker per
 * the anchor-tag exception contract. Match is case-insensitive substring; intentionally
 * permissive so authors can mark lines without learning a strict syntax.
 * @param {string} text
 * @returns {boolean}
 */
function isExempt(text) {
    const lower = text.toLowerCase();
    return EXEMPTION_MARKERS.some(marker => lower.includes(marker));
}

/**
 * Returns true when the file path falls within the lint scope. Covers turn-loaded Map
 * substrate (AGENTS.md / AGENTS_STARTUP.md / ANTIGRAVITY_RULES.md), skill substrate
 * (.agents/skills/**\/*.md), and Agent OS substrate (learn/agentos/**\/*.md).
 * Manifests, JSON, and other non-markdown substrate are out of scope.
 * @param {string} filePath
 * @returns {boolean}
 */
function isInScope(filePath) {
    if (TOP_LEVEL_MAP_FILES.has(filePath)) return true;
    if (!filePath.endsWith(SCOPE_SUFFIX)) return false;
    if (filePath.startsWith(SKILL_PREFIX))   return true;
    if (filePath.startsWith(AGENTOS_PREFIX)) return true;
    return false;
}

/**
 * Inspects a single added line for `<a id>` / `<a name>` HTML anchor-tag insertions.
 * Returns an array of violation records (empty when clean or when the line carries an
 * exemption marker per `EXEMPTION_MARKERS`).
 * @param {{file: string, line: number, text: string}} record
 * @returns {Array<{file: string, line: number, match: string, text: string}>}
 */
function findViolationsInLine(record) {
    if (!isInScope(record.file)) return [];
    if (isExempt(record.text))   return [];

    const violations = [];
    const matches    = record.text.matchAll(ANCHOR_TAG_PATTERN);

    for (const match of matches) {
        violations.push({
            file : record.file,
            line : record.line,
            match: match[0],
            text : record.text.trim()
        });
    }

    return violations;
}

/**
 * Pure-function lint entry: feed it diff text, get back violations. Exported for
 * unit testing without invoking `git` or the filesystem.
 * @param {string} diffText
 * @returns {Array<{file: string, line: number, match: string, text: string}>}
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
 * @param {{base: string}} options `base` optional (defaults to `origin/dev`).
 * @returns {{exitCode: number, violations: Array}}
 */
function runLint(options = {}) {
    const base       = options.base || 'origin/dev';
    const diffText   = gitDiff(base);
    const violations = lintDiff(diffText);

    if (violations.length === 0) {
        console.log(`[lint-agents] OK — no new <a id> / <a name> anchor-tag insertions in Map / skill / Agent OS substrate diff against ${base}.`);
        return {exitCode: 0, violations};
    }

    console.error(`[lint-agents] FAILED — ${violations.length} new HTML anchor-tag insertion(s) detected against ${base}:\n`);
    for (const v of violations) {
        console.error(`- ${v.file}:${v.line}: ${v.match}`);
        console.error(`    > ${v.text}`);
    }
    console.error(`\nHTML <a id> / <a name> anchor tags are review blockers in turn-loaded Map substrate,`);
    console.error(`.agents/skills/ skill substrate, and learn/agentos/ Agent OS substrate per Discussion #11577 graduation:`);
    console.error(`  https://github.com/neomjs/neo/discussions/11577#discussioncomment-16965519`);
    console.error(`\nUse compact text-only §<ref> form (positional §3 or semantic §<kebab>, both acceptable).`);
    console.error(`Auto-generated heading IDs cover rendered clickability where renderers support it.`);
    console.error(`\nIf this insertion is genuinely required (narrow rendered-consumer need, substrate-archaeology, or`);
    console.error(`errata), mark the line explicitly with "rendered-consumer", "historical", "archaeology", or "errata"`);
    console.error(`so the classification is legible to readers and to this lint.`);
    return {exitCode: 1, violations};
}

function main() {
    const options = parseArgs();

    if (options.help) {
        console.log('Usage: node ai/scripts/lint/lint-agents.mjs [--base <ref>]');
        console.log('  --base <ref>   Git ref to diff HEAD against (default: origin/dev)');
        console.log('');
        console.log('Flags NEW <a id> / <a name> HTML anchor-tag insertions in:');
        console.log('  - AGENTS.md / AGENTS_STARTUP.md / .agents/ANTIGRAVITY_RULES.md  (Map substrate)');
        console.log('  - .agents/skills/**/*.md                                          (skill substrate)');
        console.log('  - learn/agentos/**/*.md                                           (Agent OS substrate)');
        console.log('');
        console.log('Same-line markers exempt: historical, archaeology, errata, rendered-consumer.');
        console.log('Per Discussion #11577 graduation: §<ref> text-only form is the substrate primitive.');
        process.exit(0);
    }

    const {exitCode} = runLint(options);
    process.exit(exitCode);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main();
}

export {
    AGENTOS_PREFIX,
    ANCHOR_TAG_PATTERN,
    EXEMPTION_MARKERS,
    SCOPE_SUFFIX,
    SKILL_PREFIX,
    TOP_LEVEL_MAP_FILES,
    findViolationsInLine,
    isExempt,
    isInScope,
    lintDiff,
    parseAddedLines,
    parseArgs,
    runLint
};
