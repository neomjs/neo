#!/usr/bin/env node
/**
 * @module buildScripts/util/check-theme-palette
 * @summary Holds every theme palette to its measurable rules: a grade has one lightness in every slot, a
 * slot's grades descend in lightness, the text, border and focus-ring pairs meet their contrast floors in each
 * scheme the theme declares, and every palette declares the same `--neo-` names as every other.
 *
 * A palette is a theme class for which a sheet declares a `--neo-palette-*` name. A theme without one is not
 * written against the roles yet: it is skipped, and it declares no colour role but the scheme. This check
 * models no cascade and reads no condition, so it holds the names it measures, every `--neo-palette-*` and
 * `--neo-color-*` name of a palette, to one reading: one value per theme class, declared on the class itself
 * (`.neo-theme-x`, `:root .neo-theme-x`, or the root that holds it), under no condition, read from measured
 * names only. It reads every sheet under `resources/css` for that, as syntax alone, and any other place that
 * declares or registers such a name fails, as does a sheet whose brackets do not balance. A scale role may be
 * re-valued by a scope or a condition, as the reduced-motion collapse does.
 *
 * Three things are outside this check: a value set from JavaScript, a sheet reached through `@import`, and a
 * `color-scheme` that a rule sets against the one `src` wires from `--neo-color-scheme`. The lightness numbers
 * are each theme's own, so a palette is compared with itself and never with a table. Contrast is measured on
 * the resolved colours and never read off the grade distance: OKLCH lightness is not luminance.
 */
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import isEntryModule   from './isEntryModule.mjs';
import {cssFiles}      from './themeCss.mjs';

const
    dirname  = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot = path.resolve(dirname, '../..');

/**
 * Every tracked surface whose contents can change this guard's verdict, as repo-relative globs.
 * @type {String[]}
 */
export const SCAN_SURFACE = Object.freeze(['resources/css/**/*.css']);

/**
 * The eleven palette grades, lightest first.
 * @type {Number[]}
 */
export const GRADES = Object.freeze([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]);

/**
 * The palette names outside the grades: two ends and the translucent layers.
 * @type {Set<String>}
 */
const PALETTE_EXTRAS = new Set([
    '--neo-palette-white',
    '--neo-palette-black',
    '--neo-palette-shade-1',
    '--neo-palette-shade-2',
    '--neo-palette-shade-3',
    '--neo-palette-shade-4',
    '--neo-palette-tint-1',
    '--neo-palette-tint-2'
]);

const
    BACKGROUND = '--neo-color-background-',
    BORDER     = '--neo-color-border-',
    CANVAS     = BACKGROUND + 'canvas',
    SCHEME     = '--neo-color-scheme',
    STATUSES   = Object.freeze(['danger', 'warning', 'success', 'info']),
    TEXT       = '--neo-color-text-';

/**
 * How far one slot's reading of a grade may sit from another's. An `oklch()` literal states its lightness;
 * a hex or rgb value carries 8-bit rounding.
 * @type {Object<String,Number>}
 */
const TOLERANCE = Object.freeze({
    converted: 0.006,
    literal  : 0.0005
});

/**
 * The pairs a palette keeps readable, as `[foreground, background, floor]`: text needs 4.5:1 on its
 * region, a border and the focus ring 3:1. A translucent background is measured over the canvas.
 * @type {Array[]}
 */
