/**
 * @summary Forces every repo-owned AiConfig import in Playwright processes onto the committed
 * template graph before either a test or a transitive production dependency can evaluate an
 * ignored operator overlay.
 *
 * The direct-import migration is source-level honesty; this resolver is the graph-wide safety
 * boundary. Both are required because a test can import a production service which still names
 * `config.mjs`, and evaluating that overlay beside its template registers the same Neo class twice.
 * Disposable repositories remain untouched: containment is anchored to this module's checkout.
 *
 * @see ../../learn/agentos/decisions/0019-aiconfig-reactive-provider-ssot.md
 */
import fs                             from 'node:fs';
import {registerHooks}                from 'node:module';
import os                             from 'node:os';
import path                           from 'node:path';
import process                        from 'node:process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT_DIR          = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
      ACTIVE_SYMBOL     = Symbol.for('neo.playwright.config-template-resolver.active'),
      CLEANUP_SYMBOL    = Symbol.for('neo.playwright.config-template-resolver.cleanup'),
      PRELOAD_OPTION    = `--import=${import.meta.url}`,
      CONFIG_BASENAME   = 'config.mjs',
      TEMPLATE_BASENAME = 'config.template.mjs';

/**
 * @summary Returns the committed template URL for a repo-owned ignored overlay URL.
 * @param {String} url Candidate module URL.
 * @param {Object} [options]
 * @param {String} [options.rootDir] Repository containment root.
 * @param {Function} [options.existsSync] File-existence seam for focused tests.
 * @returns {String|null}
 */
export function resolveConfigTemplateUrl(url, {rootDir = ROOT_DIR, existsSync = fs.existsSync} = {}) {
    if (!url?.startsWith('file:')) return null;

    let file;

    try {
        file = fileURLToPath(url);
    } catch {
        return null;
    }

    const relative = path.relative(rootDir, file);

    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
    if (!(relative === `ai${path.sep}${CONFIG_BASENAME}` || relative.startsWith(`ai${path.sep}`))) return null;
    if (path.basename(file) !== CONFIG_BASENAME) return null;

    const template = path.join(path.dirname(file), TEMPLATE_BASENAME);

    return existsSync(template) ? pathToFileURL(template).href : null;
}

/**
 * @summary Resolves a module specifier to a candidate file URL without requiring the ignored
 * overlay to exist first.
 * @param {String} specifier Module specifier.
 * @param {String} [parentURL] Importer URL.
 * @returns {String|null}
 */
function resolveCandidateUrl(specifier, parentURL) {
    if (specifier.startsWith('file:')) return specifier;

    if (specifier.startsWith('neo.mjs/')) {
        return pathToFileURL(path.join(ROOT_DIR, specifier.slice('neo.mjs/'.length))).href;
    }

    if (path.isAbsolute(specifier)) return pathToFileURL(specifier).href;

    if (specifier.startsWith('.') && parentURL?.startsWith('file:')) {
        return new URL(specifier, parentURL).href;
    }

    return null;
}

/**
 * @summary Node synchronous resolve hook which redirects only eligible checkout-local overlays.
 * @param {String} specifier Module specifier.
 * @param {Object} context Node resolve context.
 * @param {Function} nextResolve Next hook/default resolver.
 * @returns {Object}
 */
function resolve(specifier, context, nextResolve) {
    activateStorageScope();

    const directTemplate = resolveConfigTemplateUrl(resolveCandidateUrl(specifier, context.parentURL));

    if (directTemplate) {
        return {shortCircuit: true, url: directTemplate};
    }

    const resolved    = nextResolve(specifier, context),
          templateUrl = resolveConfigTemplateUrl(resolved.url);

    return templateUrl ? {...resolved, shortCircuit: true, url: templateUrl} : resolved;
}

/**
 * @summary Enters the runner or current Playwright-worker storage scope. The resolve hook invokes
 * this after Playwright publishes `TEST_WORKER_INDEX`, before a test dependency can evaluate.
 * Same-scope descendants preserve explicit fixture overrides.
 * @returns {String} Effective disposable storage root.
 */
