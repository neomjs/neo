#!/usr/bin/env node
import {execFileSync}                 from 'node:child_process';
import fs                             from 'node:fs';
import os                             from 'node:os';
import path                           from 'node:path';
import process                        from 'node:process';
import {createRequire}                from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url)),
      ROOT      = path.resolve(__dirname, '../..');

/**
 * @module buildScripts/util/check-consumer-runtime-build
 * @summary Builds Data-worker and Main entry points from an installed copy of this package, because
 * this repository's own build structurally cannot observe what a consumer's build does.
 *
 * ## The defect class
 *
 * Runtime entries author lazy-import roots relative to their own directories, and their webpack
 * configs translate consumer-owned roots outward once the framework is a dependency. Every check we
 * run lives on the framework side of that translation, where the repository *is* the workspace — so
 * the translation is never exercised and its failures are invisible. Five defects of exactly this
 * shape landed within one day:
 *
 * - An unanchored `webpackInclude` matched on an *ancestor* directory named `apps`, so a nested
 *   workspace registered its entire tree. In this repository the same pattern is correct, which is
 *   why it survived: the include narrows properly exactly when the repository is the thing built.
 * - Splitting that context into four static roots then broke the configs' consumer rebasing: three
 *   roots resolved inside `node_modules/neo.mjs` and one resolved nowhere.
 * - Those same four roots are *optional* for a consumer, and rebasing an absent one failed the build
 *   outright — a case a path-arithmetic simulation cannot see, because it never asks whether a
 *   directory exists.
 * - Dependencies resolved by filesystem path rather than module resolution, which breaks the moment
 *   npm hoists them to a consumer root this package cannot see.
 * - Main's opt-in `WS/` context resolved the consumer's optional `src/main/addon` directory even
 *   when no workspace addon existed, so a generated consumer needed a meaningless empty directory.
 *
 * ## Why it packs and builds for real
 *
 * Reasoning about relative paths is explicitly not a substitute, and neither is a simulated layout:
 * the simulation encodes the dimensions its author thought of, and the optional-root failure above
 * was found by a physical build within a minute of a simulated one reporting all roots correct. Only
 * an installed copy, built from a workspace that is not this repository, can falsify the claim.
 *
 * The fixture workspace is created **under a directory named `apps`** so the original ancestor-match
 * trigger is covered by the same run, and it deliberately ships no `examples/` or `docs/app/` so the
 * optional-root path is exercised rather than assumed.
 *
 * ## What it does NOT do
 *
 * It does not assert bundle size, chunk counts, or anything about *this* repository's build — those
 * are observable here and belong to cheaper checks. It answers two consumer-only questions: does
 * Data resolve the consumer's modules and only those, and does Main preserve an optional workspace
 * addon root without leaking package addons into it?
 */

/**
 * @summary Modules the fixture plants, and what a correct consumer build must do with each.
 *
 * Spelled as required-present / required-absent rather than an exact module list: the graph legitimately
 * carries framework internals whose count is not this guard's business, while presence and absence of
 * these three is precisely the contract.
 */
const FIXTURE_EXPECTATIONS = [{
    file   : 'apps/probe/data/ConsumerOnly.mjs',
    match  : /apps[/\\]probe[/\\]data[/\\]ConsumerOnly\.mjs$/,
    present: true,
    because: 'a consumer-owned app-space module must be reachable from the consumer\'s Data worker'
}, {
    file   : 'RootOnly.mjs',
    match  : /(^|[/\\])RootOnly\.mjs$/,
    present: false,
    because: 'a root-level Node-only script must never be registered in a browser worker bundle'
}, {
    file   : 'client/src/Unrelated.mjs',
    match  : /client[/\\]src[/\\]Unrelated\.mjs$/,
    present: false,
    because: 'an unrelated application tree must not be dragged in by an over-wide context'
}];

/**
 * @summary The optional workspace-owned Main addon planted by the positive fixture arm.
 * @type {Object}
 */
const MAIN_ADDON_EXPECTATION = {
    file   : 'src/main/addon/ConsumerMainAddon.mjs',
    match  : /src[/\\]main[/\\]addon[/\\]ConsumerMainAddon\.mjs$/,
    present: true,
    because: 'a present workspace Main addon must remain reachable through the WS context'
};

/**
 * @summary Rule logic, split from the pack/install/build so it is unit-testable without spawning.
 *
 * @param {Object}   result
 * @param {String}   result.mode `development` or `production`, for the failure message only.
 * @param {String[]} result.moduleNames Module identifiers from the compilation.
 * @param {String[]} result.errors Compilation error messages.
 * @param {Object[]} [expectations=FIXTURE_EXPECTATIONS]
 * @returns {String[]} Human-readable failures; empty means the build honours the contract.
 */
