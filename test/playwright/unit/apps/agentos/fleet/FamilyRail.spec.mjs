import {expect, test}                            from '@playwright/test';
import {familyClass, familyToken, isKnownFamily} from '../../../../../../apps/agentos/util/familyTokens.mjs';

// Pure family-token resolvers — imported directly, no component instantiation needed.

test.describe('FamilyRail family token mapping (#15621)', () => {
    test('kimi is a first-class family: known, mapped to its own token and rail class', () => {
        expect(isKnownFamily('kimi')).toBe(true);
        expect(familyToken('kimi')).toBe('--fm-family-kimi');
        expect(familyClass('kimi')).toBe('fm-family-kimi');
    });

    test('the closed set still holds: unknown or absent families degrade neutral, never to a guessed family', () => {
        expect(isKnownFamily('chatgpt')).toBe(false);
        expect(familyToken('chatgpt')).toBe('--fm-state-off');
        expect(familyClass('chatgpt')).toBeNull();
        expect(familyClass(undefined)).toBeNull();
        expect(isKnownFamily('toString')).toBe(false); // prototype-shaped keys cannot leak
    });

    test('every previously known family still resolves (no regression from the kimi addition)', () => {
        for (const [family, cls] of [['claude', 'fm-family-claude'], ['gpt', 'fm-family-gpt'], ['gemini', 'fm-family-gemini'], ['human', 'fm-family-human']]) {
            expect(familyClass(family)).toBe(cls);
        }
    });
});
