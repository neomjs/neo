import { test as base, expect } from '@playwright/test';
import path                     from 'node:path';
import process                  from 'node:process';
import {pathToFileURL}          from 'node:url';
import {
    createBridgeAppConnection,
    runDedicatedWorkerNeuralLink
} from './dedicatedWorkerNeuralLink.mjs';
import { findBridgeScriptRoot } from './findBridgeScriptRoot.mjs';
import * as RmaHelpers          from './util/RmaHelpers.mjs';

// `Neo` plus the core class system, imported for their SIDE EFFECT and not for these bindings.
//
// They are the half of this change that is easy to delete and expensive to restore. `ai/services.mjs`
// used to supply them incidentally, because a barrel that reaches the whole Brain also reaches
// whatever bootstraps the class system. Importing the Neural Link services directly removes that,
// and the failure is a `ReferenceError: Neo is not defined` thrown from `src/core/Compare.mjs` —
// a file this module does not name, during a service construction it did not obviously trigger.
// `ai/mcp/server/neural-link/run-bridge.mjs` carries the same pair for the same reason.
import Neo       from '../../src/Neo.mjs';
import * as core from '../../src/core/_export.mjs';

let neuralLinkModulesPromise = null;

/**
 * @summary Whether `env` names a `NEO_AGENTOS_RUNTIME_ROOT`, selecting the Bridge path over the
 * dedicated App Worker adapter.
 * @param {Object} [env=process.env]
 * @returns {Boolean}
 */
export function hasBrainRuntimeRoot(env = process.env) {
    return typeof env?.NEO_AGENTOS_RUNTIME_ROOT === 'string' && env.NEO_AGENTOS_RUNTIME_ROOT.length > 0
}

/**
 * @summary Imports one module from the explicitly provisioned Agent OS runtime checkout.
 * @param {String} relativePath Repository-relative module path inside neo-agent-brain
 * @param {Object} [env=process.env]
 * @returns {Promise<Object>}
 */
export function loadAgentOsModule(relativePath, env = process.env) {
    const runtimeRoot = env.NEO_AGENTOS_RUNTIME_ROOT;

    if (typeof runtimeRoot !== 'string' || !path.isAbsolute(runtimeRoot)) {
        throw new Error(
            'Agent OS test modules require NEO_AGENTOS_RUNTIME_ROOT to name an absolute ' +
            'neo-agent-brain checkout; Engine cwd fallback is forbidden.'
        )
    }

    return import(pathToFileURL(path.join(runtimeRoot, relativePath)).href)
}

/**
 * @summary Loads the Neural Link fixture implementation from an explicitly provisioned Brain root.
 * Engine-only projects import this shared fixture for RMA and must not load Brain code as a side
 * effect. Whitebox projects cross the repository boundary only when they request `neuralLink`.
 * @param {Object} [env=process.env]
 * @returns {Promise<Object>}
 */
export function loadNeuralLinkModules(env = process.env) {
    const runtimeRoot = env.NEO_AGENTOS_RUNTIME_ROOT;

    if (typeof runtimeRoot !== 'string' || !path.isAbsolute(runtimeRoot)) {
        throw new Error(
            'The neuralLink fixture requires NEO_AGENTOS_RUNTIME_ROOT to name an absolute ' +
            'neo-agent-brain checkout; Engine cwd fallback is forbidden.'
        )
    }

    neuralLinkModulesPromise ??= Promise.all([
        loadAgentOsModule('ai/services/neural-link/ComponentService.mjs', env),
        loadAgentOsModule('ai/services/neural-link/ConnectionService.mjs', env),
        loadAgentOsModule('ai/services/neural-link/DataService.mjs', env),
        loadAgentOsModule('ai/services/neural-link/DockService.mjs', env),
        loadAgentOsModule('ai/services/neural-link/InstanceService.mjs', env),
        loadAgentOsModule('ai/services/neural-link/InteractionService.mjs', env),
        loadAgentOsModule('ai/services/neural-link/RuntimeService.mjs', env),
        loadAgentOsModule('ai/mcp/server/neural-link/config.template.mjs', env)
    ]).then(([component, connection, data, dock, instance, interaction, runtime, config]) => {
        const bridgeScriptRoot = findBridgeScriptRoot(runtimeRoot, connection.BRIDGE_NPM_SCRIPT);

        if (!bridgeScriptRoot) {
            throw new Error(
                `NEO_AGENTOS_RUNTIME_ROOT '${runtimeRoot}' does not declare ` +
                `the Neural Link bridge script '${connection.BRIDGE_NPM_SCRIPT}'.`
            )
        }

        return {
            NeuralLink_ComponentService  : component.default,
            NeuralLink_ConnectionService : connection.default,
            NeuralLink_DataService       : data.default,
            NeuralLink_DockService       : dock.default,
            NeuralLink_InstanceService   : instance.default,
            NeuralLink_InteractionService: interaction.default,
            NeuralLink_RuntimeService    : runtime.default,
            aiConfig                     : config.default,
            bridgeScriptRoot
        }
    });

    return neuralLinkModulesPromise
}