export const CONTRAST_PAIRS = Object.freeze([
    [TEXT + 'default',         CANVAS,                         4.5],
    [TEXT + 'default',         BACKGROUND + 'surface-raised',  4.5],
    [TEXT + 'default',         BACKGROUND + 'field',           4.5],
    [TEXT + 'default',         BACKGROUND + 'neutral-hover',   4.5],
    [TEXT + 'default',         BACKGROUND + 'neutral-active',  4.5],
    [TEXT + 'default',         BACKGROUND + 'accent-subtle',   4.5],
    [TEXT + 'default',         BACKGROUND + 'selected',        4.5],
    [TEXT + 'strong',          CANVAS,                         4.5],
    [TEXT + 'muted',           CANVAS,                         4.5],
    [TEXT + 'muted',           BACKGROUND + 'surface-raised',  4.5],
    [TEXT + 'subtle',          CANVAS,                         4.5],
    [TEXT + 'subtle',          BACKGROUND + 'field',           4.5],
    [TEXT + 'inverse',         BACKGROUND + 'inverse',         4.5],
    [TEXT + 'accent',          CANVAS,                         4.5],
    [TEXT + 'accent',          BACKGROUND + 'surface-raised',  4.5],
    [TEXT + 'accent',          BACKGROUND + 'accent-subtle',   4.5],
    [TEXT + 'on-accent',       BACKGROUND + 'accent',          4.5],
    [TEXT + 'on-accent',       BACKGROUND + 'accent-hover',    4.5],
    [TEXT + 'on-accent',       BACKGROUND + 'accent-active',   4.5],
    [TEXT + 'brand',           CANVAS,                         4.5],
    [TEXT + 'brand',           BACKGROUND + 'brand-subtle',    4.5],
    ...STATUSES.flatMap(status => [
        [TEXT + status,        CANVAS,                         4.5],
        [TEXT + status,        BACKGROUND + status + '-subtle', 4.5],
        [BORDER + status,      CANVAS,                         3]
    ]),
    [BORDER + 'accent',        CANVAS,                         3],
    [BORDER + 'strong',        CANVAS,                         3],
    [BORDER + 'strong',        BACKGROUND + 'field',           3],
    ['--neo-color-focus-ring', CANVAS,                         3]
]);

/**
 * @summary Turns one gamma-encoded sRGB channel into linear light.
 * @param {Number} value 0 to 1
 * @returns {Number}
 */
