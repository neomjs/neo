import {test, expect}   from '@playwright/test';
import {spawnSync}      from 'node:child_process';
import {readFileSync}   from 'node:fs';
import path             from 'node:path';

import {
    AGENTOS_PREFIX,
    ANCHOR_TAG_PATTERN,
    EXEMPTION_MARKERS,
    SKILL_PREFIX,
    TOP_LEVEL_MAP_FILES,
    findViolationsInLine,
    isExempt,
    isInScope,
    lintDiff,
    parseAddedLines,
    parseArgs
} from '../../../../../../ai/scripts/lint/lint-agents.mjs';

/**
 * @summary Coverage for `ai/scripts/lint/lint-agents.mjs` — the `<a id>` / `<a name>` HTML
 * anchor-tag lint guard inverted under #11584 per Discussion #11577 graduation.
 *
 * Test axes mirror #11584 AC3:
 *
 * - Lint flags new `<a id>` / `<a name>` insertions in Map substrate (AGENTS.md / AGENTS_STARTUP.md / ANTIGRAVITY_RULES.md)
 * - Lint flags new insertions in skill substrate (.agents/skills/**\/*.md)
 * - Lint flags new insertions in Agent OS substrate (learn/agentos/**\/*.md)
 * - Lint preserves positional `§\d+` and semantic `§<kebab>` refs (operator-corrected substrate permits both)
 * - Lint allows explicitly exempt lines (historical / archaeology / errata / rendered-consumer)
 * - Lint error text points authors to Discussion #11577 graduation
 *
 * Plus pure-function coverage for the exported helpers so reviewer-side V-B-A can be cheap
 * (no `git diff` shell-out required for happy-path verification).
 */
