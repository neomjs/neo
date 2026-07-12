#!/usr/bin/env node
/**
 * @module buildScripts/util/check-agentos-theme
 * @summary Mechanical guard for the agentos module's dual-mode (light + dark) theme system. Three checks
 * an eyeball review misses:
 *
 *   1. Skin parity — every `--fm-*` Fleet-Manager-cockpit COLOR token must carry a genuinely different
 *      value in the dark vs the light agentos Viewport skin; only the two mode-invariant font tokens
 *      (`--fm-font-mono`, `--fm-font-sans`) are byte-identical by contract. Kills the "a light theme
 *      whose FM cockpit stays dark" defect class — a skin that re-copied the other skin's values.
 *
 *   2. Token-only consumption — component views under the view root must consume semantic tokens, never
 *      a bare color literal that escapes the mode-swap token layer. The `var(--token, <fallback>)` idiom
 *      is the sanctioned defensive form and is exempt; a bare `#hex` or any CSS color function
 *      (`rgb/hsl/hwb/lab/lch/oklab/oklch/color()`) in a declaration value is rejected with file:line.
 *
 *   3. Completeness — every `--fm-*` a view consumes must be defined in BOTH skins (the consumers are a
 *      third source of truth), so an empty/truncated palette fails even under symmetric emptiness.
 *      Component-local `--fm-*` aliases (defined inside the view) are exempt.
 *
 * `collectAgentosThemeFailures` is a pure-over-the-filesystem function (injectable paths, no exit/log)
 * so the CLI wrapper and the isolated spec both drive it. Both mechanical, not discipline.
 */
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const __dirname        = path.dirname(fileURLToPath(import.meta.url)),
      repoRoot         = path.resolve(__dirname, '../..'),
      MODE_INVARIANT   = new Set(['--fm-font-mono', '--fm-font-sans']),
      FM_TOKEN_RE      = /^\s*(--fm-[a-z0-9-]+)\s*:\s*(.+?);\s*$/,
      COLOR_LITERAL_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/,
      // Real-tree paths; the exported collector takes overrides so the guard is testable in isolation.
      DEFAULT_PATHS = {
          darkPath : path.join(repoRoot, 'resources/scss/theme-neo-dark/apps/agentos/Viewport.scss'),
          lightPath: path.join(repoRoot, 'resources/scss/theme-neo-light/apps/agentos/Viewport.scss'),
          viewDir  : path.join(repoRoot, 'resources/scss/src/apps/agentos')
      };

function extractFmTokens(file) {
    const tokens = new Map();

    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const match = line.match(FM_TOKEN_RE);
        if (match) tokens.set(match[1], match[2].trim());
    }

    return tokens;
}

// Replace block comments with same-width blanks so reported line numbers stay accurate.
function stripBlockComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '));
}

// Remove every var(...) span (matching its balanced closing paren, so a nested rgba()/var() fallback is
// removed with it). A bare rgba()/hsl()/#hex NOT inside a var() has no `var(` prefix, so it survives.
function stripVarCalls(text) {
    let idx;

    while ((idx = text.indexOf('var(')) !== -1) {
        let depth = 0,
            end   = -1;

        for (let i = idx + 3; i < text.length; i++) { // idx + 3 = the '(' of this var(
            if (text[i] === '(') {
                depth++;
            } else if (text[i] === ')' && --depth === 0) {
                end = i;
                break;
            }
        }

        // Unbalanced (never valid SCSS) — drop just the `var` prefix so indexOf advances, no infinite loop.
        text = end === -1 ? text.slice(0, idx) + text.slice(idx + 3) : text.slice(0, idx) + text.slice(end + 1);
    }

    return text;
}

/**
 * @summary Collect every agentos-theme guard violation (parity + token-only + completeness) for the
 * given skin/view paths. Pure over the filesystem — no process.exit, no logging.
 * @param {Object} [paths]
 * @param {String} [paths.darkPath]  dark agentos Viewport skin
 * @param {String} [paths.lightPath] light agentos Viewport skin
 * @param {String} [paths.viewDir]   module-view SCSS root
 * @returns {String[]} failure messages (empty array = clean)
 */
