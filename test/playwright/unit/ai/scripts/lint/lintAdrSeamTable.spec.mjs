import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'LintAdrSeamTableTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import fs             from 'fs';
import os             from 'os';
import path           from 'path';

import {
    checkSeamTable,
    findCompositionAdr,
    listPresentAdrIds,
    listSeamTableRowIds
} from '../../../../../../ai/scripts/lint/lint-adr-seam-table.mjs';

const TABLE = (rows) => [
    '# ADR 9990: Composition Fixture',
    '',
    '## §2 The Seam Table',
    '',
    '| ADR | Surface | Owned seam | Parent |',
    '|---|---|---|---|',
    ...rows.map(id => `| ${id} | X | Y | — |`),
    '',
    '## §3 Next Section',
    'prose'
].join('\n');

function fixtureDir(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-adr-lint-'));

    for (const [name, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(dir, name), content, 'utf8')
    }

    return dir
}

test.describe('ai.scripts.lint.lint-adr-seam-table (#14525)', () => {

    test('listPresentAdrIds derives 4-digit ids from filenames only', () => {
        const dir = fixtureDir({
            '0001-a.md' : 'x',
            '0002-b.md' : 'x',
            'notes.md'  : 'x',
            '123-bad.md': 'x'
        });

        expect(listPresentAdrIds(dir)).toEqual(['0001', '0002']);
        fs.rmSync(dir, {recursive: true, force: true});
    });

    test('findCompositionAdr locates by content marker, never by filename', () => {
        const dir = fixtureDir({
            '0001-a.md'   : 'no table here',
            '0007-comp.md': TABLE(['0001', '0007'])
        });

        expect(findCompositionAdr(dir)?.file).toBe('0007-comp.md');
        fs.rmSync(dir, {recursive: true, force: true});
    });

    test('listSeamTableRowIds parses only the §2 table section — rows after the next heading are ignored', () => {
        const content = TABLE(['0001', '0002']) + '\n| 0099 | outside | the table | — |\n';

        // 0099 sits AFTER '## §3 Next Section', so the parser must not see it.
        expect(listSeamTableRowIds(content)).toEqual(['0001', '0002']);
    });

    test('checkSeamTable passes when ids and rows match both directions', () => {
        const dir = fixtureDir({
            '0001-a.md'   : 'x',
            '0002-comp.md': TABLE(['0001', '0002'])
        });

        const result = checkSeamTable(dir);

        expect(result.ok).toBe(true);
        expect(result.missingRows).toEqual([]);
        expect(result.ghostRows).toEqual([]);
        fs.rmSync(dir, {recursive: true, force: true});
    });

    test('checkSeamTable fails with a MISSING row when a present ADR has no table entry', () => {
        const dir = fixtureDir({
            '0001-a.md'   : 'x',
            '0002-b.md'   : 'x',
            '0003-comp.md': TABLE(['0001', '0003'])
        });

        const result = checkSeamTable(dir);

        expect(result.ok).toBe(false);
        expect(result.missingRows).toEqual(['0002']);
        expect(result.ghostRows).toEqual([]);
        fs.rmSync(dir, {recursive: true, force: true});
    });

    test('checkSeamTable fails with a GHOST row when the table names an absent ADR', () => {
        const dir = fixtureDir({
            '0001-a.md'   : 'x',
            '0002-comp.md': TABLE(['0001', '0002', '0042'])
        });

        const result = checkSeamTable(dir);

        expect(result.ok).toBe(false);
        expect(result.missingRows).toEqual([]);
        expect(result.ghostRows).toEqual(['0042']);
        fs.rmSync(dir, {recursive: true, force: true});
    });

    test('checkSeamTable fails when no composition ADR exists', () => {
        const dir = fixtureDir({'0001-a.md': 'no marker'});

        const result = checkSeamTable(dir);

        expect(result.ok).toBe(false);
        expect(result.file).toBeNull();
        fs.rmSync(dir, {recursive: true, force: true});
    });

    test('checkSeamTable fails on DUPLICATE rows — set equality is not cardinality (gpt RA, PR #14527)', () => {
        const dir = fixtureDir({
            '0001-a.md'   : 'x',
            '9990-comp.md': TABLE(['0001', '0001', '9990'])
        });

        const result = checkSeamTable(dir);

        expect(result.ok).toBe(false);
        expect(result.duplicateRows).toEqual(['0001']);
        expect(result.missingRows).toEqual([]);
        expect(result.ghostRows).toEqual([]);
        fs.rmSync(dir, {recursive: true, force: true});
    });

    test('checkSeamTable fails on MULTIPLE marker files — exactly one composition record (Grace hardening)', () => {
        const dir = fixtureDir({
            '0001-a.md'   : TABLE(['0001', '0002']),
            '0002-comp.md': TABLE(['0001', '0002'])
        });

        const result = checkSeamTable(dir);

        expect(result.ok).toBe(false);
        expect(result.ambiguousFiles).toEqual(['0001-a.md', '0002-comp.md']);
        fs.rmSync(dir, {recursive: true, force: true});
    });
});
