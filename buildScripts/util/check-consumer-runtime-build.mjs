#!/usr/bin/env node
import {execFileSync}                                         from 'node:child_process';
import fs                                                     from 'node:fs';
import os                                                     from 'node:os';
import path                                                   from 'node:path';
import process                                                from 'node:process';
import {createRequire}                                        from 'node:module';
import {fileURLToPath, pathToFileURL}                         from 'node:url';
import isEntryModule                                          from './isEntryModule.mjs';
import {BROWSER_BUNDLE_FILES, WORKSPACE_BROWSER_BUNDLE_FILES} from './browserBundles.mjs';
import {withComposedNpmIgnore}                                from './npmIgnoreComposition.mjs';
import {findForbiddenEntries}                                 from './check-package-contents.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url)),
      ROOT      = path.resolve(__dirname, '../..');

/**
 * @module buildScripts/util/check-consumer-runtime-build
 * @summary Builds Data-, Canvas- and App-worker and Main entry points from an installed copy of this package,
 * because this repository's own build structurally cannot observe what a consumer's build does.
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
 * A sixth reached production first: the Canvas worker loaded every renderer through one root, which
 * the rebase moved to the workspace, taking the engine's own `src/canvas` renderers with it.
 *
 * A seventh was found from a workspace outside this repository: the App worker's rebase was path
 * arithmetic from where the package resolved (`../../` from the worker directory), so a package
 * reached through a symbolic link resolved outside the workspace and the build compiled the
 * package's own apps instead of the consumer's. Every arm here installed a real directory, which is
 * why none of them saw it. The linked arm runs the whole set again with the package moved to
 * `node_modules/.pnpm/<name>@<version>/node_modules/` and linked back.
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
 * are observable here and belong to cheaper checks. Nor does it make a blanket byte-parity claim across
 * `DefaultConfig.mjs` additions (a dormant config key changes emitted bytes even when `false`). Instead,
 * it answers consumer-only build questions plus the production-artifact isolation contract: does
 * Data resolve the consumer's modules and only those, does Canvas reach both the package's renderers
 * and the consumer's, does every app the package ships compile in the App worker, does Main preserve an
 * optional workspace addon root without leaking Engine addons into it, does Main admit only package-declared
 * addon roots without embedding build-host paths, do the Playwright Neural Link
 * harness modules stay out of every compiled runtime artifact, and does a flag-off App worker boot expose
 * the exact pre-change `remote` method surface? The App worker's context spans every shipped `app.mjs`,
 * so it reaches each importer without a list of them; one mode suffices, because a specifier that
 * resolves nowhere fails both.
 */

/**
 * @summary Test-harness modules and misplaced Main addons that must never enter a compiled runtime artifact.
 *
 * Every file in `src/main/addon/` ships as a lazy chunk in every dist build, which is why the dedicated-worker
 * Neural Link harness adapter (`test/playwright/dedicatedWorkerNeuralLink.mjs`) and the fixture entry
 * (`test/playwright/fixtures.mjs`) live under `test/playwright/`. Spread into every worker and Main expectation
 * list so any runtime import of the harness side or any test-harness Main addon fails the guard.
 * @type {Object[]}
 */
export const TEST_HARNESS_ABSENCE_EXPECTATIONS = [{
    file   : 'test/playwright/dedicatedWorkerNeuralLink.mjs',
    match  : /(^|[/\\])test[/\\]playwright[/\\]dedicatedWorkerNeuralLink\.mjs\b/,
    present: false,
    because: 'the dedicated-worker Neural Link harness adapter belongs to the Playwright runner and must stay out of runtime artifacts'
}, {
    file   : 'test/playwright/fixtures.mjs',
    match  : /(^|[/\\])test[/\\]playwright[/\\]fixtures\.mjs\b/,
    present: false,
    because: 'the Playwright test entry and fixture wiring must stay out of runtime artifacts'
}, {
    file   : 'test/playwright/*',
    match  : /(^|[/\\])test[/\\]playwright[/\\]/,
    present: false,
    because: 'no Playwright test-harness module may be reachable from a worker or Main compilation'
}, {
    file   : 'src/main/addon/*NeuralLink*.mjs',
    match  : /src[/\\]main[/\\]addon[/\\][^/\\]*(?:NeuralLink|AiTest|TestHarness)[^/\\]*\.mjs\b/i,
    present: false,
    because: 'every file in src/main/addon/ ships as a lazy chunk in every dist build, so the test harness must never live there'
}];