export function collectConsumerBuildFailures({mode, moduleNames, errors}, expectations = FIXTURE_EXPECTATIONS) {
    const failures = [];

    for (const error of errors) {
        failures.push(`[${mode}] build error: ${error.split('\n')[0]}`)
    }

    for (const {file, match, present, because} of expectations) {
        const found = moduleNames.some(name => match.test(name));

        if (found !== present) {
            failures.push(
                `[${mode}] ${file} is ${found ? 'present' : 'absent'}, expected ${present ? 'present' : 'absent'} — ${because}`
            )
        }
    }

    return failures
}

/**
 * @summary Verifies that Main preserves the package/WS namespace boundary in the compiled contexts.
 *
 * Flat module presence cannot prove this boundary: Main's legitimate package context already emits
 * every Engine addon, so a broken WS fallback that points at the same package root would look green.
 * The compiled ContextModules retain the missing dimension. An absent workspace root must produce
 * one matches-nothing package fallback beside the one live package context; a present root must
 * instead produce one live context at each physical root.
 *
 * @param {Object} result
 * @param {String} result.mode Build-mode/arm label for failure messages.
 * @param {Array<{context: String, regExpSource: String}>} result.contextModules Compiled context identities.
 * @param {String} workspace Consumer fixture root.
 * @param {String} arm `absent` or `present`.
 * @returns {String[]} Human-readable failures; empty means the Main context boundary is intact.
 */
export function collectMainContextFailures({mode, contextModules}, workspace, arm) {
    // macOS exposes its temp root as `/var`, while Webpack canonicalizes it to `/private/var`.
    const physicalWorkspace = fs.existsSync(workspace) ? fs.realpathSync(workspace) : path.normalize(workspace),
          packageRoot       = path.normalize(path.join(physicalWorkspace, 'node_modules/neo.mjs/src/main/addon')),
          workspaceRoot     = path.normalize(path.join(physicalWorkspace, 'src/main/addon')),
          packageContexts   = contextModules.filter(module => path.normalize(module.context) === packageRoot),
          workspaceContexts = contextModules.filter(module => path.normalize(module.context) === workspaceRoot),
          emptyPackage      = packageContexts.filter(module => module.regExpSource === '(?!)'),
          livePackage       = packageContexts.filter(module => module.regExpSource !== '(?!)'),
          liveWorkspace     = workspaceContexts.filter(module => module.regExpSource !== '(?!)'),
          failures          = [];

    if (livePackage.length !== 1) {
        failures.push(`[${mode}] package Main addon contexts: ${livePackage.length} live, expected 1`)
    }

    if (arm === 'absent') {
        if (emptyPackage.length !== 1) {
            failures.push(
                `[${mode}] absent WS context: ${emptyPackage.length} matches-nothing package fallbacks, expected 1 — Engine addons could leak into WS/*`
            )
        }

        if (workspaceContexts.length !== 0) {
            failures.push(`[${mode}] absent WS context resolved ${workspaceContexts.length} workspace roots, expected 0`)
        }
    } else {
        if (liveWorkspace.length !== 1) {
            failures.push(`[${mode}] present WS context: ${liveWorkspace.length} live workspace roots, expected 1`)
        }

        if (emptyPackage.length !== 0) {
            failures.push(`[${mode}] present WS context still emitted ${emptyPackage.length} empty package fallbacks, expected 0`)
        }
    }

    return failures
}

/** @summary Writes the consumer fixture: one app-space module, two exclusions, and generated roots. */
function createFixture(workspace) {
    const files = {
        'package.json'                    : JSON.stringify({name: 'neo-consumer-fixture', version: '1.0.0', type: 'module'}, null, 4),
        'apps/probe/data/ConsumerOnly.mjs': 'export default class ConsumerOnly {}\n',
        'RootOnly.mjs'                    : 'export default "root-level node script";\n',
        'client/src/Unrelated.mjs'        : 'export default "unrelated application tree";\n'
    };

    for (const [relative, contents] of Object.entries(files)) {
        const target = path.join(workspace, relative);

        fs.mkdirSync(path.dirname(target), {recursive: true});
        fs.writeFileSync(target, contents)
    }

    // Main's external config enumerates this generated-workspace root before compilation.
    fs.mkdirSync(path.join(workspace, 'resources'), {recursive: true})
}

/** @summary Adds the positive-arm workspace Main addon after absent-root builds complete. */
function createMainAddonFixture(workspace) {
    const target = path.join(workspace, MAIN_ADDON_EXPECTATION.file);

    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, 'export default class ConsumerMainAddon {}\n')
}

/**
 * @summary Compiles the installed worker config for one mode and reports what the graph holds.
 *
 * The config resolves `neoPath` from `process.cwd()` at import time, so the process must already be
 * standing in the consumer when the module loads — running it from the framework checkout silently
 * builds the framework's own tree instead, and every consumer assertion then fails for the wrong
 * reason. The caller owns the `chdir`; this only consumes it.
 */
