#!/usr/bin/env node
/**
 * @module buildScripts/util/check-theme-surfaces
 * @summary Guards the Engine-owned Workstation theme surface against skin drift, raw colors, and missing tokens.
 *
 * The application-specific Institution token language and drawer-frame contract left with the
 * Institution product. This Engine guard now owns only the surviving Workstation surface:
 *
 * 1. Dark/light parity for every Workstation and dock-affordance token.
 * 2. Token-only color consumption throughout the Workstation SCSS tree.
 * 3. Completeness for every consumed, non-local token in both skins.
 */
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const
    dirname              = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot             = path.resolve(dirname, '../..'),
    COLOR_LITERAL_RE     = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/,
    NAMED_COLOR_RE       = /\b(?:aqua|aquamarine|beige|black|blue|brown|chartreuse|chocolate|coral|crimson|cyan|fuchsia|gold|goldenrod|gray|grey|green|indigo|ivory|khaki|lavender|lime|magenta|maroon|navy|olive|orange|orchid|pink|plum|purple|rebeccapurple|red|salmon|silver|tan|teal|tomato|turquoise|violet|wheat|white|yellow|(?:light|dark)(?:blue|gray|grey|green|red|pink|orange|salmon|violet|cyan|khaki))\b/,
    DECLARATION_RE       = /(?:^|[{;])\s*([-a-zA-Z]+|--[a-zA-Z0-9-]+)\s*:\s*([^;}]*)/g,
    TOKEN_DECLARATION_RE = /^\s*(--(?:workstation|agent-dock)-[a-z0-9-]+)\s*:\s*(.+?);\s*$/,
    TOKEN_DEFINITION_RE  = /(--(?:workstation|agent-dock)-[a-z0-9-]+)\s*:/g,
    TOKEN_REFERENCE_RE   = /var\(\s*(--(?:workstation|agent-dock)-[a-z0-9-]+)/g,
    WORKSTATION_SURFACE  = Object.freeze({
        darkPath     : path.join(repoRoot, 'resources/scss/theme-neo-dark/apps/workstation/Viewport.scss'),
        lightPath    : path.join(repoRoot, 'resources/scss/theme-neo-light/apps/workstation/Viewport.scss'),
        modeInvariant: new Set(['--workstation-font-mono', '--workstation-font-sans']),
        viewDir      : path.join(repoRoot, 'resources/scss/src/apps/workstation')
    });

/**
 * @summary Reads the surface token declarations from one skin.
 * @param {String} file
 * @returns {Map<String,String>}
 */
function extractTokens(file) {
    const tokens = new Map();

    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const match = line.match(TOKEN_DECLARATION_RE);

        match && tokens.set(match[1], match[2].trim())
    }

    return tokens
}

/**
 * @summary Returns whether an identical alias expression resolves differently between skins.
 * @param {Object} options
 * @returns {Boolean}
 */
function resolvesDifferently({dark, light, name, value, seen = new Set([name]), depth = 0}) {
    if (depth > 8) return false;

    for (const match of String(value).matchAll(/var\(\s*(--[\w-]+)|(?:^|[\s,(])(--[\w-]+)/g)) {
        const referent = match[1] ?? match[2];

        if (!referent || seen.has(referent)) continue;

        const
            darkReferent  = dark.get(referent),
            lightReferent = light.get(referent);

        if (darkReferent === undefined && lightReferent === undefined) continue;
        if (darkReferent !== lightReferent) return true;

        seen.add(referent);

        if (resolvesDifferently({
            dark,
            light,
            name,
            value: darkReferent,
            seen,
            depth: depth + 1
        })) return true
    }

    return false
}

/**
 * @summary Removes block comments without changing line counts.
 * @param {String} source
 * @returns {String}
 */
function stripBlockComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '))
}

/**
 * @summary Removes balanced var() calls so literal fallbacks inside them remain allowed.
 * @param {String} value
 * @returns {String}
 */
function stripVarCalls(value) {
    let index;

    while ((index = value.indexOf('var(')) !== -1) {
        let depth = 0,
            end   = -1;

        for (let i = index + 3; i < value.length; i++) {
            if (value[i] === '(') {
                depth++
            } else if (value[i] === ')' && --depth === 0) {
                end = i;
                break
            }
        }

        value = end === -1
            ? value.slice(0, index) + value.slice(index + 3)
            : value.slice(0, index) + value.slice(end + 1)
    }

    return value
}

/**
 * @summary Yields every SCSS file below a surface root.
 * @param {String} dir
 * @returns {Generator<String>}
 */
function* walkScss(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const file = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            yield* walkScss(file)
        } else if (entry.name.endsWith('.scss')) {
            yield file
        }
    }
}

/**
 * @summary Collects Workstation theme contract violations without exiting or logging.
 * @param {Object} [surface=WORKSTATION_SURFACE]
 * @returns {String[]}
 */
export function collectThemeSurfaceFailures(surface = WORKSTATION_SURFACE) {
    const
        failures       = [],
        consumed       = new Set(),
        locallyDefined = new Set(),
        dark           = extractTokens(surface.darkPath),
        light          = extractTokens(surface.lightPath);

    if (dark.size === 0 && light.size === 0) {
        failures.push('[surface] extracted no Workstation tokens from either skin')
    }

    for (const [name, darkValue] of dark) {
        if (!light.has(name)) {
            failures.push('[parity] ' + name + ' present in dark skin, missing in light skin')
        } else if (
            !surface.modeInvariant.has(name) &&
            light.get(name) === darkValue &&
            !resolvesDifferently({dark, light, name, value: darkValue})
        ) {
            failures.push('[parity] ' + name + ' is byte-identical dark↔light (' + darkValue + ')')
        }
    }

    for (const name of light.keys()) {
        if (!dark.has(name)) failures.push('[parity] ' + name + ' present in light skin, missing in dark skin')
    }

    for (const file of walkScss(surface.viewDir)) {
        const lines = stripBlockComments(fs.readFileSync(file, 'utf8')).split('\n');

        lines.forEach((rawLine, index) => {
            const line = rawLine.replace(/\/\/.*$/, '');

            for (const match of line.matchAll(TOKEN_DEFINITION_RE)) locallyDefined.add(match[1]);

            for (const [, property, value] of line.matchAll(DECLARATION_RE)) {
                for (const match of value.matchAll(TOKEN_REFERENCE_RE)) consumed.add(match[1]);

                if (property.startsWith('--')) continue;

                const bareValue = stripVarCalls(value).replace(/(['"]).*?\1/g, '');

                if (COLOR_LITERAL_RE.test(bareValue) || NAMED_COLOR_RE.test(bareValue)) {
                    failures.push(
                        '[token-only] ' + path.relative(repoRoot, file) + ':' + (index + 1) +
                        ' bare color literal — consume a semantic token instead: ' + rawLine.trim()
                    )
                }
            }
        })
    }

    for (const token of consumed) {
        if (locallyDefined.has(token)) continue;
        if (!dark.has(token))  failures.push('[completeness] ' + token + ' is undefined in the dark skin');
        if (!light.has(token)) failures.push('[completeness] ' + token + ' is undefined in the light skin')
    }

    return failures
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const failures = collectThemeSurfaceFailures();

    if (failures.length) {
        console.error('✗ Workstation theme guard FAILED:\n');
        failures.forEach(failure => console.error('    ' + failure));
        process.exit(1)
    }

    console.log('✓ Workstation theme guard: parity + token-only + completeness pass.')
}
