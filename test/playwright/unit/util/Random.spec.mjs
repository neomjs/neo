import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'RandomTest'}});

import {test, expect}       from '@playwright/test';
import Neo                  from '../../../../src/Neo.mjs';
import * as core            from '../../../../src/core/_export.mjs';
import {createSeededRandom} from '../../../../src/util/Random.mjs';

test.describe('Neo.util.Random', () => {
    test('a seed draws the same mulberry32 sequence every time', () => {
        const random = createSeededRandom(1);

        // the published mulberry32 values for seed 1: a changed algorithm changes every seeded first frame
        expect([random(), random(), random()]).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);

        const a = createSeededRandom(19666),
              b = createSeededRandom(19666);

        expect(Array.from({length: 1000}, a)).toEqual(Array.from({length: 1000}, b))
    });

    test('different seeds draw different sequences, every value in [0, 1)', () => {
        const values = Array.from({length: 10000}, createSeededRandom(2)),
              other  = Array.from({length: 10}, createSeededRandom(3));

        expect(values.slice(0, 10)).not.toEqual(other);
        values.forEach(value => expect(value >= 0 && value < 1).toBe(true))
    });

    test('a seed is read as an unsigned 32-bit integer', () => {
        expect(createSeededRandom(-1)()).toBe(createSeededRandom(4294967295)());
        expect(createSeededRandom()()).toBe(createSeededRandom(1)())
    });
});
