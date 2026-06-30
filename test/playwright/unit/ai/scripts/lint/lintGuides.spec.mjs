import {test, expect} from '@playwright/test';
import {spawnSync}    from 'node:child_process';
import path           from 'node:path';

import {
    checkDeadLinks,
    checkDeadScriptRefs,
    checkMermaidBlock,
    checkMermaidOrientation,
    checkOpenApiToolParity,
    checkProse,
    extractMermaidBlocks,
    lintGuide,
    parseArgs
} from '../../../../../../ai/scripts/lint/lint-guides.mjs';

/**
 * @summary Coverage for `ai/scripts/lint/lint-guides.mjs` — the mechanical guide-quality lint.
 * Tests the pure check functions against hand-built inputs so reviewer
 * V-B-A is cheap, plus the two boundaries a guide lint MUST get right to be trustworthy:
 *   - true positives fire (reserved-word Mermaid, self-loops, dead links, hallucinated `ai:*` refs,
 *     hallucinated MCP tool-table refs);
 *   - false positives DON'T (the `graph LR` declaration line, real `package.json` scripts, fenced code,
 *     config/property tables outside a Tools heading).
 */
test.describe('ai/scripts/lint-guides (#14354 — mechanical guide-quality lint)', () => {
    const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lint/lint-guides.mjs');

    test('CLI: --help exits 0 with usage text', () => {
        const result = spawnSync('node', [scriptPath, '--help'], {cwd: process.cwd(), encoding: 'utf8'});

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('Usage: node ai/scripts/lint/lint-guides.mjs');
        expect(result.stdout).toContain('--warn-as-error');
    });

    test('parseArgs: defaults', () => {
        expect(parseArgs([])).toEqual({files: [], warnAsError: false});
    });

    test('parseArgs: --warn-as-error + positional files', () => {
        expect(parseArgs(['--warn-as-error', 'a.md', 'b.md'])).toEqual({files: ['a.md', 'b.md'], warnAsError: true});
    });

    test('parseArgs: --help flag', () => {
        expect(parseArgs(['--help'])).toMatchObject({help: true});
    });

    test('parseArgs: rejects unknown flags', () => {
        expect(() => parseArgs(['--bogus'])).toThrow(/Unknown argument/);
    });

    test('extractMermaidBlocks: finds blocks with 1-based start line', () => {
        const content = ['# Title', '', '```mermaid', 'flowchart TD', '  A --> B', '```', 'after'].join('\n');
        const blocks  = extractMermaidBlocks(content);

        expect(blocks).toHaveLength(1);
        expect(blocks[0].startLine).toBe(4); // first body line (the line just after the ```mermaid fence)
        expect(blocks[0].body).toContain('flowchart TD');
    });

    test('extractMermaidBlocks: empty when none', () => {
        expect(extractMermaidBlocks('# Just prose\n\nNo diagram.')).toHaveLength(0);
    });

    test('checkMermaidBlock: clean TD diagram passes', () => {
        const block = {body: 'flowchart TD\n  A["x"] --> B["y"]\n  B --> C["z"]', startLine: 1};
        expect(checkMermaidBlock(block)).toHaveLength(0);
    });

    test('checkMermaidBlock: classDef with reserved word "graph" is HARD (#14340 trap)', () => {
        const block    = {body: 'flowchart TD\n  A --> B\n  classDef graph fill:#fff', startLine: 1};
        const findings = checkMermaidBlock(block);

        expect(findings).toHaveLength(1);
        expect(findings[0]).toMatchObject({severity: 'HARD', rule: 'mermaid-reserved-word'});
    });

    test('checkMermaidBlock: reserved word as a node ID is HARD', () => {
        const block    = {body: 'flowchart TD\n  end[Done] --> A', startLine: 1};
        const findings = checkMermaidBlock(block).filter(f => f.rule === 'mermaid-reserved-word');

        expect(findings.length).toBeGreaterThanOrEqual(1);
    });

    test('checkMermaidBlock: self-loop edge is HARD', () => {
        const block    = {body: 'flowchart TD\n  A --> A', startLine: 1};
        const findings = checkMermaidBlock(block);

        expect(findings).toHaveLength(1);
        expect(findings[0]).toMatchObject({severity: 'HARD', rule: 'mermaid-self-loop'});
    });

    test('checkMermaidBlock: the "graph LR" DECLARATION line is not flagged as a reserved word (false-positive guard)', () => {
        const block = {body: 'graph LR\n  A --> B', startLine: 1};
        expect(checkMermaidBlock(block).filter(f => f.rule === 'mermaid-reserved-word')).toHaveLength(0);
    });

    test('checkMermaidBlock: "Classify" node is not a false reserved-word hit (substring of "class")', () => {
        const block = {body: 'flowchart TD\n  Detect --> Classify["select strategy"]\n  Classify --> Heal', startLine: 1};
        expect(checkMermaidBlock(block)).toHaveLength(0);
    });

    test('checkMermaidOrientation: TD passes; small LR passes; large LR warns', () => {
        expect(checkMermaidOrientation({body: 'flowchart TD\n A-->B', startLine: 1})).toHaveLength(0);
        expect(checkMermaidOrientation({body: 'flowchart LR\n A[a]-->B[b]\n B-->C[c]', startLine: 1})).toHaveLength(0);

        const big  = ['flowchart LR', 'A[a]-->B[b]', 'B-->C[c]', 'C-->D[d]', 'D-->E[e]', 'E-->F[f]', 'F-->G[g]', 'G-->H[h]'].join('\n');
        const warn = checkMermaidOrientation({body: big, startLine: 1});

        expect(warn).toHaveLength(1);
        expect(warn[0]).toMatchObject({severity: 'WARN', rule: 'mermaid-lr-squish'});
    });

    test('checkDeadLinks: missing relative target is HARD; existing passes; external skipped', () => {
        const content = '[gone](./missing.md) [here](../there.md) [ext](https://neomjs.com/x.md)';

        const dead = checkDeadLinks(content, '/repo/learn', p => p.endsWith('there.md'));
        expect(dead).toHaveLength(1);
        expect(dead[0]).toMatchObject({severity: 'HARD', rule: 'dead-link'});
        expect(dead[0].detail).toContain('missing.md');
    });

    test('checkDeadScriptRefs: hallucinated ai:query is HARD; real ai:restore passes (#14327 class)', () => {
        const keys    = new Set(['ai:restore', 'ai:backup']);
        const content = 'Run `ai:query` then `ai:restore`, and `npm run ai:bogus`.';
        const dead    = checkDeadScriptRefs(content, keys);

        expect(dead.map(f => f.detail).join(' ')).toContain('ai:query');
        expect(dead.map(f => f.detail).join(' ')).toContain('ai:bogus');
        expect(dead.map(f => f.detail).join(' ')).not.toContain('ai:restore');
    });

    test('checkDeadScriptRefs: bare prose mention (no backtick / no "npm run") is NOT flagged', () => {
        expect(checkDeadScriptRefs('The ai:foo namespace is conceptual.', new Set())).toHaveLength(0);
    });

    test('checkProse: feature-list heading + "framework" warn; fenced code is ignored', () => {
        const content  = ['## Tools', 'text', 'Neo is not a framework.', '```', '## Tools', 'a framework example', '```'].join('\n');
        const findings = checkProse(content);

        expect(findings.filter(f => f.rule === 'feature-list-heading')).toHaveLength(1);
        expect(findings.filter(f => f.rule === 'identity-framework')).toHaveLength(1);
    });

    // A non-empty operation surface, so the guard tests exercise the heading/fence SCOPING logic
    // rather than the empty-set no-op (pinned separately below).
    const PARITY_OPS = new Set(['get_namespace_tree', 'query_raw_memories']);

    test('checkOpenApiToolParity: hallucinated tool under a Tools heading is HARD; real op passes (#14366)', () => {
        const content = ['## Tools', '', '| Tool | Desc |', '|---|---|', '| `get_namespace_tree` | real |', '| `totally_fake_tool` | fake |'].join('\n');
        const found   = checkOpenApiToolParity(content, PARITY_OPS);

        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({severity: 'HARD', rule: 'openapi-tool-parity'});
        expect(found[0].detail).toContain('totally_fake_tool');
    });

    test('checkOpenApiToolParity: config/property tables OUTSIDE a Tools heading are NOT flagged (the 56-false-HARD guard)', () => {
        const content = ['## Configuration', '', '| Key | Default |', '|---|---|', '| `id` | null |', '| `tier` | 0 |', '| `schema` | {} |'].join('\n');
        expect(checkOpenApiToolParity(content, PARITY_OPS)).toHaveLength(0);
    });

    test('checkOpenApiToolParity: a "Build Tools" heading does NOT scope rows in (narrow-heading guard)', () => {
        const content = ['## Build Tools', '', '| Name | Use |', '|---|---|', '| `webpack` | bundler |'].join('\n');
        expect(checkOpenApiToolParity(content, PARITY_OPS)).toHaveLength(0);
    });

    test('checkOpenApiToolParity: a tool table inside a fenced code block is skipped', () => {
        const content = ['## Tools', '', '```', '| `totally_fake_tool` | x |', '```'].join('\n');
        expect(checkOpenApiToolParity(content, PARITY_OPS)).toHaveLength(0);
    });

    test('checkOpenApiToolParity: empty operationIds is a no-op, NOT flag-everything (fallback-contract pin, #14382 CR)', () => {
        const content = ['## Tools', '', '| Tool | Desc |', '|---|---|', '| `totally_fake_tool` | hallucinated |'].join('\n');
        // No operation surface loaded → the forward-guard degrades to no-op; it must NOT HARD-flag
        // every tool-table row (the empty-set `!has()` fail-loud bug — the cross-family CR catch).
        expect(checkOpenApiToolParity(content, new Set())).toHaveLength(0);
    });

    test('lintGuide: a guide with no Mermaid emits a no-mermaid WARN', () => {
        const findings = lintGuide('# Guide\n\nProse only.', {filePath: 'x.md', fileDir: '/repo', scriptKeys: new Set()});
        expect(findings.some(f => f.rule === 'no-mermaid')).toBe(true);
    });

    test('lintGuide: a clean guide with a TD diagram has no no-mermaid WARN', () => {
        const content  = '# Guide\n\n```mermaid\nflowchart TD\n  A["x"] --> B["y"]\n```\n';
        const findings = lintGuide(content, {filePath: 'x.md', fileDir: '/repo', scriptKeys: new Set(), existsFn: () => true});

        expect(findings.some(f => f.rule === 'no-mermaid')).toBe(false);
    });
});
