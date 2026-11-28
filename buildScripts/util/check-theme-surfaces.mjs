#!/usr/bin/env node
/**
 * @module buildScripts/util/check-theme-surfaces
 * @summary Guards the Engine-owned Workstation theme surface against skin drift, raw colors, and missing tokens.
 *
 * The application-specific Institution token language and drawer-frame contract left with the
 * Institution product. This Engine guard now owns only the surviving Workstation surface:
 *
 * 1. Dark/light parity for every Workstation and dock-affordance token.
 * 2. Token-only color consumption throughout the Workstation stylesheet tree.
 * 3. Completeness for every consumed, non-local token in both skins.
 */
import fs                                                from 'node:fs';
import path                                              from 'node:path';
import {fileURLToPath}                                   from 'node:url';
import isEntryModule                                     from './isEntryModule.mjs';
import {rawColours, resolveThemeClassMap, stripVarCalls} from './themeCss.mjs';

const
    dirname              = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot             = path.resolve(dirname, '../..'),
    cssRoot              = path.join(repoRoot, 'resources/css'),
    DECLARATION_RE       = /(?:^|[{;])\s*([-a-zA-Z]+|--[a-zA-Z0-9-]+)\s*:\s*([^;}]*)/g,
    TOKEN_DECLARATION_RE = /^\s*(--(?:workstation|agent-dock)-[a-z0-9-]+)\s*:\s*(.+?);\s*$/,
    TOKEN_DEFINITION_RE  = /(--(?:workstation|agent-dock)-[a-z0-9-]+)\s*:/g,
    TOKEN_REFERENCE_RE   = /var\(\s*(--(?:workstation|agent-dock)-[a-z0-9-]+)/g,
    MODE_INVARIANT       = new Set([
        '--workstation-film-cursor-background', '--workstation-film-cursor-shadow',
        '--workstation-font-mono', '--workstation-font-sans'
    ]);

/**
 * @summary Resolves the Workstation theme surface paths across all folders mapped to
 * `neo-theme-neo-dark` and `neo-theme-neo-light` via `theme-map.json` and `Global.css` declarations.
 * @param {String} [root=cssRoot] CSS root directory.
 * @param {String} [themeMapPath] Optional `theme-map.json` path override.
 * @returns {{darkPath: String|null, darkPaths: String[], lightPath: String|null, lightPaths: String[],
 *            modeInvariant: Set<String>, viewDir: String}}
 */
export function resolveWorkstationSurface(root = cssRoot, themeMapPath) {
    const classMap  = resolveThemeClassMap({root, themeMapPath}),
          skinPaths = themeClass => {
              const folders    = classMap[themeClass] || [],
                    candidates = folders.map(folder => path.join(root, folder, 'apps/workstation/Viewport.css')),
                    existing   = candidates.filter(candidate => fs.existsSync(candidate));

              return {
                  all    : existing,
                  primary: existing.at(-1) || candidates[0] || null
              }
          },
          dark      = skinPaths('neo-theme-neo-dark'),
          light     = skinPaths('neo-theme-neo-light');

    return {
        darkPath  : dark.primary,
        darkPaths : dark.all,
        lightPath : light.primary,
        lightPaths: light.all,
        // The recording pointer keeps its annotation color when the application's skin changes.
        modeInvariant: MODE_INVARIANT,
        viewDir      : path.join(root, 'src/apps/workstation')
    }
}

const WORKSTATION_SURFACE = Object.freeze(resolveWorkstationSurface());

/**
 * @summary Reads the surface token declarations across every folder loaded for one skin in cascade order.
 * @param {String|String[]} files
 * @returns {Map<String,String>}
 */
function extractTokens(files) {
    const tokens = new Map(),
          list   = Array.isArray(files) ? files : [files];

    for (const file of list) {
        for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
            const match = line.match(TOKEN_DECLARATION_RE);

            match && tokens.set(match[1], match[2].trim())
        }
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
 * @summary Yields every stylesheet below a surface root.
 * @param {String} dir
 * @returns {Generator<String>}
 */
function* walkCss(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const file = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            yield* walkCss(file)
        } else if (entry.name.endsWith('.css')) {
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
    const resolved   = surface.root ? {...resolveWorkstationSurface(surface.root, surface.themeMapPath), ...surface} : surface,
          darkFiles  = (surface.darkPath && !surface.darkPaths ? [surface.darkPath] : resolved.darkPaths) ?? (resolved.darkPath ? [resolved.darkPath] : []),
          lightFiles = (surface.lightPath && !surface.lightPaths ? [surface.lightPath] : resolved.lightPaths) ?? (resolved.lightPath ? [resolved.lightPath] : []);

    if (
        !darkFiles.length ||
        !lightFiles.length ||
        darkFiles.some(file => !fs.existsSync(file)) ||
        lightFiles.some(file => !fs.existsSync(file))
    ) {
        return ['[surface] Workstation dark or light skin could not be resolved from the theme map']
    }

    const
        failures       = [],
        consumed       = new Set(),
        locallyDefined = new Set(),
        dark           = extractTokens(darkFiles),
        light          = extractTokens(lightFiles);

    if (dark.size === 0 && light.size === 0) {
        failures.push('[surface] extracted no Workstation tokens from either skin')
    }

    for (const [name, darkValue] of dark) {
        if (!light.has(name)) {
            failures.push('[parity] ' + name + ' present in dark skin, missing in light skin')
        } else if (
            !resolved.modeInvariant.has(name) &&
            light.get(name) === darkValue &&
            !resolvesDifferently({dark, light, name, value: darkValue})
        ) {
            failures.push('[parity] ' + name + ' is byte-identical dark↔light (' + darkValue + ')')
        }
    }

    for (const name of light.keys()) {
        if (!dark.has(name)) failures.push('[parity] ' + name + ' present in light skin, missing in dark skin')
    }

    for (const file of walkCss(resolved.viewDir)) {
        const lines = stripBlockComments(fs.readFileSync(file, 'utf8')).split('\n');

        lines.forEach((line, index) => {
            for (const match of line.matchAll(TOKEN_DEFINITION_RE)) locallyDefined.add(match[1]);

            for (const [, property, value] of line.matchAll(DECLARATION_RE)) {
                for (const match of value.matchAll(TOKEN_REFERENCE_RE)) consumed.add(match[1]);

                if (property.startsWith('--')) continue;

                if (rawColours(stripVarCalls(value)).length) {
                    failures.push(
                        '[token-only] ' + path.relative(repoRoot, file) + ':' + (index + 1) +
                        ' bare color literal — consume a semantic token instead: ' + line.trim()
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

if (isEntryModule(import.meta.url)) {
    const failures = collectThemeSurfaceFailures();

    if (failures.length) {
        console.error('✗ Workstation theme guard FAILED:\n');
        failures.forEach(failure => console.error('    ' + failure));
        process.exit(1)
    }

    console.log('✓ Workstation theme guard: parity + token-only + completeness pass.')
}
