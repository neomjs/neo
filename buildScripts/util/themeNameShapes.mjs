/**
 * @module buildScripts/util/themeNameShapes
 * @summary Canonical custom-property name shapes for the design system: palette slots, grades, and extras,
 * the thirteen role categories, the temporary fourth-kind legacy token list,
 * the closed foreign-library property list, and `kindOf(name)`.
 *
 * Shared by `check-theme-property-prefix.mjs`, `check-theme-palette.mjs`, and `theme-census.mjs` so
 * every guard and report classifies `--neo-*` and foreign custom properties from one definition.
 */

/**
 * The active scheme property declared per theme class (`light` or `dark`).
 * @type {String}
 */
export const SCHEME_PROPERTY = '--neo-color-scheme';

/**
 * Functional palette slots (`--neo-palette-<slot>-<grade>`).
 * @type {String[]}
 */
export const PALETTE_SLOTS = Object.freeze([
    'neutral',
    'accent',
    'brand',
    'danger',
    'warning',
    'success',
    'info'
]);

/**
 * Lightness-ordered palette grades, lightest first.
 * @type {Number[]}
 */
export const PALETTE_GRADES = Object.freeze([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]);

/**
 * Palette custom properties outside the 7x11 lightness-graded slots: endpoints and translucent layers.
 * @type {Set<String>}
 */
export const PALETTE_EXTRAS = new Set([
    '--neo-palette-white',
    '--neo-palette-black',
    '--neo-palette-shade-1',
    '--neo-palette-shade-2',
    '--neo-palette-shade-3',
    '--neo-palette-shade-4',
    '--neo-palette-tint-1',
    '--neo-palette-tint-2'
]);

/**
 * The thirteen role category stems (`--neo-<category>-<role>[-<state>]`).
 * @type {String[]}
 */
export const ROLE_CATEGORIES = Object.freeze([
    'color',
    'space',
    'control',
    'font',
    'line-height',
    'letter-spacing',
    'radius',
    'border-width',
    'focus-ring',
    'opacity',
    'elevation',
    'duration',
    'ease'
]);

/**
 * Reserved second `-`-segments occupied by the thirteen role categories (`line-height` -> `line`,
 * `letter-spacing` -> `letter`, `border-width` -> `border`, `focus-ring` -> `focus`). No component stem
 * may use any of these words.
 * @type {Set<String>}
 */
export const ROLE_SECOND_SEGMENTS = new Set(ROLE_CATEGORIES.map(category => category.split('-')[0]));

/**
 * Temporary fourth-kind second-segment words for the legacy `Global.css` token skeleton, allowed behind
 * `--neo-` until steps 8 and 10 remove those tokens.
 * @type {String[]}
 */
export const OLD_SKELETON_PREFIXES = Object.freeze([
    'sem',
    'core',
    'gray',
    'green',
    'purple',
    'red',
    'yellow',
    'blue',
    'orange',
    'white',
    'black',
    'Transparent',
    'spacing',
    'height',
    'borderradius',
    'cyber'
]);

/**
 * Custom properties owned by external vendor stylesheets, mapped to their reader/producer contract so
 * engine stylesheets may set or read them without `--neo-`.
 * @type {Object<String,String>}
 */
export const FOREIGN_PROPERTIES = Object.freeze({
    '--fa-style'               : 'Font Awesome 7 sets it in its own stylesheet; Markdown.css and FileUpload.css read it',
    '--fa-style-family'        : 'Font Awesome 7 sets it in its own stylesheet; Markdown.css and FileUpload.css read it',
    '--fa-style-family-classic': 'Font Awesome 7 sets it in its own stylesheet; DateSelector, MonthYearSelector, YearComponent, and CheckBox read it',
    '--fa-width'               : 'Font Awesome 7 reads it on icon elements; Toast.css sets it'
});

const
    BARE_LEGACY_SET = new Set(['white', 'black', 'Transparent']),
    GRADE_STRINGS   = new Set(PALETTE_GRADES.map(String)),
    LEGACY_SET      = new Set(OLD_SKELETON_PREFIXES),
    SLOT_SET        = new Set(PALETTE_SLOTS),
    KEBAB_TAIL_RE   = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * @summary Classifies a CSS custom-property name into `'palette'`, `'role'`, `'legacy'`, `'component'`,
 * `'foreign'`, or `null` when the name violates the `--neo-` shape rules.
 *
 * Note: `--neo-color-scheme` classifies as `'role'` (`color` category + `scheme`), so filtering by
 * `kind === 'palette' || kind === 'role'` selects the exact cross-theme `Global.css` contract.
 * @param {String} name
 * @returns {'palette'|'role'|'legacy'|'component'|'foreign'|null}
 */
export function kindOf(name) {
    if (typeof name !== 'string') {
        return null
    }

    if (Object.hasOwn(FOREIGN_PROPERTIES, name)) {
        return 'foreign'
    }

    if (!name.startsWith('--neo-')) {
        return null
    }

    const rest = name.slice(6);

    if (!rest) {
        return null
    }

    const
        parts  = rest.split('-'),
        second = parts[0];

    if (second === 'palette') {
        if (PALETTE_EXTRAS.has(name)) {
            return 'palette'
        }

        if (parts.length === 3 && SLOT_SET.has(parts[1]) && GRADE_STRINGS.has(parts[2])) {
            return 'palette'
        }

        return null
    }

    for (const category of ROLE_CATEGORIES) {
        if (rest.startsWith(`${category}-`) && KEBAB_TAIL_RE.test(rest.slice(category.length + 1))) {
            return 'role'
        }
    }

    if (ROLE_SECOND_SEGMENTS.has(second)) {
        return null
    }

    if (LEGACY_SET.has(second)) {
        if (parts.length === 1) {
            return BARE_LEGACY_SET.has(second) ? 'legacy' : null
        }

        return parts.slice(1).every( segment => /^[A-Za-z0-9_]+$/.test(segment) ) ? 'legacy' : null
    }

    if (parts.length >= 2 && KEBAB_TAIL_RE.test(rest)) {
        return 'component'
    }

    return null
}