function toLinear(value) {
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/**
 * @summary Converts an OKLCH colour into gamma-encoded sRGB, clamped to the gamut.
 * @param {Number[]} lch Lightness 0 to 1, chroma, hue in degrees
 * @returns {Number[]} `[r, g, b]`, each 0 to 1
 */
function oklchToRgb([lightness, chroma, hue]) {
    const
        a = chroma * Math.cos(hue * Math.PI / 180),
        b = chroma * Math.sin(hue * Math.PI / 180),
        l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3,
        m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3,
        s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;

    return [
         4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ].map(value => {
        const clamped = Math.min(1, Math.max(0, value));

        return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * (clamped ** (1 / 2.4)) - 0.055
    })
}

/**
 * @summary The OKLCH lightness of a gamma-encoded sRGB colour.
 * @param {Number[]} rgb `[r, g, b]`, each 0 to 1
 * @returns {Number}
 */
function oklchLightness(rgb) {
    const
        [r, g, b] = rgb.map(toLinear),
        l         = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
        m         = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
        s         = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

    return 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
}

/**
 * @summary The WCAG contrast ratio of two opaque sRGB colours.
 * @param {Number[]} rgbA
 * @param {Number[]} rgbB
 * @returns {Number}
 */
export function contrastRatio(rgbA, rgbB) {
    const [a, b] = [rgbA, rgbB].map(rgb => {
        const [red, green, blue] = rgb.map(toLinear);

        return 0.2126 * red + 0.7152 * green + 0.0722 * blue
    });

    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/**
 * @summary Composites a colour with alpha over an opaque one.
 * @param {Number[]} top `[r, g, b, alpha]`
 * @param {Number[]} bottom `[r, g, b]`
 * @returns {Number[]} `[r, g, b]`
 */
function composite([red, green, blue, alpha], bottom) {
    return [red, green, blue].map((value, index) => value * alpha + bottom[index] * (1 - alpha))
}

/**
 * @summary Reads a number that CSS may write as a percentage.
 * @param {String} text
 * @returns {Number}
 */
function fraction(text) {
    return text.endsWith('%') ? parseFloat(text) / 100 : parseFloat(text)
}

/**
 * @summary Holds a channel to the range a browser clamps it to.
 * @param {Number} value
 * @param {Number} [max=1]
 * @returns {Number}
 */
function clamp(value, max=1) {
    return Math.min(max, Math.max(0, value))
}

const
    NUMBER = '[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)',
    OKLCH  = new RegExp(`^oklch\\(\\s*(${NUMBER}%?)\\s+(${NUMBER})\\s+(${NUMBER})(?:deg)?\\s*(?:\\/\\s*(${NUMBER}%?))?\\s*\\)$`),
    // A browser reads two forms: commas throughout, or spaces with `/ alpha`. A mixture is no colour.
    RGB_COMMAS = new RegExp(`^rgba?\\(\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*(?:,\\s*(${NUMBER}%?))?\\s*\\)$`),
    RGB_SPACES = new RegExp(`^rgba?\\(\\s*(${NUMBER})\\s+(${NUMBER})\\s+(${NUMBER})\\s*(?:\\/\\s*(${NUMBER}%?))?\\s*\\)$`);

/**
 * @summary Parses a resolved CSS colour as a browser paints it: a channel out of range is clamped. Returns
 * null for a syntax this check cannot measure or a number it cannot read, so a caller fails closed instead
 * of passing a pair it did not read.
 * @param {String} text
 * @returns {{rgba: Number[], lightness: Number, literal: Boolean}|null} `literal` marks a stated OKLCH lightness
 */
export function parseColor(text) {
    const
        value   = text.trim().toLowerCase(),
        alphaOf = part => part === undefined ? 1 : clamp(fraction(part)),
        finite  = color => [...color.rgba, color.lightness].every(Number.isFinite) ? color : null;

    let match, rgb;

    if (value === 'transparent') {
        return {rgba: [0, 0, 0, 0], lightness: 0, literal: false}
    }

    if ((match = value.match(OKLCH))) {
        const lightness = clamp(fraction(match[1]));

        rgb = oklchToRgb([lightness, Math.max(0, parseFloat(match[2])), parseFloat(match[3])]);

        return finite({rgba: [...rgb, alphaOf(match[4])], lightness, literal: true})
    }

    if ((match = value.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/))) {
        const
            hex   = match[1].length < 6 ? [...match[1]].map(char => char + char).join('') : match[1],
            bytes = hex.match(/../g).map(pair => parseInt(pair, 16) / 255);

        rgb = bytes.slice(0, 3);

        return {rgba: [...rgb, bytes[3] ?? 1], lightness: oklchLightness(rgb), literal: false}
    }

    if ((match = value.match(RGB_SPACES) || value.match(RGB_COMMAS))) {
        rgb = [match[1], match[2], match[3]].map(channel => clamp(parseFloat(channel), 255) / 255);

        return finite({rgba: [...rgb, alphaOf(match[4])], lightness: oklchLightness(rgb), literal: false})
    }

    return null
}

/**
 * @summary Resolves a declaration's value for one scheme: each `var()` read is replaced from
 * `declarations`, and each `light-dark(a, b)` gives `a` for light and `b` for dark.
 * @param {String} value
 * @param {Map<String,String>} declarations
 * @param {String} scheme `light` or `dark`
 * @returns {String|null} null when a read has no declaration, carries a fallback, or the nesting does not end
 */
export function resolveValue(value, declarations, scheme) {
    let text = value.trim();

    for (let round = 0; round < 32 && /var\(|light-dark\(/.test(text); round++) {
        let missing = false;

        text = text.replace(/var\(\s*(--[a-zA-Z0-9_-]+)\s*\)/g, (read, name) => {
            if (!declarations.has(name)) {
                missing = true;
                return read
            }

            return declarations.get(name)
        });

        if (missing) {
            return null
        }

        const start = text.indexOf('light-dark(');

        if (start !== -1 && !text.includes('var(')) {
            const args = [''];

            let depth = 1,
                end   = start + 11;

            for (; end < text.length; end++) {
                const char = text[end];

                if (char === '(') {
                    depth++
                } else if (char === ')' && --depth === 0) {
                    break
                }

                if (char === ',' && depth === 1) {
                    args.push('')
                } else {
                    args[args.length - 1] += char
                }
            }

            if (depth !== 0 || args.length !== 2) {
                return null
            }

            text = text.slice(0, start) + args[scheme === 'light' ? 0 : 1].trim() + text.slice(end + 1)
        }
    }

    return /var\(|light-dark\(/.test(text) ? null : text.trim()
}

/**
 * @summary Whether this check measures a name: a palette entry or a colour role, the scheme included. Only
 * such a name can change a verdict given here, so only it is held to one reading.
 * @param {String} name
 * @returns {Boolean}
 */
function isMeasured(name) {
    return name.startsWith('--neo-palette-') || name.startsWith('--neo-color-')
}

/**
 * Every place a sheet spells a custom property as a declaration (`--name:`) or a registration
 * (`@property --name {`). A `var()` read is followed by neither, and a query such as
 * `@container style(--name: value)` writes the name behind an opening parenthesis.
 * @type {RegExp}
 */
const SPELLED = /(?<![\w-]|\(\s*)(--[a-zA-Z0-9_-]+)\s*[:{]/g;

/**
 * What a brace, a semicolon or a comment mark can hide in: an escape, a comment, a string, an unquoted `url()`.
 * A string without its closing quote ends where its line ends, as a browser's tokenizer ends it.
 * @type {RegExp}
 */
const OPAQUE = /\\[^]|\/\*[^]*?\*\/|"(?:\\[^]|[^"\\\n])*"?|'(?:\\[^]|[^'\\\n])*'?|url\(\s*(?:\\[^]|[^"'()\\\s])(?:\\[^]|[^()\\])*\)/gi;

/**
 * @summary Reads a stylesheet as its syntax alone: no comment, every string and unquoted `url()` emptied, and
 * each escape that spells a name character written out. A brace, a semicolon or a comment mark inside a string
 * is then no syntax for this check either, and `.neo-theme-neo-li\67ht` is read as a browser reads it.
 * @param {String} file
 * @returns {String}
 */
function readSheet(file) {
    return fs.readFileSync(file, 'utf8')
        .replace(OPAQUE, token => ({'\\': token, '/': ' ', '"': '""', '\'': '\'\''})[token[0]] ?? 'url()')
        .replace(/\\(?:([0-9a-fA-F]{1,6})\s?|([^0-9a-fA-F\s]))/g, (escape, hex, char) => {
            const spelled = hex ? String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10FFFF)) : char;

            return /[\w-]/.test(spelled) ? spelled : escape
        })
}

/**
 * @summary Whether every bracket of a sheet read by `readSheet` closes the one opened last. Where one does
 * not, a browser's blocks and this check's part ways: after `--probe: (} .a {);` it drops the rest of the sheet.
 * @param {String} css
 * @returns {Boolean}
 */
function isBalanced(css) {
    const
        closers = {'(': ')', '[': ']', '{': '}'},
        open    = [];

    for (let index = 0; index < css.length; index++) {
        const char = css[index];

        if (char === '\\') {
            index++
        } else if (closers[char]) {
            open.push(closers[char])
        } else if ((char === ')' || char === ']' || char === '}') && open.pop() !== char) {
            return false
        }
    }

    return open.length === 0
}

/**
 * The selectors that declare on a theme class itself: the class, `:root` before it, and the root that holds
 * it as a child. Any other selector reaches elements this check cannot name.
 * @type {RegExp}
 */
const OWN_SELECTOR = /^(?::root\s+)?\.(neo-theme-[a-zA-Z0-9_-]+)$|^:root:has\(\s*>\s*\.(neo-theme-[a-zA-Z0-9_-]+)\s*\)$/;

/**
 * @summary The theme classes a rule declares on: every alternative of its selector list, bare or inside one
 * `:where()`, has to be such a selector. Empty for any other rule, and for the structural `neo-theme-scope`.
 * @param {String} header
 * @returns {String[]}
 */
function ownThemeClasses(header) {
    const names = (header.match(/^:where\(([^]*)\)$/)?.[1] ?? header).split(',').map(part => {
        const match = part.trim().match(OWN_SELECTOR);

        return match?.[1] ?? match?.[2]
    });

    return names.every(name => name && name !== 'neo-theme-scope') ? [...new Set(names)] : []
}

/**
 * @summary Reads a comment-free stylesheet into one declaration map per theme class. A declaration belongs
 * to the theme classes its rule declares on, and a later one wins. That is no cascade: `onDeclaration` hears
 * every custom property the sheet declares, so a caller can refuse a name that has two values or sits in any
 * other rule. A declaration under a condition enters no map, since nothing here reads when it applies.
 * @param {String} css
 * @param {Function} [onDeclaration] Called with `(classes, name, value, conditions)` once for each custom
 * property declared: `classes` holds the theme classes its rule declares on, and is empty for a rule of any
 * other shape and for one nested in a rule; `conditions` holds the at-rules around it other than `@layer`,
 * outermost first
 * @returns {Map<String, Map<String,String>>}
 */
export function readThemeDeclarations(css, onDeclaration) {
    const
        blocks = [{classes: [], conditions: [], inRule: false}],
        themes = new Map();

    for (const [, text, mark] of css.matchAll(/([^{};]*)([{};])/g)) {
        const {classes, conditions, inRule} = blocks.at(-1);

        if (mark === '{') {
            const
                header = text.trim(),
                atRule = header.startsWith('@');

            blocks.push({
                classes   : atRule ? classes : inRule ? [] : ownThemeClasses(header),
                conditions: /^@(?!layer\b)/.test(header) ? [...conditions, header] : conditions,
                inRule    : inRule || !atRule
            });

            continue
        }

        const [, name, value] = text.match(/^\s*(--[a-zA-Z0-9_-]+)\s*:\s*([^]+?)\s*$/) ?? [];

        for (const themeClass of name ? classes : []) {
            themes.has(themeClass) || themes.set(themeClass, new Map());
            conditions.length || themes.get(themeClass).set(name, value)
        }

        name && onDeclaration?.(classes, name, value, conditions);

        mark === '}' && blocks.length > 1 && blocks.pop()
    }

    return themes
}

/**
 * @summary Whether two slots read one grade at the same lightness. Two stated OKLCH lightnesses have to
 * match; each converted colour adds its 8-bit rounding.
 * @param {{lightness: Number, literal: Boolean}} a
 * @param {{lightness: Number, literal: Boolean}} b
 * @returns {Boolean}
 */
function sameLightness(a, b) {
    const allowed = a.literal && b.literal ? TOLERANCE.literal : TOLERANCE.converted * (a.literal || b.literal ? 1 : 2);

    return Math.abs(a.lightness - b.lightness) <= allowed
}

/**
 * @summary Picks, among the slots of one grade, the reading most slots share. The first declared wins a tie.
 * @param {Object[]} entries
 * @returns {Object}
 */
function commonReading(entries) {
    let best      = entries[0],
        bestCount = 0;

    for (const candidate of entries) {
        const count = entries.filter(entry => sameLightness(entry, candidate)).length;

        if (count > bestCount) {
            best      = candidate;
            bestCount = count
        }
    }

    return best
}

/**
 * @summary Checks one theme class's palette: every entry and every colour role a colour this check reads, one
 * lightness per grade across its slots, each slot's descent, and the pairs against their floors in the scheme
 * the class declares.
 * @param {Object} data
 * @param {Map<String,String>} data.declarations
 * @param {Set<String>} data.failures
 * @param {String} data.relPath
 * @param {String} data.themeClass
 */
function checkPalette({declarations, failures, relPath, themeClass}) {
    const
        grades = new Map(),
        // A measured name reads measured names only: nothing outside the one reading decides a verdict.
        known  = new Map([...declarations].filter(([name]) => isMeasured(name))),
        scheme = declarations.get(SCHEME),
        slots  = new Map(),
        color  = name => {
            const resolved = known.has(name) ? resolveValue(known.get(name), known, scheme) : null;

            return resolved === null ? null : parseColor(resolved)
        };

    for (const [name] of declarations) {
        if (!name.startsWith('--neo-palette-')) {
            continue
        }

        const
            match  = PALETTE_EXTRAS.has(name) ? null : name.match(/^--neo-palette-([a-z]+)-(\d+)$/),
            grade  = match && Number(match[2]),
            parsed = color(name);

        // Every palette entry is read, the extras included: a role that no pair measures can read any of them.
        if (!parsed) {
            failures.add(`[palette] ${relPath} ${name}: cannot read '${declarations.get(name)}' as a colour`)
        } else if (match && !GRADES.includes(grade)) {
            failures.add(`[grade] ${relPath} declares ${name}; ${grade} is not one of the eleven grades`)
        } else if (match) {
            const entry = {grade, lightness: parsed.lightness, literal: parsed.literal, name};

            for (const [group, key] of [[grades, grade], [slots, match[1]]]) {
                group.has(key) ? group.get(key).push(entry) : group.set(key, [entry])
            }
        }
    }

    for (const [grade, entries] of grades) {
        const common = commonReading(entries);

        for (const entry of entries) {
            if (!sameLightness(entry, common)) {
                failures.add(
                    `[grade] ${relPath} ${entry.name} has OKLCH lightness ${entry.lightness.toFixed(3)}; grade ${grade} ` +
                    `is ${common.lightness.toFixed(3)} in ${common.name}, and a grade has one lightness in every slot`
                )
            }
        }
    }

    for (const entries of slots.values()) {
        entries.sort((a, b) => a.grade - b.grade);

        entries.forEach((entry, index) => {
            const lighter = entries[index - 1];

            if (lighter && entry.lightness >= lighter.lightness) {
                failures.add(
                    `[descent] ${relPath} ${entry.name} has OKLCH lightness ${entry.lightness.toFixed(3)}, not under ` +
                    `${lighter.name} at ${lighter.lightness.toFixed(3)}; a slot's grades descend in lightness`
                )
            }
        })
    }

    if (scheme !== 'light' && scheme !== 'dark') {
        failures.add(`[scheme] ${relPath} .${themeClass} declares a palette and no ${SCHEME} of light or dark`);
        return
    }

    const
        canvas = color(CANVAS),
        paired = new Set(CONTRAST_PAIRS.flatMap(([foreground, background]) => [foreground, background]));

    // A colour role that no pair measures is read as well: a browser drops a value that is no colour.
    for (const name of declarations.keys()) {
        if (name.startsWith('--neo-color-') && name !== SCHEME && !paired.has(name) && !color(name)) {
            failures.add(`[role] ${relPath} .${themeClass} (${scheme}) ${name}: cannot read '${declarations.get(name)}' as a colour`)
        }
    }

    for (const [foreground, background, floor] of CONTRAST_PAIRS) {
        const
            front = color(foreground),
            back  = color(background),
            label = `[pair] ${relPath} .${themeClass} (${scheme}) ${foreground} on ${background}`;

        if (!front || !back || !canvas || canvas.rgba[3] < 1) {
            failures.add(`${label}: cannot measure; a role is missing, unresolved or not a colour this check reads`);
            continue
        }

        const
            region = back.rgba[3] < 1 ? composite(back.rgba, canvas.rgba) : back.rgba.slice(0, 3),
            ratio  = contrastRatio(composite(front.rgba, region), region);

        // Written so that a ratio which is no number fails as well.
        if (!(ratio >= floor)) {
            failures.add(`${label} is ${ratio.toFixed(2)}:1; the floor is ${floor}:1`)
        }
    }
}

/**
 * @summary Holds every palette to one set of names: a `--neo-` name that one theme class declares and
 * another lacks fails once, so an override written against one theme reaches every theme.
 * @param {Object} data
 * @param {Object[]} data.declared Each `{names: String[], relPath: String, themeClass: String}`
 * @param {Set<String>} data.failures
 * @returns {Number} How many distinct names the palettes declare
 */
function checkNames({declared, failures}) {
    const
        names = new Set(declared.flatMap(entry => entry.names)),
        where = entries => [...new Set(entries.map(entry => entry.relPath))].map(relPath =>
            `${relPath} (${entries.filter(entry => entry.relPath === relPath).map(entry => '.' + entry.themeClass).join(', ')})`
        ).join(', ');

    for (const name of names) {
        const lacking = declared.filter(entry => !entry.names.includes(name));

        if (lacking.length) {
            failures.add(
                `[names] ${name} is declared in ${where(declared.filter(entry => entry.names.includes(name)))} and ` +
                `missing in ${where(lacking)}; every theme declares the same palette and role names`
            )
        }
    }

    return names.size
}

/**
 * @summary Refuses a measured name that has two different values for one theme class, in whichever sheets
 * they sit. This check reads one declaration per name and models no specificity, layer or load order, so it
 * cannot tell which value the browser paints.
 * @param {Object} data
 * @param {Map<String,String>} data.declarations The palette sheet's declarations for the class
 * @param {Set<String>} data.failures
 * @param {String} data.relPath The palette sheet, named first in a failure
 * @param {String} data.themeClass
 * @param {Map<String, Map<String,String>>} data.values Per name, each value with the sheet that declares it
 */
function checkCascade({declarations, failures, relPath, themeClass, values}) {
    for (const name of declarations.keys()) {
        const seen = values.get(name);

        if (isMeasured(name) && seen.size > 1) {
            failures.add(
                `[cascade] ${name} has ${seen.size} values for .${themeClass} (${[...new Set([relPath, ...seen.values()])].join(', ')}); ` +
                `this check reads one declaration per name and cannot tell which one the browser paints`
            )
        }
    }
}

/**
 * @summary Reads every stylesheet under `resources/css`, checks each palette it finds, compares their names,
 * and refuses a measured name wherever a sheet declares it outside the one reading this check has of it.
 * @param {Object} [options={}]
 * @param {String} [options.root=repoRoot]
 * @returns {{failures: String[], names: Number, palettes: String[]}} `palettes` names each checked theme class
 * with its scheme; `names` counts the distinct `--neo-` names they declare
 */
export function inspectThemePalettes({root = repoRoot} = {}) {
    const
        cssRoot  = path.join(root, 'resources/css'),
        declared = [],
        failures = new Set(),
        palettes = [];

    if (!fs.existsSync(cssRoot)) {
        return {failures: [`[surface] missing resources/css under ${root}`], names: 0, palettes}
    }

    const
        themes = new Map(),
        theme  = themeClass => themes.get(themeClass) ??
            themes.set(themeClass, {conditional: [], sheets: [], values: new Map()}).get(themeClass);

    // Every sheet first, then every class: any sheet can name a theme class.
    for (const file of cssFiles(cssRoot)) {
        const
            css     = readSheet(file),
            placed  = new Map(),
            relPath = path.relative(root, file).replaceAll('\\', '/'),
            sheets  = readThemeDeclarations(css, (classes, name, value, conditions) => {
                classes.length && placed.set(name, (placed.get(name) ?? 0) + 1);

                for (const themeClass of classes) {
                    const {conditional, values} = theme(themeClass);

                    if (!conditions.length) {
                        values.has(name) || values.set(name, new Map());
                        values.get(name).has(value) || values.get(name).set(value, relPath)
                    } else if (isMeasured(name)) {
                        conditional.push({conditions, name, relPath})
                    }
                }
            });

        isBalanced(css) || failures.add(
            `[syntax] ${relPath} has a bracket that does not close the one opened last; a browser reads the rest ` +
            `of such a sheet in another way, and this check cannot follow it`
        );

        // What the sheet spells beyond the declarations the reader placed on a theme class. Such a name fails
        // whether or not a palette was found: a palette block under a selector of another shape is found nowhere.
        for (const [, name] of css.matchAll(SPELLED)) {
            const left = placed.get(name) ?? 0;

            if (left) {
                placed.set(name, left - 1)
            } else if (isMeasured(name)) {
                failures.add(
                    `[scope] ${relPath} declares or registers ${name} outside a rule that declares on a theme class itself; ` +
                    `a palette or colour-role name has one value per theme class, and nothing here can tell what another rule reaches`
                )
            }
        }

        for (const [themeClass, declarations] of sheets) {
            theme(themeClass).sheets.push({declarations, relPath})
        }
    }

    for (const [themeClass, {conditional, sheets, values}] of themes) {
        const [palette, second] = sheets.filter(({declarations}) =>
            [...declarations.keys()].some(name => name.startsWith('--neo-palette-')));

        // A theme without a palette keeps its exemption. A palette declared under a condition is still one.
        if (palette || conditional.some(({name}) => name.startsWith('--neo-palette-'))) {
            for (const {conditions, name, relPath} of conditional) {
                failures.add(
                    `[conditional] ${relPath} declares ${name} for .${themeClass} inside ${conditions.join(' ')}; ` +
                    `this check reads no condition and cannot tell when that value paints`
                )
            }
        }

        if (!palette) {
            // Without a palette nothing here measures a colour role, so such a theme declares none but the scheme.
            for (const [name, seen] of values) {
                isMeasured(name) && name !== SCHEME && failures.add(
                    `[scope] ${[...seen.values()][0]} declares ${name} for .${themeClass}, which has no palette; ` +
                    `a theme takes its palette and its colour roles together`
                )
            }

            continue
        }

        const {declarations, relPath} = palette;

        if (second) {
            failures.add(`[cascade] .${themeClass} has a palette in ${relPath} and in ${second.relPath}; a theme class has one`)
        }

        checkCascade({declarations, failures, relPath, themeClass, values});

        palettes.push(`${themeClass} (${declarations.get(SCHEME) ?? 'no scheme'})`);
        declared.push({names: [...declarations.keys()].filter(name => name.startsWith('--neo-')), relPath, themeClass});
        checkPalette({declarations, failures, relPath, themeClass})
    }

    const names = checkNames({declared, failures});

    return {failures: [...failures], names, palettes}
}

/**
 * @summary Collects every palette failure under `root`: a palette entry or a colour role that is no colour
 * this check reads, a grade that two slots read at different lightness, a slot that does not descend, a pair
 * under its contrast floor or one it cannot measure, a measured name with two values, under a condition or
 * outside a theme class, and a sheet whose brackets do not balance.
 * @param {Object} [options={}]
 * @param {String} [options.root=repoRoot]
 * @returns {String[]}
 */
export function collectThemePaletteFailures(options) {
    return inspectThemePalettes(options).failures
}

if (isEntryModule(import.meta.url)) {
    const {failures, names, palettes} = inspectThemePalettes();

    if (failures.length) {
        console.error('✗ theme palette FAILED:\n');
        failures.forEach(failure => console.error('    ' + failure));
        process.exit(1)
    }

    console.log(
        `✓ theme palette — ${palettes.length} palette(s): ${palettes.join(', ') || 'none'}; the same ${names} names ` +
        `in each, every grade at one lightness across its slots, every slot descending, ${CONTRAST_PAIRS.length} ` +
        `pairs at their floors.`
    )
}