/**
 * @summary Stops a Neural Link Bridge only when this process spawned it. `ConnectionService` holds a
 * `bridgeProcess` only for a Bridge it spawned itself; a Bridge it found already listening (the operator's
 * live `:8081`, another seat's) leaves it null, and that one is never stopped from here.
 * @param {Object|null} connection The Brain's `ConnectionService`, or null when no test loaded it
 * @returns {Promise<Boolean>} Whether a stop was requested
 */
export async function stopSpawnedBridge(connection) {
    if (!connection?.bridgeProcess) return false;

    await connection.manageConnection({action: 'stop'});

    return true
}

/**
 * @summary Whether a Bridge connect failure is the Bridge refusing authentication (close code 1008), as
 * `ConnectionService` marks it: `authenticationFailed: true`, `closeCode: 1008`.
 * @param {*} error
 * @returns {Boolean}
 */
export function isAuthenticationFailed(error) {
    return error?.authenticationFailed === true || error?.closeCode === 1008
}

/**
 * @summary Starts the Neural Link connection and names the remedy when a Bridge this process did not spawn
 * refuses it. A fleet-mode Bridge (the seat's own, on `aiConfig.port`) demands a signed seat token the test
 * runner does not hold, so every spec would otherwise fail with an authentication error that names no fix.
 * @param {Object} connection The Brain's `ConnectionService`
 * @param {Number} port       The Bridge port (`aiConfig.port`)
 * @returns {Promise<void>}
 * @throws {Error} One actionable error for a refused foreign Bridge; any other failure unchanged
 */
export async function startNeuralLinkConnection(connection, port) {
    try {
        await connection.manageConnection({action: 'start'})
    } catch (error) {
        // A Bridge we spawned ourselves, or any other failure, keeps its original error
        if (connection.bridgeProcess || !isAuthenticationFailed(error)) throw error;

        throw new Error(
            `The Neural Link Bridge on port ${port} refused this test run: it is a fleet-mode Bridge, ` +
            'which requires a seat token the test runner does not hold. ' +
            `Run with NEO_NL_PORT=<free port> so the fixture spawns its own Bridge and routes the page to it.`,
            {cause: error}
        )
    }
}

/**
 * @summary Refuses to initialize `neuralLink` after `page` has already navigated away from `about:blank`.
 * When `test.beforeEach` calls `page.goto()` without requesting `{ neuralLink }`, Playwright runs
 * `beforeEach` before initializing `neuralLink`, so the page fetches `neo-config.json` before
 * `routeConfig(context)` can point `neuralLinkUrl` at this worker's Bridge (`NEO_NL_PORT`).
 * @param {Object} page A Playwright `Page`
 * @throws {Error} When `page.url()` is already navigated past `about:blank`
 */
export function assertUnnavigatedBeforeNeuralLinkRoute(page) {
    const url = page?.url?.() || 'about:blank';

    if (url !== 'about:blank') {
        throw new Error(
            `The neuralLink fixture initialized after page navigated to '${url}', so ` +
            'neo-config.json was fetched before neuralLink could route neuralLinkUrl to its Bridge. ' +
            'Include { neuralLink } in test.beforeEach whenever beforeEach calls page.goto().'
        )
    }
}

/**
 * A line `Neo.worker.Base#forwardErrorToMainThread` mirrors into the page console: `<Name> Worker: …`.
 * @type {RegExp}
 */
const MIRRORED_WORKER_ERROR = /^[A-Za-z]+ Worker: /;

/**
 * An App Worker id, which `connectToApp` binds exactly, as opposed to an app's name.
 * @type {RegExp}
 */
const WORKER_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/**
 * @summary Polls a page's own App Worker for its id until the remote answers.
 * @description The remote namespace materializes after worker construction, so the first read on a
 * booting page is null. `page.waitForFunction` cannot wait for it: an async predicate returns a
 * Promise, which is truthy, so the wait resolves on its first read. Some SharedWorker
 * remotes return the raw reply envelope, whose `data` is the id.
 * @param {Object} page    A Playwright `Page`
 * @param {Number} timeout Ms to wait for the remote
 * @returns {Promise<String|null>} The id, or null if none arrived in time
 */
export async function readWorkerId(page, timeout) {
    let workerId = null;

    await expect.poll(async () => {
        const reply = await page.evaluate(async () => {
            const appWorker = window.Neo?.worker?.App;

            try {
                return appWorker?.getWorkerId ? await appWorker.getWorkerId() : null
            } catch {
                return null
            }
        }).catch(() => null);

        workerId = typeof reply === 'string' ? reply : reply?.data;

        return typeof workerId === 'string' && workerId.length > 0
    }, {timeout}).toBe(true).catch(() => workerId = null);

    return workerId
}

