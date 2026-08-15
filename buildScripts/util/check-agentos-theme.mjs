#!/usr/bin/env node
/**
 * @module buildScripts/util/check-agentos-theme
 * @summary Mechanical guard for the agentos module's dual-mode (light + dark) theme system. Four checks
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
 *   4. Text-safe ink — `--fm-ink-faint` measures below the 4.5:1 text floor on EVERY surface in BOTH
 *      skins, so it may never fill text; it survives only as the non-text floor. A prose tripwire was
 *      not enough: an earlier pass cleaned eight text sites and recorded "no live consumer", after
 *      which four new text sites re-adopted it unnoticed. This check makes the contract mechanical —
 *      the token stays legal for `background`/`border-color`, and is rejected in a `color:` fill.
 *
 * `collectAgentosThemeFailures` is a pure-over-the-filesystem function (injectable paths, no exit/log)
 * so the CLI wrapper and the isolated spec both drive it. Both mechanical, not discipline.
 */
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const __dirname      = path.dirname(fileURLToPath(import.meta.url)),
      repoRoot       = path.resolve(__dirname, '../..'),
      MODE_INVARIANT = new Set(['--fm-font-mono', '--fm-font-sans']),
      // Per-surface, because the token NAMESPACE is part of what a surface is: agentos speaks `--fm-*`
      // and the workstation speaks `--workstation-*` / `--agent-dock-*`. Hardcoding one prefix does not
      // merely miss the other surface — it extracts ZERO tokens there and every parity check then passes
      // over an empty map, which reads exactly like a clean surface. That vacuous green is why this is a
      // parameter rather than a widened literal.
      FM_TOKEN_RE    = /^\s*(--fm-[a-z0-9-]+)\s*:\s*(.+?);\s*$/,
      // Color literals: hex + every CSS color function. Named CSS colors are ALSO raw values (policy:
      // module views consume tokens, never a color keyword); `transparent`/`currentColor` are
      // keywords-not-colors and stay allowed, so they are absent from NAMED_COLOR_RE by design.
      COLOR_LITERAL_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/,
      NAMED_COLOR_RE   = /\b(?:aqua|aquamarine|beige|black|blue|brown|chartreuse|chocolate|coral|crimson|cyan|fuchsia|gold|goldenrod|gray|grey|green|indigo|ivory|khaki|lavender|lime|magenta|maroon|navy|olive|orange|orchid|pink|plum|purple|rebeccapurple|red|salmon|silver|tan|teal|tomato|turquoise|violet|wheat|white|yellow|(?:light|dark)(?:blue|gray|grey|green|red|pink|orange|salmon|violet|cyan|khaki))\b/,
      // Properties that fill TEXT. A token below the 4.5:1 text floor is legal as a surface/border but
      // never here. Property name only — the value side is checked against TEXT_FORBIDDEN_INK.
      TEXT_FILL_PROPERTIES = new Set(['color', '-webkit-text-fill-color']),
      // Inks measured below 4.5:1 on every surface in both skins: legal as non-text, rejected on text.
      TEXT_FORBIDDEN_INK   = ['--fm-ink-faint'],
      // Built once, not per declaration: the guard walks every declaration of every view file, so a
      // per-iteration `new RegExp` would recompile the same pattern thousands of times. Non-global on
      // purpose — `.test()` against a `/g` regex is stateful across calls and would skip matches.
      TEXT_FORBIDDEN_INK_RE = TEXT_FORBIDDEN_INK.map(token => [token, new RegExp(`var\\(\\s*${token}\\b`)]),
      // Every declaration on a line, anchored on a preceding `{` or `;` so the property is resolved from
      // the DECLARATION rather than the first colon on the line — a pseudo-class (`&:hover`, `:not(.b)`)
      // puts a colon in the SELECTOR, and a first-colon split then reads a selector fragment as the
      // property and silently skips the check. Also handles multi-declaration lines uniformly.
      // Case-insensitive because CSS property names are (`COLOR:` === `color:`); the captured property
      // is lowercased before the `TEXT_FILL_PROPERTIES` lookup so `COLOR: var(--fm-ink-faint)` cannot evade.
      DECLARATION_RE       = /(?:^|[{;])\s*([-a-zA-Z]+)\s*:\s*([^;}]*)/g,
      // The closed design-contract vocabulary — every skin must DEFINE all of these even when a token is
      // momentarily unconsumed, so a symmetric deletion of a contracted token cannot false-green.
      CONTRACTED_FM_TOKENS = new Set([
          '--fm-ground', '--fm-panel', '--fm-panel-2', '--fm-rail', '--fm-line', '--fm-line-soft',
          '--fm-ink', '--fm-ink-dim', '--fm-ink-faint', '--fm-signal',
          '--fm-state-ok', '--fm-state-idle', '--fm-state-wedged', '--fm-state-limited',
          '--fm-state-starting', '--fm-state-stopping', '--fm-state-off',
          '--fm-family-claude', '--fm-family-gpt', '--fm-family-gemini', '--fm-family-human',
          '--fm-kind-pr', '--fm-kind-a2a', '--fm-kind-review', '--fm-kind-alert', '--fm-kind-neutral',
          '--fm-font-mono', '--fm-font-sans'
      ]),
      // Real-tree paths; the exported collector takes overrides so the guard is testable in isolation.
      DEFAULT_PATHS = {
          darkPath : path.join(repoRoot, 'resources/scss/theme-neo-dark/apps/agentos/Viewport.scss'),
          lightPath: path.join(repoRoot, 'resources/scss/theme-neo-light/apps/agentos/Viewport.scss'),
          viewDir  : path.join(repoRoot, 'resources/scss/src/apps/agentos')
      };

