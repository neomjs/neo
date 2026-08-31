import {test, expect} from '@playwright/test';
import fs             from 'fs';
import os             from 'os';
import path           from 'path';

import {
    AT_IMPORT_PATTERN, collectReport, PER_FILE_LIMIT_BYTES, resolveLoadedSize
} from '../../../../buildScripts/util/check-substrate-size.mjs';

/**
 * The guard exists because a substrate breach is SILENT: past the limit the tail of `AGENTS.md` is
 * truncated and every seat loses the bottom of its own rules with nothing reporting it. So the arms
 * that matter are the ones where a wrong implementation still looks green — a symlink measured as
 * its own 12-byte path string, an import stub measured as its own ~25 bytes, a renamed import
 * quietly dropped from the total.
 *
 * Sizes are the real ones from the near-miss this guard exists to catch (`AGENTS.md` 24,380 B,
 * `NOW.md` 1,586 B) so the fixture reproduces the incident's arithmetic rather than a convenient toy.
 */

const
    AGENTS_BYTES = 24380,
    NOW_BYTES    = 1586,
    // '@../AGENTS.md\n@../NOW.md\n' — the stub's own bytes, which the seat also reads.
    STUB_BYTES   = 25;

/**
 * Builds a throwaway substrate tree and returns its realpath.
 *
 * The root is realpath-resolved because `os.tmpdir()` is itself a symlink on macOS
 * (`/var` → `/private/var`); leaving it unresolved would make reported member paths relative to a
 * directory the resolved files are not actually under.
 *
 * @param {String} claudeShape Either `'symlink'` (today's tree) or `'imports'` (the near-miss shape).
 * @returns {String} Absolute realpath of the fixture root.
 */
function buildTree(claudeShape) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'substrate-size-')));

    fs.mkdirSync(path.join(root, '.agents'));
    fs.mkdirSync(path.join(root, '.claude'));

    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'A'.repeat(AGENTS_BYTES));
    fs.writeFileSync(path.join(root, 'NOW.md'),    'N'.repeat(NOW_BYTES));
    fs.writeFileSync(path.join(root, '.agents/ANTIGRAVITY_RULES.md'), 'R'.repeat(100));

    claudeShape === 'symlink' ?
        fs.symlinkSync('../AGENTS.md', path.join(root, '.claude/CLAUDE.md')) :
        fs.writeFileSync(path.join(root, '.claude/CLAUDE.md'), '@../AGENTS.md\n@../NOW.md\n');

    return root
}

const claudeRow = rows => rows.find(row => row.file === '.claude/CLAUDE.md');

test.describe('check-substrate-size — the two entry-point shapes', () => {
    test('CONTROL: the symlink tree passes, measured as the TARGET and not as the link', () => {
        const row = claudeRow(collectReport({root: buildTree('symlink')}));

        // The whole point: `lstat` on this symlink reports 12 — the length of '../AGENTS.md'. A
        // guard reporting 12 passes every conceivable substrate and is worse than no guard.
        expect(row.bytes).toBe(AGENTS_BYTES);
        expect(row.bytes).not.toBe('../AGENTS.md'.length);
        expect(row.over).toBe(false);
        expect(row.error).toBeNull();
        expect(row.headroom).toBe(PER_FILE_LIMIT_BYTES - AGENTS_BYTES)
    });

    test('the PR #17156 near-miss FAILS: two @-imports are summed as one loaded unit', () => {
        const row = claudeRow(collectReport({root: buildTree('imports')}));

        // 24,380 + 1,586 + the stub's own 25. Pinned as a literal: a summing regression that drops
        // a member or forgets the importer's own bytes must not be able to still land on it.
        expect(row.bytes).toBe(AGENTS_BYTES + NOW_BYTES + STUB_BYTES);
        expect(row.bytes).toBe(25991);
        expect(row.over).toBe(true);
        expect(row.headroom).toBe(PER_FILE_LIMIT_BYTES - 25991);
        expect(row.members).toEqual(['AGENTS.md', 'NOW.md'])
    });

    test('the same tree differs ONLY in that shape — so the shape is what the guard caught', () => {
        // Non-vacuity: both arms above must not be passing for some unrelated fixture difference.
        const symlink = claudeRow(collectReport({root: buildTree('symlink')})),
              imports = claudeRow(collectReport({root: buildTree('imports')}));

        expect(symlink.over).toBe(false);
        expect(imports.over).toBe(true);
        expect(imports.bytes - symlink.bytes).toBe(NOW_BYTES + STUB_BYTES)
    })
});