/**
 * @summary The App Worker's pre-change `remote` method surface (`src/worker/App.mjs`).
 *
 * A boot without `allowAiClientInTests` exposes no dispatch route that the pre-change build lacked:
 * the `remote` map stays pinned to these exact `main` methods, `DefaultConfig.allowAiClientInTests`
 * defaults to `false`, and `resolveAiClientBoot` returns `null` for a flag-off boot. `useAiClient`
 * transport semantics are covered separately by `test/playwright/unit/worker/AppAiClientBoot.spec.mjs`
 * and `test/playwright/unit/ai/ClientTransportSeam.spec.mjs`.
 * @type {Object<String, String[]>}
 */
export const EXPECTED_APP_WORKER_REMOTE = Object.freeze({
    main: Object.freeze([
        'createNeoInstance',
        'destroyNeoInstance',
        'fireEvent',
        'getConfigs',
        'getWorkerId',
        'loadModule',
        'moveComponent',
        'setConfigs',
        'setGlobalConfig'
    ])
});

/**
 * @summary Modules the fixture plants, and what a correct consumer build must do with each.
 *
 * Spelled as required-present / required-absent rather than an exact module list: the graph legitimately
 * carries framework internals whose count is not this guard's business, while presence and absence of
 * these three and the test-harness exclusions is precisely the contract.
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
}, ...TEST_HARNESS_ABSENCE_EXPECTATIONS];

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
 * @summary Main package admission is independent of workspace addons and worker-module declarations.
 * @type {Object[]}
 */
export const MAIN_PACKAGE_EXPECTATIONS = [{
    file   : 'node_modules/@fixture/native-hooks/src/main/addon/DeclaredMainAddon.mjs',
    match  : /@fixture[/\\]native-hooks[/\\]src[/\\]main[/\\]addon[/\\]DeclaredMainAddon\.mjs\b/,
    present: true,
    because: 'a scoped dependency declaring neo.mainAddons must contribute its Main addon in either installation layout'
}, {
    file   : 'node_modules/@fixture/native-hooks/src/main/addon-sibling/UnrelatedMainModule.mjs',
    match  : /@fixture[/\\]native-hooks[/\\]src[/\\]main[/\\]addon-sibling[/\\]UnrelatedMainModule\.mjs\b/,
    present: false,
    because: 'a sibling directory outside the declared Main root must not enter the Main graph'
}, {
    file   : 'node_modules/@fixture/undeclared-hooks/src/main/addon/UndeclaredMainAddon.mjs',
    match  : /@fixture[/\\]undeclared-hooks[/\\]src[/\\]main[/\\]addon[/\\]UndeclaredMainAddon\.mjs\b/,
    present: false,
    because: 'an installed dependency without neo.mainAddons must not contribute a Main addon'
}, {
    file   : 'node_modules/@fixture/empty-hooks/src/main/addon/EmptyMainAddon.mjs',
    match  : /@fixture[/\\]empty-hooks[/\\]src[/\\]main[/\\]addon[/\\]EmptyMainAddon\.mjs\b/,
    present: false,
    because: 'an empty neo.mainAddons declaration admits no Main addon roots'
}];

/** @summary The Main-only fixture packages; none declares worker modules. */
const MAIN_PACKAGE_FIXTURES = [
    {name: '@fixture/native-hooks',     addon: 'DeclaredMainAddon',   neo: {mainAddons: ['src/main/addon']}},
    {name: '@fixture/undeclared-hooks', addon: 'UndeclaredMainAddon'},
    {name: '@fixture/empty-hooks',      addon: 'EmptyMainAddon',      neo: {mainAddons: []}}
];

/**
 * @summary What the App worker's compile must reach, so an error-free build is not a context that reached nothing.
 * @type {Object[]}
 */
export const APP_EXPECTATIONS = [{
    file   : 'node_modules/neo.mjs/apps/portal/view/news/tickets/Component.mjs',
    match  : /neo\.mjs[/\\]apps[/\\]portal[/\\]view[/\\]news[/\\]tickets[/\\]Component\.mjs$/,
    present: true,
    because: 'the App worker compiles the apps the package ships, so an importer there must resolve from an installed copy'
}, {
    file   : 'node_modules/neo.mjs/dist/marked.mjs',
    match  : /neo\.mjs[/\\]dist[/\\]marked\.mjs$/,
    present: true,
    because: 'marked resolves through the bundle generated inside the installed package, never through a node_modules layout'
}, ...TEST_HARNESS_ABSENCE_EXPECTATIONS];

