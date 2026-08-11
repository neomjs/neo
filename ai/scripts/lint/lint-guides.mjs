#!/usr/bin/env node
/**
 * @summary Mechanical guide-quality lint for `learn/` conceptual guides — the static,
 * no-renderer half of the guide-quality immune system. It complements the `guide-authoring`
 * skill (the *discipline* half) by removing the
 * objectively-falsifiable failure classes from the human-judgment path: a reviewer should
 * never again be the thing standing between a broken-Mermaid guide and `dev`.
 *
 * **Why a whole-file content lint, not diff-scoped (unlike `lint-agents.mjs`):** the failure
 * we are guarding against is a guide that is *already* wrong sitting on a branch. Diff-scoping
 * would let a pre-existing broken diagram or dead link pass simply because this PR didn't touch
 * that line. Guides are the public adoption surface; the whole artifact must be sound at merge.
 *
 * **HARD-fail (exit 1) — objectively wrong, no judgment required:**
 *   - Mermaid reserved-word node IDs / `classDef` names (`graph`/`end`/`subgraph`/`class`/…) —
 *     the trap where `classDef graph` silently breaks the parse and merges CI-green.
 *   - Mermaid self-loop edges (`X --> X`) — the documented illegible anti-pattern.
 *   - Dead local doc links — `](./x.md)` / `](../x.md)` targets absent on disk.
 *   - Dead `ai:*` script refs — `` `ai:foo` `` / `npm run ai:foo` not in `package.json` scripts
 *     (the hallucinated-command class).
 *   - Tool-table refs under a Tools heading that resolve to no `ai/mcp/server/*​/openapi.yaml`
 *     operationId — the MCP-tool analogue of the hallucinated-command class.
 *
 * **WARN (report-only, exit 0) — heuristics a human confirms:**
 *   - No Mermaid block at all (the bar wants >=1 diagram that carries the story).
 *   - `flowchart LR` / `graph LR` with many nodes (LR squishes unreadable on GitHub/portal).
 *   - Feature-list-skeleton headings (`## Tools` / `## Configuration` / `## API` …) — reference
 *     belongs in `tooling/`, not inlined into an explanation guide (Diátaxis).
 *   - `framework` identity-guard hits (Neo is an Application Engine + organism, never a framework).
 *
 * **Scope:** the conceptual-guide surfaces only — top-level `learn/agentos/*.md` and
 * `learn/benefits/*.md`. ADRs (`decisions/`), generated/reference docs (`tooling/`), and
 * process docs (`process/`) are deliberately excluded: they are reference, not narrative guides.
 *
 * @see .agents/skills/guide-authoring/references/guide-authoring-bar.md (the discipline half)
 * @see learn/agentos/decisions/0008-skill-anatomy-and-authoring-contract.md
 * @plane in-plane
 */
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import path                                    from 'node:path';
import process                                 from 'node:process';
import {fileURLToPath}                         from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, '../../..');

/**
 * Conceptual-guide directories (non-recursive — only top-level `*.md`). Subdirectories
 * (`decisions/`, `tooling/`, `process/`) are reference/ADR substrate, intentionally excluded.
 */
const GUIDE_DIRS = ['learn/agentos', 'learn/benefits'];

/**
 * Mermaid keywords that break the parser when reused as a node ID or `classDef` name.
 * `graph`/`flowchart` are also legal as the diagram-type declaration on the FIRST block line,
 * so the reserved-word node scan skips that declaration line (see {@link checkMermaidBlock}).
 */
const MERMAID_RESERVED = ['graph', 'end', 'subgraph', 'class', 'flowchart', 'style', 'linkStyle', 'click', 'default'];

/** Above this node count an `LR` (left-to-right) flow squishes unreadable on GitHub/portal. */
const LR_NODE_WARN = 6;

/**
 * Headings that signal a reference catalog leaking into an explanation guide (Diátaxis).
 * Matched case-insensitively as a whole `##`/`###` heading line.
 */
const FEATURE_LIST_HEADING = /^#{2,3}\s+(available\s+)?(tools?|configuration|config|api|reference|commands?|options|parameters|flags|endpoints?|methods?|properties)\s*$/i;

