import {test, expect} from '@playwright/test';
import fs             from 'fs';
import os             from 'os';
import path           from 'path';
import {
    collectUnresolved,
    extractEntrypoints,
    readRelativeSpecifiers
} from '../../../../../../ai/scripts/lint/lint-npm-script-entrypoints.mjs';


// Pure-ish lint module: no Neo runtime; fixtures are real files in a per-suite tmp dir.

const
    repoRoot   = path.resolve(import.meta.dirname, '../../../../../..'),
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-entrypoint-lint-'));

/**
 * Writes a fixture file relative to the fixture root.
 * @param {String} relPath
 * @param {String} content
 */
function writeFixture(relPath, content) {
    const absPath = path.join(fixtureDir, relPath);
    fs.mkdirSync(path.dirname(absPath), {recursive: true});
    fs.writeFileSync(absPath, content);
}

test.describe('lint-npm-script-entrypoints — the dead-published-entrypoint guard', () => {
    test('extractEntrypoints classifies every ai/scripts path shape and reports what it cannot', () => {
        const {entries, unclassifiable} = extractEntrypoints({
            'ai:agent'       : 'node ./ai/scripts/runners/runAgent.mjs',
            'ai:benchmark'   : 'node --expose-gc ./ai/scripts/benchmark/probe.mjs',
            'ai:bare'        : 'node ai/scripts/maintenance/no-dot-slash.mjs',
            'ai:reseed'      : 'node ./ai/scripts/maintenance/restore.mjs --operation reseed',
            'ai:fleet-server': 'node ./ai/services/fleet/devFleetServer.mjs',
            'build'          : 'node ./buildScripts/buildAll.mjs',
            'ai:piped'       : 'node ./buildScripts/x.mjs && node ./ai/scripts/maintenance/y.mjs',
            'ai:compound'    : 'node ./ai/scripts/one.mjs && node ./ai/scripts/two.mjs',
            'ai:mention-only': 'echo ai/scripts is the scripts home'
        });

        // Every extractable shape is CLASSIFIED — bare `ai/scripts/…`, flags, trailing args,
        // pipes, and both halves of a compound command. Nothing checkable falls out of the count.
        expect(entries).toEqual([
            {name: 'ai:agent',     entry: './ai/scripts/runners/runAgent.mjs'},
            {name: 'ai:benchmark', entry: './ai/scripts/benchmark/probe.mjs'},
            {name: 'ai:bare',      entry: './ai/scripts/maintenance/no-dot-slash.mjs'},
            {name: 'ai:reseed',    entry: './ai/scripts/maintenance/restore.mjs'},
            {name: 'ai:piped',     entry: './ai/scripts/maintenance/y.mjs'},
            {name: 'ai:compound',  entry: './ai/scripts/one.mjs'},
            {name: 'ai:compound',  entry: './ai/scripts/two.mjs'}
        ]);

        // A reference with no extractable entrypoint is REPORTED — the count can never shrink silently.
        expect(unclassifiable).toEqual([
            {name: 'ai:mention-only', command: 'echo ai/scripts is the scripts home'}
        ]);
    });

    test('readRelativeSpecifiers reads the parse tree — comments and dynamic import are not edges', () => {
        const source = [
            'import fs from "node:fs";',
            'import {a} from "./real.mjs";',
            'export {b} from "./also-real.mjs";',
            '/**',
            ' * @example',
            ' * import Ghost from "./docs-placeholder.mjs";',
            ' */',
            'const later = await import("./dynamic.mjs");'
        ].join('\n');

        expect(readRelativeSpecifiers(source, '/x/entry.mjs')).toEqual(['./real.mjs', './also-real.mjs']);
    });

    test('a clean transitive tree reports nothing — cycles terminate', () => {
        writeFixture('ai/scripts/entry.mjs', 'import {a} from "./a.mjs";\nconsole.log(a);');
        writeFixture('ai/scripts/a.mjs', 'import {b} from "./b.mjs";\nexport const a = b;');
        writeFixture('ai/scripts/b.mjs', 'import {a} from "./a.mjs";\nexport const b = 1;');

        expect(collectUnresolved({entryFile: 'ai/scripts/entry.mjs', rootDir: fixtureDir})).toEqual([]);
    });

    test('RED-PROOF — an entry pointing at a nonexistent module is reported, entry or transitive', () => {
        writeFixture('ai/scripts/broken-entry.mjs', 'import {x} from "./does-not-exist.mjs";');
        writeFixture('ai/scripts/via-middle.mjs', 'import {m} from "./middle.mjs";');
        writeFixture('ai/scripts/middle.mjs', 'import {g} from "./gone.mjs";\nexport const m = 1;');

        const direct     = collectUnresolved({entryFile: 'ai/scripts/broken-entry.mjs', rootDir: fixtureDir}),
              transitive = collectUnresolved({entryFile: 'ai/scripts/via-middle.mjs', rootDir: fixtureDir});

        expect(direct.length).toBe(1);
        expect(direct[0]).toContain('does-not-exist.mjs');
        // The break is attributed to the entry that reached it, one level down or many.
        expect(transitive.length).toBe(1);
        expect(transitive[0]).toContain('gone.mjs');
        expect(transitive[0]).toContain('via-middle.mjs');
    });

    test('a gitignored config.mjs overlay resolves through its committed template sibling', () => {
        // The fresh-clone condition: the overlay is absent, the template is the committed canonical.
        writeFixture('ai/scripts/overlay/entry.mjs', 'import cfg from "./config.mjs";\nconsole.log(cfg);');
        writeFixture('ai/scripts/overlay/config.template.mjs', 'export default {};');
        writeFixture('ai/scripts/bare/entry.mjs', 'import cfg from "./config.mjs";\nconsole.log(cfg);');

        expect(collectUnresolved({entryFile: 'ai/scripts/overlay/entry.mjs', rootDir: fixtureDir})).toEqual([]);

        // A config.mjs specifier with NO template sibling stays a violation.
        const bare = collectUnresolved({entryFile: 'ai/scripts/bare/entry.mjs', rootDir: fixtureDir});

        expect(bare.length).toBe(1);
        expect(bare[0]).toContain('config.mjs');
    });

    test('a relative specifier resolving to a directory is rejected — ESM rejects directory imports', () => {
        writeFixture('ai/scripts/dir/entry.mjs', 'import {x} from "./foo";');
        fs.mkdirSync(path.join(fixtureDir, 'ai/scripts/dir/foo'), {recursive: true});

        const result = collectUnresolved({entryFile: 'ai/scripts/dir/entry.mjs', rootDir: fixtureDir});

        expect(result.length).toBe(1);
        expect(result[0]).toContain('ERR_UNSUPPORTED_DIR_IMPORT');
    });

    test('an unreadable entry file itself is reported', () => {
        const result = collectUnresolved({entryFile: 'ai/scripts/absent.mjs', rootDir: fixtureDir});

        expect(result.length).toBe(1);
        expect(result[0]).toContain('cannot read');
    });

    test('the real package.json tree is clean — the pin that would have caught the specimen', () => {
        const pkg                       = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')),
              {entries, unclassifiable} = extractEntrypoints(pkg.scripts),
              okCache                   = new Set(),
              violations                = entries.flatMap(({entry}) => collectUnresolved({entryFile: entry, rootDir: repoRoot, okCache}));

        expect(entries.length).toBeGreaterThan(0);
        expect(violations).toEqual([]);
        // The truthful-coverage pin: today nothing is unclassifiable, so if a future entry
        // escapes classification this arm fails here rather than shrinking the count silently.
        expect(unclassifiable).toEqual([]);
    });
});
