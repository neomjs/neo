import {setup} from '../../../../setup.mjs';

setup({appConfig: {name: 'FleetFamilyTokensTest'}});

import {expect, test} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import FamilyTokens   from '../../../../../../apps/agentos/util/FamilyTokens.mjs';

// Pure family-token resolvers — imported directly, no component instantiation needed.

test.describe('FamilyRail family token mapping (#15621)', () => {
    test('kimi is a first-class family: known, mapped to its own token and rail class', () => {
        expect(FamilyTokens.isKnownFamily('kimi')).toBe(true);
        expect(FamilyTokens.familyToken('kimi')).toBe('--fm-family-kimi');
        expect(FamilyTokens.familyClass('kimi')).toBe('fm-family-kimi');
    });

    test('the closed set still holds: unknown or absent families degrade neutral, never to a guessed family', () => {
        expect(FamilyTokens.isKnownFamily('chatgpt')).toBe(false);
        expect(FamilyTokens.familyToken('chatgpt')).toBe('--fm-state-off');
        expect(FamilyTokens.familyClass('chatgpt')).toBeNull();
        expect(FamilyTokens.familyClass(undefined)).toBeNull();
        expect(FamilyTokens.isKnownFamily('toString')).toBe(false); // prototype-shaped keys cannot leak
    });

    test('every previously known family still resolves (no regression from the kimi addition)', () => {
        for (const [family, cls] of [['claude', 'fm-family-claude'], ['gpt', 'fm-family-gpt'], ['gemini', 'fm-family-gemini'], ['human', 'fm-family-human']]) {
            expect(FamilyTokens.familyClass(family)).toBe(cls);
        }
    });
});