/**
 * Tool-table parity (the OpenAPI-operation analogue of the dead-`ai:*`-script check). A guide that
 * inlines an MCP tool table must reference real `ai/mcp/server/*​/openapi.yaml` operationIds.
 *
 * **Why heading-scoped, not every `| `name` |` row:** config / property / schema tables share the
 * exact same row shape, so an unscoped scan flags `id`/`name`/`tier`/`schema` etc. as "hallucinated
 * tools" — empirically 56 false HARDs across the live guide corpus. We only scan rows under a
 * *tools-catalog* heading. The heading match is deliberately narrow (`(available|mcp|agent|the)? tools?`
 * anchored at the heading start) so `## Build Tools` / `## Debugging Tools` cannot match either.
 */
const TOOLS_HEADING  = /^#{2,4}\s+(available\s+|mcp\s+|agent\s+|the\s+)?tools?\b/i;
const TOOL_TABLE_ROW = /^\|\s*`([a-z][a-z0-9_]*)`\s*\|/;

/**
 * Returns the 1-based line number of a character index within `content`.
 * @param {string} content
 * @param {number} index
 * @returns {number}
 */
function lineOf(content, index) {
    return content.slice(0, index).split('\n').length;
}

/**
 * Extracts fenced ` ```mermaid ` blocks. `startLine` is the 1-based file line of the block's
 * FIRST body line (the line just after the opening fence), so `startLine + bodyIndex` yields the
 * exact file line of a finding inside the block.
 * @param {string} content
 * @returns {Array<{body: string, startLine: number}>}
 */
function extractMermaidBlocks(content) {
    const blocks  = [];
    const pattern = /```mermaid\s*\n([\s\S]*?)```/g;
    let   match;

    while ((match = pattern.exec(content)) !== null) {
        blocks.push({body: match[1], startLine: lineOf(content, match.index) + 1});
    }

    return blocks;
}

/**
 * HARD checks for one Mermaid block: reserved-word node IDs / classDefs and self-loop edges.
 * The first non-empty line is the diagram declaration (`flowchart TD`, `graph LR`) and is
 * exempt from the reserved-word-as-node scan so the legal type keyword isn't flagged.
 * @param {{body: string, startLine: number}} block
 * @returns {Array<{severity: string, rule: string, line: number, detail: string}>}
 */
