#!/usr/bin/env node
/**
 * @module buildScripts/util/check-agentos-theme
 * @summary Mechanical guard for the agentos module's dual-mode (light + dark) theme system. Two checks
 * an eyeball review misses:
 *
 *   1. Skin parity — every `--fm-*` Fleet-Manager-cockpit COLOR token must carry a genuinely different
 *      value in the dark vs the light agentos Viewport skin; only the two mode-invariant font tokens
 *      (`--fm-font-mono`, `--fm-font-sans`) are byte-identical by contract. This kills the "a light
 *      theme whose FM cockpit stays dark" defect class — a skin that re-copied the other skin's values.
 *      A token present in one skin but absent in the other is also a defect.
 *
 *   2. Token-only consumption — component views under `resources/scss/src/apps/agentos/` must consume
 *      semantic tokens, never a bare color literal that escapes the mode-swap token layer. The
 *      `var(--token, <fallback>)` idiom is the sanctioned defensive form and is exempt; a bare `#hex`,
 *      `rgb()`/`rgba()`, or `hsl()`/`hsla()` in a declaration value is rejected with file:line so a leaf
 *      cannot hardcode a value that would survive a light/dark swap.
 *
 * Both are mechanical, not discipline.
 */
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url)),
      repoRoot  = path.resolve(__dirname, '../..'),
      // check 1 — skin parity
      DARK           = path.join(repoRoot, 'resources/scss/theme-neo-dark/apps/agentos/Viewport.scss'),
      LIGHT          = path.join(repoRoot, 'resources/scss/theme-neo-light/apps/agentos/Viewport.scss'),
      MODE_INVARIANT = new Set(['--fm-font-mono', '--fm-font-sans']),
      FM_TOKEN_RE    = /^\s*(--fm-[a-z0-9-]+)\s*:\s*(.+?);\s*$/,
      // check 2 — token-only consumption. Covers the full CSS color-function surface (legacy + modern
      // wide-gamut) so a bare `oklch()`/`lab()`/`color()` literal cannot slip past as `rgb`-only did.
      VIEW_DIR         = path.join(repoRoot, 'resources/scss/src/apps/agentos'),
      COLOR_LITERAL_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/;

const failures                 = [],
      consumedFmTokens         = new Set(),
      componentDefinedFmTokens = new Set();

// ───────────────────────── check 1: skin parity ─────────────────────────
function extractFmTokens(file) {
    const tokens = new Map();

    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const match = line.match(FM_TOKEN_RE);
        if (match) tokens.set(match[1], match[2].trim());
    }

    return tokens;
}

const dark  = extractFmTokens(DARK),
      light = extractFmTokens(LIGHT);

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

// ─────────────────── check 2: token-only consumption ────────────────────
// Replace block comments with same-width blanks so reported line numbers stay accurate.
function stripBlockComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '));
}

// Remove every var(...) span (matching its balanced closing paren, so a nested rgba()/var() fallback
// is removed with it) — the var(--token, <fallback>) idiom is exempt. A bare rgba()/hsl()/#hex NOT
// inside a var() has no `var(` prefix, so it survives and is still flagged.
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

function checkView(file) {
    stripBlockComments(fs.readFileSync(file, 'utf8')).split('\n').forEach((rawLine, index) => {
        const line     = rawLine.replace(/\/\/.*$/, ''),
              colonIdx = line.indexOf(':');

        // Only inspect declaration VALUES (after the first colon) — skips selectors like `#dead {`.
        if (colonIdx === -1) return;

        const value = line.slice(colonIdx + 1);

        // A `--fm-*:` custom-property declaration anywhere on the line (incl. inline `{ --fm-dot: … }`)
        // is a component-LOCAL alias, not a skin-token demand — exempt from the completeness check.
        for (const def of line.matchAll(/(--fm-[a-z0-9-]+)\s*:/g)) componentDefinedFmTokens.add(def[1]);

        // Every --fm-* this view consumes is the demand side of the completeness check below.
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

scanScss(VIEW_DIR);

// ────────── check 3: each skin SUPPLIES every consumed token (completeness) ──────────
// Symmetry alone false-passes when BOTH skins are equally empty/truncated (vacuous parity). The set
// of tokens the module views consume is the third source of truth: a skin that fails to define a
// consumed token is incomplete, even if the other skin omits it too.
for (const token of consumedFmTokens) {
    if (componentDefinedFmTokens.has(token)) continue; // component-local alias, supplied by the view itself
    if (!dark.has(token))  failures.push(`[completeness] ${token} is consumed by a module view but undefined in the dark skin`);
    if (!light.has(token)) failures.push(`[completeness] ${token} is consumed by a module view but undefined in the light skin`);
}

// ─────────────────────────────── report ─────────────────────────────────
if (failures.length) {
    console.error('✗ agentos theme guard FAILED:\n');
    for (const failure of failures) console.error(`    ${failure}`);
    console.error('\n  [parity]     give each --fm-* color token a genuinely light-native value in the light skin (fonts excepted).');
    console.error('  [token-only] components consume semantic tokens; var(--token, fallback) is allowed, a bare literal is not.');
    process.exit(1);
}

console.log(`✓ agentos theme guard: ${dark.size - MODE_INVARIANT.size} --fm-* color tokens differ dark↔light, ${MODE_INVARIANT.size} font tokens invariant; module views are token-only.`);
