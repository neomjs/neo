#!/usr/bin/env node
/**
 * @module buildScripts/util/check-theme-palette
 * @summary Holds every theme palette to its measurable rules: a grade has one lightness in every slot, a
 * slot's grades descend in lightness, the text, border and focus-ring pairs meet their contrast floors in each
 * scheme the theme declares, and every palette declares the same palette and role names as every other.
 *
 * Every palette and role name (`kindOf` `'palette'` or `'role'`) is declared in a `Global.css` only: a theme's
 * `Global.css`, or `src/Global.css` for a scale role re-valued under a narrower scope or a condition. Any
 * declaration or `@property` registration in another sheet fails as `[scope]`.
 * A palette is a theme class for which a theme `Global.css` declares a `--neo-palette-*` name. A theme without
 * one is skipped for pair and grade checks and declares no colour role but the scheme; a palette or colour-role
 * name declared under a condition fails as `[conditional]` for every theme class, with or without a palette. Inside
 * a `Global.css`, a palette or colour-role name sits on the theme class itself under no condition, while a narrower
 * scope or a condition may re-value a scale role (`src/Global.css` classifies every effective selector arm and
 * refuses an unconditional role when any arm reaches the document or a bare theme). Pass `--contrast <foreground>
 * <background> [--theme <class-or-stem>]` (or `npm run theme-contrast -- <fg> <bg>`) to print a pair's contrast
 * ratio in each scheme with the same compositing.
 *
 * Three things are outside this check: a value set from JavaScript, a sheet reached through `@import`, and a
 * `color-scheme` that a rule sets against the one `src` wires from `--neo-color-scheme`. The lightness numbers
 * are each theme's own, so a palette is compared with itself and never with a table. Contrast is measured on
 * the resolved colours and never read off the grade distance: OKLCH lightness is not luminance.
 */
import fs                                                        from 'node:fs';
import path                                                      from 'node:path';
import {fileURLToPath}                                           from 'node:url';
import postcss                                                   from 'postcss';
import selectorParser                                            from 'postcss-selector-parser';
import isEntryModule                                             from './isEntryModule.mjs';
import {cssFiles}                                                from './themeCss.mjs';
import {PALETTE_EXTRAS, PALETTE_GRADES, SCHEME_PROPERTY, kindOf} from './themeNameShapes.mjs';

const
    dirname  = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot = path.resolve(dirname, '../..');

/**
 * Every tracked surface whose contents can change this guard's verdict, as repo-relative globs.
 * @type {String[]}
 */
export const SCAN_SURFACE = Object.freeze(['resources/css/**/*.css']);

/**
 * The eleven palette grades, lightest first: the list `themeNameShapes` owns, under the name callers import.
 * @type {Number[]}
 */
export const GRADES = PALETTE_GRADES;

const
    BACKGROUND = '--neo-color-background-',
    BORDER     = '--neo-color-border-',
    CANVAS     = BACKGROUND + 'canvas',
    SCHEME     = SCHEME_PROPERTY,
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
 * region, a border and the focus ring 3:1, and `background-selected` keeps at least a 1.1:1 step on
 * `background-accent-subtle`. A translucent background is measured over the canvas.
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
    [BACKGROUND + 'selected',  BACKGROUND + 'accent-subtle',   1.1],
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
    [BORDER + 'strong-hover',  CANVAS,                         3],
    [BORDER + 'strong-hover',  BACKGROUND + 'field',           3],
    [BACKGROUND + 'track',     CANVAS,                         3],
    [BACKGROUND + 'handle',    BACKGROUND + 'track',           3],
    [BACKGROUND + 'handle',    BACKGROUND + 'accent',          3],
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
 * @summary Whether a custom property has a palette or role shape under the shared classifier.
 * @param {String} name
 * @returns {Boolean}
 */
function isPaletteOrRole(name) {
    const kind = kindOf(name);

    return kind === 'palette' || kind === 'role'
}

/**
 * @summary Whether a `resources/css`-relative path is a theme folder's `Global.css`.
 * @param {String} cssRelPath
 * @returns {Boolean}
 */
function isThemeGlobal(cssRelPath) {
    return /^theme-[a-z0-9-]+\/Global\.css$/.test(cssRelPath)
}

/**
 * @summary Whether a `resources/css`-relative path is `src/Global.css`.
 * @param {String} cssRelPath
 * @returns {Boolean}
 */
