#!/usr/bin/env node
import {execFileSync}  from 'node:child_process';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import process         from 'node:process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url)),
      ROOT      = path.resolve(__dirname, '../..');

/**
 * @module buildScripts/util/check-consumer-worker-build
 * @summary Builds a Data worker from an installed copy of this package, because this repository's
 * own build structurally cannot observe what a consumer's build does.
 *
 * ## The defect class
 *
 * A worker authors its lazy-import roots relative to its own directory, and the worker webpack
 * configs translate those roots outward once the framework is a dependency. Every check we run lives
 * on the framework side of that translation, where the repository *is* the workspace — so the
 * translation is never exercised and its failures are invisible. Four defects of exactly this shape
 * landed within one day:
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
 * are observable here and belong to cheaper checks. It answers one question: does a consumer's Data
 * worker resolve the consumer's modules, and only those?
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

/** @summary Writes the consumer fixture: one app-space module, two that must never be reached. */
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

async function main() {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-consumer-')),
          // Nested under `apps` on purpose: the ancestor-name match is half of what this guard covers.
          workspace     = path.join(workspaceRoot, 'apps', 'workspace');

    fs.mkdirSync(workspace, {recursive: true});

    try {
        createFixture(workspace);

        console.log('check-consumer-worker-build: packing…');
        const packed = execFileSync('npm', ['pack', '--pack-destination', workspace], {cwd: ROOT, encoding: 'utf8'})
            .trim().split('\n').pop().trim();

        console.log(`check-consumer-worker-build: installing ${packed} into the fixture…`);
        // The published package declares no runtime dependencies, so a consumer that builds neo's
        // workers supplies the build toolchain itself; installing it here mirrors that reality.
        execFileSync('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', `./${packed}`, 'fs-extra', 'webpack'],
            {cwd: workspace, encoding: 'utf8', stdio: 'pipe'});

        const failures = [],
              origCwd  = process.cwd();

        // Stand in the consumer before the configs load: they read `process.cwd()` at import time.
        process.chdir(workspace);

        try {
            for (const mode of ['development', 'production']) {
                console.log(`check-consumer-worker-build: building ${mode}…`);
                failures.push(...collectConsumerBuildFailures(await buildWorker(workspace, mode)))
            }
        } finally {
            process.chdir(origCwd)
        }

        if (failures.length) {
            console.error(`\ncheck-consumer-worker-build: FAILED (${failures.length})\n`);
            failures.forEach(failure => console.error(`  ${failure}`));
            console.error('\nA consumer build resolves differently from this repository\'s own. See #17881.');
            process.exit(1)
        }

        console.log('\ncheck-consumer-worker-build: OK — both modes resolve the consumer\'s modules and only those.')
    } finally {
        fs.rmSync(workspaceRoot, {recursive: true, force: true})
    }
}

// Only the CLI path packs and builds; importing the module for its rule logic must stay cheap.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
    main().catch(error => {
        console.error(`check-consumer-worker-build: ${error.message}`);
        process.exit(1)
    })
}
