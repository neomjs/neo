#!/usr/bin/env node
/**
 * @summary Bans inline `process.env` reads inside `leaf(...)` default expressions in
 * `config.template.mjs` files — the declarative-config SSOT antipattern.
 *
 * ## The rule
 *
 * `config.template.mjs` is the declarative configuration SSOT: every value is
 * `leaf(default, envVarName, type)`, where the environment override is named by the
 * string-literal `envVarName` argument and resolved by the config system. A `default`
 * expression that itself reads `process.env` (typically an inline
 * `process.env.UNIT_TEST_MODE === 'true' ? test : prod` branch) leaks imperative
 * env-resolution into the canonical config — the same root the `resolveAiDataRoot`
 * over-engineering hit. Env-resolution belongs at the env/test layer, not baked into
 * the SSOT, so this guard makes the antipattern un-mergeable rather than "review harder".
 *
 * ## What this catches
 *
 * Any single-line `leaf( ... process.env ... )` default across every `config.template.mjs`
 * under `ai/`. Env access must flow through the leaf env-var-name argument; a test
 * override belongs in the test layer (the `test-unit` npm script shell env), not an
 * inline branch.
 *
 * Scope: single-line leaf defaults (the established idiom — the realistic regression
 * copies that shape). Multi-line leaf bodies are not parsed. The gitignored `config.mjs`
 * overlays are out of scope by design: they are generated from these templates, so the
 * template is the SSOT fix site.
 *
 * ## Baseline + burndown
 *
 * The known pre-existing instances live in `BASELINE` so this lint lands enforcing
 * (blocks NEW antipattern instances) without failing the build on the historical debt.
 * Each reshape that removes an instance must also drop its `BASELINE` row — a row that no
 * longer matches a live violation fails the lint, keeping the burndown honest.
 *
 * @see learn/agentos/decisions  The AiConfig reactive Provider SSOT decision record.
 */
import fs              from 'node:fs';
import path            from 'node:path';
import process         from 'node:process';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, '../../..');

const CONFIG_TEMPLATE_BASENAME = 'config.template.mjs';
const SCAN_ROOT_REL            = 'ai';

/**
 * Pre-existing inline-env leaf defaults, keyed by `<file>::<envVar>`. Each entry is a
 * burndown row for the declarative-config reshape: dropping the inline branch from the
 * template must also drop the matching row here. `reshape` records the verified fix shape.
 * @type {ReadonlyArray<{file: String, env: String, ticket: String, reshape: String}>}
 */
export const BASELINE = Object.freeze([
    Object.freeze({
        file   : 'ai/mcp/server/memory-core/config.template.mjs',
        env    : 'NEO_MEMORY_COLLECTION_NAME',
        ticket : '#12451',
        reshape: 'Dynamic (harder sub-case). The per-worker-unique test collection name (Date.now()/Math.random()) ' +
                 'must move to a per-worker test bootstrap, not a static env value — one shared shell-env value would ' +
                 'collide across fullyParallel workers.'
    }),
    Object.freeze({
        file   : 'ai/mcp/server/memory-core/config.template.mjs',
        env    : 'NEO_SESSION_COLLECTION_NAME',
        ticket : '#12451',
        reshape: 'Dynamic (harder sub-case). Same per-worker-bootstrap relocation as NEO_MEMORY_COLLECTION_NAME.'
    })
]);

/**
 * @summary Recursively collects `config.template.mjs` files under a directory.
 * @param {String} dir Absolute directory to walk.
 * @returns {String[]} Absolute file paths, sorted.
 */
function walkConfigTemplates(dir) {
    if (!fs.existsSync(dir)) return [];

    const out = [];

    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') continue;
            out.push(...walkConfigTemplates(full));
        } else if (entry.name === CONFIG_TEMPLATE_BASENAME) {
            out.push(full);
        }
    }

    return out.sort();
}

/**
 * @summary Detects single-line `leaf(...)` defaults that read `process.env` inline.
 *
 * Pure: operates on source text, so it is unit-testable without touching disk. Env access
 * in a declarative leaf must flow through the env-var-name argument, never an inline
 * `process.env` read in the default expression.
 * @param {String} source File contents.
 * @returns {Array<{line: Number, env: (String|null), key: (String|null), text: String}>}
 */