test.describe('check-substrate-size — fails closed', () => {
    test('an import naming a file that does not exist is an ERROR, never a skipped member', () => {
        const root = buildTree('imports');

        // The rename case: a budget that silently drops a missing member measures a fiction, and
        // the fiction is always SMALLER — so it passes.
        fs.rmSync(path.join(root, 'NOW.md'));

        const row = claudeRow(collectReport({root}));

        expect(row.error).toContain("imports '../NOW.md', which does not exist");
        expect(row.bytes).toBeNull();
        expect(row.over).toBe(false)
    });

    test('a missing target file is an ERROR row, not an absent row that reads as a pass', () => {
        const root = buildTree('symlink');

        fs.rmSync(path.join(root, '.agents/ANTIGRAVITY_RULES.md'));

        const rows = collectReport({root}),
              row  = rows.find(entry => entry.file === '.agents/ANTIGRAVITY_RULES.md');

        expect(rows).toHaveLength(3);
        expect(row.error).toBe('Required substrate file .agents/ANTIGRAVITY_RULES.md not found.')
    })
});

test.describe('check-substrate-size — resolution mechanics', () => {
    test('imports recurse, because an imported file may import further', () => {
        const root = buildTree('imports');

        fs.writeFileSync(path.join(root, 'NOW.md'), '@./DEEP.md\n');
        fs.writeFileSync(path.join(root, 'DEEP.md'), 'D'.repeat(500));

        const {bytes, members} = resolveLoadedSize('.claude/CLAUDE.md', {root});

        expect(members).toEqual(['AGENTS.md', 'NOW.md', 'DEEP.md']);
        expect(bytes).toBe(AGENTS_BYTES + 11 + 500 + STUB_BYTES)
    });

    test('a file reachable twice is paid for once, and a cycle terminates', () => {
        const root = buildTree('imports');

        // Both the stub (as '../AGENTS.md' from .claude/) and NOW.md (as './AGENTS.md' from the
        // root) import the same file by different paths; the loader reads it once.
        fs.writeFileSync(path.join(root, 'NOW.md'), '@./AGENTS.md\n');

        const {bytes} = resolveLoadedSize('.claude/CLAUDE.md', {root});

        // '@./AGENTS.md\n' is 13 bytes, and AGENTS.md itself is counted ONCE despite two referents —
        // the cycle guard keys on realpath, so the two spellings collapse to one identity.
        expect(bytes).toBe(AGENTS_BYTES + 13 + STUB_BYTES);
        expect(bytes).toBeLessThan(2 * AGENTS_BYTES);

        // A self-import must not recurse forever.
        fs.writeFileSync(path.join(root, 'NOW.md'), '@./NOW.md\n');
        expect(() => resolveLoadedSize('.claude/CLAUDE.md', {root})).not.toThrow()
    });

    test('only a whole-line @path is an import — a mid-prose @handle is prose', () => {
        expect('@../AGENTS.md'.match(AT_IMPORT_PATTERN)[1]).toBe('../AGENTS.md');
        expect('hand off to @tobiu (human operator)').toMatch(/@tobiu/);
        expect('hand off to @tobiu (human operator)'.match(AT_IMPORT_PATTERN)).toBeNull();
        expect('**No `<noreply@*>` footers.**'.match(AT_IMPORT_PATTERN)).toBeNull()
    })
});