async function buildWorker(workspace, mode) {
    const webpack = createRequire(path.join(workspace, 'package.json'))('webpack');

    const {default: configFactory} = await import(
        path.join(workspace, `node_modules/neo.mjs/buildScripts/webpack/${mode}/webpack.config.worker.mjs`)
    );

    const config = configFactory({worker: 'data', insideNeo: 'false'});

    config.output = {...config.output, path: path.join(workspace, 'dist', mode)};

    const stats = await new Promise((resolve, reject) => {
        webpack(config, (err, result) => err ? reject(err) : resolve(result))
    });

    const json = stats.toJson({modules: true, errors: true, all: false});

    return {
        mode,
        moduleNames: (json.modules || []).map(m => m.name || ''),
        errors     : (json.errors  || []).map(e => e.message || String(e))
    }
}

/**
 * @summary Compiles the installed Main config for one mode and optional-root arm.
 * @param {String} workspace Consumer fixture root.
 * @param {String} mode `development` or `production`.
 * @param {String} arm `absent` or `present`, used to isolate config module state and output.
 * @returns {Promise<Object>} Compilation module names and errors.
 */
async function buildMain(workspace, mode, arm) {
    const webpack           = createRequire(path.join(workspace, 'package.json'))('webpack'),
          configPath        = path.join(workspace, `node_modules/neo.mjs/buildScripts/webpack/${mode}/webpack.config.main.mjs`),
          {default: config} = await import(`${pathToFileURL(configPath).href}?arm=${arm}`);

    // Post-build copies are orthogonal to context resolution and require optional asset packages.
    config.plugins = config.plugins.filter(plugin => plugin.constructor?.name !== 'WebpackHookPlugin');
    config.output  = {...config.output, path: path.join(workspace, 'dist', mode, `main-${arm}`)};

    const stats = await new Promise((resolve, reject) => {
        webpack(config, (err, result) => err ? reject(err) : resolve(result))
    });

    const json = stats.toJson({modules: true, errors: true, all: false});

    return {
        mode          : `${mode}/main-${arm}`,
        moduleNames   : (json.modules || []).map(m => m.name || ''),
        errors        : (json.errors  || []).map(e => e.message || String(e)),
        contextModules: [...stats.compilation.modules]
            .filter(module => module.constructor?.name === 'ContextModule')
            .map(module => ({
                context     : module.context,
                regExpSource: module.options?.regExp?.source || ''
            }))
    }
}

async function main() {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-consumer-')),
          // Nested under `apps` on purpose: the ancestor-name match is half of what this guard covers.
          workspace     = path.join(workspaceRoot, 'apps', 'workspace');

    fs.mkdirSync(workspace, {recursive: true});

    try {
        createFixture(workspace);

        console.log('check-consumer-runtime-build: packing…');
        const packed = execFileSync('npm', ['pack', '--pack-destination', workspace], {cwd: ROOT, encoding: 'utf8'})
            .trim().split('\n').pop().trim();

        console.log(`check-consumer-runtime-build: installing ${packed} into the fixture…`);
        // The published package declares no runtime dependencies, so a consumer that builds neo's
        // workers supplies the build toolchain itself; installing it here mirrors that reality.
        execFileSync('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', `./${packed}`, 'fs-extra', 'webpack', 'webpack-hook-plugin'],
            {cwd: workspace, encoding: 'utf8', stdio: 'pipe'});

        const failures = [],
              origCwd  = process.cwd();

        // Stand in the consumer before the configs load: they read `process.cwd()` at import time.
        process.chdir(workspace);

        try {
            for (const mode of ['development', 'production']) {
                console.log(`check-consumer-runtime-build: building ${mode} Data…`);
                failures.push(...collectConsumerBuildFailures(await buildWorker(workspace, mode)));

                console.log(`check-consumer-runtime-build: building ${mode} Main without workspace addons…`);
                const result = await buildMain(workspace, mode, 'absent');

                failures.push(...collectConsumerBuildFailures(
                    result,
                    [{...MAIN_ADDON_EXPECTATION, present: false}]
                ));
                failures.push(...collectMainContextFailures(result, workspace, 'absent'))
            }

            createMainAddonFixture(workspace);

            for (const mode of ['development', 'production']) {
                console.log(`check-consumer-runtime-build: building ${mode} Main with a workspace addon…`);
                const result = await buildMain(workspace, mode, 'present');

                failures.push(...collectConsumerBuildFailures(
                    result,
                    [MAIN_ADDON_EXPECTATION]
                ));
                failures.push(...collectMainContextFailures(result, workspace, 'present'))
            }
        } finally {
            process.chdir(origCwd)
        }

        if (failures.length) {
            console.error(`\ncheck-consumer-runtime-build: FAILED (${failures.length})\n`);
            failures.forEach(failure => console.error(`  ${failure}`));
            console.error('\nA consumer build resolves differently from this repository\'s own.');
            process.exit(1)
        }

        console.log('\ncheck-consumer-runtime-build: OK — Data and Main preserve their consumer-owned contexts in both modes.')
    } finally {
        fs.rmSync(workspaceRoot, {recursive: true, force: true})
    }
}

// Only the CLI path packs and builds; importing the module for its rule logic must stay cheap.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
    main().catch(error => {
        console.error(`check-consumer-runtime-build: ${error.message}`);
        process.exit(1)
    })
}