export function detectInlineEnvLeaves(source) {
    const violations = [],
          lines      = source.split('\n');

    lines.forEach((text, index) => {
        if (!/\bleaf\s*\(/.test(text))      return;
        if (!/\bprocess\.env\b/.test(text)) return;

        const env = (text.match(/'([A-Z][A-Z0-9_]{2,})'/) || [])[1] || null,
              key = (text.match(/(\w+)\s*:\s*leaf\s*\(/)   || [])[1] || null;

        violations.push({line: index + 1, env, key, text: text.trim()});
    });

    return violations;
}

/**
 * @summary Core lint: scans config templates and partitions inline-env leaf defaults into
 * baselined, new (unbaselined), and stale-baseline sets.
 * @param {Object} [options]
 * @param {String} [options.rootDir] Repo root.
 * @param {Array<{file: String, source: String}>} [options.files] Injected file records (test seam).
 * @param {ReadonlyArray<Object>} [options.baseline] Baseline rows.
 * @returns {{violations: Object[], newViolations: Object[], staleBaseline: Object[]}}
 */
export function lintConfigTemplateSsot({rootDir = ROOT_DIR, files, baseline = BASELINE} = {}) {
    const records = files || walkConfigTemplates(path.join(rootDir, SCAN_ROOT_REL)).map(abs => ({
        file  : path.relative(rootDir, abs).split(path.sep).join('/'),
        source: fs.readFileSync(abs, 'utf8')
    }));

    const violations = [];

    for (const {file, source} of records) {
        for (const hit of detectInlineEnvLeaves(source)) {
            violations.push({file, ...hit});
        }
    }

    const keyOf         = row => `${row.file}::${row.env}`,
          baselineKeys  = new Set(baseline.map(keyOf)),
          violationKeys = new Set(violations.map(keyOf));

    return {
        violations,
        newViolations: violations.filter(v => !baselineKeys.has(keyOf(v))),
        staleBaseline: baseline.filter(b => !violationKeys.has(keyOf(b)))
    };
}

const FIX_HINT = 'Move env access into the leaf env-var-name argument — leaf(default, \'ENV_VAR\', type) — ' +
    'and relocate any UNIT_TEST_MODE branch to the test layer (the test-unit npm script shell env). ' +
    'Authority: the AiConfig reactive Provider SSOT decision record (issue #12451).';

/**
 * @summary CLI wrapper. Returns an exit code (0 clean, 1 on new violations or stale baseline rows).
 * @param {Object} [options] Forwarded to {@link lintConfigTemplateSsot}.
 * @returns {{exitCode: Number, violations: Object[], newViolations: Object[], staleBaseline: Object[]}}
 */
export function runLint(options = {}) {
    const result = lintConfigTemplateSsot(options),
          {violations, newViolations, staleBaseline} = result;

    if (newViolations.length === 0 && staleBaseline.length === 0) {
        console.log(`[lint-config-template-ssot] OK - ${violations.length} inline-env leaf default(s), all baselined for #12451 burndown.`);
        return {exitCode: 0, ...result};
    }

    if (newViolations.length > 0) {
        console.error(`[lint-config-template-ssot] FAILED - ${newViolations.length} new inline process.env read(s) in a leaf default:\n`);

        for (const v of newViolations) {
            console.error(`- ${v.file}:${v.line}${v.env ? `  (${v.env})` : ''}`);
            console.error(`    ${v.text}`);
        }

        console.error(`\n${FIX_HINT}\n`);
    }

    if (staleBaseline.length > 0) {
        console.error(`[lint-config-template-ssot] FAILED - ${staleBaseline.length} baseline row(s) no longer match a live violation (reshape landed — remove the row):\n`);

        for (const b of staleBaseline) {
            console.error(`- ${b.file}::${b.env}  (${b.ticket})`);
        }

        console.error('');
    }

    return {exitCode: 1, ...result};
}

function main() {
    const arg = process.argv[2];

    if (arg === '--help' || arg === '-h') {
        console.log('Usage: node ai/scripts/lint/lint-config-template-ssot.mjs');
        console.log('');
        console.log('Fails when a config.template.mjs leaf default reads process.env inline');
        console.log('(outside the BASELINE), or when a BASELINE row no longer matches a violation.');
        process.exit(0);
    }

    const {exitCode} = runLint();
    process.exit(exitCode);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main();
}