test.describe('ai/scripts/lint-agents (#11584 — <a id> anchor-tag block per Discussion #11577)', () => {
    const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lint/lint-agents.mjs');

    test('CLI: --help exits 0 with usage text', () => {
        const result = spawnSync('node', [scriptPath, '--help'], {
            cwd     : process.cwd(),
            encoding: 'utf8'
        });

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('Usage: node ai/scripts/lint/lint-agents.mjs');
        expect(result.stdout).toContain('--base');
        expect(result.stdout).toContain('Map substrate');
        expect(result.stdout).toContain('skill substrate');
        expect(result.stdout).toContain('Agent OS substrate');
    });

    test('CLI: clean substrate against HEAD passes (no diff = no violations)', () => {
        const result = spawnSync('node', [scriptPath, '--base', 'HEAD'], {
            cwd     : process.cwd(),
            encoding: 'utf8'
        });

        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain('[lint-agents] OK');
    });

    test('parseArgs: default base is origin/dev', () => {
        expect(parseArgs([])).toEqual({base: 'origin/dev'});
    });

    test('parseArgs: --base <ref> form', () => {
        expect(parseArgs(['--base', 'feat-branch'])).toEqual({base: 'feat-branch'});
    });

    test('parseArgs: --base=<ref> form', () => {
        expect(parseArgs(['--base=feat-branch'])).toEqual({base: 'feat-branch'});
    });

    test('parseArgs: --help flag', () => {
        expect(parseArgs(['--help'])).toEqual({base: 'origin/dev', help: true});
    });

    test('parseArgs: rejects unknown args', () => {
        expect(() => parseArgs(['--bogus'])).toThrow(/Unknown argument/);
    });

    test('isInScope: accepts top-level Map substrate', () => {
        expect(isInScope('AGENTS.md')).toBe(true);
        expect(isInScope('AGENTS_STARTUP.md')).toBe(true);
        expect(isInScope('.agents/ANTIGRAVITY_RULES.md')).toBe(true);
    });

    test('isInScope: accepts .agents/skills/**/*.md', () => {
        expect(isInScope('.agents/skills/pull-request/SKILL.md')).toBe(true);
        expect(isInScope('.agents/skills/pull-request/references/foo.md')).toBe(true);
    });

    test('isInScope: accepts learn/agentos/**/*.md', () => {
        expect(isInScope('learn/agentos/AGENTS_ATLAS.md')).toBe(true);
        expect(isInScope('learn/agentos/decisions/0011-substrate-numbering-convention.md')).toBe(true);
        expect(isInScope('learn/agentos/MemoryCore.md')).toBe(true);
    });

    test('isInScope: rejects non-markdown and out-of-scope paths', () => {
        expect(isInScope('.agents/skills/skills.manifest.json')).toBe(false);
        expect(isInScope('.agents/skills/pull-request/SKILL.txt')).toBe(false);
        expect(isInScope('learn/guides/fundamentals/CodebaseOverview.md')).toBe(false);
        expect(isInScope('src/Neo.mjs')).toBe(false);
        expect(isInScope('README.md')).toBe(false);
    });

    test('TOP_LEVEL_MAP_FILES export contains the 3 capped Map files', () => {
        expect(TOP_LEVEL_MAP_FILES.has('AGENTS.md')).toBe(true);
        expect(TOP_LEVEL_MAP_FILES.has('AGENTS_STARTUP.md')).toBe(true);
        expect(TOP_LEVEL_MAP_FILES.has('.agents/ANTIGRAVITY_RULES.md')).toBe(true);
        expect(TOP_LEVEL_MAP_FILES.size).toBe(3);
    });

    test('SKILL_PREFIX + AGENTOS_PREFIX exports are the canonical roots', () => {
        expect(SKILL_PREFIX).toBe('.agents/skills/');
        expect(AGENTOS_PREFIX).toBe('learn/agentos/');
    });

    test('isExempt: matches case-insensitive markers', () => {
        for (const marker of EXEMPTION_MARKERS) {
            expect(isExempt(`See ${marker}: <a id="x"></a>`)).toBe(true);
            expect(isExempt(`See ${marker.toUpperCase()}: <a id="x"></a>`)).toBe(true);
        }
    });

    test('isExempt: rendered-consumer marker exempts narrow rendered-consumer cases', () => {
        expect(isExempt('Example for renderer test (rendered-consumer): <a id="x"></a>')).toBe(true);
    });

    test('isExempt: returns false for plain text', () => {
        expect(isExempt('Inserted <a id="foo"></a> anchor tag.')).toBe(false);
        expect(isExempt('Plain live reference.')).toBe(false);
    });

    test('ANCHOR_TAG_PATTERN: matches <a id="..."> forms', () => {
        const re = new RegExp(ANCHOR_TAG_PATTERN.source, ANCHOR_TAG_PATTERN.flags);
        expect(re.test('<a id="foo">')).toBe(true);
        re.lastIndex = 0;
        expect(re.test('<a id="anchor-id"></a>')).toBe(true);
    });

    test('ANCHOR_TAG_PATTERN: matches <a name="..."> forms (legacy HTML)', () => {
        const re = new RegExp(ANCHOR_TAG_PATTERN.source, ANCHOR_TAG_PATTERN.flags);
        expect(re.test('<a name="legacy">')).toBe(true);
    });

    test('ANCHOR_TAG_PATTERN: matches with intervening attributes', () => {
        const re = new RegExp(ANCHOR_TAG_PATTERN.source, ANCHOR_TAG_PATTERN.flags);
        expect(re.test('<a class="x" id="foo">')).toBe(true);
        re.lastIndex = 0;
        expect(re.test('<a href="#x" id="foo">')).toBe(true);
    });

    test('ANCHOR_TAG_PATTERN: matches case-insensitively', () => {
        const re = new RegExp(ANCHOR_TAG_PATTERN.source, ANCHOR_TAG_PATTERN.flags);
        expect(re.test('<A ID="foo">')).toBe(true);
        re.lastIndex = 0;
        expect(re.test('<a ID="foo">')).toBe(true);
    });

    test('ANCHOR_TAG_PATTERN: does NOT match <a href="..."> regular hyperlinks', () => {
        const re = new RegExp(ANCHOR_TAG_PATTERN.source, ANCHOR_TAG_PATTERN.flags);
        expect(re.test('<a href="https://example.com">link</a>')).toBe(false);
    });

    test('ANCHOR_TAG_PATTERN: does NOT match unrelated tags starting with <a', () => {
        const re = new RegExp(ANCHOR_TAG_PATTERN.source, ANCHOR_TAG_PATTERN.flags);
        expect(re.test('<abbr title="x">HTML</abbr>')).toBe(false);
        re.lastIndex = 0;
        expect(re.test('<article id="x">')).toBe(false);
    });

    test('ANCHOR_TAG_PATTERN: does NOT match positional §N or semantic §<kebab> refs', () => {
        const re = new RegExp(ANCHOR_TAG_PATTERN.source, ANCHOR_TAG_PATTERN.flags);
        expect(re.test('See §21 for mailbox protocol.')).toBe(false);
        re.lastIndex = 0;
        expect(re.test('See §mailbox-check-protocol for the protocol.')).toBe(false);
        re.lastIndex = 0;
        expect(re.test('Section 5')).toBe(false);
    });

    test('findViolationsInLine: detects <a id> insertion in AGENTS.md (Map substrate)', () => {
        const result = findViolationsInLine({
            file: 'AGENTS.md',
            line: 100,
            text: '## <a id="mailbox-check-protocol"></a> Mailbox Check Protocol'
        });

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            file : 'AGENTS.md',
            line : 100
        });
        expect(result[0].match).toMatch(/<a\b[^>]*\sid\s*=/i);
    });

    test('findViolationsInLine: detects <a id> insertion in skill file', () => {
        const result = findViolationsInLine({
            file: '.agents/skills/pull-request/SKILL.md',
            line: 42,
            text: 'Adding <a id="example"></a> tag here.'
        });

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            file: '.agents/skills/pull-request/SKILL.md',
            line: 42
        });
    });

    test('findViolationsInLine: detects <a id> insertion in learn/agentos file', () => {
        const result = findViolationsInLine({
            file: 'learn/agentos/AGENTS_ATLAS.md',
            line: 200,
            text: '## <a id="memory-core"></a> Memory Core Section'
        });

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            file: 'learn/agentos/AGENTS_ATLAS.md',
            line: 200
        });
    });

    test('findViolationsInLine: detects multiple anchor tags on one line', () => {
        const result = findViolationsInLine({
            file: 'AGENTS.md',
            line: 42,
            text: '<a id="alpha"></a> <a id="beta"></a> two anchors.'
        });

        expect(result).toHaveLength(2);
    });

    test('findViolationsInLine: preserves positional §N references (operator-corrected substrate permits them)', () => {
        const result = findViolationsInLine({
            file: 'AGENTS.md',
            line: 42,
            text: 'See §21 for mailbox protocol.'
        });

        expect(result).toHaveLength(0);
    });

    test('findViolationsInLine: preserves semantic §<kebab> references', () => {
        const result = findViolationsInLine({
            file: 'AGENTS.md',
            line: 42,
            text: 'See §mailbox-check-protocol for the protocol.'
        });

        expect(result).toHaveLength(0);
    });

    test('findViolationsInLine: skips line with historical marker', () => {
        const result = findViolationsInLine({
            file: 'AGENTS.md',
            line: 42,
            text: 'historical: <a id="archived-section"></a> was the prior structure.'
        });

        expect(result).toHaveLength(0);
    });

    test('findViolationsInLine: skips line with rendered-consumer marker', () => {
        const result = findViolationsInLine({
            file: '.agents/skills/foo/SKILL.md',
            line: 42,
            text: '<a id="external-renderer-target"></a> rendered-consumer: justified per #NNNN.'
        });

        expect(result).toHaveLength(0);
    });

    test('findViolationsInLine: skips line outside scope (e.g. manifest JSON)', () => {
        const result = findViolationsInLine({
            file: '.agents/skills/skills.manifest.json',
            line: 1,
            text: '<a id="x">'
        });

        expect(result).toHaveLength(0);
    });

    test('findViolationsInLine: skips line outside scope (e.g. user-facing guide)', () => {
        const result = findViolationsInLine({
            file: 'learn/guides/devindex/frontend/Architecture.md',
            line: 1,
            text: '<a id="example-anchor-in-html-tutorial"></a>'
        });

        expect(result).toHaveLength(0);
    });

    test('parseAddedLines: extracts added lines with new-file line numbers', () => {
        const diff = [
            'diff --git a/AGENTS.md b/AGENTS.md',
            '--- a/AGENTS.md',
            '+++ b/AGENTS.md',
            '@@ -10,0 +11,2 @@',
            '+New line with <a id="foo"></a> tag.',
            '+Second new line.'
        ].join('\n');

        const added = parseAddedLines(diff);

        expect(added).toEqual([
            {file: 'AGENTS.md', line: 11, text: 'New line with <a id="foo"></a> tag.'},
            {file: 'AGENTS.md', line: 12, text: 'Second new line.'}
        ]);
    });

    test('parseAddedLines: ignores removed lines and pre-image headers', () => {
        const diff = [
            'diff --git a/AGENTS.md b/AGENTS.md',
            '--- a/AGENTS.md',
            '+++ b/AGENTS.md',
            '@@ -10,2 +10,1 @@',
            '-Removed line with <a id="bar"></a>.',
            '-Second removed line.',
            '+Single new line.'
        ].join('\n');

        const added = parseAddedLines(diff);

        expect(added).toHaveLength(1);
        expect(added[0].text).toBe('Single new line.');
        expect(added[0].line).toBe(10);
    });

    test('parseAddedLines: handles multi-hunk diff', () => {
        const diff = [
            'diff --git a/AGENTS.md b/AGENTS.md',
            '--- a/AGENTS.md',
            '+++ b/AGENTS.md',
            '@@ -5,0 +6,1 @@',
            '+Hunk one new line.',
            '@@ -20,0 +21,1 @@',
            '+Hunk two new line.'
        ].join('\n');

        const added = parseAddedLines(diff);

        expect(added.map(a => a.line)).toEqual([6, 21]);
    });

    test('lintDiff: surfaces violation on new <a id> insertion in AGENTS.md', () => {
        const diff = [
            'diff --git a/AGENTS.md b/AGENTS.md',
            '--- a/AGENTS.md',
            '+++ b/AGENTS.md',
            '@@ -10,0 +11,1 @@',
            '+## <a id="mailbox-check-protocol"></a> Mailbox Check Protocol'
        ].join('\n');

        const violations = lintDiff(diff);

        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            file: 'AGENTS.md',
            line: 11
        });
    });

    test('lintDiff: surfaces violation on new <a id> insertion in .agents/skills/**', () => {
        const diff = [
            'diff --git a/.agents/skills/foo/SKILL.md b/.agents/skills/foo/SKILL.md',
            '--- a/.agents/skills/foo/SKILL.md',
            '+++ b/.agents/skills/foo/SKILL.md',
            '@@ -10,0 +11,1 @@',
            '+Adding <a id="example"></a> to skill router.'
        ].join('\n');

        const violations = lintDiff(diff);

        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            file: '.agents/skills/foo/SKILL.md',
            line: 11
        });
    });

    test('lintDiff: surfaces violation on new <a id> insertion in learn/agentos/**', () => {
        const diff = [
            'diff --git a/learn/agentos/AGENTS_ATLAS.md b/learn/agentos/AGENTS_ATLAS.md',
            '--- a/learn/agentos/AGENTS_ATLAS.md',
            '+++ b/learn/agentos/AGENTS_ATLAS.md',
            '@@ -10,0 +11,1 @@',
            '+## <a id="atlas-section"></a> Atlas Section'
        ].join('\n');

        const violations = lintDiff(diff);

        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            file: 'learn/agentos/AGENTS_ATLAS.md',
            line: 11
        });
    });

    test('lintDiff: passes when new line marked with exemption marker', () => {
        const diff = [
            'diff --git a/AGENTS.md b/AGENTS.md',
            '--- a/AGENTS.md',
            '+++ b/AGENTS.md',
            '@@ -10,0 +11,1 @@',
            '+Historical: <a id="legacy-mailbox"></a> was the prior structure.'
        ].join('\n');

        const violations = lintDiff(diff);

        expect(violations).toHaveLength(0);
    });

    test('lintDiff: passes when new line uses §<ref> form (operator-corrected substrate)', () => {
        const diff = [
            'diff --git a/.agents/skills/foo/SKILL.md b/.agents/skills/foo/SKILL.md',
            '--- a/.agents/skills/foo/SKILL.md',
            '+++ b/.agents/skills/foo/SKILL.md',
            '@@ -10,0 +11,2 @@',
            '+See §21 for mailbox protocol.',
            '+And §mailbox-check-protocol for semantic form.'
        ].join('\n');

        const violations = lintDiff(diff);

        expect(violations).toHaveLength(0);
    });

    test('lintDiff: ignores diff entries outside scope (e.g. learn/guides/)', () => {
        const diff = [
            'diff --git a/learn/guides/foo.md b/learn/guides/foo.md',
            '--- a/learn/guides/foo.md',
            '+++ b/learn/guides/foo.md',
            '@@ -10,0 +11,1 @@',
            '+HTML tutorial: <a id="example"></a> shows anchor syntax.'
        ].join('\n');

        const violations = lintDiff(diff);

        // learn/guides/ is user-facing documentation, NOT Agent OS substrate. Out of scope.
        expect(violations).toHaveLength(0);
    });

    test('lintDiff: ignores removed lines containing <a id>', () => {
        const diff = [
            'diff --git a/AGENTS.md b/AGENTS.md',
            '--- a/AGENTS.md',
            '+++ b/AGENTS.md',
            '@@ -10,1 +10,0 @@',
            '-Removed line still mentioning <a id="bar"></a>.'
        ].join('\n');

        const violations = lintDiff(diff);

        expect(violations).toHaveLength(0);
    });

    test('lintDiff: handles multi-file diff across Map + skill + Agent OS substrate', () => {
        const diff = [
            'diff --git a/AGENTS.md b/AGENTS.md',
            '--- a/AGENTS.md',
            '+++ b/AGENTS.md',
            '@@ -10,0 +11,1 @@',
            '+<a id="map-anchor"></a> Map insertion',
            'diff --git a/.agents/skills/foo/SKILL.md b/.agents/skills/foo/SKILL.md',
            '--- a/.agents/skills/foo/SKILL.md',
            '+++ b/.agents/skills/foo/SKILL.md',
            '@@ -5,0 +6,1 @@',
            '+<a id="skill-anchor"></a> Skill insertion',
            'diff --git a/learn/agentos/MemoryCore.md b/learn/agentos/MemoryCore.md',
            '--- a/learn/agentos/MemoryCore.md',
            '+++ b/learn/agentos/MemoryCore.md',
            '@@ -100,0 +101,1 @@',
            '+<a id="agentos-anchor"></a> Agent OS insertion'
        ].join('\n');

        const violations = lintDiff(diff);

        expect(violations).toHaveLength(3);
        expect(violations.map(v => v.file).sort()).toEqual([
            '.agents/skills/foo/SKILL.md',
            'AGENTS.md',
            'learn/agentos/MemoryCore.md'
        ]);
    });

    test('runLint output: error text references Discussion #11577 graduation', () => {
        const lintSource = readFileSync(scriptPath, 'utf8');

        expect(lintSource).toContain('discussions/11577');
        expect(lintSource).toContain('Discussion #11577');
        expect(lintSource).toContain('§<ref>');
    });
});