/**
 * @summary What the Canvas worker's compile must reach: the engine renderers from the package (one a
 * consumer renderer extends) and a consumer renderer from app space. Matched without an end anchor,
 * because production concatenation names a renderer module `… + N modules`.
 * @type {Object[]}
 */
export const CANVAS_EXPECTATIONS = [{
    file   : 'node_modules/neo.mjs/src/canvas/Header.mjs',
    match  : /neo\.mjs[/\\]src[/\\]canvas[/\\]Header\.mjs\b/,
    present: true,
    because: 'an engine renderer ships in the package, so the Canvas worker must load it from there'
}, {
    file   : 'node_modules/neo.mjs/src/canvas/GraphScene.mjs',
    match  : /neo\.mjs[/\\]src[/\\]canvas[/\\]GraphScene\.mjs\b/,
    present: true,
    because: 'the graph-scene renderer ships in the package for consumer renderers to extend, so the Canvas worker must reach it there'
}, {
    file   : 'apps/probe/canvas/ProbeRenderer.mjs',
    match  : /apps[/\\]probe[/\\]canvas[/\\]ProbeRenderer\.mjs\b/,
    present: true,
    because: 'a consumer-owned renderer must stay reachable through the rebased app-space root'
}, ...TEST_HARNESS_ABSENCE_EXPECTATIONS];

/**
 * @summary What a CONSUMER-mode App worker compile must reach: the workspace's own app and none of the
 * ones the package ships.
 *
 * The mode matters. Built as the framework, the App worker legitimately compiles every app in the
 * package, which is `APP_EXPECTATIONS` and how a consumer building with `--framework` compiles. Built
 * as a consumer, the app-space root belongs to the workspace, so the same context must reach the
 * workspace's app instead. A linked package is the case this pins: it resolves outside the
 * workspace, and path arithmetic from where it resolves built the package's apps while the
 * workspace's app never entered the graph.
 * @type {Object[]}
 */
export const CONSUMER_APP_EXPECTATIONS = [{
    file   : 'apps/probe/app.mjs',
    match  : /apps[/\\]probe[/\\]app\.mjs$/,
    present: true,
    because: 'a consumer build compiles the workspace\'s own app, whatever layout the package was installed in'
}, {
    file   : 'node_modules/neo.mjs/apps/portal/app.mjs',
    match  : /neo\.mjs[/\\]apps[/\\]portal[/\\]app\.mjs$/,
    present: false,
    because: 'the package\'s own apps are not the consumer\'s app space, so a consumer build must not compile them'
}, ...TEST_HARNESS_ABSENCE_EXPECTATIONS];

/**
 * @summary Returns generated files missing from their runtime-owned package or workspace roots.
 * @param {String[]} files Regular files beneath the installed Engine root, as relative paths.
 * @param {String[]} workspaceFiles=[] Regular files beneath the consumer workspace, as relative paths.
 * @returns {String[]} Missing paths in the canonical browser-artifact order.
 */
export function findMissingBrowserArtifacts(files, workspaceFiles=[]) {
    const present   = new Set(files),
          workspace = new Set(workspaceFiles);

    return BROWSER_BUNDLE_FILES.filter(file =>
        !(WORKSPACE_BROWSER_BUNDLE_FILES.includes(file) ? workspace : present).has(file))
}

/**
 * @summary Pins the fixture's direct build tools to root lockfile resolutions, without reading local installs.
 * Transitive dependencies still resolve through npm; this does not synthesize a complete fixture lockfile.
 * @param {Object} declared Development dependency declarations from the installed package.
 * @param {Object} lock Root package-lock.json, including its root declarations and top-level packages.
 * @returns {Object} A new development dependency map with exact versions, preserving npm aliases.
 * @throws {Error} If a declared tool has no usable root resolution or the lockfile declaration is stale.
 */
