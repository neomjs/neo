import {test, expect}  from '@playwright/test';
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {
    countInventory,
    findMirror,
    MIRRORS,
    stampMirror
} from '../../../../../buildScripts/release/engineInventory.mjs';

/**
 * Coverage for `buildScripts/release/engineInventory.mjs`: the figures it counts, and the table of sentences that
 * copy them. The table is checked against the real files, so a reworded sentence fails here instead of dropping out
 * of the cut's stamp. No test compares a copied figure with `src`: a new class never turns a pull request red.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

test.describe('buildScripts/release/engineInventory', () => {
    test('counts classes, top-level namespaces and main-thread addons other than their Base', () => {
        expect(countInventory([
            'src/Neo.mjs',
            'src/button/Base.mjs',
            'src/button/Split.mjs',
            'src/main/DomEvents.mjs',
            'src/main/addon/Base.mjs',
            'src/main/addon/Navigator.mjs',
            'src/main/addon/mixin/Remote.mjs'
        ], ['src/button/'])).toEqual({addons: 2, classes: 7, namespaces: 2, 'src/button/': 2})
    });

    test('every mirror pattern matches exactly once in its file', () => {
        for (const mirror of MIRRORS) {
            const text = fs.readFileSync(path.join(repoRoot, mirror.file), 'utf8');

            expect(findMirror(text, mirror).count, `${mirror.file} ${mirror.pattern}`).toBe(1)
        }
    });

    test('a stamp replaces only the digits of its own group', () => {
        const mirror = {file: 'x', figure: 'namespaces', pattern: /— `\d+` classes across `(\d+)` namespaces/d},
              text   = 'A platform — `439` classes across `39` namespaces, and `39` addons.';

        expect(stampMirror(text, mirror, 44)).toBe('A platform — `439` classes across `44` namespaces, and `39` addons.')
    });

    test('a sentence reworded out of its pattern is reported, not skipped', () => {
        const mirror = MIRRORS[0],
              text   = 'A platform with `503` classes in `44` namespaces.';

        expect(findMirror(text, mirror).count).toBe(0);
        expect(() => stampMirror(text, mirror, 503)).toThrow(/matches 0 times; update MIRRORS/)
    })
});