export const test = base.extend({
    /**
     * @summary Fails a test whose page received a worker error or an uncaught page error, unless the
     * test named it with `workerErrors.expect(RegExp)` (non-global).
     *
     * A worker error that a component catches and logs fails nothing else; this reads it for every test
     * that imports `test` from here, by both channels it reaches the page: a SharedWorker's mirrored
     * line, and a dedicated worker's own console. `lines` lets a test wait for its own error.
     */
    workerErrors: [async ({page}, use) => {
        const expected = [],
              seen     = [];

        page.on('console', message => {
            const text   = message.text(),
                  worker = message.worker();

            if (message.type() === 'error') {
                if (worker) {
                    // Named from its script the way the mirror names a shared one (`…/App.mjs` → `App Worker: `), so a waiver reads in either mode
                    const prefix = worker.url().split('/').pop().split('.')[0] + ' Worker: ';

                    seen.push(text.startsWith(prefix) ? text : prefix + text)
                } else if (MIRRORED_WORKER_ERROR.test(text)) {
                    seen.push(text)
                }
            }
        });

        // The stack frames follow the message, as on a mirrored worker line, so a CI failure names its source
        page.on('pageerror', ({message, stack}) => seen.push([`pageerror: ${message}`, ...(stack?.split('\n').slice(1) || [])].join('\n')));

        await use({
            expect: pattern => expected.push(pattern),
            get lines() {
                return [...seen]
            }
        });

        expect(seen.filter(line => !expected.some(pattern => pattern.test(line))),
            'no worker error reached the page console, and the page threw nothing').toEqual([])
    }, {auto: true}],
    /**
     * @warning The `neo` fixture uses legacy Remote Method Access (RMA).
     * It is retained for environments where the Neural Link is unavailable
     * (e.g., Neo.mjs wrapped inside a React application).
     * For native Neo.mjs E2E testing, you should exclusively use the `neuralLink`
     * fixture instead. See: learn/guides/testing/WhiteboxE2E.md
     */
    neo: async ({ page }, use) => {
        // Ensure RMA helpers are registered in the browser context
        await RmaHelpers.registerRmaHelpers(page);

        const neo = {
            page,

            async createComponent(config) {
                return RmaHelpers.createComponent(page, config);
            },

            async destroyComponent(id) {
                return RmaHelpers.destroyComponent(page, id);
            },

            async loadModule(path) {
                return RmaHelpers.loadModule(page, path);
            },

            async setConfig(id, config) {
                return RmaHelpers.setComponentConfig(page, id, config);
            },

            async moveComponent(opts) {
                return RmaHelpers.moveComponent(page, opts);
            },

            async getConfig(id, keyOrKeys) {
                return RmaHelpers.getComponentConfig(page, id, keyOrKeys);
            },

            async getVdom(id) {
                return RmaHelpers.getComponentConfig(page, id, 'vdom');
            },

            /**
             * Waits for the Neo framework to be fully initialized.
             */
            async waitForReady() {
                await page.waitForFunction(() => window.Neo && window.Neo.main && window.Neo.worker.Manager.workers.app);
            },

            /**
             * Checks if a Fragment's start and end anchors exist in the DOM.
             * @param {String} id Fragment ID
             * @returns {Promise<{start: boolean, end: boolean}>}
             */
            async getFragmentAnchors(id) {
                return page.evaluate(fragmentId => {
                    const start = document.evaluate(`//comment()[contains(., ' ${fragmentId}-start ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                    const end   = document.evaluate(`//comment()[contains(., ' ${fragmentId}-end ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                    return { start: !!start, end: !!end };
                }, id);
            }
        };

        await use(neo);
    },

    /**
     * @summary Stops, when this worker ends, the Neural Link Bridge that the worker's `neuralLink` spawned
     * ({@link stopSpawnedBridge}). Worker-scoped because every test of the worker shares the Bridge, so a
     * per-test stop would respawn it per test. The e2e configs run one worker: with several workers on one
     * port, the first to end would stop the Bridge under the others, and its lifecycle would belong in a
     * global teardown instead.
     */
    neuralLinkBridge: [async ({}, use) => {
        await use();

        // Only a worker whose tests requested `neuralLink` loaded the services; Engine-only projects never do
        await stopSpawnedBridge(neuralLinkModulesPromise &&
            (await neuralLinkModulesPromise.catch(() => null))?.NeuralLink_ConnectionService)
    }, {scope: 'worker', auto: true}],

    neuralLink: async ({ browser, context, page }, use) => {
        if (!hasBrainRuntimeRoot()) {
            return runDedicatedWorkerNeuralLink({ browser, context, page }, use, {
                assertUnnavigated: assertUnnavigatedBeforeNeuralLinkRoute
            })
        }

        const {
            NeuralLink_ComponentService,
            NeuralLink_ConnectionService,
            NeuralLink_DataService,
            NeuralLink_DockService,
            NeuralLink_InstanceService,
            NeuralLink_InteractionService,
            NeuralLink_RuntimeService,
            aiConfig,
            bridgeScriptRoot
        } = await loadNeuralLinkModules();

        // This fixture is the second Bridge entrypoint, alongside the MCP server, so it owes the same
        // `cwd` the MCP server supplies via `--cwd`. `??=` yields to an entrypoint that already did.
        NeuralLink_ConnectionService.cwd ??= bridgeScriptRoot;

        // 1. Ensure Bridge connects
        await startNeuralLinkConnection(NeuralLink_ConnectionService, aiConfig.port);

        // The page's client dials `Neo.config.neuralLinkUrl`, which defaults to the shared :8081. A seat running its
        // own Bridge (NEO_NL_PORT) must point the page there too, or it drives this Bridge and reads another. Routed
        // per context, because a popup loads its own config and a test may open contexts of its own (`newContext`).
        // A page route outranks a context route, so a spec that edits its config goes through `routeConfig` too.
        const routeConfig = (target, mutate = config => config, url = '**/neo-config.json*') => target.route(url, async route => {
            const response = await route.fetch();

            if (!response.ok()) {
                return route.fulfill({response})
            }

            await route.fulfill({response, json: {...mutate(await response.json()), neuralLinkUrl: `ws://127.0.0.1:${aiConfig.port}`}})
        });

        await routeConfig(context);
        assertUnnavigatedBeforeNeuralLinkRoute(page);

        // 2. Define the Neural Link Fixture object
        const nl = {
            /**
             * The live Neural Link Bridge port the fixture's `ConnectionService` connected (or spawned) on —
             * the canonical `aiConfig.port`, NOT the hardcoded `:8081` literal the WriteGuard e2es used to
             * carry. Raw-agent writers (`openRawAgent`) target the SAME Bridge the fixture uses via this.
             * @member {Number} bridgePort
             */
            bridgePort: aiConfig.port,

            /**
             * Opens a browser context whose pages dial this fixture's Bridge. `browser.newContext()` skips the
             * fixture's route, so its pages dial the default `:8081` while the test waits on `bridgePort`.
             * @param {Object} [options] `browser.newContext()` options
             * @returns {Promise<Object>} The Playwright `BrowserContext`
             */
            async newContext(options) {
                const created = await browser.newContext(options);

                await routeConfig(created);

                return created
            },

            /**
             * Routes `neo-config.json` through `mutate`, then points it at this fixture's Bridge. A spec that edits its
             * config uses this instead of `page.route()`: a page route outranks the fixture's context route, so a plain
             * one hands the page a config without the Bridge URL.
             * @param {Object}   target   A Playwright `Page` or `BrowserContext`
             * @param {Function} [mutate] Receives the served config, returns the edited one
             * @param {String}   [url]    The config route pattern
             * @returns {Promise<void>}
             */
            routeConfig,

            /**
             * Waits for an App Worker to connect to the Bridge and returns an SDK wrapper.
             *
             * It binds by worker id (an exact match in `waitForSession`) and never by app name: a name
             * lookup returns the OLDEST matching session, so a dev tab or an earlier page of the same
             * app would silently receive the test's worker queries while `page.mouse` drives the test
             * page. Given a name, it binds the page's own App Worker, and fails if that reports no id.
             * Given a worker id, for example one read from another page with `readWorkerId`, it binds
             * that worker, which works after the fixture's page has closed.
             * @param {String} [target]                        The app's name, named in failures, or an App Worker id
             * @param {Object} [options]
             * @param {Number} [options.identityTimeout=30000] Ms to wait for the page's App Worker id
             */
            async connectToApp(target, {identityTimeout = 30000} = {}) {
                const workerId = WORKER_ID.test(target) ? target : await readWorkerId(page, identityTimeout);

                if (!workerId) {
                    throw new Error(`neuralLink.connectToApp('${target}'): the page's App Worker reported no id ` +
                        `within ${identityTimeout} ms. Binding by name would select the oldest same-name session.`)
                }

                const sessionId = await NeuralLink_ConnectionService.waitForSession(workerId, 30000);

                return createBridgeAppConnection({
                    NeuralLink_ComponentService,
                    NeuralLink_ConnectionService,
                    NeuralLink_DataService,
                    NeuralLink_DockService,
                    NeuralLink_InstanceService,
                    NeuralLink_InteractionService,
                    NeuralLink_RuntimeService
                }, sessionId)
            }
        };

        await use(nl);
    }
});

export { expect };
