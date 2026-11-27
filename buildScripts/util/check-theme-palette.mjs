#!/usr/bin/env node
/**
 * @module buildScripts/util/check-theme-palette
 * @summary Holds every theme palette to its measurable rules: a grade has one lightness in every slot, a
 * slot's grades descend in lightness, the text, border and focus-ring pairs meet their contrast floors in each
 * scheme the theme declares, and every palette declares the same `--neo-` names as every other.
 *
 * A palette is a theme class whose `Global.css` declares a `--neo-palette-*` name. A theme without one is
 * not written against the roles yet and is skipped. A name with two different values for one class fails,
 * in one sheet or across the folders that serve the class: this check models no cascade. The lightness numbers are each theme's own, so a palette
 * is compared with itself and never with a table. Contrast is measured on the resolved colours and never
 * read off the grade distance: OKLCH lightness is not luminance.
 */
import fs                              from 'node:fs';
import path                            from 'node:path';
import {fileURLToPath}                 from 'node:url';
import isEntryModule                   from './isEntryModule.mjs';
import {collectThemeClassMap, readCss} from './themeCss.mjs';

const
    dirname  = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot = path.resolve(dirname, '../..');

/**
 * Every tracked surface whose contents can change this guard's verdict, as repo-relative globs.
 * @type {String[]}
 */
export const SCAN_SURFACE = Object.freeze(['resources/css/*/Global.css']);

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
    RGB    = new RegExp(`^rgba?\\(\\s*(${NUMBER})[\\s,]+(${NUMBER})[\\s,]+(${NUMBER})\\s*(?:[\\/,]\\s*(${NUMBER}%?))?\\s*\\)$`);

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

    if ((match = value.match(RGB))) {
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
 * @summary Reads a comment-free `Global.css` into one declaration map per theme class. A rule's
 * declarations belong to every theme class its selector list names, and a later rule wins. That is no
 * cascade: `onDeclaration` hears every declaration, so a caller can refuse a name that has two values.
 * @param {String} css
 * @param {Function} [onDeclaration] Called with `(themeClass, name, value)` for each declaration read
 * @returns {Map<String, Map<String,String>>}
 */
export function readThemeDeclarations(css, onDeclaration) {
    const themes = new Map();

    for (const [, header, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const classes = new Set([...header.matchAll(/\.(neo-theme-[a-zA-Z0-9_-]+)/g)]
            .map(match => match[1])
            .filter(name => name !== 'neo-theme-scope'));

        for (const themeClass of classes) {
            let declarations = themes.get(themeClass);

            if (!declarations) {
                themes.set(themeClass, declarations = new Map())
            }

            for (const [, name, value] of body.matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+)/g)) {
                declarations.set(name, value.trim());
                onDeclaration?.(themeClass, name, value.trim())
            }
        }
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
 * @summary Checks one theme class's palette: one lightness per grade across its slots, each slot's descent,
 * and the pairs against their floors in the scheme the class declares.
 * @param {Object} data
 * @param {Map<String,String>} data.declarations
 * @param {Set<String>} data.failures
 * @param {String} data.relPath
 * @param {String} data.themeClass
 */
function checkPalette({declarations, failures, relPath, themeClass}) {
    const
        grades = new Map(),
        scheme = declarations.get(SCHEME),
        slots  = new Map(),
        color  = name => {
            const resolved = declarations.has(name) ? resolveValue(declarations.get(name), declarations, scheme) : null;

            return resolved === null ? null : parseColor(resolved)
        };

    for (const [name] of declarations) {
        const match = PALETTE_EXTRAS.has(name) ? null : name.match(/^--neo-palette-([a-z]+)-(\d+)$/);

        if (!match) {
            continue
        }

        const
            grade  = Number(match[2]),
            parsed = color(name);

        if (!GRADES.includes(grade)) {
            failures.add(`[grade] ${relPath} declares ${name}; ${grade} is not one of the eleven grades`)
        } else if (!parsed) {
            failures.add(`[grade] ${relPath} ${name}: cannot read '${declarations.get(name)}' as a colour`)
        } else {
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

    const canvas = color(CANVAS);

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
 * @summary Refuses a palette or role name that has two different values for one theme class, in one sheet or
 * across the folders that serve the class. This check reads one declaration per name and models no
 * specificity, layer or folder order, so it cannot tell which value the browser paints.
 * @param {Object} data
 * @param {Map<String,String>} data.declarations The palette sheet's declarations for the class
 * @param {Set<String>} data.failures
 * @param {String} data.themeClass
 * @param {Map<String, Map<String,String>>} data.values Per name, each value with the sheet that declares it
 */
function checkCascade({declarations, failures, themeClass, values}) {
    for (const name of declarations.keys()) {
        const seen = values.get(name);

        if (name.startsWith('--neo-') && seen.size > 1) {
            failures.add(
                `[cascade] ${name} has ${seen.size} values for .${themeClass} (${[...new Set(seen.values())].join(', ')}); ` +
                `this check reads one declaration per name and cannot tell which one the browser paints`
            )
        }
    }
}

/**
 * @summary Walks every theme folder's `Global.css`, checks each palette it declares, and compares their names.
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
        folders = [...new Set(Object.values(collectThemeClassMap([cssRoot])).flat())].sort(),
        themes  = new Map(),
        theme   = themeClass => themes.get(themeClass) ?? themes.set(themeClass, {sheets: [], values: new Map()}).get(themeClass);

    // Every sheet first, then every class: more than one folder can serve a class.
    for (const folder of folders) {
        const
            file    = path.join(cssRoot, folder, 'Global.css'),
            relPath = path.relative(root, file).replaceAll('\\', '/'),
            sheets  = readThemeDeclarations(readCss(file), (themeClass, name, value) => {
                const {values} = theme(themeClass);

                values.has(name) || values.set(name, new Map());
                values.get(name).has(value) || values.get(name).set(value, relPath)
            });

        for (const [themeClass, declarations] of sheets) {
            theme(themeClass).sheets.push({declarations, relPath})
        }
    }

    for (const [themeClass, {sheets, values}] of themes) {
        const [palette, second] = sheets.filter(({declarations}) =>
            [...declarations.keys()].some(name => name.startsWith('--neo-palette-')));

        if (!palette) {
            continue
        }

        const {declarations, relPath} = palette;

        if (second) {
            failures.add(`[cascade] .${themeClass} has a palette in ${relPath} and in ${second.relPath}; a theme class has one`)
        }

        checkCascade({declarations, failures, themeClass, values});

        palettes.push(`${themeClass} (${declarations.get(SCHEME) ?? 'no scheme'})`);
        declared.push({names: [...declarations.keys()].filter(name => name.startsWith('--neo-')), relPath, themeClass});
        checkPalette({declarations, failures, relPath, themeClass})
    }

    const names = checkNames({declared, failures});

    return {failures: [...failures], names, palettes}
}

/**
 * @summary Collects every palette failure under `root`: a grade that two slots read at different
 * lightness, a slot that does not descend, a pair under its contrast floor, or a pair this check cannot measure.
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