function isSrcGlobal(cssRelPath) {
    return cssRelPath === 'src/Global.css'
}

/**
 * Single-pass CSS lexical normalizer: strips comments, neutralizes unquoted `url(...)` tokens and unclosed
 * `<bad-string-token>` lines (as a browser's CSS tokenizer ends them at `\n`) while preserving valid quoted
 * strings intact (so quoted selector attributes such as `[class^="density-"]` keep their values), and writes
 * out identifier escapes outside strings (`.neo-theme-neo-li\67ht` -> `.neo-theme-neo-light`).
 * @type {RegExp}
 */
const CSS_TOKENS = /\/\*[^]*?\*\/|"(?:\\[^]|[^"\\\n])*"|'(?:\\[^]|[^'\\\n])*'|"(?:\\[^]|[^"\\\n])*(?=\n|$)|'(?:\\[^]|[^'\\\n])*(?=\n|$)|url\(\s*(?:\\[^]|[^"'()\\\s])(?:\\[^]|[^()\\])*\)|\\(?:([0-9a-fA-F]{1,6})\s?|([^0-9a-fA-F\s]))/gi;

/**
 * @summary Normalizes raw CSS text before bracket checking and PostCSS parsing.
 * @param {String} raw
 * @returns {String}
 */
function prepareCss(raw) {
    return raw.replace(CSS_TOKENS, (token, hex, char) => {
        if (token.startsWith('/*')) {
            return ' '
        }

        if (token[0] === '"') {
            return token.length >= 2 && token.endsWith('"') && !/(?:^|[^\\])(?:\\\\)*\\$/.test(token.slice(1, -1)) ? token : '""'
        }

        if (token[0] === '\'') {
            return token.length >= 2 && token.endsWith('\'') && !/(?:^|[^\\])(?:\\\\)*\\$/.test(token.slice(1, -1)) ? token : '\'\''
        }

        if (/^url\(/i.test(token)) {
            return 'url()'
        }

        const spelled = hex ? String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10FFFF)) : char;

        return spelled && /[\w-]/.test(spelled) ? spelled : token
    })
}

/**
 * @summary Reads a stylesheet with comments stripped, bad strings and unquoted `url()` tokens normalized,
 * valid quoted strings preserved, and identifier escapes resolved.
 * @param {String} file
 * @returns {String}
 */
function readSheet(file) {
    return prepareCss(fs.readFileSync(file, 'utf8'))
}

/**
 * @summary Whether every bracket outside quoted strings in `prepareCss` output closes the one opened last.
 * Where one does not, a browser's blocks and this check's part ways: after `--probe: (} .a {);` it drops
 * the rest of the sheet.
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
        } else if (char === '"' || char === '\'') {
            for (index++; index < css.length && css[index] !== char && css[index] !== '\n'; index++) {
                if (css[index] === '\\') {
                    index++
                }
            }
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
 * Representative `class` attribute values present on bare themed documents without any density or component
 * sub-scope. Used alongside prefix checks to test `[class...]` attribute selectors.
 * @type {String[]}
 */
const BARE_CLASS_SAMPLES = Object.freeze([
    'neo-body',
    'neo-theme-neo-light',
    'neo-theme-neo-dark',
    'neo-theme-light',
    'neo-theme-dark',
    'neo-theme-cyberpunk',
    'neo-theme-custom',
    'neo-body neo-theme-neo-light',
    'neo-body neo-theme-neo-dark',
    'neo-body neo-theme-custom'
]);

/**
 * @summary Evaluates a CSS attribute operator against one candidate attribute string.
 * @param {String} sample
 * @param {String} operator
 * @param {String} value
 * @returns {Boolean}
 */
function matchesAttributeOperator(sample, operator, value) {
    switch (operator) {
        case '=' : return sample === value;
        case '~=': return Boolean(value) && !/\s/.test(value) && sample.split(/\s+/).includes(value);
        case '|=': return sample === value || sample.startsWith(`${value}-`);
        case '^=': return Boolean(value) && sample.startsWith(value);
        case '$=': return Boolean(value) && sample.endsWith(value);
        case '*=': return Boolean(value) && sample.includes(value);
        default  : return true
    }
}

/**
 * @summary Whether a `[class...]` attribute selector can match a bare theme element (`neo-body` or any
 * `neo-theme-<name>` other than `neo-theme-scope`). Narrower class-prefix selectors such as
 * `[class^="density-"]` return `false`.
 * @param {Object} node `postcss-selector-parser` attribute node
 * @returns {Boolean}
 */
function classAttributeReachesBareTheme(node) {
    if (!node.operator) {
        return true
    }

    const
        rawVal  = node.value ?? '',
        val     = node.insensitive ? rawVal.toLowerCase() : rawVal,
        samples = node.insensitive ? BARE_CLASS_SAMPLES.map(sample => sample.toLowerCase()) : BARE_CLASS_SAMPLES;

    if (samples.some(sample => matchesAttributeOperator(sample, node.operator, val))) {
        return true
    }

    return val.startsWith('neo-theme-') && val !== 'neo-theme-scope' && !val.startsWith('neo-theme-scope-')
}

/**
 * @summary Whether a selector subtree contains an explicit CSS nesting `&` selector.
 * @param {Object} node
 * @returns {Boolean}
 */
function containsNestingSelector(node) {
    return node?.type === 'nesting' || Boolean(node?.nodes?.some(containsNestingSelector))
}

/**
 * @summary Whether a single simple selector can match an element of a bare themed document (without any
 * narrower density, feature, or `.neo-theme-scope` qualifier).
 * @param {Object} node `postcss-selector-parser` node
 * @param {Boolean} parentReachesBareTheme
 * @returns {Boolean}
 */
function simpleReachesBareTheme(node, parentReachesBareTheme) {
    switch (node.type) {
        case 'universal':
            return true;
        case 'nesting':
            return parentReachesBareTheme;
        case 'tag':
            return ['html', 'body', 'div', 'main', 'section'].includes(node.value.toLowerCase());
        case 'id':
            return false;
        case 'class':
            return node.value === 'neo-body' || (node.value.startsWith('neo-theme-') && node.value !== 'neo-theme-scope');
        case 'attribute':
            return node.attribute.trim().toLowerCase() === 'class' ? classAttributeReachesBareTheme(node) : false;
        case 'pseudo': {
            const name = node.value.toLowerCase();

            if (name === ':root' || name === ':scope' || name === ':host' || name === ':host-context') {
                return true
            }

            if (name === ':is' || name === ':where' || name === ':matches' || name === ':-webkit-any' || name === ':-moz-any') {
                return Boolean(node.nodes?.some(arm => selectorArmReachesBareTheme(arm, parentReachesBareTheme, false)))
            }

            if (name === ':not' || name === ':has') {
                return true
            }

            return false
        }
        default:
            return true
    }
}

/**
 * @summary Whether one comma-separated selector arm can match a bare themed document without crossing at
 * least one narrower scope compound.
 * @param {Object} selectorNode `postcss-selector-parser` selector node
 * @param {Boolean} parentReachesBareTheme
 * @param {Boolean} injectImplicitNesting True for top-level arms of a nested CSS rule
 * @returns {Boolean}
 */
function selectorArmReachesBareTheme(selectorNode, parentReachesBareTheme, injectImplicitNesting) {
    const compounds = [[]];

    for (const child of selectorNode.nodes ?? []) {
        if (child.type === 'comment') {
            continue
        }

        if (child.type === 'combinator') {
            compounds.at(-1).length && compounds.push([])
        } else {
            compounds.at(-1).push(child)
        }
    }

    compounds.at(-1).length || compounds.pop();

    if (!compounds.length) {
        return true
    }

    if (injectImplicitNesting && !containsNestingSelector(selectorNode) && !parentReachesBareTheme) {
        return false
    }

    return compounds.every(compound =>
        compound.every(simple => simpleReachesBareTheme(simple, parentReachesBareTheme))
    )
}

/**
 * @summary Parses a CSS rule selector list and returns `true` when ANY effective selector arm reaches the
 * document root, universal selector, or a bare theme (`:is(.neo-theme-*)`, mixed comma/`:where()` lists, etc.).
 * Fails closed (`true`) on malformed selector syntax.
 * @param {String} header
 * @param {Boolean} [parentReachesBareTheme=true]
 * @param {Boolean} [hasParentRule=false]
 * @returns {Boolean}
 */
function selectorListReachesBareTheme(header, parentReachesBareTheme = true, hasParentRule = false) {
    if (!header.trim()) {
        return true
    }

    try {
        const root = selectorParser().astSync(header);

        if (!root.nodes?.length) {
            return true
        }

        return root.nodes.some(arm => selectorArmReachesBareTheme(arm, parentReachesBareTheme, hasParentRule))
    } catch {
        return true
    }
}

/**
 * @summary Walks a stylesheet's PostCSS AST, invoking `onDeclaration` for every custom-property declaration
 * (`--name: value`) and `onProperty` for every `@property --name` registration, while ignoring selector names
 * (`.--neo-foo:hover`), container style queries, and braced token streams inside custom-property values.
 * @param {String} css Raw or `readSheet`-normalized CSS
 * @param {Object} [callbacks={}]
 * @param {Function} [callbacks.onDeclaration]
 * @param {Function} [callbacks.onProperty]
 * @returns {{syntaxError: Boolean, themes: Map<String, Map<String,String>>}}
 */
function walkSheetCustomProperties(css, {onDeclaration, onProperty} = {}) {
    const
        normalized = prepareCss(css),
        themes     = new Map();

    let root;

    try {
        root = postcss.parse(normalized)
    } catch {
        return {syntaxError: true, themes}
    }

    const visit = (container, context) => {
        for (const node of container.nodes ?? []) {
            if (node.type === 'rule') {
                const
                    header      = node.selector.trim(),
                    classes     = context.inRule ? [] : ownThemeClasses(header),
                    reachesBare = selectorListReachesBareTheme(header, context.reachesBare, context.inRule);

                visit(node, {
                    classes,
                    conditions: context.conditions,
                    inRule    : true,
                    reachesBare
                });
                continue
            }

            if (node.type === 'atrule') {
                const atName = node.name.toLowerCase();

                if (atName === 'property') {
                    const name = node.params.trim().match(/^(--[a-zA-Z0-9_-]+)/)?.[1];

                    name && onProperty?.(name, context.conditions, {inRule: context.inRule, scoped: context.inRule && !context.reachesBare});
                    node.nodes && visit(node, {...context, classes: [], inRule: false, reachesBare: true});
                    continue
                }

                const
                    params     = node.params?.trim() ?? '',
                    header     = params ? `@${node.name} ${params}` : `@${node.name}`,
                    conditions = atName === 'layer' ? context.conditions : [...context.conditions, header];

                node.nodes && visit(node, {...context, conditions});
                continue
            }

            if (node.type === 'decl' && node.prop.startsWith('--')) {
                const
                    name  = node.prop.trim(),
                    value = (node.value.trim() + (node.important ? ' !important' : '')).trim();

                if (!/^--[a-zA-Z0-9_-]+$/.test(name)) {
                    continue
                }

                for (const themeClass of context.classes) {
                    themes.has(themeClass) || themes.set(themeClass, new Map());
                    context.conditions.length || themes.get(themeClass).set(name, value)
                }

                onDeclaration?.(context.classes, name, value, context.conditions, {
                    inRule: context.inRule,
                    scoped: context.inRule && !context.reachesBare
                })
            }
        }
    };

    visit(root, {classes: [], conditions: [], inRule: false, reachesBare: true});

    return {syntaxError: false, themes}
}

/**
 * @summary Reads a stylesheet into one declaration map per theme class. A declaration belongs to the theme
 * classes its rule declares on, and a later one wins. That is no cascade: `onDeclaration` hears every custom
 * property the sheet declares, so a caller can refuse a name that has two values or sits in any other rule.
 * A declaration under a condition enters no map, since nothing here reads when it applies.
 * @param {String} css
 * @param {Function} [onDeclaration] Called with `(classes, name, value, conditions, meta)` once for each custom
 * property declared: `classes` holds the theme classes its rule declares on, and is empty for a rule of any
 * other shape and for one nested in a rule; `conditions` holds the conditional at-rules around it (excluding
 * `@layer` and `@property`), outermost first; `meta` carries `{inRule, scoped}`
 * @returns {Map<String, Map<String,String>>}
 */
export function readThemeDeclarations(css, onDeclaration) {
    return walkSheetCustomProperties(css, {onDeclaration}).themes
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
 * @summary Measures the contrast ratio of `foreground` over `background` for one scheme of a palette's
 * declarations, compositing a translucent background over `--neo-color-background-canvas` and a translucent
 * foreground over the resulting region. Returns `null` when any required entry is missing or unreadable.
 * @param {Object} data
 * @param {String} data.background
 * @param {Map<String,String>} data.declarations
 * @param {String} data.foreground
 * @param {String} data.scheme
 * @returns {Number|null}
 */
function measurePairRatio({background, declarations, foreground, scheme}) {
    const
        known = new Map([...declarations].filter(([name]) => isMeasured(name))),
        color = name => {
            const resolved = known.has(name) ? resolveValue(known.get(name), known, scheme) : null;

            return resolved === null ? null : parseColor(resolved)
        },
        canvas = color(CANVAS),
        front  = color(foreground),
        back   = color(background);

    if (!front || !back || !canvas || canvas.rgba[3] < 1) {
        return null
    }

    const region = back.rgba[3] < 1 ? composite(back.rgba, canvas.rgba) : back.rgba.slice(0, 3);

    return contrastRatio(composite(front.rgba, region), region)
}

/**
 * @summary Resolves a CLI or caller colour-role/palette token (`text-default`, `color-text-default`,
 * `neutral-500`, `--neo-color-text-default`, `--neo-palette-neutral-500`) against a palette's declarations.
 * @param {String} input
 * @param {Map<String,String>} declarations
 * @returns {String|null}
 */
function resolveMeasuredName(input, declarations) {
    if (typeof input !== 'string' || !input.trim()) {
        return null
    }

    const raw = input.trim();

    for (const candidate of [
        raw,
        `--neo-${raw}`,
        `--neo-color-${raw}`,
        `--neo-palette-${raw}`
    ]) {
        if (isMeasured(candidate) && declarations.has(candidate)) {
            return candidate
        }
    }

    return null
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

    const paired = new Set(CONTRAST_PAIRS.flatMap(([foreground, background]) => [foreground, background]));

    // A colour role that no pair measures is read as well: a browser drops a value that is no colour.
    for (const name of declarations.keys()) {
        if (name.startsWith('--neo-color-') && name !== SCHEME && !paired.has(name) && !color(name)) {
            failures.add(`[role] ${relPath} .${themeClass} (${scheme}) ${name}: cannot read '${declarations.get(name)}' as a colour`)
        }
    }

    for (const [foreground, background, floor] of CONTRAST_PAIRS) {
        const
            ratio = measurePairRatio({background, declarations, foreground, scheme}),
            label = `[pair] ${relPath} .${themeClass} (${scheme}) ${foreground} on ${background}`;

        if (ratio === null) {
            failures.add(`${label}: cannot measure; a role is missing, unresolved or not a colour this check reads`);
            continue
        }

        // Written so that a ratio which is no number fails as well.
        if (!(ratio >= floor)) {
            failures.add(`${label} is ${ratio.toFixed(2)}:1; the floor is ${floor}:1`)
        }
    }
}

/**
 * @summary Holds every palette to one set of names: a palette or role name that one theme class declares and
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
 * with its scheme; `names` counts the distinct palette and role names they declare
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

    // Every sheet first, then every class: any theme Global.css can name a theme class.
    for (const file of cssFiles(cssRoot)) {
        const
            css         = readSheet(file),
            cssRelPath  = path.relative(cssRoot, file).replaceAll('\\', '/'),
            relPath     = path.relative(root, file).replaceAll('\\', '/'),
            srcGlobal   = isSrcGlobal(cssRelPath),
            themeGlobal = isThemeGlobal(cssRelPath),
            addSyntax   = () => failures.add(
                `[syntax] ${relPath} has a bracket that does not close the one opened last; a browser reads the rest ` +
                `of such a sheet in another way, and this check cannot follow it`
            );

        if (!isBalanced(css)) {
            addSyntax();
            continue
        }

        if (!themeGlobal && !srcGlobal) {
            const checkOutsideGlobal = name => {
                if (isPaletteOrRole(name)) {
                    failures.add(
                        `[scope] ${relPath} declares or registers ${name} outside Global.css; ` +
                        `palette and role names are declared in Global.css only`
                    )
                }
            };

            const {syntaxError} = walkSheetCustomProperties(css, {
                onDeclaration: (classes, name) => checkOutsideGlobal(name),
                onProperty   : name => checkOutsideGlobal(name)
            });

            syntaxError && addSyntax();
            continue
        }

        if (srcGlobal) {
            const reportSrcGlobal = name => {
                if (isMeasured(name)) {
                    failures.add(
                        `[scope] ${relPath} declares or registers ${name} outside a theme Global.css; ` +
                        `palette and colour-role names belong to a theme class in theme-<name>/Global.css`
                    )
                } else if (isPaletteOrRole(name)) {
                    failures.add(
                        `[scope] ${relPath} declares or registers ${name} without a scope or condition; ` +
                        `src/Global.css only re-values scale roles under a scope or condition`
                    )
                }
            };

            const {syntaxError} = walkSheetCustomProperties(css, {
                onDeclaration: (classes, name, value, conditions, {inRule, scoped}) => {
                    if (isMeasured(name) || (isPaletteOrRole(name) && !(inRule && (conditions.length > 0 || scoped)))) {
                        reportSrcGlobal(name)
                    }
                },
                onProperty: name => reportSrcGlobal(name)
            });

            syntaxError && addSyntax();
            continue
        }

        const reportThemeGlobalScope = (name, isRegistration = false) => {
            if (isMeasured(name)) {
                failures.add(
                    `[scope] ${relPath} declares or registers ${name} outside a rule that declares on a theme class itself; ` +
                    `a palette or colour-role name has one value per theme class, and nothing here can tell what another rule reaches`
                )
            } else if (isPaletteOrRole(name) && isRegistration) {
                failures.add(
                    `[scope] ${relPath} registers ${name} outside a selector rule; ` +
                    `a scale role is declared or re-valued inside a rule of Global.css`
                )
            }
        };

        const {syntaxError, themes: sheets} = walkSheetCustomProperties(css, {
            onDeclaration: (classes, name, value, conditions, {inRule}) => {
                if (isMeasured(name) && !classes.length) {
                    reportThemeGlobalScope(name);
                    return
                }

                if (!isMeasured(name) && isPaletteOrRole(name) && !inRule) {
                    reportThemeGlobalScope(name, true);
                    return
                }

                for (const themeClass of classes) {
                    const {conditional, values} = theme(themeClass);

                    if (!conditions.length) {
                        values.has(name) || values.set(name, new Map());
                        values.get(name).has(value) || values.get(name).set(value, relPath)
                    } else if (isMeasured(name)) {
                        conditional.push({conditions, name, relPath})
                    }
                }
            },
            onProperty: name => reportThemeGlobalScope(name, true)
        });

        if (syntaxError) {
            addSyntax();
            continue
        }

        for (const [themeClass, declarations] of sheets) {
            theme(themeClass).sheets.push({declarations, relPath})
        }
    }

    for (const [themeClass, {conditional, sheets, values}] of themes) {
        const [palette, second] = sheets.filter(({declarations}) =>
            [...declarations.keys()].some(name => name.startsWith('--neo-palette-')));

        // Every theme class, with or without a palette, refuses a palette or colour-role name under a condition.
        for (const {conditions, name, relPath} of conditional) {
            failures.add(
                `[conditional] ${relPath} declares ${name} for .${themeClass} inside ${conditions.join(' ')}; ` +
                `this check reads no condition and cannot tell when that value paints`
            )
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
        // The names every theme shares are the palette and role names, as the shared classifier tells them.
        declared.push({names: [...declarations.keys()].filter(name => ['palette', 'role'].includes(kindOf(name))), relPath, themeClass});
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

/**
 * @summary Measures the contrast ratio of a named foreground/background pair across each scheme of the matching
 * theme palette(s), using the exact `resolveValue`, `parseColor`, alpha-compositing, and `contrastRatio` path of
 * `checkPalette`.
 * @param {String} foregroundInput Role or palette name (`text-default`, `color-text-default`, `--neo-color-text-default`)
 * @param {String} backgroundInput Role or palette name (`background-selected`, `--neo-color-background-selected`)
 * @param {Object} [options={}]
 * @param {String} [options.root=repoRoot]
 * @param {String} [options.theme='neo-theme-neo'] Theme class, stem (`neo`, `theme-neo`), or `'all'`
 * @returns {{failures: String[], pairs: Array<{background: String, foreground: String, formatted: String, ratio: Number, relPath: String, scheme: String, themeClass: String}>}}
 */
export function measureThemePairContrast(foregroundInput, backgroundInput, {root = repoRoot, theme = 'neo-theme-neo'} = {}) {
    const
        cssRoot  = path.join(root, 'resources/css'),
        failures = [],
        pairs    = [];

    if (!fs.existsSync(cssRoot)) {
        return {failures: [`[surface] missing resources/css under ${root}`], pairs}
    }

    const
        normalized = String(theme ?? 'neo-theme-neo').trim().replace(/^\./, ''),
        matches    = (themeClass, relPath) =>
            normalized === 'all' ||
            themeClass === normalized ||
            themeClass.startsWith(`${normalized}-`) ||
            themeClass === `neo-theme-${normalized}` ||
            themeClass.startsWith(`neo-theme-${normalized}-`) ||
            relPath.includes(`/${normalized}/`),
        palettes   = [];

    for (const file of cssFiles(cssRoot)) {
        const cssRelPath = path.relative(cssRoot, file).replaceAll('\\', '/');

        if (!isThemeGlobal(cssRelPath)) {
            continue
        }

        const
            relPath = path.relative(root, file).replaceAll('\\', '/'),
            sheets  = readThemeDeclarations(readSheet(file));

        for (const [themeClass, declarations] of sheets) {
            if ([...declarations.keys()].some(name => name.startsWith('--neo-palette-')) && matches(themeClass, relPath)) {
                palettes.push({declarations, relPath, themeClass})
            }
        }
    }

    if (!palettes.length) {
        return {failures: [`[theme] no palette matches '${theme}' under resources/css`], pairs}
    }

    for (const {declarations, relPath, themeClass} of palettes) {
        const
            scheme     = declarations.get(SCHEME),
            foreground = resolveMeasuredName(foregroundInput, declarations),
            background = resolveMeasuredName(backgroundInput, declarations);

        if (!foreground) {
            failures.push(`[name] ${relPath} (.${themeClass}) does not declare '${foregroundInput}' as a palette or colour-role name`);
            continue
        }

        if (!background) {
            failures.push(`[name] ${relPath} (.${themeClass}) does not declare '${backgroundInput}' as a palette or colour-role name`);
            continue
        }

        if (scheme !== 'light' && scheme !== 'dark') {
            failures.push(`[scheme] ${relPath} (.${themeClass}) declares no ${SCHEME} of light or dark`);
            continue
        }

        const ratio = measurePairRatio({background, declarations, foreground, scheme});

        if (ratio === null) {
            failures.push(`[pair] ${relPath} .${themeClass} (${scheme}) ${foreground} on ${background}: cannot measure`);
            continue
        }

        pairs.push({
            background,
            foreground,
            formatted: `${ratio.toFixed(2)}:1`,
            ratio,
            relPath,
            scheme,
            themeClass
        })
    }

    return {failures, pairs}
}

/**
 * @summary Parses CLI arguments when `--contrast` is passed and returns `{foreground, background, theme}`, or `null`
 * when invoked in default guard mode.
 * @param {String[]} argv
 * @returns {{background: String|undefined, foreground: String|undefined, theme: String}|null}
 */
function parseContrastCli(argv) {
    if (!argv.includes('--contrast')) {
        return null
    }

    const positional = [];
    let   theme      = 'neo-theme-neo';

    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];

        if (arg === '--contrast') {
            continue
        }

        if (arg === '--theme') {
            theme = argv[++index] ?? '';
            continue
        }

        if (arg.startsWith('--theme=')) {
            theme = arg.slice(8);
            continue
        }

        positional.push(arg)
    }

    return {background: positional[1], foreground: positional[0], theme}
}

if (isEntryModule(import.meta.url)) {
    const contrastArgs = parseContrastCli(process.argv.slice(2));

    if (contrastArgs) {
        if (!contrastArgs.foreground || !contrastArgs.background) {
            console.error('Usage: check-theme-palette.mjs --contrast <foreground> <background> [--theme <theme>]');
            process.exit(1)
        }

        const {failures, pairs} = measureThemePairContrast(contrastArgs.foreground, contrastArgs.background, {
            theme: contrastArgs.theme
        });

        if (failures.length) {
            console.error('✗ theme contrast FAILED:\n');
            failures.forEach(failure => console.error('    ' + failure));
            process.exit(1)
        }

        console.log(`${pairs[0].foreground} on ${pairs[0].background}`);
        pairs.forEach(({formatted, scheme, themeClass}) => console.log(`  ${themeClass} (${scheme}): ${formatted}`))
    } else {
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
}