/**
 * @summary Whether a token identical in BOTH skins nonetheless resolves to different values, because
 * it delegates to referents that themselves differ per skin.
 *
 * Parity's subject is the resolved VALUE, and comparing the written expression is only a proxy for it.
 * The proxy fails on aliases: `--agent-dock-preview-accept: var(--workstation-signal)` is byte-identical
 * in both skins **precisely because** the token layer is working — the difference lives one hop down. On
 * the workstation surface six of eight identical tokens are that shape, so the expression comparison
 * reports six violations on correct code.
 *
 * Resolution walks every `--token` referenced anywhere in the value — which covers `var()`, nested
 * `var()` fallbacks, and `color-mix(in srgb, var(--a) 38%, var(--b))` alike — and asks whether ANY of
 * them differs between skins. One differing referent is enough: the composed result then differs too.
 *
 * The walk is depth-bounded and cycle-guarded rather than trusting the input, because a token graph is
 * author-written and a self-referential pair would otherwise hang the guard rather than fail it.
 *
 * A literal with no referents resolves to itself, so this returns false and the parity failure stands —
 * which is what keeps the rule from becoming a blanket escape for anything containing `var(`.
 *
 * @param {Object}              options
 * @param {Map<String,String>}  options.dark  Dark-skin token map.
 * @param {Map<String,String>}  options.light Light-skin token map.
 * @param {String}              options.name  The token under test (cycle guard seed).
 * @param {String}              options.value Its identical value in both skins.
 * @returns {Boolean} True when some referent differs across skins.
 */
