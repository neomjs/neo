import {test, expect} from '@playwright/test';

import {
    FOREIGN_PROPERTIES,
    OLD_SKELETON_PREFIXES,
    PALETTE_EXTRAS,
    PALETTE_GRADES,
    PALETTE_SLOTS,
    ROLE_CATEGORIES,
    ROLE_SECOND_SEGMENTS,
    SCHEME_PROPERTY,
    kindOf
} from '../../../../../buildScripts/util/themeNameShapes.mjs';

const neoProp = suffix => '--' + 'neo-' + suffix;

/**
 * @summary Unit suite for `buildScripts/util/themeNameShapes.mjs`.
 */
test.describe('themeNameShapes — canonical kindOf() classification and closed lists', () => {
    test('exports frozen/closed palette, role, legacy-skeleton, and foreign-property sets', () => {
        expect(SCHEME_PROPERTY).toBe('--neo-color-scheme');
        expect(PALETTE_SLOTS).toHaveLength(7);
        expect(PALETTE_GRADES).toHaveLength(11);
        expect(PALETTE_EXTRAS.size).toBe(9);
        expect(ROLE_CATEGORIES).toHaveLength(13);
        expect(ROLE_SECOND_SEGMENTS.size).toBe(13);
        expect(OLD_SKELETON_PREFIXES).toHaveLength(16);
        expect(Object.keys(FOREIGN_PROPERTIES)).toEqual([
            '--fa-style',
            '--fa-style-family',
            '--fa-style-family-classic',
            '--fa-width'
        ])
    });

    test('classifies palette, role (including --neo-color-scheme), legacy skeleton, component, and foreign names', () => {
        expect(kindOf('--neo-palette-neutral-50')).toBe('palette');
        expect(kindOf('--neo-palette-accent-600')).toBe('palette');
        expect(kindOf('--neo-palette-shade-2')).toBe('palette');
        expect(kindOf('--neo-palette-white')).toBe('palette');

        expect(kindOf('--neo-color-scheme')).toBe('role');
        expect(kindOf('--neo-color-text-default')).toBe('role');
        expect(kindOf('--neo-space-0-5')).toBe('role');
        expect(kindOf('--neo-line-height-normal')).toBe('role');
        expect(kindOf('--neo-letter-spacing-heading')).toBe('role');
        expect(kindOf('--neo-border-width-thin')).toBe('role');
        expect(kindOf('--neo-focus-ring-width')).toBe('role');
        expect(kindOf(neoProp('duration-fast'))).toBe('role');
        expect(kindOf(neoProp('ease-out'))).toBe('role');
        expect(kindOf('--neo-font-smoothing')).toBe('role');

        expect(kindOf(neoProp('sem-color-text-neutral-default'))).toBe('legacy');
        expect(kindOf(neoProp('core-fontfamily-sans'))).toBe('legacy');
        expect(kindOf(neoProp('gray-500'))).toBe('legacy');
        expect(kindOf(neoProp('white'))).toBe('legacy');
        expect(kindOf(neoProp('white-off'))).toBe('legacy');
        expect(kindOf(neoProp('black'))).toBe('legacy');
        expect(kindOf(neoProp('Transparent'))).toBe('legacy');
        expect(kindOf(neoProp('spacing-16'))).toBe('legacy');
        expect(kindOf(neoProp('cyber-cyan'))).toBe('legacy');

        expect(kindOf(neoProp('button-background-color'))).toBe('component');
        expect(kindOf(neoProp('button-primary-glyph-color-hover'))).toBe('component');
        expect(kindOf(neoProp('global-color'))).toBe('component');

        expect(kindOf('--fa-width')).toBe('foreign');
        expect(kindOf('--fa-style-family-classic')).toBe('foreign')
    });

    test('rejects unprefixed non-foreign names, single-segment --neo-* names, bad palette slots/grades, and component collisions with role words', () => {
        expect(kindOf('--fixture-button-color')).toBeNull();
        expect(kindOf('--fa-unknown')).toBeNull();
        expect(kindOf(neoProp('color'))).toBeNull();
        expect(kindOf(neoProp('duration'))).toBeNull();
        expect(kindOf(neoProp('easing'))).toBeNull();
        expect(kindOf(neoProp('button'))).toBeNull();
        expect(kindOf(neoProp('palette-purple-400'))).toBeNull();
        expect(kindOf(neoProp('palette-accent-350'))).toBeNull();
        expect(kindOf(neoProp('border-color'))).toBeNull();
        expect(kindOf(neoProp('line-color'))).toBeNull();
        expect(kindOf(neoProp('focus-color'))).toBeNull();
        expect(kindOf(neoProp('letter-width'))).toBeNull();
        expect(kindOf(neoProp('spacing'))).toBeNull();
        expect(kindOf(neoProp('demo--atom'))).toBeNull();
        expect(kindOf(neoProp('demo-'))).toBeNull();
        expect(kindOf(neoProp('-demo'))).toBeNull();
        expect(kindOf(neoProp('sem--bad'))).toBeNull();
        expect(kindOf(neoProp('sem-bad-'))).toBeNull()
    })
});
