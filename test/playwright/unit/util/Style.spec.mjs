import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'StyleUtilTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Style          from '../../../../src/util/Style.mjs';

test.describe('Neo.util.Style', () => {
    test('returns added, changed, and removed properties without mutating object inputs', () => {
        const oldStyle = {
            color    : 'red',
            display  : 'block',
            marginTop: 4
        };
        const newStyle = {
            color    : 'blue',
            marginTop: 4,
            opacity  : 0.5
        };
        const oldSnapshot = structuredClone(oldStyle);
        const newSnapshot = structuredClone(newStyle);

        expect(Style.compareStyles(newStyle, oldStyle)).toEqual({
            color  : 'blue',
            opacity: 0.5,
            display: null
        });
        expect(oldStyle).toEqual(oldSnapshot);
        expect(newStyle).toEqual(newSnapshot)
    });

    test('returns null when object styles are unchanged', () => {
        expect(Style.compareStyles({color: 'blue', marginTop: 4}, {color: 'blue', marginTop: 4})).toBeNull()
    });

    test('handles either or both missing sides', () => {
        const newStyle = {color: 'blue'};
        const added    = Style.compareStyles(newStyle, null);

        expect(Style.compareStyles(null, null)).toBeNull();
        expect(added).toEqual(newStyle);
        expect(added).not.toBe(newStyle);
        expect(Style.compareStyles(null, {color: 'red', display: 'block'})).toEqual({
            color  : null,
            display: null
        })
    });

    test('normalizes string styles before comparing them', () => {
        expect(Style.compareStyles(
            'font-size: 16; margin-top: 8; color: blue',
            'font-size: 14; margin-top: 8; display: block'
        )).toEqual({
            fontSize: 16,
            color   : 'blue',
            display : null
        })
    });

    test('supports mixed object and string inputs', () => {
        expect(Style.compareStyles(
            {fontSize: 16, color: 'blue'},
            'font-size: 14; color: blue'
        )).toEqual({fontSize: 16});

        expect(Style.compareStyles(
            'font-size: 16; color: blue',
            {fontSize: 16, color: 'red'}
        )).toEqual({color: 'blue'})
    })
});