function activateStorageScope() {
    // Product AiConfig defaults describe the canonical cloud/container plane. Playwright is an
    // explicit disposable test profile and historically exercises the single-process local
    // topology; declare that posture before any redirected config template evaluates. Preserve
    // shell-provided values so cloud-specific tests can still opt in deliberately.
    process.env.NEO_AI_DEPLOYMENT_MODE ??= 'local';
    process.env.NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE ??= 'legacy-mixed';

    const inheritedBoundary = process.env.NEO_TEST_CONFIG_TEMPLATES === 'true';
    let   boundaryRoot      = inheritedBoundary && process.env.NEO_TEST_STORAGE_ROOT;

    if (!boundaryRoot) {
        boundaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-playwright-'));
        process.env.NEO_TEST_STORAGE_ROOT = boundaryRoot;

        if (!globalThis[CLEANUP_SYMBOL]) {
            process.once('exit', () => fs.rmSync(boundaryRoot, {force: true, recursive: true}));
            Object.defineProperty(globalThis, CLEANUP_SYMBOL, {value: true});
        }
    }

    const workerIndex   = process.env.TEST_WORKER_INDEX,
          scope         = workerIndex === undefined ? 'runner' : `worker-${workerIndex}`,
          storageRoot   = path.join(boundaryRoot, scope),
          enteringScope = process.env.NEO_TEST_CONFIG_TEMPLATE_SCOPE !== scope;

    if (enteringScope) {
        process.env.NEO_TEST_CONFIG_TEMPLATE_SCOPE           = scope;
        process.env.NEO_MEMORY_LOG_PATH                      = path.join(storageRoot, 'memory-core-logs');
        process.env.NEO_KB_LOG_PATH                          = path.join(storageRoot, 'knowledge-base-logs');
        process.env.NEO_KB_EMBEDDING_RESUME_STATE_DIR        = path.join(storageRoot, 'kb-sync');
        process.env.NEO_NL_LOG_PATH                          = path.join(storageRoot, 'neural-link-logs');
        process.env.NEO_TELEMETRY_DB_PATH_TEST               = path.join(storageRoot, 'telemetry.sqlite');
        process.env.NEO_HEAP_OBSERVATION_DIR                 = path.join(storageRoot, 'heap-observation');
        process.env.NEO_DEPLOYMENT_STATE_BRIDGE_SNAPSHOT_PATH =
            path.join(storageRoot, 'deployment-state', 'snapshot.json');
        process.env.NEO_RECOVERY_ACTUATOR_HEAL_ATTEMPTS_PATH =
            path.join(storageRoot, 'orchestrator-daemon', 'heal-attempts.json');
        process.env.NEO_RECOVERY_ACTUATOR_RUN_STATE_DIR      =
            path.join(storageRoot, 'orchestrator-daemon', 'recovery-runs');
    }

    process.env.NEO_TEST_CONFIG_TEMPLATES = 'true';

    return storageRoot;
}

/**
 * @summary Activates template-only test resolution in this process and all descendant Node
 * processes while routing template-derived writable paths to disposable test storage.
 * @returns {{preloadOption: String, storageRoot: String}}
 */
export function activateConfigTemplateResolver() {
    const storageRoot = activateStorageScope();

    if (!globalThis[ACTIVE_SYMBOL]) {
        registerHooks({resolve});
        Object.defineProperty(globalThis, ACTIVE_SYMBOL, {value: true});
    }

    const nodeOptions = process.env.NODE_OPTIONS || '';

    if (!nodeOptions.split(/\s+/).includes(PRELOAD_OPTION)) {
        process.env.NODE_OPTIONS = `${nodeOptions} ${PRELOAD_OPTION}`.trim();
    }

    return {preloadOption: PRELOAD_OPTION, storageRoot};
}

activateConfigTemplateResolver();