export function resolveFixtureDevDependencies(declared, lock) {
    return Object.fromEntries(Object.entries(declared).map(([name, range]) => {
        const key     = `node_modules/${name}`,
              entry   = lock.packages?.[key],
              version = entry?.version;

        if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
            throw new Error(`Missing or unusable root lockfile resolution: ${key}`)
        }

        if (lock.packages['']?.devDependencies?.[name] !== range) {
            throw new Error(`Root lockfile declaration for ${name} differs from the installed package; refresh package-lock.json`)
        }

        return [name, entry.name && entry.name !== name ? `npm:${entry.name}@${version}` : version]
    }))
}

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
 * @summary Imports `DefaultConfig.mjs` and `src/worker/App.mjs` from `packageRoot` in a fresh Node process
 * without booting a worker singleton, returning the default flag-off config values, the enumerated `remote`
 * method map, and the `resolveAiClientBoot` outcomes for flag-off `development` and `dist/production` boots.
 * @param {String} [packageRoot=ROOT] Root of the Engine checkout or installed `node_modules/neo.mjs` package.
 * @returns {Object} The probed dispatch surface.
 */
export function probeAppWorkerDispatchSurface(packageRoot = ROOT) {
    const script = `
        import DefaultConfig from './src/DefaultConfig.mjs';
        globalThis.Neo = {
            config    : {...DefaultConfig, unitTestMode: true},
            overwrites: {Neo: {worker: {App: {singleton: false}}}}
        };
        await import('./src/Neo.mjs');
        await import('./src/core/_export.mjs');
        const {default: App} = await import('./src/worker/App.mjs');
        console.log(JSON.stringify({
            defaultAllowAiClientInTests: DefaultConfig.allowAiClientInTests,
            defaultUseAiClient         : DefaultConfig.useAiClient,
            remote                     : App.config.remote,
            flagOffDevelopmentBoot     : App.prototype.resolveAiClientBoot({...DefaultConfig, environment: 'development'}),
            flagOffProductionBoot      : App.prototype.resolveAiClientBoot({...DefaultConfig, environment: 'dist/production'})
        }));
    `;

    const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd     : packageRoot,
        encoding: 'utf8',
        timeout : 15000
    });

    return JSON.parse(stdout.trim().split('\n').at(-1))
}

/**
 * @summary Verifies that a flag-off App Worker boot exposes no dispatch route that the pre-change build lacked.
 * @param {Object} surface Output of {@link probeAppWorkerDispatchSurface}.
 * @param {Boolean} surface.defaultAllowAiClientInTests Default value of `Neo.config.allowAiClientInTests`.
 * @param {Boolean} surface.defaultUseAiClient Default value of `Neo.config.useAiClient`.
 * @param {Object<String, String[]>} surface.remote `Neo.worker.App.config.remote` method map.
 * @param {String|null} surface.flagOffDevelopmentBoot `resolveAiClientBoot` result for flag-off `development`.
 * @param {String|null} surface.flagOffProductionBoot `resolveAiClientBoot` result for flag-off `dist/production`.
 * @param {Object<String, String[]>} [expectedRemote=EXPECTED_APP_WORKER_REMOTE]
 * @returns {String[]} Human-readable failures; empty means the flag-off dispatch surface is unchanged.
 */
