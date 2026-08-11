#!/usr/bin/env node
/**
 * @module ai/scripts/diagnostics/printAiConfig
 * @summary Prints resolved AiConfig leaves for a named server config — the one-command falsifier for "resolved at this head" claims in tickets, PR bodies, and reviews.
 *
 * Why this exists (born as a tooling gap named in cross-family review): the read-gate for the
 * config SSOT made "read resolved leaves at the use site" the rule, and PR bodies increasingly
 * carry resolved-at-this-head measurements as load-bearing evidence (a recent test-isolation
 * burndown rested entirely on one). Resolution only runs inside a booted Neo context, and the
 * boot contract is non-obvious — a bare `node -e` probe dies on `Neo.gatekeep` before ever
 * reaching the config. So a reviewer could not falsify a runtime-resolution claim without
 * writing their own probe, and verify-before-assert degraded to static source reading exactly
 * when the claim was about runtime behavior.
 *
 * Boot contract (spike-verified before implementation): `globalThis.Neo.config` BEFORE importing
 * `src/Neo.mjs`, then import the config template. Reads the canonical template only, never the
 * operator overlay.
 *
 * Toggle leaves are printed alongside value leaves on purpose: some resolutions are
 * consumer-side (e.g. `engines.chroma.database` stays `default_database` while ChromaManager
 * selects `databaseTest` via `engines.chroma.useTestDatabase`), and printing values alone would
 * misread consumer-side selection as missing isolation.
 *
 * Usage:
 *   npm run ai:config-print -- [--unit] [--server=memory-core|knowledge-base|neural-link] [dot.paths…]
 *
 * Read-only by construction: resolves and prints; never assigns to any config path. Env faithfulness:
 * the leaf machinery owns env overrides, so a caller-exported `UNIT_TEST_MODE` resolves exactly as
 * it would in the harness; `--unit` merely sets it for you.
 * @plane in-plane
 */
import path                           from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const neoRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Server key -> repo-relative canonical config template. Scoped to the three servers whose
 * config resolution is the current review surface; `github-workflow` and `gitlab-workflow`
 * templates exist but are deliberately not wired yet — an unknown key fails loud with the valid
 * values rather than reading as "unsupported".
 * @type {Object<string,string>}
 */
const SERVERS = Object.freeze({
    'knowledge-base': 'ai/mcp/server/knowledge-base/config.template.mjs',
    'memory-core'   : 'ai/mcp/server/memory-core/config.template.mjs',
    'neural-link'   : 'ai/mcp/server/neural-link/config.template.mjs'
});

/**
 * Default print set: the test-isolation surface of the config SSOT plus the selector toggles, so a
 * resolution claim in this family is falsifiable with a bare `npm run ai:config-print -- --unit`.
 * @type {String[]}
 */
const DEFAULT_PATHS = Object.freeze([
    'storagePaths.graph',
    'collections.memory',
    'collections.session',
    'engines.chroma.database',
    'engines.chroma.useTestDatabase',
    'engines.chroma.useUnitTestDatabase'
]);

/**
 * @summary Parses CLI args into a paths/server/unit triple.
 * @param {String[]} argv Argv tail (post `node script`).
 * @returns {{paths: String[], server: String, unit: Boolean}}
 */
export function parseArgs(argv) {
    let unit   = false,
        server = 'memory-core';

    const paths = [];

    for (const arg of argv) {
        if (arg === '--unit') {
            unit = true
        } else if (arg.startsWith('--server=')) {
            server = arg.slice('--server='.length)
        } else {
            paths.push(arg)
        }
    }

    return {paths, server, unit}
}

/**
 * @summary Boots the minimal Neo context, resolves the selected config template, prints leaves.
 * @param {String[]} [argv] Defaults to the real CLI tail.
 */
export async function main(argv = process.argv.slice(2)) {
    const {paths, server, unit} = parseArgs(argv),
          templateRel           = SERVERS[server];

    if (!templateRel) {
        console.error(`[ai:config-print] unknown --server "${server}" — valid: ${Object.keys(SERVERS).join(', ')}`);
        process.exit(2)
    }

    // The boot contract: Neo.config must exist before src/Neo.mjs evaluates (Neo.gatekeep).
    globalThis.Neo ??= {};
    globalThis.Neo.config = {environment: 'development', unitTestMode: unit};

    if (unit) {
        process.env.UNIT_TEST_MODE = 'true'
    }

    await import(pathToFileURL(path.join(neoRootDir, 'src/Neo.mjs')).href);

    const aiConfig = (await import(pathToFileURL(path.join(neoRootDir, templateRel)).href)).default,
          wanted   = paths.length > 0 ? paths : DEFAULT_PATHS,
          missing  = [];

    console.log(`# server=${server} mode=${unit ? 'unit' : 'prod'} template=${templateRel}`);

    for (const dotPath of wanted) {
        const value = dotPath.split('.').reduce((acc, key) => acc?.[key], aiConfig);

        console.log(`${dotPath} = ${value}`);

        if (value === undefined) {
            missing.push(dotPath)
        }
    }

    if (missing.length > 0) {
        console.error(`[ai:config-print] unresolved path(s): ${missing.join(', ')}`);
        process.exit(1)
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(err => {
        console.error(`[ai:config-print] ${err.message}`);
        process.exit(1)
    })
}
