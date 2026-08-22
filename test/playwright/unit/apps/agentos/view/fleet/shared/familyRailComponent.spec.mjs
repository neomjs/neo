import {setup} from '../../../../../../setup.mjs';

const appName = 'FleetFamilyRailTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';

test.describe('Fleet cockpit FamilyRail — data-driven era attribute, unclassified-safe (#14635)', () => {
    let FamilyRail, familyClass, familyToken, isKnownFamily;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../../../apps/agentos/view/fleet/shared/FamilyRailComponent.mjs');

        FamilyRail    = mod.default;
        familyClass   = mod.familyClass;
        familyToken   = mod.familyToken;
        isKnownFamily = mod.isKnownFamily
    });

    test('familyToken maps known families to --fm-family-*, unknown/absent to the NEUTRAL token (never human)', () => {
        expect(familyToken('claude')).toBe('--fm-family-claude');
        expect(familyToken('gpt')).toBe('--fm-family-gpt');
        expect(familyToken('gemini')).toBe('--fm-family-gemini');
        expect(familyToken('human')).toBe('--fm-family-human');
        // the key rule: unknown does NOT silently become human — it degrades to neutral
        expect(familyToken('some-new-family')).toBe('--fm-state-off');
        expect(familyToken(null)).toBe('--fm-state-off');
        expect(familyToken(undefined)).toBe('--fm-state-off');
        // prototype-shaped keys must not leak an inherited value past the closed set
        expect(familyToken('toString')).toBe('--fm-state-off');
        expect(familyToken('constructor')).toBe('--fm-state-off');
        expect(familyToken('__proto__')).toBe('--fm-state-off')
    });

    test('familyClass is the token minus the custom-property prefix for KNOWN families; unknown → null (the unclassified marker carries neutral)', () => {
        expect(familyClass('claude')).toBe('fm-family-claude');
        expect(familyClass('gpt')).toBe('fm-family-gpt');
        expect(familyClass('human')).toBe('fm-family-human');
        expect(familyClass('mystery')).toBeNull();
        expect(familyClass(null)).toBeNull();
        expect(familyClass('__proto__')).toBeNull()
    });

    test('isKnownFamily gates the unclassified marker', () => {
        expect(isKnownFamily('claude')).toBe(true);
        expect(isKnownFamily('human')).toBe(true);
        expect(isKnownFamily('mystery')).toBe(false);
        expect(isKnownFamily(null)).toBe(false);
        expect(isKnownFamily('toString')).toBe(false);
        expect(isKnownFamily('__proto__')).toBe(false)
    });

    test('FamilyRail binds --fm-rail from the family class and marks unknown/absent as unclassified', async () => {
        const rail = Neo.create(FamilyRail, {appName, family: 'claude'});
        await rail.initVnode();

        expect(rail.vdom.cls).toContain('fm-family-rail');
        expect(rail.vdom.cls).not.toContain('fm-family-unclassified');
        // the class carries the rail binding (SCSS maps it onto --fm-rail); no inline style write
        expect(rail.vdom.cls).toContain('fm-family-claude');
        expect(rail.vdom.style?.['--fm-rail']).toBeUndefined();

        // an unknown/absent family renders neutral + the unclassified marker — never a guessed family
        rail.family = 'mystery';
        expect(rail.vdom.cls).not.toContain('fm-family-claude');
        expect(rail.vdom.cls).toContain('fm-family-unclassified');

        rail.destroy()
    });

    test('a family swap re-renders the SAME resident in place (anti-lock-in episode binding)', async () => {
        const rail = Neo.create(FamilyRail, {appName, family: 'claude'});
        await rail.initVnode();

        const before = rail.id;
        // Opus→Fable is still Claude-family; a cross-family swap (Claude→GPT) is the harder case
        rail.family = 'gpt';
        expect(rail.vdom.cls).toContain('fm-family-gpt');
        expect(rail.vdom.cls).not.toContain('fm-family-claude');
        expect(rail.id).toBe(before);
        expect(rail.vdom.cls).not.toContain('fm-family-unclassified');

        rail.destroy()
    });
});