export function collectAppWorkerDispatchSurfaceFailures(
    {defaultAllowAiClientInTests, defaultUseAiClient, remote, flagOffDevelopmentBoot, flagOffProductionBoot},
    expectedRemote = EXPECTED_APP_WORKER_REMOTE
) {
    const failures        = [],
          actualRemote    = remote && typeof remote === 'object' ? remote : {},
          expectedTargets = Object.keys(expectedRemote).sort(),
          actualTargets   = Object.keys(actualRemote).sort();

    if (defaultAllowAiClientInTests !== false) {
        failures.push(
            `[app-worker-dispatch] DefaultConfig.allowAiClientInTests is ${JSON.stringify(defaultAllowAiClientInTests)}, expected false`
        )
    }

    if (defaultUseAiClient !== false) {
        failures.push(
            `[app-worker-dispatch] DefaultConfig.useAiClient is ${JSON.stringify(defaultUseAiClient)}, expected false`
        )
    }

    if (flagOffDevelopmentBoot !== null) {
        failures.push(
            `[app-worker-dispatch] flag-off development resolveAiClientBoot returned ${JSON.stringify(flagOffDevelopmentBoot)}, expected null`
        )
    }

    if (flagOffProductionBoot !== null) {
        failures.push(
            `[app-worker-dispatch] flag-off dist/production resolveAiClientBoot returned ${JSON.stringify(flagOffProductionBoot)}, expected null`
        )
    }

    for (const target of actualTargets) {
        if (!Object.hasOwn(expectedRemote, target)) {
            failures.push(`[app-worker-dispatch] unexpected App.config.remote target '${target}'`)
        }
    }

    for (const target of expectedTargets) {
        const expectedMethods = expectedRemote[target] || [],
              actualMethods   = Array.isArray(actualRemote[target]) ? actualRemote[target] : [];

        if (!Array.isArray(actualRemote[target])) {
            failures.push(`[app-worker-dispatch] App.config.remote.${target} is missing or not an array`);
            continue
        }

        const extraMethods   = actualMethods.filter(method => !expectedMethods.includes(method)),
              missingMethods = expectedMethods.filter(method => !actualMethods.includes(method));

        if (extraMethods.length) {
            failures.push(
                `[app-worker-dispatch] App.config.remote.${target} exposes unexpected method(s): ${extraMethods.join(', ')}`
            )
        }

        if (missingMethods.length) {
            failures.push(
                `[app-worker-dispatch] App.config.remote.${target} is missing expected method(s): ${missingMethods.join(', ')}`
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
 * @param {Object} [options]
 * @param {String} [options.packagePath] The package's own root, when it is not `node_modules/neo.mjs`.
 * @returns {String[]} Human-readable failures; empty means the Main context boundary is intact.
 */
export function collectMainContextFailures({mode, contextModules}, workspace, arm, {packagePath} = {}) {
    // macOS exposes its temp root as `/var`, while Webpack canonicalizes it to `/private/var`.
    const physicalWorkspace = fs.existsSync(workspace) ? fs.realpathSync(workspace) : path.normalize(workspace),
          physicalPackage   = packagePath === undefined
              ? path.join(physicalWorkspace, 'node_modules/neo.mjs')
              : (fs.existsSync(packagePath) ? fs.realpathSync(packagePath) : path.normalize(packagePath)),
          packageRoot       = path.normalize(path.join(physicalPackage, 'src/main/addon')),
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

/**
 * @summary Rejects Main JavaScript that embeds a build-host fixture path instead of a runtime-relative address.
 * @param {Object} result
 * @param {String} result.mode Build-mode/arm label.
 * @param {Array<{name: String, source: String}>} result.assets Emitted Main JavaScript assets.
 * @param {String[]} fixtureRoots Logical and physical consumer roots, covering macOS temp-directory aliases.
 * @param {String} [fixtureMarker] Unique temporary-directory name, preserved by nested regex/URL escaping.
 * @returns {String[]} One failure per leaking asset.
 */
export function collectMainAssetPathFailures({mode, assets}, fixtureRoots, fixtureMarker) {
    const fragments = [...new Set(fixtureRoots.flatMap(root => {
        const normalized = root.replaceAll('\\', '/');

        return [root, normalized, JSON.stringify(root).slice(1, -1), encodeURI(normalized)]
    }))];

    fixtureMarker && fragments.push(fixtureMarker);

    return assets.filter(({source}) => fragments.some(fragment => source.includes(fragment)))
        .map(({name}) => `[${mode}] Main asset ${name} embeds an absolute consumer fixture path`)
}

/**
 * @summary Writes the consumer fixture: one app-space module, two exclusions, generated roots, and the
 * loader the App-worker config copies from every workspace.
 */
function createFixture(workspace) {
    const files = {
        'package.json'                       : JSON.stringify({name: 'neo-consumer-fixture', version: '1.0.0', type: 'module'}, null, 4),
        'src/MicroLoader.mjs'                : 'export default "loader";\n',
        'apps/probe/app.mjs'                 : 'export default class ConsumerApp {}\n',
        'apps/probe/index.html'              : '<!doctype html><html><body></body></html>\n',
        'apps/probe/neo-config.json'         : JSON.stringify({appPath: '../../apps/probe'}, null, 4),
        'apps/probe/data/ConsumerOnly.mjs'   : 'export default class ConsumerOnly {}\n',
        'apps/probe/canvas/ProbeRenderer.mjs': 'export default class ProbeRenderer {}\n',
        'RootOnly.mjs'                       : 'export default "root-level node script";\n',
        'client/src/Unrelated.mjs'           : 'export default "unrelated application tree";\n'
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

/** @summary Removes the workspace Main addon, so the next arm's absent builds start without it. */
function removeMainAddonFixture(workspace) {
    // The directory, not just the file: an existing but empty root is a live context, and the absent
    // arm is specifically the arm where the root does not exist.
    fs.rmSync(path.join(workspace, 'src/main/addon'), {recursive: true, force: true})
}

/**
 * @summary Installs neutral Main-addon dependencies after npm's final pruning pass.
 * @description Main already owns Neo.core.Base. These real addon classes reuse that class graph, expose a browser
 * method through the usual Main-addon remote contract, and require no package-layout-specific Engine import.
 * @param {String} workspace Consumer fixture root.
 */
function installMainPackageFixtures(workspace) {
    const manifestPath = path.join(workspace, 'package.json'),
          manifest     = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    for (const {name, addon, neo} of MAIN_PACKAGE_FIXTURES) {
        const root = path.join(workspace, 'node_modules', name);

        fs.mkdirSync(path.join(root, 'src/main/addon'), {recursive: true});
        fs.writeFileSync(path.join(root, 'package.json'),
            JSON.stringify({name, version: '1.0.0', type: 'module', ...(neo && {neo})}, null, 4));
        fs.writeFileSync(path.join(root, `src/main/addon/${addon}.mjs`), [
            '/** @summary Neutral package-owned Main addon for the physical consumer build guard. */',
            `class ${addon} extends Neo.core.Base {`,
            '    static config = {',
            `        className: 'ConsumerRuntimeMain.addon.${addon}',`,
            '        isMainThreadAddon: true,',
            "        remote: {app: ['readWindow']}",
            '    }',
            '    /** @summary Reads the window in which Main registered this addon. */',
            '    readWindow() { return {name: window.name, title: document.title} }',
            '}',
            `export default Neo.setupClass(${addon});`,
            ''
        ].join('\n'));

        manifest.dependencies = {...manifest.dependencies, [name]: '1.0.0'}
    }

    const sibling = path.join(workspace, 'node_modules/@fixture/native-hooks/src/main/addon-sibling/UnrelatedMainModule.mjs');

    fs.mkdirSync(path.dirname(sibling), {recursive: true});
    fs.writeFileSync(sibling, 'export default "not a declared Main addon root";\n');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4))
}

/**
 * @summary Replaces one fixture package with a symbolic link to it, in pnpm's real-path layout.
 *
 * A linked package resolves outside the workspace: path arithmetic from where the package resolves
 * cannot reach the consumer's app space. The real path is
 * placed under `node_modules/.pnpm/<name>@<version>/node_modules/` so the linked arm covers pnpm's
 * store layout as well as a plain link.
 *
 * @param {String} workspace Consumer fixture root.
 * @param {String} [name='neo.mjs'] Installed Engine or Main-fixture package name.
 * @returns {String} The package's real (linked) path.
 */
function linkPackage(workspace, name='neo.mjs') {
    const installed = path.join(workspace, 'node_modules', name),
          real      = path.join(workspace, 'node_modules/.pnpm', `${name.replaceAll('/', '+')}@1.0.0`, 'node_modules', name);

    fs.mkdirSync(path.dirname(real), {recursive: true});
    fs.renameSync(installed, real);
    fs.symlinkSync(real, installed, 'dir');

    return real
}

/**
 * @summary Compiles the installed worker config for one mode and reports what the graph holds.
 *
 * The config resolves `neoPath` from `process.cwd()` at import time, so the process must already be
 * standing in the consumer when the module loads — running it from the framework checkout silently
 * builds the framework's own tree instead, and every consumer assertion then fails for the wrong
 * reason. The caller owns the `chdir`; this only consumes it.
 *
 * The App worker has a config of its own, selected as `buildThreads.mjs` selects it, and compiles as the
 * framework while standing in the consumer. In consumer mode its app context moves to the workspace root,
 * where webpack hides everything under `./node_modules/`, so it reaches no shipped app. As the framework it
 * reaches every one, which is also how a consumer building with `--framework` compiles.
 * @param {String} workspace Consumer fixture root.
 * @param {String} mode `development` or `production`.
 * @param {String} [worker='data'] `data`, `canvas` or `app`.
 * @param {Object} [options]
 * @param {Boolean} [options.asConsumer=false] Build the App worker as a consumer rather than as the framework.
 * @returns {Promise<Object>} Compilation module names and errors.
 */
async function buildWorker(workspace, mode, worker='data', {asConsumer = false} = {}) {
    const webpack = createRequire(path.join(workspace, 'package.json'))('webpack'),
          isApp   = worker === 'app',
          // A distinct URL per arm gives each its own module state: the configs read
          // `process.cwd()` and cache build targets at import time, and the two App arms are the
          // same module file. `buildMain` isolates its arms the same way.
          configUrl = pathToFileURL(path.join(workspace,
              `node_modules/neo.mjs/buildScripts/webpack/${mode}/webpack.config.${isApp ? 'appworker' : 'worker'}.mjs`
          )).href;

    const {default: configFactory} = await import(`${configUrl}?arm=${isApp ? (asConsumer ? 'consumer' : 'framework') : 'worker'}`);

    const config = configFactory(isApp && !asConsumer ? {insideNeo: 'true'} : {worker, insideNeo: 'false'});

    config.output = {...config.output, path: path.join(workspace, 'dist', mode, worker)};

    const stats = await new Promise((resolve, reject) => {
        webpack(config, (err, result) => err ? reject(err) : resolve(result))
    });

    const json = stats.toJson({modules: true, errors: true, all: false});

    return {
        mode       : `${mode}/${worker}${asConsumer ? '/consumer' : ''}`,
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
        mode       : `${mode}/main-${arm}`,
        moduleNames: (json.modules || []).map(m => m.name || ''),
        errors     : (json.errors  || []).map(e => e.message || String(e)),
        assets     : stats.hasErrors() ? [] : stats.compilation.getAssets()
            .filter(({name}) => /\.(?:m?js)$/.test(name))
            .map(({name}) => ({name, source: fs.readFileSync(path.join(config.output.path, name), 'utf8')})),
        contextModules: [...stats.compilation.modules]
            .filter(module => module.constructor?.name === 'ContextModule')
            .map(module => ({
                context     : module.context,
                regExpSource: module.options?.regExp?.source || ''
            }))
    }
}

/** @summary Packs source, generates browser dependencies in an installed consumer, then verifies its runtime builds. */
async function main() {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-consumer-')),
          // Nested under `apps` on purpose: the ancestor-name match is half of what this guard covers.
          workspace     = path.join(workspaceRoot, 'apps', 'workspace');

    fs.mkdirSync(workspace, {recursive: true});

    try {
        createFixture(workspace);

        console.log('check-consumer-runtime-build: packing…');
        // Skip hooks, but retain the same ignore composition that publish uses.
        const report = withComposedNpmIgnore(ROOT, () => JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--loglevel=error', '--pack-destination', workspace],
            {cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}))[0]),
              forbidden = findForbiddenEntries(report.files.map(file => file.path));

        if (forbidden.length) {
            throw new Error(`the consumer tarball contains forbidden entries: ${forbidden.map(entry => entry.path).join(', ')}`)
        }

        console.log(`check-consumer-runtime-build: installing ${report.filename} into the fixture…`);
        execFileSync('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', `./${report.filename}`],
            {cwd: workspace, encoding: 'utf8', stdio: 'pipe'});

        const installedRoot = path.join(workspace, 'node_modules/neo.mjs'),
              installed     = JSON.parse(fs.readFileSync(path.join(installedRoot, 'package.json'), 'utf8')),
              manifestPath  = path.join(workspace, 'package.json'),
              manifest      = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

        // Keep locked direct build tools hoisted: a nested install could hide resolution defects.
        manifest.devDependencies = resolveFixtureDevDependencies(installed.devDependencies,
            JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8')));
        manifest.overrides       = installed.overrides;
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4));
        execFileSync('npm', ['install', '--include=dev', '--no-audit', '--no-fund', '--ignore-scripts'],
            {cwd: workspace, encoding: 'utf8', stdio: 'pipe'});

        installMainPackageFixtures(workspace);

        console.log('check-consumer-runtime-build: generating browser dependencies from the consumer workspace…');
        execFileSync(process.execPath, [path.join(installedRoot, 'buildScripts/build/all.mjs'),
            '-n', '-l', 'no', '-t', 'no', '-w', 'no', '-p', 'no', '-e', 'dev'],
        {cwd: workspace, stdio: 'inherit'});

        const filesAt = root => BROWSER_BUNDLE_FILES.filter(file =>
                  fs.statSync(path.join(root, file), {throwIfNoEntry: false})?.isFile()),
              missing = findMissingBrowserArtifacts(filesAt(installedRoot), filesAt(workspace));

        if (missing.length) {
            throw new Error(`the consumer build is missing files at their runtime roots: ${missing.join(', ')}`)
        }

        const failures = [],
              origCwd  = process.cwd();

        console.log('check-consumer-runtime-build: verifying flag-off App worker dispatch surface…');
        failures.push(...collectAppWorkerDispatchSurfaceFailures(probeAppWorkerDispatchSurface(installedRoot)));

        // Stand in the consumer before the configs load: they read `process.cwd()` at import time.
        process.chdir(workspace);

        try {
            for (const arm of ['installed', 'linked']) {
                const packagePath = arm === 'linked' ? linkPackage(workspace) : undefined;

                arm === 'linked' && linkPackage(workspace, '@fixture/native-hooks');
                removeMainAddonFixture(workspace);

                for (const mode of ['development', 'production']) {
                    console.log(`check-consumer-runtime-build: [${arm}] building ${mode} Data…`);
                    failures.push(...collectConsumerBuildFailures(await buildWorker(workspace, mode)));

                    console.log(`check-consumer-runtime-build: [${arm}] building ${mode} Canvas…`);
                    failures.push(...collectConsumerBuildFailures(await buildWorker(workspace, mode, 'canvas'), CANVAS_EXPECTATIONS));

                    console.log(`check-consumer-runtime-build: [${arm}] building ${mode} Main without workspace addons…`);
                    const result = await buildMain(workspace, mode, `${arm}-absent`);

                    failures.push(...collectConsumerBuildFailures(
                        result,
                        [{...MAIN_ADDON_EXPECTATION, present: false}, ...MAIN_PACKAGE_EXPECTATIONS, ...TEST_HARNESS_ABSENCE_EXPECTATIONS]
                    ));
                    failures.push(...collectMainContextFailures(result, workspace, 'absent', {packagePath}));
                    failures.push(...collectMainAssetPathFailures(result, [workspace, fs.realpathSync(workspace)], path.basename(workspaceRoot)))
                }

                console.log(`check-consumer-runtime-build: [${arm}] building development App as a consumer…`);
                failures.push(...collectConsumerBuildFailures(
                    await buildWorker(workspace, 'development', 'app', {asConsumer: true}),
                    CONSUMER_APP_EXPECTATIONS
                ));

                if (arm === 'installed') {
                    // Only the installed layout can hold this arm. `src/worker/App.mjs`'s shipped
                    // `webpackExclude` drops any path segment `node_modules/` not followed by
                    // `neo.mjs`, so a package resolved from `node_modules/.pnpm/…/node_modules/` is
                    // excluded by its own store path and the framework build reaches no app of the
                    // package. That is a separate defect in the exclude pattern, out of scope here,
                    // and it is reported rather than papered over.
                    console.log(`check-consumer-runtime-build: [${arm}] building development App as the framework…`);
                    failures.push(...collectConsumerBuildFailures(await buildWorker(workspace, 'development', 'app'), APP_EXPECTATIONS));
                } else {
                    console.log(`check-consumer-runtime-build: [${arm}] SKIPPED the development framework App arm: the package resolves from a pnpm store path, which src/worker/App.mjs's shipped webpackExclude excludes before it reaches any app of the package (separate defect, out of scope here).`)
                }

                createMainAddonFixture(workspace);

                for (const mode of ['development', 'production']) {
                    console.log(`check-consumer-runtime-build: [${arm}] building ${mode} Main with a workspace addon…`);
                    const result = await buildMain(workspace, mode, `${arm}-present`);

                    failures.push(...collectConsumerBuildFailures(
                        result,
                        [MAIN_ADDON_EXPECTATION, ...MAIN_PACKAGE_EXPECTATIONS, ...TEST_HARNESS_ABSENCE_EXPECTATIONS]
                    ));
                    failures.push(...collectMainContextFailures(result, workspace, 'present', {packagePath}));
                    failures.push(...collectMainAssetPathFailures(result, [workspace, fs.realpathSync(workspace)], path.basename(workspaceRoot)))
                }
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

        console.log('\ncheck-consumer-runtime-build: OK — Data and Main preserve their consumer-owned contexts in both modes; Main admits only declared package addon roots and emits no absolute fixture paths; Canvas reaches the package\'s renderers and the consumer\'s; the App worker compiles the workspace\'s own app as a consumer in both layouts and every shipped app as the framework with the package installed; and the rest holds with the Engine and declaring Main package linked from pnpm-style real paths. The framework App arm runs installed only and is logged as skipped when linked.')
    } finally {
        fs.rmSync(workspaceRoot, {recursive: true, force: true})
    }
}

// Only the CLI path packs and builds; importing the module for its rule logic must stay cheap.
if (isEntryModule(import.meta.url)) {
    main().catch(error => {
        console.error(`check-consumer-runtime-build: ${error.message}`);
        process.exit(1)
    })
}