function checkMermaidBlock(block) {
    const findings        = [];
    const lines           = block.body.split('\n');
    let   seenDeclaration = false;

    lines.forEach((raw, i) => {
        const line     = raw.trim();
        const fileLine = block.startLine + i;

        if (!line) return;

        if (!seenDeclaration) {
            seenDeclaration = true; // first non-empty line is the `flowchart TD` / `graph LR` declaration
            return;
        }

        // classDef <reserved> — the silent parse-break.
        const classDefMatch = line.match(/^classDef\s+([A-Za-z0-9_]+)/);
        if (classDefMatch && MERMAID_RESERVED.includes(classDefMatch[1].toLowerCase())) {
            findings.push({severity: 'HARD', rule: 'mermaid-reserved-word', line: fileLine,
                detail: `classDef named with reserved word "${classDefMatch[1]}" breaks the Mermaid parser`});
        }

        // A reserved word used as a node ID: `end[...]`, `graph(...)`, `class{...}`.
        const nodeIdMatch = line.match(/(^|[^A-Za-z0-9_])(end|graph|subgraph|class)\s*[[({]/);
        if (nodeIdMatch) {
            findings.push({severity: 'HARD', rule: 'mermaid-reserved-word', line: fileLine,
                detail: `reserved word "${nodeIdMatch[2]}" used as a node ID breaks the Mermaid parser`});
        }

        // Self-loop edge: same identifier on both ends of an edge (strip an optional |label|).
        const edgeMatch = line.match(/^([A-Za-z0-9_]+)\s*(?:--+>?|-\.-*->?|==+>?|--+)\s*(?:\|[^|]*\|\s*)?([A-Za-z0-9_]+)\b/);
        if (edgeMatch && edgeMatch[1] === edgeMatch[2]) {
            findings.push({severity: 'HARD', rule: 'mermaid-self-loop', line: fileLine,
                detail: `self-loop edge "${edgeMatch[1]} -> ${edgeMatch[1]}" — use an intermediate node + two edges`});
        }
    });

    return findings;
}

/**
 * WARN check: an `LR`/`RL` flow with more than {@link LR_NODE_WARN} distinct nodes.
 * @param {{body: string, startLine: number}} block
 * @returns {Array<{severity: string, rule: string, line: number, detail: string}>}
 */
function checkMermaidOrientation(block) {
    const firstLine = block.body.split('\n').map(l => l.trim()).find(Boolean) || '';
    if (!/^(flowchart|graph)\s+(LR|RL)\b/i.test(firstLine)) return [];

    const nodeIds = new Set((block.body.match(/[A-Za-z0-9_]+(?=\s*[[({])/g) || []));
    if (nodeIds.size <= LR_NODE_WARN) return [];

    return [{severity: 'WARN', rule: 'mermaid-lr-squish', line: block.startLine,
        detail: `${nodeIds.size} nodes in an LR flow — use "flowchart TD" so it stays readable on GitHub/portal`}];
}

/**
 * HARD check: relative `*.md` links whose target file is absent on disk.
 * Only relative links (starting with `.`) are resolved; external URLs and bare anchors are skipped.
 * @param {string} content
 * @param {string} fileDir absolute directory of the guide being linted
 * @param {Function} [existsFn] path-exists predicate, injectable for testing (defaults to fs.existsSync)
 * @returns {Array<{severity: string, rule: string, line: number, detail: string}>}
 */
function checkDeadLinks(content, fileDir, existsFn = existsSync) {
    const findings = [];
    const pattern  = /]\((\.\.?\/[^)#\s]+\.md)(#[^)]*)?\)/g;
    let   match;

    while ((match = pattern.exec(content)) !== null) {
        const target   = match[1];
        const resolved = path.resolve(fileDir, target);

        if (!existsFn(resolved)) {
            findings.push({severity: 'HARD', rule: 'dead-link', line: lineOf(content, match.index),
                detail: `link target does not exist: ${target}`});
        }
    }

    return findings;
}

/**
 * HARD check: `ai:*` script references that are not real `package.json` scripts (the
 * hallucinated-command class).
 * Conservative — only flags backtick-wrapped `` `ai:foo` `` or `npm run ai:foo` forms, so prose
 * mentioning a namespace casually isn't caught.
 * @param {string} content
 * @param {Set<string>} scriptKeys the set of defined `package.json` script names
 * @returns {Array<{severity: string, rule: string, line: number, detail: string}>}
 */
function checkDeadScriptRefs(content, scriptKeys) {
    const findings = [];
    const seen     = new Set();
    const pattern  = /(?:`\s*(?:npm run\s+)?|npm run\s+)(ai:[a-z0-9][a-z0-9:-]*)/gi;
    let   match;

    while ((match = pattern.exec(content)) !== null) {
        const ref = match[1];
        const key = `${ref}@${lineOf(content, match.index)}`;

        if (scriptKeys.has(ref) || seen.has(key)) continue;
        seen.add(key);
        findings.push({severity: 'HARD', rule: 'dead-script-ref', line: lineOf(content, match.index),
            detail: `"${ref}" is not a script in package.json`});
    }

    return findings;
}

/**
 * HARD check: tool-table rows that reference an MCP tool no server exposes — the OpenAPI-operation
 * analogue of {@link checkDeadScriptRefs}. Scoped to rows under a {@link TOOLS_HEADING} so config /
 * property / schema tables (same `| `name` |` shape) never false-positive. Generalizes the
 * per-guide `GuideToolParity` spec into the shared lint. Fenced code is skipped so an example table
 * in a code block doesn't trip it.
 * @param {string} content
 * @param {Set<string>} operationIds union of every MCP server's openapi.yaml operationIds
 * @returns {Array<{severity: string, rule: string, line: number, detail: string}>}
 */
function checkOpenApiToolParity(content, operationIds) {
    const findings = [];

    // Empty surface (missing servers dir / empty injection) → no-op, NOT flag-everything: without
    // this guard `!operationIds.has(...)` is always true and HARD-fails every tool-table row. This
    // check is a forward-guard, so a missing surface degrades to "can't verify, don't block".
    if (!operationIds || operationIds.size === 0) return findings;

    let underTools = false;
    let inFence    = false;

    content.split('\n').forEach((raw, i) => {
        const line = raw.trim();

        if (line.startsWith('```')) { inFence = !inFence; return; }
        if (inFence) return;
        if (line.startsWith('#'))   { underTools = TOOLS_HEADING.test(line); return; }
        if (!underTools) return;

        const match = line.match(TOOL_TABLE_ROW);
        if (match && !operationIds.has(match[1])) {
            findings.push({severity: 'HARD', rule: 'openapi-tool-parity', line: i + 1,
                detail: `tool-table ref \`${match[1]}\` resolves to no ai/mcp/server/*/openapi.yaml operationId — hallucinated/stale tool (or the heading is not an MCP-tool catalog)`});
        }
    });

    return findings;
}

/**
 * WARN checks: feature-list-skeleton headings + identity-guard `framework` hits, both scanned
 * outside fenced code blocks so example code doesn't trip them.
 * @param {string} content
 * @returns {Array<{severity: string, rule: string, line: number, detail: string}>}
 */
function checkProse(content) {
    const findings = [];
    let   inFence  = false;

    content.split('\n').forEach((raw, i) => {
        const line = raw.trim();

        if (line.startsWith('```')) { inFence = !inFence; return; }
        if (inFence) return;

        if (FEATURE_LIST_HEADING.test(line)) {
            findings.push({severity: 'WARN', rule: 'feature-list-heading', line: i + 1,
                detail: `catalog heading "${line}" — extract reference to tooling/, keep the guide narrative (Diátaxis)`});
        }

        if (/\bframework\b/i.test(line)) {
            findings.push({severity: 'WARN', rule: 'identity-framework', line: i + 1,
                detail: `"framework" — Neo is an Application Engine + self-evolving organism; confirm this usage is intentional`});
        }
    });

    return findings;
}

/**
 * Lints one guide's content and returns all findings. Pure: no fs/process access beyond the
 * injectable `existsFn`, so it is unit-testable in isolation.
 * @param {string} content
 * @param {{filePath: string, fileDir: string, scriptKeys: Set, operationIds: Set, existsFn: Function}} ctx scriptKeys = package.json script names; operationIds = MCP openapi operationIds (defaults to empty → tool-parity is a no-op); existsFn is optional (defaults to fs.existsSync)
 * @returns {Array<{severity: string, rule: string, line: number, detail: string}>}
 */
function lintGuide(content, ctx) {
    const blocks   = extractMermaidBlocks(content);
    const findings = [];

    for (const block of blocks) {
        findings.push(...checkMermaidBlock(block), ...checkMermaidOrientation(block));
    }

    if (blocks.length === 0) {
        findings.push({severity: 'WARN', rule: 'no-mermaid', line: 1,
            detail: 'no Mermaid diagram — the bar wants >=1 diagram that carries the story'});
    }

    findings.push(
        ...checkDeadLinks(content, ctx.fileDir, ctx.existsFn),
        ...checkDeadScriptRefs(content, ctx.scriptKeys),
        ...checkOpenApiToolParity(content, ctx.operationIds || new Set()),
        ...checkProse(content)
    );

    return findings.sort((a, b) => a.line - b.line);
}

/**
 * Discovers the in-scope guide files (top-level `*.md` under each {@link GUIDE_DIRS} entry).
 * @returns {string[]} repo-relative file paths
 */
function discoverGuides() {
    const files = [];

    for (const dir of GUIDE_DIRS) {
        const absDir = path.join(ROOT_DIR, dir);
        if (!existsSync(absDir)) continue;

        for (const entry of readdirSync(absDir, {withFileTypes: true})) {
            if (entry.isFile() && entry.name.endsWith('.md')) {
                files.push(path.join(dir, entry.name));
            }
        }
    }

    return files.sort();
}

/** @returns {Set<string>} the defined `package.json` script names. */
function loadScriptKeys() {
    const pkg = JSON.parse(readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
    return new Set(Object.keys(pkg.scripts || {}));
}

/**
 * Union of every MCP server's openapi.yaml `operationId`s — the canonical tool surface a guide's
 * tool tables must resolve against. Regex-extracted (no YAML dependency); a missing servers dir
 * yields an empty set, which makes {@link checkOpenApiToolParity} a no-op rather than a false alarm.
 * @returns {Set<string>}
 */
function loadOperationIds() {
    const ids       = new Set();
    const serverDir = path.join(ROOT_DIR, 'ai/mcp/server');

    if (!existsSync(serverDir)) return ids;

    for (const entry of readdirSync(serverDir, {withFileTypes: true})) {
        if (!entry.isDirectory()) continue;

        const oapi = path.join(serverDir, entry.name, 'openapi.yaml');
        if (!existsSync(oapi)) continue;

        for (const raw of readFileSync(oapi, 'utf8').split('\n')) {
            const m = raw.match(/^\s*operationId:\s*['"]?([A-Za-z0-9_]+)/);
            if (m) ids.add(m[1]);
        }
    }

    return ids;
}

/**
 * Parses `--warn-as-error` / `--help` plus optional explicit file paths (default: discover all).
 * @param {string[]} argv
 * @returns {{files: string[], warnAsError: boolean, help: boolean}}
 */
function parseArgs(argv = process.argv.slice(2)) {
    const options = {files: [], warnAsError: false};

    for (const arg of argv) {
        if (arg === '--warn-as-error')        options.warnAsError = true;
        else if (arg === '--help' || arg === '-h') options.help = true;
        else if (arg.startsWith('--'))        throw new Error(`Unknown argument: ${arg}`);
        else                                  options.files.push(arg);
    }

    return options;
}

/**
 * CLI entry. Returns a numeric exit code (no `process.exit`) so tests can drive it directly.
 * @param {{files: string[], warnAsError: boolean}} [options] both keys optional (files defaults to discoverGuides())
 * @returns {{exitCode: number, hard: number, warn: number}}
 */
function runLint(options = {}) {
    const scriptKeys   = loadScriptKeys();
    const operationIds = loadOperationIds();
    const files        = options.files?.length ? options.files : discoverGuides();

    let hard = 0, warn = 0;

    for (const file of files) {
        const abs      = path.isAbsolute(file) ? file : path.join(ROOT_DIR, file);
        const content  = readFileSync(abs, 'utf8');
        const findings = lintGuide(content, {filePath: file, fileDir: path.dirname(abs), scriptKeys, operationIds});

        if (findings.length === 0) continue;

        console.log(`\n${file}`);
        for (const f of findings) {
            const tag = f.severity === 'HARD' ? '✗ HARD' : '· warn';
            console.log(`  ${tag}  [${f.rule}] line ${f.line}: ${f.detail}`);
            if (f.severity === 'HARD') hard++; else warn++;
        }
    }

    const failed = hard > 0 || (options.warnAsError && warn > 0);

    console.log(`\n[lint-guides] ${files.length} guide(s) scanned — ${hard} hard, ${warn} warning(s).`);
    if (!failed) console.log('[lint-guides] OK');
    else         console.error(`[lint-guides] FAILED — ${hard} hard failure(s)${options.warnAsError ? ` + ${warn} warning(s) (--warn-as-error)` : ''}.`);

    return {exitCode: failed ? 1 : 0, hard, warn};
}

function main() {
    const options = parseArgs();

    if (options.help) {
        console.log('Usage: node ai/scripts/lint/lint-guides.mjs [files...] [--warn-as-error]');
        console.log('  Mechanical guide-quality lint for learn/agentos/*.md + learn/benefits/*.md.');
        console.log('  HARD (exit 1): mermaid reserved-word / self-loop, dead local links, dead ai:* script refs, openapi tool-parity.');
        console.log('  WARN:          no-mermaid, LR-squish, feature-list headings, "framework".');
        console.log('  --warn-as-error  treat warnings as failures too.');
        process.exit(0);
    }

    process.exit(runLint(options).exitCode);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main();
}

export {
    FEATURE_LIST_HEADING,
    GUIDE_DIRS,
    LR_NODE_WARN,
    MERMAID_RESERVED,
    TOOLS_HEADING,
    checkDeadLinks,
    checkDeadScriptRefs,
    checkMermaidBlock,
    checkMermaidOrientation,
    checkOpenApiToolParity,
    checkProse,
    discoverGuides,
    extractMermaidBlocks,
    loadOperationIds,
    lintGuide,
    parseArgs,
    runLint
};