export function collectAgentosThemeFailures({
    darkPath  = DEFAULT_PATHS.darkPath,
    lightPath = DEFAULT_PATHS.lightPath,
    viewDir   = DEFAULT_PATHS.viewDir
} = {}) {
    const failures                 = [],
          consumedFmTokens         = new Set(),
          componentDefinedFmTokens = new Set(),
          dark                     = extractFmTokens(darkPath),
          light                    = extractFmTokens(lightPath);

    // check 1 — skin parity
    for (const [name, darkValue] of dark) {
        if (!light.has(name)) {
            failures.push(`[parity] ${name} present in dark skin, missing in light skin`);
        } else if (!MODE_INVARIANT.has(name) && light.get(name) === darkValue) {
            failures.push(`[parity] ${name} is byte-identical dark↔light (${darkValue}) — the light FM cockpit still carries the dark value`);
        }
    }
    for (const name of light.keys()) {
        if (!dark.has(name)) failures.push(`[parity] ${name} present in light skin, missing in dark skin`);
    }

    // check 2 — token-only consumption; also collects the consumed + component-local token sets
    function checkView(file) {
        stripBlockComments(fs.readFileSync(file, 'utf8')).split('\n').forEach((rawLine, index) => {
            const line     = rawLine.replace(/\/\/.*$/, ''),
                  colonIdx = line.indexOf(':');

            if (colonIdx === -1) return; // not a declaration — skips selectors like `#dead {`

            const value = line.slice(colonIdx + 1);

            // A `--fm-*:` declaration anywhere on the line (incl. inline `{ --fm-dot: … }`) is a
            // component-LOCAL alias, not a skin-token demand — exempt from the completeness check.
            for (const def of line.matchAll(/(--fm-[a-z0-9-]+)\s*:/g)) componentDefinedFmTokens.add(def[1]);
            for (const match of value.matchAll(/var\(\s*(--fm-[a-z0-9-]+)/g)) consumedFmTokens.add(match[1]);

            if (COLOR_LITERAL_RE.test(stripVarCalls(value))) {
                failures.push(`[token-only] ${path.relative(repoRoot, file)}:${index + 1} bare color literal — consume a semantic token instead: ${rawLine.trim()}`);
            }
        });
    }
    function scanScss(dir) {
        for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
            const full = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                scanScss(full);
            } else if (entry.name.endsWith('.scss')) {
                checkView(full);
            }
        }
    }
    scanScss(viewDir);

    // check 3 — completeness: each skin supplies every consumed (non-component-local) token
    for (const token of consumedFmTokens) {
        if (componentDefinedFmTokens.has(token)) continue; // component-local alias, supplied by the view
        if (!dark.has(token))  failures.push(`[completeness] ${token} is consumed by a module view but undefined in the dark skin`);
        if (!light.has(token)) failures.push(`[completeness] ${token} is consumed by a module view but undefined in the light skin`);
    }

    return failures;
}

// ─────────────────────────────── CLI ───────────────────────────────
// Only when run directly (`node …/check-agentos-theme.mjs`), not when imported by the spec.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const failures = collectAgentosThemeFailures();

    if (failures.length) {
        console.error('✗ agentos theme guard FAILED:\n');
        for (const failure of failures) console.error(`    ${failure}`);
        console.error('\n  [parity]       give each --fm-* color token a genuinely light-native value in the light skin (fonts excepted).');
        console.error('  [token-only]   components consume semantic tokens; var(--token, fallback) is allowed, a bare literal is not.');
        console.error('  [completeness] every consumed --fm-* must be defined in both skins.');
        process.exit(1);
    }

    console.log('✓ agentos theme guard: parity + token-only + completeness all pass.');
}