function resolvesDifferently({dark, light, name, value, seen = new Set([name]), depth = 0}) {
    if (depth > 8) return false;

    for (const [, referent] of String(value).matchAll(/var\(\s*(--[\w-]+)|(?:^|[\s,(])(--[\w-]+)/g)) {
        if (!referent || seen.has(referent)) continue;

        const darkReferent  = dark.get(referent),
              lightReferent = light.get(referent);

        // Unknown to both skins: defined elsewhere (a shared base layer), so it cannot be the source of
        // a per-skin difference and is not evidence either way.
        if (darkReferent === undefined && lightReferent === undefined) continue;
        if (darkReferent !== lightReferent) return true;

        seen.add(referent);

        if (resolvesDifferently({dark, light, name, value: darkReferent, seen, depth: depth + 1})) return true;
    }

    return false
}

function extractFmTokens(file, tokenPattern = FM_TOKEN_RE) {
    const tokens = new Map();

    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const match = line.match(tokenPattern);
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
 * @param {Set}    [paths.modeInvariant]  tokens exempt from parity by contract (fonts), per surface
 * @param {RegExp} [paths.tokenPattern] per-surface token namespace; a wrong one extracts nothing and every
 *                                      parity check then passes over an empty map
 * @returns {String[]} failure messages (empty array = clean)
 */
export function collectAgentosThemeFailures({
    darkPath         = DEFAULT_PATHS.darkPath,
    lightPath        = DEFAULT_PATHS.lightPath,
    viewDir          = DEFAULT_PATHS.viewDir,
    contractedTokens = CONTRACTED_FM_TOKENS,
    modeInvariant    = MODE_INVARIANT,
    tokenPattern     = FM_TOKEN_RE
} = {}) {
    const failures                 = [],
          consumedFmTokens         = new Set(),
          componentDefinedFmTokens = new Set(),
          dark                     = extractFmTokens(darkPath,  tokenPattern),
          light                    = extractFmTokens(lightPath, tokenPattern);

    // check 1 — skin parity
    for (const [name, darkValue] of dark) {
        if (!light.has(name)) {
            failures.push(`[parity] ${name} present in dark skin, missing in light skin`);
        } else if (!modeInvariant.has(name) && light.get(name) === darkValue
                && !resolvesDifferently({dark, light, name, value: darkValue})) {
            failures.push(`[parity] ${name} is byte-identical dark↔light (${darkValue}) and resolves to the same value in both skins — the light skin still carries the dark value`);
        }
    }
    for (const name of light.keys()) {
        if (!dark.has(name)) failures.push(`[parity] ${name} present in light skin, missing in dark skin`);
    }

    // check 1b — closed contracted vocabulary: every skin must DEFINE every contracted token even when it
    // is momentarily unconsumed, so a symmetric deletion of a contracted token cannot slip past parity.
    for (const token of contractedTokens) {
        if (!dark.has(token))  failures.push(`[contract] ${token} is a contracted --fm-* token but undefined in the dark skin`);
        if (!light.has(token)) failures.push(`[contract] ${token} is a contracted --fm-* token but undefined in the light skin`);
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

            // Strip var() fallbacks + quoted strings, then flag a bare hex/functional OR named CSS color.
            const bareValue = stripVarCalls(value).replace(/(['"]).*?\1/g, '');
            if (COLOR_LITERAL_RE.test(bareValue) || NAMED_COLOR_RE.test(bareValue)) {
                failures.push(`[token-only] ${path.relative(repoRoot, file)}:${index + 1} bare color literal — consume a semantic token instead: ${rawLine.trim()}`);
            }

            // check 4 — text-safe ink. Resolve the property per DECLARATION (see DECLARATION_RE), never
            // from the first colon on the line: a pseudo-class puts a colon in the selector, so
            // `&:hover { color: … }` would otherwise read `&` as the property and skip the check.
            for (const [, property, declarationValue] of line.matchAll(DECLARATION_RE)) {
                if (!TEXT_FILL_PROPERTIES.has(property.toLowerCase())) continue;

                for (const [token, tokenRe] of TEXT_FORBIDDEN_INK_RE) {
                    if (tokenRe.test(declarationValue)) {
                        failures.push(`[text-contrast] ${path.relative(repoRoot, file)}:${index + 1} ${token} fills text but measures below the 4.5:1 floor on every surface in both skins — use --fm-ink-dim: ${rawLine.trim()}`);
                    }
                }
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
/**
 * @summary The app surfaces this guard covers, each with its own paths, token namespace, contract and
 * mode-invariant set.
 *
 * A surface is not just a directory — it is a **token language**. agentos speaks `--fm-*`; the
 * workstation speaks `--workstation-*` / `--agent-dock-*`. Registering a surface without its own
 * `tokenPattern` extracts zero tokens and every parity check then passes over an empty map, reporting
 * a clean surface because it looked at nothing.
 *
 * `contractedTokens` is empty for the workstation on purpose: the closed-vocabulary check is agentos's
 * design contract (every `--fm-*` must exist even when unconsumed), and inventing an equivalent list
 * here would assert a contract nobody agreed. Parity, token-only and completeness apply to both.
 * @type {Object[]}
 */
const SURFACES = [
    {
        name            : 'agentos',
        darkPath        : DEFAULT_PATHS.darkPath,
        lightPath       : DEFAULT_PATHS.lightPath,
        viewDir         : DEFAULT_PATHS.viewDir,
        tokenPattern    : FM_TOKEN_RE,
        modeInvariant   : MODE_INVARIANT,
        contractedTokens: CONTRACTED_FM_TOKENS
    },
    {
        name            : 'workstation',
        darkPath        : path.join(repoRoot, 'resources/scss/theme-neo-dark/apps/workstation/Viewport.scss'),
        lightPath       : path.join(repoRoot, 'resources/scss/theme-neo-light/apps/workstation/Viewport.scss'),
        viewDir         : path.join(repoRoot, 'resources/scss/src/apps/workstation'),
        tokenPattern    : /^\s*(--(?:workstation|agent-dock)-[a-z0-9-]+)\s*:\s*(.+?);\s*$/,
        modeInvariant   : new Set(['--workstation-font-mono', '--workstation-font-sans']),
        contractedTokens: new Set()
    }
];

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const failures = SURFACES.flatMap(({name, ...paths}) =>
        collectAgentosThemeFailures(paths).map(failure => `[${name}] ${failure}`));

    if (failures.length) {
        console.error('✗ theme guard FAILED:\n');
        for (const failure of failures) console.error(`    ${failure}`);
        console.error('\n  [parity]       give each color token a genuinely light-native value in the light skin (fonts and per-skin-resolving aliases excepted).');
        console.error('  [token-only]   components consume semantic tokens; var(--token, fallback) is allowed, a bare literal is not.');
        console.error('  [completeness] every consumed token must be defined in both skins.');
        process.exit(1);
    }

    console.log(`✓ theme guard: ${SURFACES.map(s => s.name).join(' + ')} — parity + token-only + completeness + text-safe ink all pass.`);
}
