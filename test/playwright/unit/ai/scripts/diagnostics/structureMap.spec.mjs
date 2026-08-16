import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

import {
    buildStructureMap,
    countCodeLoc,
    main,
    parseArgs
} from '../../../../../../ai/scripts/diagnostics/structureMap.mjs';

function createFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-ai-structure-map-'));

    fs.mkdirSync(path.join(root, 'ai/scripts/diagnostics'), {recursive: true});
    fs.mkdirSync(path.join(root, 'ai/services/memory-core'), {recursive: true});
    fs.mkdirSync(path.join(root, 'ai/empty'), {recursive: true});

    fs.writeFileSync(path.join(root, 'ai/Agent.mjs'), [
        '#!/usr/bin/env node',
        '',
        '// comment',
        'const value = 1;',
        '/* block',
        'comment */',
        'const next = 2; // inline',
        ''
    ].join('\n'));
    fs.writeFileSync(path.join(root, 'ai/scripts/diagnostics/check.mjs'), 'export default 1;\n');
    fs.writeFileSync(path.join(root, 'ai/services/memory-core/MemoryService.mjs'), 'export const x = 1;\n');
    fs.writeFileSync(path.join(root, 'ai/services/memory-core/README.md'), '<!-- hidden -->\nText\n');

    return root;
}

test.describe('ai/scripts/diagnostics/structureMap (#14307)', () => {
    test('parseArgs defaults to the ai root and rejects unknown flags', () => {
        expect(parseArgs([])).toEqual({
            root : 'ai',
            files: undefined,
            loc  : undefined
        });

        expect(parseArgs(['--root', 'custom', '--files', '--loc'])).toEqual({
            root : 'custom',
            files: true,
            loc  : true
        });

        expect(() => parseArgs(['--unknown'])).toThrow();
    });

    test('emits sorted per-folder file counts for the configured root', () => {
        const fixture = createFixture();

        try {
            const map = buildStructureMap({cwd: fixture});

            expect(map.root).toBe('ai');
            expect(map.folders).toEqual([
                {path: 'ai', fileCount: 1},
                {path: 'ai/empty', fileCount: 0},
                {path: 'ai/scripts', fileCount: 0},
                {path: 'ai/scripts/diagnostics', fileCount: 1},
                {path: 'ai/services', fileCount: 0},
                {path: 'ai/services/memory-core', fileCount: 2}
            ]);
        } finally {
            fs.rmSync(fixture, {recursive: true, force: true});
        }
    });

    test('--files includes sorted file names per folder', () => {
        const fixture = createFixture();

        try {
            const map = buildStructureMap({cwd: fixture, includeFiles: true});

            expect(map.folders.find(folder => folder.path === 'ai/services/memory-core')).toEqual({
                path     : 'ai/services/memory-core',
                fileCount: 2,
                files    : ['MemoryService.mjs', 'README.md']
            });
        } finally {
            fs.rmSync(fixture, {recursive: true, force: true});
        }
    });

    test('--loc includes per-file code LOC and remains deterministic', () => {
        const fixture = createFixture();

        try {
            const first  = buildStructureMap({cwd: fixture, includeLoc: true}),
                  second = buildStructureMap({cwd: fixture, includeLoc: true});

            expect(JSON.stringify(first)).toBe(JSON.stringify(second));
            expect(first.folders.find(folder => folder.path === 'ai')).toEqual({
                path     : 'ai',
                fileCount: 1,
                files    : [{name: 'Agent.mjs', codeLoc: 3}]
            });
            expect(first.folders.find(folder => folder.path === 'ai/services/memory-core').files).toEqual([
                {name: 'MemoryService.mjs', codeLoc: 1},
                {name: 'README.md', codeLoc: 1}
            ]);
        } finally {
            fs.rmSync(fixture, {recursive: true, force: true});
        }
    });

    test('main writes stable pretty JSON with a trailing newline', async () => {
        const fixture = createFixture(),
              chunks  = [];

        try {
            await main(['--root', 'ai', '--files'], {
                cwd   : fixture,
                stdout: {write: value => chunks.push(value)}
            });

            const output = chunks.join('');

            expect(output.endsWith('\n')).toBe(true);
            expect(JSON.parse(output).folders[0]).toEqual({
                path     : 'ai',
                fileCount: 1,
                files    : ['Agent.mjs']
            });
        } finally {
            fs.rmSync(fixture, {recursive: true, force: true});
        }
    });

    test('countCodeLoc excludes blank lines and common comments', () => {
        expect(countCodeLoc([
            '',
            '#!/usr/bin/env node',
            '# yaml-style comment',
            'value: 1',
            '/* block */',
            'const x = 1; // inline',
            '<!-- html -->',
            'body'
        ].join('\n'), 'fixture.yaml')).toBe(4);
    });
});

test.describe('--planes projection (#16929)', () => {
    /*
     * `ai/scripts` names its folders after the VERB — `maintenance`, `diagnostics`, `lint` — and never
     * the execution plane, which is why "can this run where there is no host shell" used to mean
     * opening the file. Five of the seven folders carry more than one plane, so `planesMixed` is the
     * field that earns this projection: a folder name cannot tell you, and now the map can.
     */
    const projection = {
        'ai/scripts/maintenance': {
            planes     : {'host-edge': 4, 'container-plane': 2, unresolved: 18},
            mixed      : true,
            entrypoints: {'backup.mjs': 'container-plane'}
        },
        'ai/scripts/migrations': {
            planes     : {'host-edge': 3},
            mixed      : false,
            entrypoints: {}
        }
    };

    test('annotates folders with their tally and flags the mixed ones', () => {
        const map    = buildStructureMap({root: 'ai/scripts', includePlanes: true, planeProjection: projection}),
              byPath = Object.fromEntries(map.folders.map(folder => [folder.path, folder]));

        expect(byPath['ai/scripts/maintenance'].planes).toEqual(projection['ai/scripts/maintenance'].planes);
        expect(byPath['ai/scripts/maintenance'].planesMixed, 'a verb-named folder holding three planes is the case worth seeing').toBe(true);
        expect(byPath['ai/scripts/migrations'].planesMixed).toBe(false);
    });

    test('a folder outside the projection is left untouched, not zero-filled', () => {
        const map    = buildStructureMap({root: 'ai/scripts', includePlanes: true, planeProjection: projection}),
              absent = map.folders.find(folder => !(folder.path in projection));

        // Zero-filling would make "no entrypoints here" and "no plane could be derived" look identical.
        expect(absent).toBeTruthy();
        expect(absent.planes).toBeUndefined();
    });

    test('includePlanes WITHOUT a projection throws rather than rendering empty tallies', () => {
        // The load-bearing arm. An empty annotation reads as "this folder has no entrypoints", which
        // is the silent-default shape this whole lane exists to remove — so it must fail loudly.
        expect(() => buildStructureMap({root: 'ai/scripts', includePlanes: true}))
            .toThrow(/requires an injected planeProjection/);
    });

    test('the default path carries no plane keys at all', () => {
        // Opt-in is measured, not stylistic: the projection walks every entrypoint's import closure.
        const map = buildStructureMap({root: 'ai/scripts'});

        expect(map.folders.every(folder => folder.planes === undefined)).toBe(true);
    });
});
