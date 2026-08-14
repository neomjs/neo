#!/usr/bin/env node
/**
 * @summary Bans mechanical ADR-19 AiConfig SSOT antipatterns: inline `process.env`
 * reads inside `leaf(...)` default expressions in `config.template.mjs`, implementation-file
 * config pass-throughs, hidden defaults, type coercions, exports, defensive optional chaining
 * around `AiConfig`, test imports of gitignored operator overlays, and test-side exports derived
 * from canonical config-template Providers.
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
 * inline branch. Test modules may import committed templates for direct reads, but may not
 * synchronously materialize and export a second authority from the reactive Provider.
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
import fs                             from 'node:fs';
import path                           from 'node:path';
import process                        from 'node:process';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {parse}            from 'acorn';
import {load as loadYaml} from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, '../../..');

const CONFIG_TEMPLATE_BASENAME = 'config.template.mjs';
// The Tier-1 root base: canonical default leaves live here since the template/base split — the
// declarative-SSOT rules must cover it exactly like a template, or base-only leaves bypass the lint.
const CONFIG_BASE_BASENAME            = 'configBase.mjs';
const CONFIG_LEAF_PARITY_REL          = 'ai/scripts/lint/config-leaf-parity.json';
const COMPOSE_DEFAULT_PARITY_KEY      = '$composeDefaultParity';
const BEHAVIOR_BINDING_PROJECTION_KEY = '$behaviorBindingProjection';
const CONFIG_OVERLAY_BASENAME         = 'config.mjs';
const SCAN_ROOT_REL                   = 'ai';
const TEST_SCAN_ROOT_REL              = 'test';
const DEPLOY_SCAN_ROOT_REL            = 'ai/deploy';
const SELF_REL_FILE                   = 'ai/scripts/lint/lint-config-template-ssot.mjs';

// The workflow-parity SSOT: every glob a path-filtered workflow must watch for this lint's
// verdict to stay reproducible at PR time (scanned ⊆ watched as a mechanical fact, not YAML
// prose). Consumed by lintWorkflowScanRootParity.spec.mjs; derived from the scan roots above
// so a new root cannot silently widen the scan without widening this surface.
export const SCAN_SURFACE = Object.freeze([
    `${SCAN_ROOT_REL}/**/*.mjs`,
    `${TEST_SCAN_ROOT_REL}/**/*.mjs`,
    // The Compose/default parity and behavior-binding projection rules both read deploy templates,
    // so this lint's scan is wider than its `.mjs` roots. Declaring it here is what makes the
    // sibling parity spec DEMAND the workflow watch it; leaving it undeclared would let the spec
    // report a satisfied invariant over an incomplete picture of what this lint actually reads —
    // the same shape as the unprojected clock these rules exist to catch, one layer up.
    `${DEPLOY_SCAN_ROOT_REL}/**`
]);
const CONFIG_TEMPLATE_KIND_CACHE         = new Map();
const SERVICE_EXPORT_CONFIG_TEMPLATE_REL = Object.freeze({
    GH_Config        : 'ai/mcp/server/github-workflow/config.template.mjs',
    KB_Config        : 'ai/mcp/server/knowledge-base/config.template.mjs',
    Memory_Config    : 'ai/mcp/server/memory-core/config.template.mjs',
    NeuralLink_Config: 'ai/mcp/server/neural-link/config.template.mjs'
});

/**
 * Pre-existing inline-env leaf defaults, keyed by `<file>::<envVar>`. Each entry is a
 * burndown row for the declarative-config reshape: dropping the inline branch from the
 * template must also drop the matching row here. `reshape` records the verified fix shape.
 * @type {ReadonlyArray<{file: String, env: String, ticket: String, reshape: String}>}
 */
export const BASELINE = Object.freeze([
    // EMPTY — all config.template inline-`process.env` leaf defaults have been reshaped to the
    // declarative toggle+formula shape. The lint is now FULLY ENFORCING: any NEW inline-`process.env`
    // leaf default is a fresh violation (no grandfathered instances remain).
]);

/**
 * Pre-existing implementation-level ADR-19 B2/B3/B5 guard hits. These rows are not
 * permission to add more; they keep this lint fail-build for NEW regressions while the
 * broader AiConfig cleanup retires existing boundaries one by one.
 * @type {ReadonlyArray<{file: String, kind: String, text: String, ticket: String, reason: String}>}
 */
export const AI_CONFIG_IMPLEMENTATION_BASELINE = Object.freeze([
    {
        file  : 'ai/daemons/orchestrator/Orchestrator.mjs',
        kind  : 'config-pass-through',
        text  : 'runtimeAccessConfig: AiConfig.orchestrator.deploymentRuntimeAccess,',
        ticket: '#13939',
        reason: 'Existing bootstrap handoff; cleanup belongs to the #12456 fan-out.'
    },
    {
        file  : 'ai/daemons/orchestrator/Orchestrator.mjs',
        kind  : 'config-pass-through',
        text  : 'actuatorConfig                : AiConfig.orchestrator.recoveryActuator',
        ticket: '#13939',
        reason: 'Existing bootstrap handoff; cleanup belongs to the #12456 fan-out.'
    },
    {
        file  : 'ai/daemons/orchestrator/daemon.mjs',
        kind  : 'config-pass-through',
        text  : 'primaryDevSyncRootsConfig: AiConfig.orchestrator.devSyncRoots,',
        ticket: '#13939',
        reason: 'Existing entrypoint injection boundary; cleanup belongs to the #12456 fan-out.'
    }
]);

/**
 * Existing module-scope AiConfig primitive leaf captures that freeze resolved Provider values at
 * module load. These rows are not permission to add more captures: they document residual P1
 * debt while the lint fails NEW primitive/formula leaf freezes. Namespace and object-valued
 * leaves are deliberately excluded because their nested reads stay live through the Provider proxy.
 * @type {ReadonlyArray<{file: String, kind: String, text: String, ticket: String, reason: String}>}
 */
export const AI_CONFIG_MODULE_SCOPE_BASELINE = Object.freeze([
    {
        file  : 'ai/scripts/diagnostics/analyzeNlTelemetry.mjs',
        kind  : 'module-scope-leaf-capture',
        text  : 'const DB_PATH = aiConfig.storagePaths.graph;',
        ticket: '#14239',
        reason: 'Frozen primitive path leaf; existing P1 burndown debt.'
    },
    {
        file  : 'ai/scripts/diagnostics/analyzeNlTelemetry.mjs',
        kind  : 'module-scope-leaf-capture',
        text  : 'const RLAIF_PATH = aiConfig.datasets.rlaif.trajectories;',
        ticket: '#14239',
        reason: 'Frozen primitive dataset leaf; existing P1 burndown debt.'
    },
    {
        file  : 'ai/services/knowledge-base/DatabaseService.mjs',
        kind  : 'module-scope-leaf-capture',
        text  : 'const cwd       = aiConfig.neoRootDir;',
        ticket: '#14239',
        reason: 'Frozen primitive root path leaf; existing P1 burndown debt.'
    },
    {
        file  : 'ai/services/knowledge-base/QueryService.mjs',
        kind  : 'module-scope-leaf-capture',
        text  : 'const cwd       = aiConfig.neoRootDir;',
        ticket: '#14239',
        reason: 'Frozen primitive root path leaf; existing P1 burndown debt.'
    }
]);

/**
 * @summary Normalizes paths for deterministic lint keys.
 * @param {String} file Path to normalize.
 * @returns {String}
 */
function normalizeFile(file) {
    return file.split(path.sep).join('/');
}

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
        } else if (entry.name === CONFIG_TEMPLATE_BASENAME || entry.name === CONFIG_BASE_BASENAME) {
            out.push(full);
        }
    }

    return out.sort();
}

/**
 * @summary Recursively collects `.mjs` files under a directory.
 * @param {String} dir Absolute directory to walk.
 * @returns {String[]} Absolute file paths, sorted.
 */
function walkMjsFiles(dir) {
    if (!fs.existsSync(dir)) return [];

    const out = [];

    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') continue;
            out.push(...walkMjsFiles(full));
        } else if (entry.name.endsWith('.mjs')) {
            out.push(full);
        }
    }

    return out.sort();
}

/**
 * @summary Filters files to the `ai/` implementation scope for ADR-19 implementation linting.
 * @param {String} file Repo-relative path.
 * @returns {Boolean}
 */
function shouldScanAiConfigImplementation(file) {
    const normalized = normalizeFile(file),
          basename   = path.basename(normalized);

    return normalized.startsWith(`${SCAN_ROOT_REL}/`) &&
        normalized.endsWith('.mjs') &&
        normalized !== SELF_REL_FILE &&
        basename !== CONFIG_TEMPLATE_BASENAME &&
        basename !== CONFIG_BASE_BASENAME &&
        basename !== CONFIG_OVERLAY_BASENAME;
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
 * @summary Detects mechanical ADR-19 implementation violations around `AiConfig`.
 *
 * The detector is intentionally conservative: it catches the recurrence shapes that
 * review keeps missing without parsing every legitimate direct leaf read. Nuanced
 * sanctioned boundaries stay review-owned, and local Provider subtree variables are
 * allowed. New config-shaped pass-throughs, parameter defaults, exports, hidden
 * defaults, type coercions, and defensive optional chains fail early.
 * @param {String} source File contents.
 * @returns {Array<{line: Number, kind: String, text: String}>}
 */
export function detectAiConfigImplementationViolations(source) {
    const violations = [],
          lines      = source.split('\n');

    lines.forEach((text, index) => {
        const trimmed = text.trim();

        if (!trimmed) return;
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('*/')) return;
        if (!/\bAiConfig(?:\?\.|\.)/.test(trimmed)) return;

        const push = kind => violations.push({line: index + 1, kind, text: trimmed});

        if (/\bexport\s+(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*AiConfig(?:\?\.|\.)/.test(trimmed)) {
            push('export');
        }

        if (/\b[A-Za-z_$][\w$]*Config[\w$]*\s*:\s*AiConfig(?:\?\.|\.)/.test(trimmed)) {
            push('config-pass-through');
        }

        if (/[({,]\s*[A-Za-z_$][\w$]*Config[\w$]*\s*=\s*AiConfig(?:\?\.|\.)/.test(trimmed)) {
            push('config-parameter-default');
        }

        if (/\bAiConfig\?\.|\bAiConfig(?:\.[A-Za-z_$][\w$]*)+\?\./.test(trimmed)) {
            push('defensive-optional-chain');
        }

        if (/\b(?:Number|Boolean)\s*\(\s*AiConfig(?:\?\.|\.)/.test(trimmed)) {
            push('type-coercion');
        }

        if (/\bAiConfig(?:\?\.|\.[A-Za-z_$][\w$]*)[^;\n]*(?:\?\?|\|\|)/.test(trimmed)) {
            push('hidden-default');
        }
    });

    return violations;
}

/**
 * @summary Collects config paths that resolve to frozen leaves versus live Provider proxies.
 *
 * The scanner follows the `config.template.mjs` meta-leaf style: namespace objects are live proxy
 * paths, object-valued leaves return nested live proxies, and primitive/formula leaves return the
 * value itself. It intentionally reads source text instead of importing config modules so this lint
 * stays a static guard with no Neo bootstrap side effects.
 * @param {String} source Config template source.
 * @returns {{primitiveLeafPaths: Set<String>, liveProxyPaths: Set<String>}}
 */
export function collectConfigPathKindsFromSource(source) {
    const primitiveLeafPaths = new Set(),
          liveProxyPaths     = new Set(),
          stack              = [];
    let   insideData    = false,
          dataIndent    = 0,
          leafCallDepth = 0;

    for (const text of source.split('\n')) {
        const code    = stripStringsAndLineComment(text),
              trimmed = code.trim(),
              indent  = (code.match(/^\s*/) || [''])[0].length;

        if (!insideData) {
            if (/^\s*data\s*:\s*\{/.test(code)) {
                insideData = true;
                dataIndent = indent;
                stack.length = 0;
            }
            continue;
        }

        if (leafCallDepth > 0) {
            leafCallDepth += countChar(code, '(') - countChar(code, ')');
            if (leafCallDepth <= 0) {
                leafCallDepth = 0;
            }
            continue;
        }

        if (trimmed.startsWith('}') && indent <= dataIndent) {
            insideData = false;
            stack.length = 0;
            continue;
        }

        while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
            stack.pop();
        }

        const match = code.match(/^(\s*)([A-Za-z_$][\w$]*)\s*:\s*(leaf\s*\(|\{)/);
        if (!match) continue;

        const prop = match[2],
              rhs  = match[3],
              key  = [...stack.map(entry => entry.prop), prop].join('.');

        if (rhs.startsWith('leaf')) {
            if (/:\s*leaf\s*\(\s*\{/.test(code)) {
                liveProxyPaths.add(key);
            } else {
                primitiveLeafPaths.add(key);
            }

            leafCallDepth = countChar(code.slice(code.indexOf('leaf')), '(') -
                countChar(code.slice(code.indexOf('leaf')), ')');
            if (leafCallDepth < 0) {
                leafCallDepth = 0;
            }
        } else {
            liveProxyPaths.add(key);
            stack.push({indent, prop});
        }
    }

    return {primitiveLeafPaths, liveProxyPaths};
}

/**
 * @summary Runs resolved config collection with a raw Tier-1 parent instance.
 *
 * Config-isolation specs may delete `Neo.ai.Config` after the root module is cached. Re-importing
 * cannot replay registration, while assigning the exported Proxy violates ConfigProvider#getParent's
 * raw-instance contract. A fresh ConfigBase is declaration-equivalent to the thin root template;
 * when this helper creates it, the root is removed again so lint imports cannot mutate later tests.
 * @param {String} rootDir Repo root.
 * @param {Function} callback Work that requires the Tier-1 parent.
 * @returns {Promise<*>}
 */
async function withTier1ConfigForLint(rootDir, callback) {
    globalThis.Neo ??= {};
    globalThis.Neo.config ??= {environment: 'development'};

    await import(pathToFileURL(path.join(rootDir, 'src/Neo.mjs')).href);

    let transientRoot;

    if (!Neo.ai?.Config) {
        const RootConfigBase = (await import(
            pathToFileURL(path.join(rootDir, 'ai', CONFIG_BASE_BASENAME)).href
        )).default;

        transientRoot = Neo.create(RootConfigBase);
        Neo.ai.Config = transientRoot
    }

    try {
        return await callback()
    } finally {
        if (transientRoot) {
            if (Neo.ai?.Config === transientRoot) delete Neo.ai.Config;
            transientRoot.destroy()
        }
    }
}

/**
 * @summary Collects declared config paths from a config class's OWN static `config.data` tree —
 * the declaration-form-transparent collector.
 *
 * The line scanner above recognises exactly two declaration shapes (`name: leaf(` and `name: {`),
 * so a subtree built by ANY other call — a descriptor factory, a shared builder — silently leaves
 * the declared set while the resolved tree stays correct (green specs, blinded gate). This
 * collector never parses text: it imports the module and walks the class's own static `config.data`,
 * so every form that *evaluates* to a valid descriptor tree is collected identically — inline
 * literal, descriptor factory, or anything a future author builds.
 *
 * Two shape decisions, both load-bearing:
 *
 * - **The class's OWN static config, not the template proxy.** `config.template.mjs` files export
 *   `createConfigProxy(...)` (values, not descriptors) and carry no `data` of their own; the
 *   sibling `configBase.mjs` classes hold the descriptor trees. Walking per-file own statics
 *   reproduces the text union's decomposition exactly — Tier-1 inheritance never leaks in,
 *   because the deep-merge happens at instance creation, not in the static config.
 * - **Kind rule mirrors the text scanner's semantics.** A leaf descriptor (`default`+`env`+`type`
 *   keys) classifies as `liveProxyPaths` only when its default is a PLAIN object (matching the
 *   scanner's `leaf({` test — `leaf([...])` stays primitive, arrays never classify as proxies).
 *
 * Boot contract: `globalThis.Neo.config` must exist before `src/Neo.mjs` evaluates. A lint script
 * is a thread entrypoint, so the import is C1-legal; the boot is the same 4-line shape the
 * resolved-config print tool uses.
 * @param {String} templatePath Absolute path to a `config.template.mjs` or `configBase.mjs`.
 * @returns {Promise<{primitiveLeafPaths: Set<String>, liveProxyPaths: Set<String>}>}
 */
export async function collectConfigPathKindsFromTemplate(templatePath) {
    const
        neoRootDir         = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'),
        primitiveLeafPaths = new Set(),
          liveProxyPaths     = new Set(),
          isDescriptor       = v => v && typeof v === 'object' && !Array.isArray(v) &&
                              'default' in v && 'env' in v && 'type' in v;

    // A template shell (createConfigProxy export, no own data) contributes nothing — its sibling
    // configBase carries the declarations, and the caller unions both.
    if (path.basename(templatePath) === CONFIG_TEMPLATE_BASENAME &&
        fs.existsSync(path.join(path.dirname(templatePath), CONFIG_BASE_BASENAME))
    ) {
        return {primitiveLeafPaths, liveProxyPaths}
    }

    const
        module_     = await withTier1ConfigForLint(neoRootDir, () =>
            import(pathToFileURL(templatePath).href)),
        ConfigClass = module_.default,
        data        = ConfigClass?.config?.data;

    if (!data || typeof data !== 'object') {
        return {primitiveLeafPaths, liveProxyPaths}
    }

    (function walk(node, parts) {
        for (const [prop, value] of Object.entries(node)) {
            const key = [...parts, prop].join('.');

            if (isDescriptor(value)) {
                const isObjectDefault = value.default !== null &&
                                        typeof value.default === 'object' &&
                                        !Array.isArray(value.default);

                (isObjectDefault ? liveProxyPaths : primitiveLeafPaths).add(key)
            } else if (value && typeof value === 'object' && !Array.isArray(value)) {
                liveProxyPaths.add(key);
                walk(value, [...parts, prop])
            }
        }
    })(data, []);

    return {primitiveLeafPaths, liveProxyPaths}
}

/**
 * @summary The DECLARED config-path surface of one template, collector-swap edition: the union of
 * its own and its sibling `configBase.mjs`'s RESOLVED declaration trees. Drop-in equivalent of
 * `collectDeclaredConfigPaths` — see the zero-delta proof spec before any caller migrates.
 * @param {String} templatePath Absolute path to a `config.template.mjs`.
 * @returns {Promise<String[]>} Sorted, de-duplicated declared paths.
 */
export async function collectDeclaredConfigPathsFromTemplate(templatePath) {
    const union    = new Set(),
          basePath = path.join(path.dirname(templatePath), CONFIG_BASE_BASENAME);

    for (const file of [basePath, templatePath]) {
        if (!fs.existsSync(file)) continue;

        const kinds = await collectConfigPathKindsFromTemplate(file);

        kinds.primitiveLeafPaths.forEach(configPath => union.add(configPath));
        kinds.liveProxyPaths.forEach(configPath => union.add(configPath))
    }

    return [...union].sort()
}

/**
 * @summary Collects env-bound defaults from one meta-leaf tree.
 * @param {Object} data Static `config.data` descriptor tree.
 * @param {String[]} [parts] Current config path.
 * @param {Object} [out] Env name to descriptor rows.
 * @returns {Object}
 */
function collectConfigEnvDefaultsFromData(data, parts = [], out = {}) {
    for (const [prop, value] of Object.entries(data || {})) {
        const configPath = [...parts, prop];

        if (value && typeof value === 'object' && !Array.isArray(value) &&
            Object.hasOwn(value, 'default')
        ) {
            if (value.env) {
                out[value.env] ||= [];
                out[value.env].push({
                    configPath: configPath.join('.'),
                    default   : value.default
                })
            }
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
            collectConfigEnvDefaultsFromData(value, configPath, out)
        }
    }

    return out
}

/**
 * @summary Builds the effective env/default declaration map for one runtime config template.
 *
 * Tier-1 defaults apply to every server; a server's sibling `configBase.mjs` then contributes
 * its narrower leaves. This reads descriptor metadata, not resolved environment values, so the
 * Compose guard compares declarations without importing operator state.
 * @param {Object} options
 * @param {String} options.template Repo-relative config template.
 * @param {String} [options.rootDir] Repo root.
 * @returns {Promise<Object>} Env name to descriptor rows.
 */
export async function buildConfigEnvDefaultsForTemplate({template, rootDir = ROOT_DIR}) {
    return withTier1ConfigForLint(rootDir, async () => {
        const
            rootBase    = path.join(rootDir, 'ai', CONFIG_BASE_BASENAME),
            templateAbs = path.join(rootDir, template),
            serverBase  = path.join(path.dirname(templateAbs), CONFIG_BASE_BASENAME),
            files       = [...new Set([rootBase, serverBase])],
            out         = {};

        for (const file of files) {
            const ConfigClass = (await import(pathToFileURL(file).href)).default;

            collectConfigEnvDefaultsFromData(ConfigClass?.config?.data, [], out)
        }

        return out
    })
}

/**
 * @summary Counts single-character occurrences in a string.
 * @param {String} text Source text.
 * @param {String} ch Character to count.
 * @returns {Number}
 */
function countChar(text, ch) {
    let count = 0;

    for (const current of text) {
        if (current === ch) count++;
    }

    return count;
}

/**
 * @summary Resolves an import specifier to a repo-owned path under `ai/`.
 * @param {Object} options
 * @param {String} options.rootDir Repo root.
 * @param {String} options.file Repo-relative importer file.
 * @param {String} options.specifier Import specifier.
 * @returns {String|null} Absolute template path.
 */
function resolveRepoAiSpecifierPath({rootDir, file, specifier}) {
    const cleanSpecifier = specifier.replace(/[?#].*$/, '');
    let   abs;

    if (cleanSpecifier.startsWith('file:')) {
        try {
            abs = fileURLToPath(cleanSpecifier);
        } catch {
            return null;
        }
    } else if (cleanSpecifier.startsWith('neo.mjs/')) {
        abs = path.join(rootDir, cleanSpecifier.slice('neo.mjs/'.length));
    } else if (cleanSpecifier.startsWith(`${SCAN_ROOT_REL}/`)) {
        abs = path.join(rootDir, cleanSpecifier);
    } else if (cleanSpecifier.startsWith('.')) {
        abs = path.resolve(path.dirname(path.join(rootDir, file)), cleanSpecifier);
    } else if (path.isAbsolute(cleanSpecifier)) {
        abs = cleanSpecifier;
    } else {
        return null;
    }

    const relative = path.relative(rootDir, abs);

    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
    if (!(relative === `${SCAN_ROOT_REL}${path.sep}${CONFIG_OVERLAY_BASENAME}` ||
        relative.startsWith(`${SCAN_ROOT_REL}${path.sep}`))) return null;

    return abs;
}

/**
 * @summary Resolves a `config.mjs` import specifier to its matching `config.template.mjs`.
 * @param {Object} options
 * @param {String} options.rootDir Repo root.
 * @param {String} options.file Repo-relative importer file.
 * @param {String} options.specifier Import specifier.
 * @returns {String|null} Absolute template path.
 */
function resolveConfigTemplatePath({rootDir, file, specifier}) {
    const abs = resolveRepoAiSpecifierPath({rootDir, file, specifier});

    if (!abs) return null;
    if (path.basename(abs) !== CONFIG_OVERLAY_BASENAME) return null;

    const template = path.join(path.dirname(abs), CONFIG_TEMPLATE_BASENAME);
    return fs.existsSync(template) ? template : null;
}

/**
 * @summary Resolves a direct import of a repo-owned canonical config template.
 * @param {Object} options
 * @param {String} options.rootDir Repo root.
 * @param {String} options.file Repo-relative importer file.
 * @param {String} options.specifier Import specifier.
 * @returns {String|null} Absolute template path.
 */
function resolveDirectConfigTemplatePath({rootDir, file, specifier}) {
    const abs = resolveRepoAiSpecifierPath({rootDir, file, specifier});

    return abs && path.basename(abs) === CONFIG_TEMPLATE_BASENAME && fs.existsSync(abs) ? abs : null;
}

/**
 * @summary Parses one executable ESM source with the shared lint options.
 * @param {String} source Module source.
 * @returns {Object} Acorn Program node.
 */
function parseModule(source) {
    return parse(source, {
        allowHashBang: true,
        ecmaVersion  : 'latest',
        locations    : true,
        sourceType   : 'module'
    });
}

/**
 * @summary Walks an AST while retaining lexical variable scopes for dynamic-import evaluation.
 * @param {Object} node AST node.
 * @param {Function} visitor Visitor receiving `(node, scopes)`.
 * @param {Array<Map<String,Array<{init:Object,start:Number}>>>} [scopes] Active lexical scopes.
 * @param {Object|null} [parent] Parent AST node.
 * @returns {void}
 */
function walkAstScoped(node, visitor, scopes = [], parent = null) {
    if (!node || typeof node !== 'object' || typeof node.type !== 'string') return;

    const createsScope = node.type === 'Program' || node.type === 'BlockStatement' ||
              node.type === 'CatchClause' || node.type === 'FunctionDeclaration' ||
              node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression',
          scope        = createsScope ? Object.assign(new Map(), {scopeType: node.type}) : null,
          activeScopes = scope ? [...scopes, scope] : scopes;

    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
        const targetScope = parent?.type === 'VariableDeclaration' && parent.kind === 'var'
                  ? [...activeScopes].reverse().find(candidate => candidate.scopeType === 'Program' ||
                      candidate.scopeType === 'FunctionDeclaration' ||
                      candidate.scopeType === 'FunctionExpression' ||
                      candidate.scopeType === 'ArrowFunctionExpression')
                  : activeScopes.at(-1),
              declarations = targetScope.get(node.id.name) || [];

        if (node.init) declarations.push({init: node.init, start: node.start});
        targetScope.set(node.id.name, declarations);
    } else if (node.type === 'AssignmentExpression' && node.operator === '=' &&
        node.left?.type === 'Identifier'
    ) {
        const scope = [...activeScopes].reverse().find(candidate => candidate.has(node.left.name)) ||
                  activeScopes.at(-1),
              declarations = scope.get(node.left.name) || [];

        declarations.push({init: node.right, start: node.start});
        scope.set(node.left.name, declarations);
    }

    visitor(node, activeScopes);

    for (const [key, value] of Object.entries(node)) {
        if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue;

        if (Array.isArray(value)) {
            value.forEach(child => walkAstScoped(child, visitor, activeScopes, node));
        } else {
            walkAstScoped(value, visitor, activeScopes, node);
        }
    }
}

/**
 * @summary Flattens visible lexical bindings at one import expression, with inner scopes winning.
 * @param {Array<Map<String,Array<{init:Object,start:Number}>>>} scopes Active lexical scopes.
 * @param {Number} position Import-expression source offset.
 * @returns {Map<String,Object>}
 */
function resolveVisibleBindings(scopes, position) {
    const bindings = new Map();

    for (const scope of scopes) {
        for (const [name, declarations] of scope) {
            const visible = declarations.filter(declaration => declaration.start < position).at(-1);

            if (visible) bindings.set(name, visible.init);
        }
    }

    return bindings;
}

/**
 * @summary Reads a static string value from a literal or expression-free template literal.
 * @param {Object} node AST node.
 * @returns {String|null}
 */
function readStaticString(node) {
    if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;

    if (node?.type === 'TemplateLiteral' && node.expressions.length === 0 && node.quasis.length === 1) {
        return node.quasis[0].value.cooked;
    }

    return null;
}

/**
 * @summary Evaluates the bounded string-expression vocabulary used to construct dynamic import
 * specifiers in tests. Unknown runtime values fail closed to `null`; callers may still inspect
 * literal contributors as a conservative fallback.
 * @param {Object} node AST expression.
 * @param {Map<String,Object>} bindings Variable initializer map.
 * @param {Set<String>} [visitedBindings] Cycle guard for identifier aliases.
 * @param {{rootDir:String,file:String}} [context] Source-location context.
 * @returns {String|null}
 */
function evaluateStaticString(node, bindings, visitedBindings = new Set(), context = {}) {
    if (!node) return null;

    const direct = readStaticString(node);

    if (direct !== null) return direct;

    if (node.type === 'Identifier' && bindings.has(node.name)) {
        if (visitedBindings.has(node.name)) return null;

        const nextVisited = new Set(visitedBindings);
        nextVisited.add(node.name);
        return evaluateStaticString(bindings.get(node.name), bindings, nextVisited, context);
    }

    if (node.type === 'TemplateLiteral') {
        let value = node.quasis[0]?.value?.cooked ?? '';

        for (let index = 0; index < node.expressions.length; index++) {
            const expression = evaluateStaticString(node.expressions[index], bindings, visitedBindings, context);

            if (expression === null) return null;
            value += expression + (node.quasis[index + 1]?.value?.cooked ?? '');
        }

        return value;
    }

    if (node.type === 'BinaryExpression' && node.operator === '+') {
        const left  = evaluateStaticString(node.left, bindings, visitedBindings, context),
              right = evaluateStaticString(node.right, bindings, visitedBindings, context);

        return left === null || right === null ? null : `${left}${right}`;
    }

    if (node.type === 'MemberExpression') {
        const property = node.computed ? readStaticString(node.property) : node.property?.name;

        if (node.object?.type === 'MetaProperty' && node.object.meta?.name === 'import' &&
            node.object.property?.name === 'meta'
        ) {
            const sourceFile = path.join(context.rootDir || ROOT_DIR, context.file || '');

            if (property === 'dirname') return path.dirname(sourceFile);
            if (property === 'filename') return sourceFile;
            if (property === 'url') return pathToFileURL(sourceFile).href;
        }

        if (property === 'href') return evaluateStaticString(node.object, bindings, visitedBindings, context);
    }

    if (node.type === 'NewExpression' && node.callee?.name === 'URL') {
        const relative = evaluateStaticString(node.arguments[0], bindings, visitedBindings, context),
              base     = node.arguments.length > 1
                  ? evaluateStaticString(node.arguments[1], bindings, visitedBindings, context)
                  : null;

        if (relative === null || node.arguments.length > 1 && base === null) return null;

        try {
            return node.arguments.length > 1 ? new URL(relative, base).href : relative;
        } catch {
            return null;
        }
    }

    if (node.type === 'CallExpression') {
        const property = node.callee?.type === 'MemberExpression'
                  ? (node.callee.computed ? readStaticString(node.callee.property) : node.callee.property?.name)
                  : null,
              calleeName = node.callee?.type === 'Identifier' ? node.callee.name : null;

        if (property === 'join' && node.callee.object?.type === 'ArrayExpression') {
            const separator = node.arguments.length === 0
                      ? ','
                      : evaluateStaticString(node.arguments[0], bindings, visitedBindings, context),
                  values = node.callee.object.elements.map(element =>
                      evaluateStaticString(element, bindings, visitedBindings, context)
                  );

            return separator === null || values.includes(null) ? null : values.join(separator);
        }

        if (property === 'dirname' || property === 'join' || property === 'resolve') {
            const values = node.arguments.map(argument =>
                evaluateStaticString(argument, bindings, visitedBindings, context)
            );

            if (!values.includes(null)) return path[property](...values);

            return null;
        }

        if (calleeName === 'pathToFileURL' || property === 'pathToFileURL') {
            const value = evaluateStaticString(node.arguments[0], bindings, visitedBindings, context);

            return value === null ? null : pathToFileURL(value).href;
        }

        if (calleeName === 'fileURLToPath' || property === 'fileURLToPath') {
            const value = evaluateStaticString(node.arguments[0], bindings, visitedBindings, context);

            if (value === null) return null;

            try {
                return fileURLToPath(value);
            } catch {
                return null;
            }
        }

        if (property === 'cwd' && node.callee.object?.name === 'process') {
            return context.rootDir || ROOT_DIR;
        }
    }

    return null;
}

/**
 * @summary Collects a fully resolved candidate for one dynamic import.
 *
 * Partial literal contributors are intentionally not treated as checkout-relative paths. An
 * unknown prefix can be a disposable repository root; claiming its trailing `ai/config.mjs`
 * literal belongs to this checkout would create a false positive at the exact materialization
 * seam this rule must preserve.
 * @param {Object} node Dynamic-import source expression.
 * @param {Map<String,Object>} bindings Variable initializer map.
 * @param {{rootDir:String,file:String}} context Source-location context.
 * @returns {Array<{node: Object, specifier: String}>}
 */
function collectDynamicImportCandidates(node, bindings, context) {
    const evaluated = evaluateStaticString(node, bindings, new Set(), context);

    if (evaluated !== null) return [{node, specifier: evaluated}];

    return [];
}

/**
 * @summary Detects executable test imports that resolve to a repo-owned ignored config overlay.
 *
 * Acorn provides the executable-code boundary: comments and imports embedded in fixture strings are
 * data, not imports of the current test process. Dynamic imports may name a local URL variable; its
 * initializer is followed and only config paths with a real sibling template inside `ai/` qualify.
 * @param {String} source Test/helper source.
 * @param {Object} options
 * @param {String} options.file Repo-relative source path.
 * @param {String} [options.rootDir] Repo root.
 * @returns {Array<{file: String, line: Number, column: Number, kind: String, specifier: String, template: String, replacement: String, start: Number, end: Number, text: String}>}
 */
export function detectTestConfigOverlayImports(source, {file, rootDir = ROOT_DIR, ast = parseModule(source)} = {}) {
    const hits  = [],
          seen  = new Set(),
          lines = source.split('\n');

    const addNode = (node, kind, explicitSpecifier) => {
        const specifier = explicitSpecifier ?? readStaticString(node);
        if (specifier === null) return;

        const templatePath = resolveConfigTemplatePath({rootDir, file, specifier});
        if (!templatePath) return;

        const key = `${node.start}:${node.end}:${specifier}`;
        if (seen.has(key)) return;
        seen.add(key);

        hits.push({
            file,
            line       : node.loc.start.line,
            column     : node.loc.start.column + 1,
            kind,
            specifier,
            template   : normalizeFile(path.relative(rootDir, templatePath)),
            replacement: specifier.replace(/config\.mjs(?=([?#]|$))/, CONFIG_TEMPLATE_BASENAME),
            start      : node.start,
            end        : node.end,
            text       : lines[node.loc.start.line - 1].trim()
        });
    };

    walkAstScoped(ast, (node, scopes) => {
        if (node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration' ||
            (node.type === 'ExportNamedDeclaration' && node.source)
        ) {
            addNode(
                node.source,
                node.type === 'ImportDeclaration' && node.specifiers.length === 0
                    ? 'side-effect-import'
                    : 'static-import'
            );
        } else if (node.type === 'ImportExpression') {
            const bindings = resolveVisibleBindings(scopes, node.start);

            collectDynamicImportCandidates(node.source, bindings, {rootDir, file})
                .forEach(candidate => addNode(
                    candidate.node,
                    readStaticString(node.source) === null ? 'dynamic-import-computed' : 'dynamic-import',
                    candidate.specifier
                ));
        }
    });

    return hits.sort((a, b) => a.start - b.start);
}

/**
 * @summary Checks whether an expression synchronously reads an imported config Provider value.
 *
 * Function and class bodies are invocation/instantiation-time reads, not module-evaluation
 * materialization, so this bounded traversal deliberately does not enter them.
 * @param {Object} node Expression node.
 * @param {Set<String>} providerBindings Direct config-template Provider imports.
 * @param {Set<String>} derivedBindings Module-scope values already derived from a Provider.
 * @returns {Boolean}
 */
function expressionReadsConfigProvider(node, providerBindings, derivedBindings) {
    if (!node || typeof node !== 'object' || typeof node.type !== 'string') return false;

    if (node.type === 'Identifier') {
        return providerBindings.has(node.name) || derivedBindings.has(node.name);
    }

    if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression' ||
        node.type === 'ClassExpression' || node.type === 'FunctionDeclaration' ||
        node.type === 'ClassDeclaration'
    ) {
        return false;
    }

    for (const [key, value] of Object.entries(node)) {
        if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue;
        if (key === 'property' && node.type === 'MemberExpression' && !node.computed) continue;
        if (key === 'key' && (node.type === 'Property' || node.type === 'PropertyDefinition' ||
            node.type === 'MethodDefinition') && !node.computed
        ) {
            continue;
        }

        if (Array.isArray(value)) {
            if (value.some(child => expressionReadsConfigProvider(child, providerBindings, derivedBindings))) {
                return true;
            }
        } else if (expressionReadsConfigProvider(value, providerBindings, derivedBindings)) {
            return true;
        }
    }

    return false;
}

/**
 * @summary Detects test-module exports that create a second authority from a directly imported
 * canonical config-template Provider.
 *
 * The rule is intentionally bounded to module evaluation: direct Provider re-exports and exported
 * values whose initializer synchronously reads the Provider are rejected. Functions that read the
 * Provider when invoked stay valid direct-use seams.
 * @param {String} source Test/helper source.
 * @param {Object} options
 * @param {String} options.file Repo-relative source path.
 * @param {String} [options.rootDir] Repo root.
 * @param {Object} [options.ast] Pre-parsed Acorn Program node.
 * @returns {Array<{file: String, line: Number, column: Number, kind: String, start: Number, end: Number, text: String}>}
 */
export function detectTestConfigProviderExports(
    source,
    {file, rootDir = ROOT_DIR, ast = parseModule(source)} = {}
) {
    const providerBindings = new Set(),
          derivedBindings  = new Set(),
          declarations     = [],
          hits             = [],
          lines            = source.split('\n');

    for (const statement of ast.body) {
        if (statement.type === 'ImportDeclaration') {
            const specifier = readStaticString(statement.source);

            if (!specifier || !resolveDirectConfigTemplatePath({rootDir, file, specifier})) continue;

            for (const binding of statement.specifiers) {
                if (binding.type === 'ImportDefaultSpecifier' || binding.type === 'ImportNamespaceSpecifier' ||
                    binding.type === 'ImportSpecifier' && binding.imported?.name === 'default'
                ) {
                    providerBindings.add(binding.local.name);
                }
            }
        }

        const declaration = statement.type === 'VariableDeclaration'
                  ? statement
                  : statement.type === 'ExportNamedDeclaration' && statement.declaration?.type === 'VariableDeclaration'
                      ? statement.declaration
                      : null;

        if (declaration) declarations.push(...declaration.declarations);
    }

    let changed = true;

    while (changed) {
        changed = false;

        for (const declaration of declarations) {
            if (declaration.id?.type !== 'Identifier' || !declaration.init ||
                derivedBindings.has(declaration.id.name)
            ) {
                continue;
            }

            if (expressionReadsConfigProvider(declaration.init, providerBindings, derivedBindings)) {
                derivedBindings.add(declaration.id.name);
                changed = true;
            }
        }
    }

    const addNode = (node, kind) => {
        hits.push({
            file,
            line  : node.loc.start.line,
            column: node.loc.start.column + 1,
            kind,
            start : node.start,
            end   : node.end,
            text  : lines[node.loc.start.line - 1].trim()
        });
    };

    for (const statement of ast.body) {
        if ((statement.type === 'ExportAllDeclaration' ||
            statement.type === 'ExportNamedDeclaration' && statement.source) &&
            resolveDirectConfigTemplatePath({
                rootDir,
                file,
                specifier: readStaticString(statement.source)
            })
        ) {
            addNode(statement, 'config-provider-re-export');
            continue;
        }

        if (statement.type === 'ExportDefaultDeclaration') {
            if (expressionReadsConfigProvider(statement.declaration, providerBindings, derivedBindings)) {
                addNode(
                    statement,
                    statement.declaration.type === 'Identifier' && providerBindings.has(statement.declaration.name)
                        ? 'config-provider-re-export'
                        : 'config-provider-derived-export'
                );
            }
            continue;
        }

        if (statement.type !== 'ExportNamedDeclaration') continue;

        if (statement.declaration?.type === 'VariableDeclaration') {
            for (const declaration of statement.declaration.declarations) {
                if (expressionReadsConfigProvider(declaration.init, providerBindings, derivedBindings)) {
                    addNode(declaration, 'config-provider-derived-export');
                }
            }
        } else if (!statement.source) {
            for (const specifier of statement.specifiers) {
                const localName = specifier.local?.name;

                if (providerBindings.has(localName)) {
                    addNode(specifier, 'config-provider-re-export');
                } else if (derivedBindings.has(localName)) {
                    addNode(specifier, 'config-provider-derived-export');
                }
            }
        }
    }

    return hits.sort((a, b) => a.start - b.start);
}

/**
 * @summary Reads and caches config-template path classifications.
 *
 * Since the template/base split, a Tier-1 template is a subclass shell: its canonical default
 * leaves live in the sibling `configBase.mjs`. The classification is therefore the union of both
 * files, template-declared paths winning — a shell-only read would leave every base-declared path
 * unclassifiable, and the fail-closed capture rule would flag legitimate subtree captures.
 * The same union applies to every per-server thin template with an adjacent base. Legacy full
 * templates still have no sibling base and therefore read exactly as before during transition.
 * @param {String} templatePath Absolute template path.
 * @returns {{primitiveLeafPaths: Set<String>, liveProxyPaths: Set<String>}}
 */
async function getConfigPathKindsForTemplate(templatePath) {
    const key = normalizeFile(templatePath);

    if (!CONFIG_TEMPLATE_KIND_CACHE.has(key)) {
        const kinds    = await collectConfigPathKindsFromTemplate(templatePath),
              basePath = path.join(path.dirname(templatePath), CONFIG_BASE_BASENAME);

        if (path.basename(templatePath) !== CONFIG_BASE_BASENAME && fs.existsSync(basePath)) {
            const baseKinds  = await collectConfigPathKindsFromTemplate(basePath),
                  classified = p => kinds.primitiveLeafPaths.has(p) || kinds.liveProxyPaths.has(p);

            baseKinds.primitiveLeafPaths.forEach(p => {classified(p) || kinds.primitiveLeafPaths.add(p)});
            baseKinds.liveProxyPaths.forEach(p => {classified(p) || kinds.liveProxyPaths.add(p)});
        }

        CONFIG_TEMPLATE_KIND_CACHE.set(key, kinds);
    }

    return CONFIG_TEMPLATE_KIND_CACHE.get(key);
}

/**
 * @summary The DECLARED config-path surface of one template — the union of its own declarations and
 * its sibling `configBase.mjs`, if one exists.
 *
 * The union, not the leaf set. `leaf({...})` — a leaf whose default is an object literal — classifies
 * as a live proxy rather than a primitive, so `logger` and `discussionDenylist` sit in `liveProxyPaths`
 * while being every bit as removable as their primitive siblings. Guarding only `primitiveLeafPaths`
 * would leave 8 declarations across the servers unwatched, and they are exactly the ones a reader
 * counting `leaf(` calls would expect to be covered.
 *
 * Reading the sibling base is what keeps this correct across the template/base split: whichever file a
 * declaration lives in, it is the same runtime surface, and a guard that watched only one file would
 * report a clean set for a leaf that merely moved out of view.
 *
 * @param {String} templatePath Absolute path to a `config.template.mjs`.
 * @returns {String[]} Sorted, de-duplicated declared paths.
 */
export function collectDeclaredConfigPaths(templatePath) {
    const union    = new Set(),
          basePath = path.join(path.dirname(templatePath), CONFIG_BASE_BASENAME);

    for (const file of [basePath, templatePath]) {
        if (!fs.existsSync(file)) continue;

        const kinds = collectConfigPathKindsFromSource(fs.readFileSync(file, 'utf8'));

        kinds.primitiveLeafPaths.forEach(configPath => union.add(configPath));
        kinds.liveProxyPaths.forEach(configPath => union.add(configPath))
    }

    return [...union].sort()
}

/**
 * @summary Builds the declared-path surface for every config template in the repo.
 * @param {Object} options={}
 * @param {String} [options.rootDir] Repo root.
 * @returns {Object} Repo-relative template path → sorted declared paths.
 */
export async function buildConfigLeafParitySnapshot({rootDir = ROOT_DIR} = {}) {
    const out = {};

    for (const file of walkConfigTemplates(path.join(rootDir, SCAN_ROOT_REL))) {
        // The base is read THROUGH its template, never as a surface of its own: it declares no runtime
        // namespace, and listing it separately would double-count every path it contributes.
        if (path.basename(file) !== CONFIG_TEMPLATE_BASENAME) continue;

        const rel = normalizeFile(path.relative(rootDir, file));

        try {
            out[rel] = await collectDeclaredConfigPathsFromTemplate(file)
        } catch (error) {
            // A template that cannot be evaluated is NOT a path deletion: the collector could not
            // resolve the declaration form, and reporting its whole surface as GONE would be a
            // false statement about the diff. The reporter names this separately and never offers
            // --update-parity for it.
            out[rel] = {error: error?.message || String(error)}
        }
    }

    return out
}

/**
 * @summary Compares the live declared-path surface against the committed expectation.
 *
 * A dropped config leaf is silent at every gate and loud only at runtime, in a peer's process, as
 * `undefined` — so the expectation exists to make removal a REVIEWABLE act rather than an invisible
 * one. A deliberate removal updates the snapshot in the same commit; that diff is the review surface.
 *
 * Named paths, never counts. `106 → 105` tells nobody which leaf died, and a rename (one removed, one
 * added) nets to zero — which is precisely the refactor that would hide the loss.
 *
 * @param {Object} options={}
 * @param {String} [options.rootDir] Repo root.
 * @param {Object} [options.expectation] The committed snapshot; read from disk when omitted.
 * @returns {{added: Object, missing: Object, untracked: String[], vanished: String[]}}
 */
export async function detectConfigLeafParityViolations({rootDir = ROOT_DIR, expectation} = {}) {
    const snapshotPath = path.join(rootDir, CONFIG_LEAF_PARITY_REL),
          document     = expectation ?? (fs.existsSync(snapshotPath) ? JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) : {}),
          expected     = Object.fromEntries(Object.entries(document)
              .filter(([key]) => !key.startsWith('$'))),
          actual       = await buildConfigLeafParitySnapshot({rootDir}),
          result       = {added: {}, errors: {}, missing: {}, untracked: [], vanished: []};

    for (const [template, paths] of Object.entries(actual)) {
        if (paths && typeof paths === 'object' && !Array.isArray(paths) && paths.error) {
            result.errors[template] = paths.error;
            continue
        }

        if (!Object.hasOwn(expected, template)) {
            // A NEW template is not silently adopted: its whole surface would otherwise enter the
            // repo unreviewed, and the snapshot would bless it on first write.
            result.untracked.push(template);
            continue
        }

        const before  = new Set(expected[template]),
              after   = new Set(paths),
              missing = [...before].filter(configPath => !after.has(configPath)),
              added   = [...after].filter(configPath => !before.has(configPath));

        if (missing.length) result.missing[template] = missing.sort();
        if (added.length)   result.added[template]   = added.sort()
    }

    // A template that disappeared entirely — the failure the per-template diff cannot see, because it
    // iterates what still exists.
    result.vanished = Object.keys(expected).filter(template => !Object.hasOwn(actual, template)).sort();

    return result
}

/**
 * @summary Prints a config-leaf-parity failure as the exact paths that changed.
 * @param {Object} parity The {@link detectConfigLeafParityViolations} result.
 * @returns {void}
 */
function reportConfigLeafParity(parity) {
    console.error('[lint-config-template-ssot] config leaf parity FAILED');

    const errorTemplates = Object.keys(parity.errors || {});

    for (const template of errorTemplates) {
        console.error(`  ${template}: the collector could not RESOLVE this template's declaration form`);
        console.error(`    ${parity.errors[template]}`);
        console.error('    This is not a path deletion: the gate cannot see through the form used, so no');
        console.error('    diff verdict is possible. Declare the subtree inline (or via leaf()), never widen the');
        console.error('    snapshot to hide it — --update-parity is deliberately not offered for this case.');
    }

    for (const [template, paths] of Object.entries(parity.missing)) {
        console.error(`  ${template}: ${paths.length} declared path(s) GONE`);
        paths.forEach(configPath => console.error(`    - ${configPath}`))
    }

    for (const [template, paths] of Object.entries(parity.added)) {
        console.error(`  ${template}: ${paths.length} declared path(s) ADDED`);
        paths.forEach(configPath => console.error(`    + ${configPath}`))
    }

    parity.untracked.forEach(template => console.error(`  ${template}: template is not in the parity snapshot`));
    parity.vanished.forEach(template => console.error(`  ${template}: template in the snapshot no longer exists`));

    console.error('');
    console.error('A config path reads `undefined` at runtime, in a peer\'s process, when it silently leaves');
    console.error('this surface — no other gate can see it.');

    if (errorTemplates.length === 0) {
        console.error('If the change is deliberate, record it:');
        console.error(`    node ${SELF_REL_FILE} --update-parity`);
        console.error('and commit the snapshot in the SAME commit, so the removal is reviewable.')
    }
}

/**
 * @summary Resolves list-form, map-form, and YAML-merge Compose environments into one map.
 * @param {Object|Array|String|null} environment Compose environment declaration.
 * @param {Map<String,*>} [out] Accumulator.
 * @returns {Map<String,*>}
 */
function collectComposeEnvironment(environment, out = new Map()) {
    if (Array.isArray(environment)) {
        environment.forEach(entry => collectComposeEnvironment(entry, out));
        return out
    }

    if (typeof environment === 'string') {
        const separator = environment.indexOf('='),
              env       = separator === -1 ? environment : environment.slice(0, separator),
              value     = separator === -1 ? null : environment.slice(separator + 1);

        out.set(env, value);
        return out
    }

    if (!environment || typeof environment !== 'object') return out;

    if (Object.hasOwn(environment, '<<')) {
        collectComposeEnvironment(environment['<<'], out)
    }

    for (const [env, value] of Object.entries(environment)) {
        if (env !== '<<') out.set(env, value)
    }

    return out
}

/**
 * @summary Serializes scalar/CSV config defaults the same way Compose environment values arrive.
 * @param {*} value Config descriptor default.
 * @returns {String|undefined}
 */
function serializeConfigDefault(value) {
    if (Array.isArray(value)) return value.join(',');
    if (['boolean', 'number', 'string'].includes(typeof value)) return String(value);
}

/**
 * @summary Compares parsed Compose profiles with declared config defaults and the committed census.
 *
 * This is deliberately a small deployment-boundary guard, not a general Compose evaluator:
 * interpolated values are deployment choices and therefore skipped; literal values are compared
 * with the owning config template, while retired/derived env names fail by policy.
 * @param {Object} options
 * @param {Object} options.policy Committed `$composeDefaultParity` policy.
 * @param {Object} options.composeDocuments Repo-relative Compose path to parsed YAML.
 * @param {Object} options.envDefaultsByTemplate Config template to env/default descriptor rows.
 * @returns {Array<Object>} Violations.
 */
export function detectComposeDefaultRestatementsFromDocuments({
    policy = {},
    composeDocuments = {},
    envDefaultsByTemplate = {}
} = {}) {
    const
        violations   = [],
        forbiddenEnv = policy.forbiddenEnv || {},
        environments = {};

    for (const [file, profile] of Object.entries(policy.profiles || {})) {
        const document = composeDocuments[file];

        if (!document) {
            violations.push({kind: 'compose-profile-missing', file});
            continue
        }

        environments[file] = {};

        for (const [service, serviceConfig] of Object.entries(document.services || {})) {
            const environment = collectComposeEnvironment(serviceConfig?.environment);

            environments[file][service] = environment;

            for (const [env, value] of environment) {
                if (Object.hasOwn(forbiddenEnv, env)) {
                    violations.push({
                        env,
                        file,
                        kind  : 'derived-or-retired-env',
                        reason: forbiddenEnv[env],
                        service,
                        value : value == null ? null : String(value)
                    });
                    continue
                }

                const
                    template = profile.services?.[service],
                    rows     = envDefaultsByTemplate[template]?.[env] || [],
                    rendered = value == null ? null : String(value);

                if (!template || rendered == null || rendered.includes('${')) continue;

                const match = rows.find(row => serializeConfigDefault(row.default) === rendered);

                if (match) {
                    violations.push({
                        configPath: match.configPath,
                        env,
                        file,
                        kind      : 'matches-config-default',
                        service,
                        value     : rendered
                    })
                }
            }
        }
    }

    const census = policy.census;

    if (census?.profile) {
        const
            actual = new Set(Object.values(environments[census.profile] || {})
                .flatMap(environment => [...environment.keys()])
                .filter(env => /^(?:NEO_|MCP_)/.test(env))),
            buckets = [
                ...(census.requiredDeploymentInputs || []),
                ...(census.optionalOverrides || []),
                ...(census.secrets || [])
            ],
            expected = new Set(buckets),
            duplicates = [...new Set(buckets.filter((env, index) => buckets.indexOf(env) !== index))],
            missing    = [...expected].filter(env => !actual.has(env)).sort(),
            unexpected = [...actual].filter(env => !expected.has(env)).sort();

        if (duplicates.length || missing.length || unexpected.length ||
            actual.size !== census.remainingUniqueKeys
        ) {
            violations.push({
                actualUniqueKeys  : actual.size,
                duplicates,
                expectedUniqueKeys: census.remainingUniqueKeys,
                file              : census.profile,
                kind              : 'census-drift',
                missing,
                unexpected
            })
        }
    }

    return violations
}

/**
 * @summary Loads the committed Compose/default parity surface and returns violations.
 * @param {Object} [options]
 * @param {String} [options.rootDir] Repo root.
 * @param {Object} [options.policy] Injected policy.
 * @returns {Promise<Array<Object>>}
 */
export async function detectComposeDefaultRestatements({rootDir = ROOT_DIR, policy} = {}) {
    if (!policy) {
        const snapshotPath = path.join(rootDir, CONFIG_LEAF_PARITY_REL),
              document     = fs.existsSync(snapshotPath) ?
                  JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) : {};

        policy = document[COMPOSE_DEFAULT_PARITY_KEY]
    }

    if (!policy) return [];

    const
        composeDocuments      = {},
        envDefaultsByTemplate = {},
        violations            = [];

    for (const file of Object.keys(policy.profiles || {})) {
        try {
            composeDocuments[file] = loadYaml(fs.readFileSync(path.join(rootDir, file), 'utf8'))
        } catch (error) {
            violations.push({
                error: error?.message || String(error),
                file,
                kind : 'compose-profile-unreadable'
            })
        }
    }

    const templates = new Set(Object.values(policy.profiles || {})
        .flatMap(profile => Object.values(profile.services || {})));

    for (const template of templates) {
        envDefaultsByTemplate[template] = await buildConfigEnvDefaultsForTemplate({rootDir, template})
    }

    return [
        ...violations,
        ...detectComposeDefaultRestatementsFromDocuments({
            composeDocuments,
            envDefaultsByTemplate,
            policy
        })
    ]
}

/**
 * @summary Prints Compose/default parity violations.
 * @param {Array<Object>} violations Violations.
 * @returns {void}
 */
function reportComposeDefaultRestatements(violations) {
    console.error('[lint-config-template-ssot] Compose default parity FAILED');

    for (const violation of violations) {
        if (violation.kind === 'census-drift') {
            console.error(`  ${violation.file}: census expected ${violation.expectedUniqueKeys}, found ${violation.actualUniqueKeys}`);
            if (violation.missing.length) console.error(`    missing: ${violation.missing.join(', ')}`);
            if (violation.unexpected.length) console.error(`    unexpected: ${violation.unexpected.join(', ')}`);
            if (violation.duplicates.length) console.error(`    duplicate classifications: ${violation.duplicates.join(', ')}`);
        } else if (violation.kind === 'matches-config-default') {
            console.error(`  ${violation.file} ${violation.service}: ${violation.env}=${violation.value} matches ${violation.configPath}`);
        } else if (violation.kind === 'derived-or-retired-env') {
            console.error(`  ${violation.file} ${violation.service}: ${violation.env} is derived/retired — ${violation.reason}`);
        } else {
            console.error(`  ${violation.file}: ${violation.kind}${violation.error ? ` — ${violation.error}` : ''}`)
        }
    }
}

/**
 * @summary Classifies a Compose source's projection of one clock leaf against its config default.
 *
 * ## Why a token search is not enough, and how it false-greens
 *
 * The first shape of this check asked only whether the env NAME appeared anywhere in the file. That
 * proves an identifier is present; it proves nothing about what an operator reads. Three shapes
 * passed it while publishing no usable information, and the middle one is the dangerous class:
 *
 * - a value that no longer matches the leaf (`"15000"` after the default moved to `20000`) — the
 *   comment is now confidently WRONG, which is worse than absent, because an operator trusts a
 *   number and only distrusts a blank;
 * - prose that merely names the variable (`# …_TIMEOUT_MS exists somewhere`);
 * - a contaminated token (`OLD_…_TIMEOUT_MS`), which slipped through because the earlier right-only
 *   boundary was justified by reasoning about SHORTER-vs-LONGER generated names and never
 *   considered a PREFIXED one.
 *
 * A documentation guard has to validate the information consumed, not the identifier carrying it,
 * or visibility drifts while enforcement stays green — the same operator-blindness this rule exists
 * to end, rebuilt one layer up.
 *
 * ## The canonical projection line
 *
 * Both boundaries are anchored, the line must be a COMMENT (never a live key — that is the sibling
 * rule's territory), the value must equal the current config default, and a trailing guidance
 * comment must be present and non-empty:
 *
 *     # NEO_X_TIMEOUT_MS: "15000"   # per-attempt ceiling, ONE single-input embed
 *
 * Requiring value-equality is what makes the projection self-invalidating: change the leaf and every
 * stale comment fails on the next run, so the documentation cannot rot silently.
 * One env name can bind more than one config path, so the accepted set is every row's default —
 * the same tolerance the sibling restatement rule applies, for the same reason: the projection is
 * correct if it names a value the leaf actually resolves to.
 * @param {String} source Raw Compose file text, comments included.
 * @param {String} env Environment variable name.
 * @param {Array<Object>} rows The leaf's `{configPath, default}` rows.
 * @returns {String|null} A violation kind, or `null` when the projection is valid.
 */
function classifyProjection(source, env, rows) {
    const
        expected = (rows || []).map(row => serializeConfigDefault(row.default)),
        line     = new RegExp(`^[^\\S\\n]*#[^\\S\\n]*(?<![A-Z0-9_])${env}(?![A-Z0-9_])[^\\S\\n]*:[^\\S\\n]*(\\S+?)[^\\S\\n]*(#[^\\n]*)?$`, 'm')
            .exec(source);

    if (!line) return 'unprojected-behavior-binding-clock';

    const [, rawValue, guidance] = line;

    if (!expected.includes(rawValue.replace(/^"|"$/g, ''))) return 'projection-default-mismatch';
    if (!guidance || !guidance.slice(1).trim())             return 'projection-missing-guidance';

    return null
}

/**
 * @summary Detects behavior-binding clock leaves that a covered Compose template never projects.
 *
 * ## Why this is the inverse of `detectComposeDefaultRestatements`, not a duplicate of it
 *
 * The sibling rule bans a Compose value that RESTATES a config default, because a restated default
 * is a second declaration site that silently pins the old number when the leaf changes. This rule
 * bans the opposite failure: a clock that binds real behavior and appears in the deployment file
 * NOWHERE, so an operator reading that file cannot see what governs the deployment. One says do not
 * duplicate the value; this one says do not hide the knob. Together they leave exactly one
 * declaration site and zero invisible clocks.
 *
 * Because the two rules pull in opposite directions, projection here is satisfied by a MENTION —
 * a commented line counts, a live assignment counts. That is deliberate: the commented form is what
 * lets a template document a clock without restating its default and tripping the sibling rule.
 * The match therefore runs against raw file text rather than parsed YAML, since a YAML parse drops
 * exactly the comments that carry the documentation.
 *
 * ## Scope is declared per profile, never inferred
 *
 * A blanket "every leaf must be projected" would flood a template with dozens of knobs irrelevant to
 * it, and a check that produces noise gets routed around within a week. So each profile names the env
 * NAMESPACES it is responsible for, and within those the `clockSuffixes` select the timing/retry
 * leaves mechanically — no semantic judgment at lint time. Widening coverage is a policy edit, which
 * keeps the decision reviewable instead of buried in a heuristic.
 * @param {Object} options
 * @param {Object} options.composeSources Raw file text keyed by repo-relative path.
 * @param {Object} options.envDefaultsByFile Env-name → config default, keyed by repo-relative path.
 * @param {Object} options.policy The `$behaviorBindingProjection` policy.
 * @returns {Array<Object>} Violations.
 */
export function detectUnprojectedBehaviorBindingClocksFromSources({composeSources, envDefaultsByFile, policy}) {
    const
        suffixes   = policy?.clockSuffixes || [],
        violations = [];

    for (const [file, profile] of Object.entries(policy?.profiles || {})) {
        const source = composeSources[file];

        if (typeof source !== 'string') continue;

        const
            defaults   = envDefaultsByFile[file] || {},
            namespaces = profile.namespaces || [];

        for (const [env, rows] of Object.entries(defaults)) {
            if (!namespaces.some(namespace => env.startsWith(namespace))) continue;
            if (!suffixes.some(suffix => env.endsWith(suffix)))            continue;

            const kind = classifyProjection(source, env, rows);

            if (kind) {
                violations.push({
                    configDefault: (rows || []).map(row => serializeConfigDefault(row.default)).join(' | '),
                    env, file, kind
                })
            }
        }
    }

    return violations
}

/**
 * @summary Loads the behavior-binding projection surface and returns violations.
 * @param {Object} [options]
 * @param {String} [options.rootDir] Repo root.
 * @param {Object} [options.policy] Injected policy.
 * @returns {Promise<Array<Object>>}
 */
export async function detectUnprojectedBehaviorBindingClocks({rootDir = ROOT_DIR, policy} = {}) {
    if (!policy) {
        const snapshotPath = path.join(rootDir, CONFIG_LEAF_PARITY_REL),
              document     = fs.existsSync(snapshotPath) ?
                  JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) : {};

        policy = document[BEHAVIOR_BINDING_PROJECTION_KEY]
    }

    if (!policy) return [];

    const
        composeSources    = {},
        envDefaultsByFile = {},
        violations        = [];

    for (const [file, profile] of Object.entries(policy.profiles || {})) {
        try {
            composeSources[file] = fs.readFileSync(path.join(rootDir, file), 'utf8')
        } catch (error) {
            violations.push({
                error: error?.message || String(error),
                file,
                kind : 'projection-profile-unreadable'
            });

            continue
        }

        envDefaultsByFile[file] = await buildConfigEnvDefaultsForTemplate({rootDir, template: profile.template})
    }

    return [
        ...violations,
        ...detectUnprojectedBehaviorBindingClocksFromSources({composeSources, envDefaultsByFile, policy})
    ]
}

/**
 * @summary Prints unprojected behavior-binding clock violations.
 * @param {Array<Object>} violations Violations.
 * @returns {void}
 */
function reportUnprojectedBehaviorBindingClocks(violations) {
    console.error('[lint-config-template-ssot] Behavior-binding clock projection FAILED');

    for (const violation of violations) {
        if (violation.kind === 'unprojected-behavior-binding-clock') {
            console.error(`  ${violation.file}: ${violation.env} binds behavior but is not projected`);
            console.error(`    fix: add   # ${violation.env}: "${violation.configDefault}"   # <plane-class guidance>`);
            console.error('    (a COMMENT, never a live key — a live value equal to the default is the sibling rule\'s violation)')
        } else if (violation.kind === 'projection-default-mismatch') {
            console.error(`  ${violation.file}: ${violation.env} is projected with a STALE value — config default is now ${violation.configDefault}`);
            console.error('    an operator reads this number and trusts it; a wrong projection is worse than none')
        } else if (violation.kind === 'projection-missing-guidance') {
            console.error(`  ${violation.file}: ${violation.env} is projected without plane-class guidance`);
            console.error('    add a trailing `# …` explaining what the knob does on a CPU-constrained vs GPU plane')
        } else {
            console.error(`  ${violation.file}: ${violation.kind}${violation.error ? ` — ${violation.error}` : ''}`)
        }
    }
}

/**
 * @summary Maps imported config identifiers in one implementation file to config path kinds.
 * @param {Object} options
 * @param {String} [options.rootDir] Repo root.
 * @param {String} options.file Repo-relative file.
 * @param {String} options.source File source.
 * @returns {Map<String,{primitiveLeafPaths: Set<String>, liveProxyPaths: Set<String>}>}
 */
export async function buildConfigPathKindsByIdentifier({rootDir = ROOT_DIR, file, source} = {}) {
    const out = new Map();

    if (!file || !source) return out;

    for (const match of source.matchAll(/\bimport\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]*config\.mjs)['"]/g)) {
        const template = resolveConfigTemplatePath({rootDir, file, specifier: match[2]});
        if (template) {
            out.set(match[1], await getConfigPathKindsForTemplate(template));
        }
    }

    for (const match of source.matchAll(/\bimport\s*\{([^}]+)\}\s*from\s+['"]([^'"]*services\.mjs)['"]/g)) {
        for (const rawBinding of match[1].split(',')) {
            const binding = rawBinding.trim();
            if (!binding) continue;

            const [imported, alias] = binding.split(/\s+as\s+/),
                  rel               = SERVICE_EXPORT_CONFIG_TEMPLATE_REL[imported];

            if (rel) {
                out.set(alias || imported, await getConfigPathKindsForTemplate(path.join(rootDir, rel)));
            }
        }
    }

    if (!out.has('AiConfig')) {
        const rootTemplate = path.join(rootDir, 'ai/config.template.mjs');
        if (fs.existsSync(rootTemplate)) {
            out.set('AiConfig', await getConfigPathKindsForTemplate(rootTemplate));
        }
    }

    return out;
}

/**
 * @summary Detects module-load AiConfig primitive/formula leaf captures.
 *
 * Direct use-site reads remain valid. Namespace captures and object-valued leaf captures also remain
 * valid because later property reads go through live nested Provider proxies. This detector targets
 * primitive/formula leaves frozen at module evaluation time: a runtime
 * self-heal config mutation can be ignored by a stale closure. Function bodies and module-scope
 * functions that read AiConfig when invoked are intentionally out of scope.
 * @param {String} source File contents.
 * @param {Object} [options]
 * @param {Map<String,{primitiveLeafPaths: Set<String>, liveProxyPaths: Set<String>}>} [options.configPathKindsByIdentifier]
 * @returns {Array<{line: Number, kind: String, text: String}>}
 */
export function detectModuleScopeAiConfigCaptures(source, {configPathKindsByIdentifier = new Map()} = {}) {
    const violations = [];
    let   depth      = 0;

    source.split('\n').forEach((text, index) => {
        const trimmed = text.trim(),
              before  = depth;

        if (before === 0 && isPotentialModuleScopeConfigCapture(trimmed) &&
            shouldFlagModuleScopeCapture(trimmed, configPathKindsByIdentifier)
        ) {
            violations.push({line: index + 1, kind: 'module-scope-leaf-capture', text: trimmed});
        }

        const code = stripStringsAndLineComment(text);
        for (const ch of code) {
            if (ch === '{') {
                depth++;
            } else if (ch === '}') {
                depth = Math.max(0, depth - 1);
            }
        }
    });

    return violations;
}

/**
 * @summary Checks whether a line can be a module-scope config capture before kind classification.
 * @param {String} trimmed Trimmed source line.
 * @returns {Boolean}
 */
function isPotentialModuleScopeConfigCapture(trimmed) {
    return Boolean(trimmed) &&
        !trimmed.startsWith('//') &&
        !trimmed.startsWith('*') &&
        !trimmed.startsWith('/*') &&
        !trimmed.startsWith('*/') &&
        /\b(?:const|let|var)\b/.test(trimmed);
}

/**
 * @summary Decides whether a module-scope config capture freezes a primitive/formula leaf.
 * @param {String} trimmed Trimmed source line.
 * @param {Map<String,{primitiveLeafPaths: Set<String>, liveProxyPaths: Set<String>}>} configPathKindsByIdentifier
 * @returns {Boolean}
 */
function shouldFlagModuleScopeCapture(trimmed, configPathKindsByIdentifier) {
    const captures = readModuleScopeCapturePaths(trimmed, configPathKindsByIdentifier);

    if (captures.length === 0) return false;

    return captures.some(({identifier, path: capturePath}) => {
        const kinds = configPathKindsByIdentifier.get(identifier);

        if (!kinds) return true;

        const key = capturePath.join('.');

        if (kinds.liveProxyPaths.has(key)) return false;
        if (kinds.primitiveLeafPaths.has(key)) return true;

        for (const knownPath of [...kinds.liveProxyPaths, ...kinds.primitiveLeafPaths]) {
            if (knownPath.startsWith(`${key}.`)) return false;
        }

        return true;
    });
}

/**
 * @summary Extracts captured config paths from one module-scope declaration line.
 * @param {String} trimmed Trimmed source line.
 * @param {Map<String,{primitiveLeafPaths: Set<String>, liveProxyPaths: Set<String>}>} configPathKindsByIdentifier
 * @returns {Array<{identifier: String, path: String[]}>}
 */
function readModuleScopeCapturePaths(trimmed, configPathKindsByIdentifier) {
    const direct = trimmed.match(/\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*([A-Za-z_$][\w$]*)(?:\?\.|\.)((?:[A-Za-z_$][\w$]*)(?:\.[A-Za-z_$][\w$]*)*)/);

    if (direct) {
        if (!isConfigCaptureIdentifier(direct[1], configPathKindsByIdentifier)) return [];
        return [{identifier: direct[1], path: direct[2].split('.')}];
    }

    const destructured = trimmed.match(/\b(?:const|let|var)\s*\{([^}]+)\}\s*=\s*([A-Za-z_$][\w$]*)\b/);
    if (!destructured) return [];
    if (!isConfigCaptureIdentifier(destructured[2], configPathKindsByIdentifier)) return [];

    return destructured[1]
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => {
            const localDefaultFree = part.split('=')[0].trim(),
                  prop             = localDefaultFree.split(':')[0].trim();

            return {identifier: destructured[2], path: [prop]};
        })
        .filter(({path}) => /^[A-Za-z_$][\w$]*$/.test(path[0]));
}

/**
 * @summary Checks whether an identifier is a config provider alias worth classifying.
 * @param {String} identifier Source identifier.
 * @param {Map<String,{primitiveLeafPaths: Set<String>, liveProxyPaths: Set<String>}>} configPathKindsByIdentifier
 * @returns {Boolean}
 */
function isConfigCaptureIdentifier(identifier, configPathKindsByIdentifier) {
    return configPathKindsByIdentifier.has(identifier) || [
        'aiConfig',
        'AiConfig',
        'GH_Config',
        'KB_Config',
        'MC_Config',
        'Memory_Config',
        'kbConfig',
        'mcConfig',
        'memoryCoreConfig'
    ].includes(identifier);
}

/**
 * @summary Removes quoted strings and line comments for brace-depth scanning.
 * @param {String} line Source line.
 * @returns {String}
 */
function stripStringsAndLineComment(line) {
    let out     = '',
        quote   = null,
        escaped = false;

    for (let i = 0; i < line.length; i++) {
        const ch   = line[i],
              next = line[i + 1];

        if (!quote && ch === '/' && next === '/') {
            break;
        }

        if (quote) {
            out += ' ';
            if (escaped) {
                escaped = false;
            } else if (ch === '\\') {
                escaped = true;
            } else if (ch === quote) {
                quote = null;
            }
            continue;
        }

        if (ch === '"' || ch === '\'' || ch === '`') {
            quote = ch;
            out += ' ';
            continue;
        }

        out += ch;
    }

    return out;
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

/**
 * @summary Scans `ai/` implementation files for mechanical ADR-19 AiConfig SSOT hits.
 * @param {Object} [options]
 * @param {String} [options.rootDir] Repo root.
 * @param {Array<{file: String, source: String}>} [options.files] Injected file records (test seam).
 * @param {ReadonlyArray<Object>} [options.baseline] Baseline rows.
 * @returns {{violations: Object[], newViolations: Object[], staleBaseline: Object[]}}
 */
export function lintAiConfigImplementationSsot({
    rootDir  = ROOT_DIR,
    files,
    baseline = AI_CONFIG_IMPLEMENTATION_BASELINE
} = {}) {
    const records = files || walkMjsFiles(path.join(rootDir, SCAN_ROOT_REL))
        .map(abs => ({
            file  : normalizeFile(path.relative(rootDir, abs)),
            source: fs.readFileSync(abs, 'utf8')
        }))
        .filter(({file}) => shouldScanAiConfigImplementation(file));

    const violations = [];

    for (const {file, source} of records) {
        if (!shouldScanAiConfigImplementation(file)) continue;

        for (const hit of detectAiConfigImplementationViolations(source)) {
            violations.push({file, ...hit});
        }
    }

    const keyOf         = row => `${row.file}::${row.kind}::${row.text}`,
          baselineKeys  = new Set(baseline.map(keyOf)),
          violationKeys = new Set(violations.map(keyOf));

    return {
        violations,
        newViolations: violations.filter(v => !baselineKeys.has(keyOf(v))),
        staleBaseline: baseline.filter(b => !violationKeys.has(keyOf(b)))
    };
}

/**
 * @summary Scans `ai/` implementation files for module-scope AiConfig leaf captures.
 * @param {Object} [options]
 * @param {String} [options.rootDir] Repo root.
 * @param {Array<{file: String, source: String}>} [options.files] Injected file records (test seam).
 * @param {ReadonlyArray<Object>} [options.baseline] Baseline rows.
 * @returns {{violations: Object[], newViolations: Object[], staleBaseline: Object[]}}
 */
export async function lintAiConfigModuleScopeCaptures({
    rootDir  = ROOT_DIR,
    files,
    baseline = AI_CONFIG_MODULE_SCOPE_BASELINE
} = {}) {
    const records = files || walkMjsFiles(path.join(rootDir, SCAN_ROOT_REL))
        .map(abs => ({
            file  : normalizeFile(path.relative(rootDir, abs)),
            source: fs.readFileSync(abs, 'utf8')
        }))
        .filter(({file}) => shouldScanAiConfigImplementation(file));

    const violations = [];

    for (const {file, source} of records) {
        if (!shouldScanAiConfigImplementation(file)) continue;

        const configPathKindsByIdentifier = await buildConfigPathKindsByIdentifier({rootDir, file, source});

        for (const hit of detectModuleScopeAiConfigCaptures(source, {configPathKindsByIdentifier})) {
            violations.push({file, ...hit});
        }
    }

    const keyOf         = row => `${row.file}::${row.kind}::${row.text}`,
          baselineKeys  = new Set(baseline.map(keyOf)),
          violationKeys = new Set(violations.map(keyOf));

    return {
        violations,
        newViolations: violations.filter(v => !baselineKeys.has(keyOf(v))),
        staleBaseline: baseline.filter(b => !violationKeys.has(keyOf(b)))
    };
}

/**
 * @summary Scans the Playwright tree for config-authority violations: executable imports of
 * repo-owned ignored overlays and module-evaluated exports derived from canonical Providers.
 * This rule is target-zero by construction: there is no baseline or file allowlist.
 * @param {Object} [options]
 * @param {String} [options.rootDir] Repo root.
 * @param {Array<{file: String, source: String}>} [options.files] Injected test records.
 * @returns {{violations: Object[]}}
 */
export function lintTestConfigAuthority({rootDir = ROOT_DIR, files} = {}) {
    const records = files || walkMjsFiles(path.join(rootDir, TEST_SCAN_ROOT_REL)).map(abs => ({
              file  : normalizeFile(path.relative(rootDir, abs)),
              source: fs.readFileSync(abs, 'utf8')
          })),
          violations = [];

    for (const {file, source} of records) {
        const ast = parseModule(source);

        violations.push(
            ...detectTestConfigOverlayImports(source, {file, rootDir, ast}),
            ...detectTestConfigProviderExports(source, {file, rootDir, ast})
        );
    }

    return {violations};
}

const FIX_HINT = 'Move env access into the leaf env-var-name argument — leaf(default, \'ENV_VAR\', type) — ' +
    'and relocate any UNIT_TEST_MODE branch to the test layer (the test-unit npm script shell env). ' +
    'Authority: the AiConfig reactive Provider SSOT decision record (issue #12451).';
const AI_CONFIG_FIX_HINT = 'Read resolved AiConfig leaves inline at the use site; local Provider subtree references are OK. ' +
    'Do not export config values, pass config-shaped objects through consumers, add hidden defaults/type coercions, ' +
    'or add defensive optional chaining unless the code names an ADR-19-sanctioned boundary. Authority: ADR 0019.';
const AI_CONFIG_MODULE_SCOPE_FIX_HINT = 'Do not freeze primitive/formula Provider leaves at module load. ' +
    'Read the leaf at the use site, or document an existing frozen primitive leaf in AI_CONFIG_MODULE_SCOPE_BASELINE ' +
    'as explicit #14239 burndown debt. Namespace and object-valued leaf captures stay live through nested Provider ' +
    'proxies and must not be baselined as violations. Authority: #14239 + ADR 0019.';
const TEST_CONFIG_OVERLAY_FIX_HINT = 'Tests resolve committed config templates, never repo-local ignored overlays. ' +
    'Import config.template.mjs directly; the Playwright resolver covers transitive production imports. ' +
    'Config-materialization probes must execute overlays only inside disposable child repositories. ' +
    'Read reactive Providers directly at each assertion/use site; do not export frozen snapshots, derived defaults, ' +
    'or the Provider itself as a second test authority. Authority: ADR 0019 B1/C3.';

/**
 * @summary CLI wrapper. Returns an exit code (0 clean, 1 on new violations or stale baseline rows).
 * @param {Object} [options] Forwarded to {@link lintConfigTemplateSsot}.
 * @returns {{exitCode: Number, violations: Object[], newViolations: Object[], staleBaseline: Object[], testConfig: Object}}
 */
export async function runLint(options = {}) {
    const {
              rootDir                = ROOT_DIR,
              files,
              baseline               = BASELINE,
              implementationFiles,
              implementationBaseline = AI_CONFIG_IMPLEMENTATION_BASELINE,
              moduleScopeFiles,
              moduleScopeBaseline    = AI_CONFIG_MODULE_SCOPE_BASELINE,
              testConfigFiles
          } = options,
          result               = lintConfigTemplateSsot({rootDir, files, baseline}),
          implementationResult = lintAiConfigImplementationSsot({
              rootDir,
              files   : implementationFiles,
              baseline: implementationBaseline
          }),
          moduleScopeResult = await lintAiConfigModuleScopeCaptures({
              rootDir,
              files   : moduleScopeFiles,
              baseline: moduleScopeBaseline
          }),
          testConfigResult = lintTestConfigAuthority({rootDir, files: testConfigFiles}),
          parityResult     = await detectConfigLeafParityViolations({rootDir}),
          composeDefaultViolations = await detectComposeDefaultRestatements({rootDir}),
          projectionViolations     = await detectUnprojectedBehaviorBindingClocks({rootDir}),
          {violations, newViolations, staleBaseline} = result,
          hasImplementationFailures = implementationResult.newViolations.length > 0 ||
              implementationResult.staleBaseline.length > 0,
          hasModuleScopeFailures = moduleScopeResult.newViolations.length > 0 ||
              moduleScopeResult.staleBaseline.length > 0,
          hasTestConfigFailures = testConfigResult.violations.length > 0,
          hasComposeDefaultFailures = composeDefaultViolations.length > 0,
          hasProjectionFailures     = projectionViolations.length > 0,
          hasParityFailures = Object.keys(parityResult.missing).length > 0 ||
              Object.keys(parityResult.added).length > 0 ||
              Object.keys(parityResult.errors || {}).length > 0 ||
              parityResult.untracked.length > 0 || parityResult.vanished.length > 0;

    if (hasParityFailures) {
        reportConfigLeafParity(parityResult)
    }

    if (hasComposeDefaultFailures) {
        reportComposeDefaultRestatements(composeDefaultViolations)
    }

    if (hasProjectionFailures) {
        reportUnprojectedBehaviorBindingClocks(projectionViolations)
    }

    if (newViolations.length === 0 && staleBaseline.length === 0 && !hasImplementationFailures &&
        !hasModuleScopeFailures && !hasTestConfigFailures && !hasParityFailures &&
        !hasComposeDefaultFailures && !hasProjectionFailures
    ) {
        console.log(`[lint-config-template-ssot] OK - ${violations.length} inline-env leaf default(s), ${implementationResult.violations.length} AiConfig implementation SSOT hit(s), ${moduleScopeResult.violations.length} module-scope AiConfig capture(s), ${testConfigResult.violations.length} test config-authority violation(s), all baselined or target-zero.`);
        return {
            exitCode: 0,
            ...result,
            implementation : implementationResult,
            moduleScope    : moduleScopeResult,
            testConfig     : testConfigResult,
            composeDefaults: {violations: composeDefaultViolations},
            projection     : {violations: projectionViolations}
        };
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

    if (implementationResult.newViolations.length > 0) {
        console.error(`[lint-config-template-ssot] FAILED - ${implementationResult.newViolations.length} new AiConfig implementation SSOT violation(s):\n`);

        for (const v of implementationResult.newViolations) {
            console.error(`- ${v.file}:${v.line}  (${v.kind})`);
            console.error(`    ${v.text}`);
        }

        console.error(`\n${AI_CONFIG_FIX_HINT}\n`);
    }

    if (implementationResult.staleBaseline.length > 0) {
        console.error(`[lint-config-template-ssot] FAILED - ${implementationResult.staleBaseline.length} AiConfig implementation baseline row(s) no longer match live code (cleanup landed — remove the row):\n`);

        for (const b of implementationResult.staleBaseline) {
            console.error(`- ${b.file}::${b.kind}::${b.text}  (${b.ticket})`);
        }

        console.error('');
    }

    if (moduleScopeResult.newViolations.length > 0) {
        console.error(`[lint-config-template-ssot] FAILED - ${moduleScopeResult.newViolations.length} new module-scope AiConfig capture(s):\n`);

        for (const v of moduleScopeResult.newViolations) {
            console.error(`- ${v.file}:${v.line}  (${v.kind})`);
            console.error(`    ${v.text}`);
        }

        console.error(`\n${AI_CONFIG_MODULE_SCOPE_FIX_HINT}\n`);
    }

    if (moduleScopeResult.staleBaseline.length > 0) {
        console.error(`[lint-config-template-ssot] FAILED - ${moduleScopeResult.staleBaseline.length} module-scope AiConfig baseline row(s) no longer match live code (cleanup landed — remove the row):\n`);

        for (const b of moduleScopeResult.staleBaseline) {
            console.error(`- ${b.file}::${b.kind}::${b.text}  (${b.ticket})`);
        }

        console.error('');
    }

    if (testConfigResult.violations.length > 0) {
        console.error(`[lint-config-template-ssot] FAILED - ${testConfigResult.violations.length} test config-authority violation(s):\n`);

        for (const v of testConfigResult.violations) {
            console.error(`- ${v.file}:${v.line}:${v.column}  (${v.kind})`);
            console.error(`    ${v.text}`);
        }

        console.error(`\n${TEST_CONFIG_OVERLAY_FIX_HINT}\n`);
    }

    return {
        exitCode: 1,
        ...result,
        implementation : implementationResult,
        moduleScope    : moduleScopeResult,
        testConfig     : testConfigResult,
        composeDefaults: {violations: composeDefaultViolations}
    };
}

async function main() {
    const arg = process.argv[2];

    if (arg === '--help' || arg === '-h') {
        console.log('Usage: node ai/scripts/lint/lint-config-template-ssot.mjs');
        console.log('');
        console.log('Fails when a config.template.mjs leaf default reads process.env inline');
        console.log('(outside the BASELINE), when a BASELINE row no longer matches a violation,');
        console.log('when ai/ implementation code adds mechanical ADR-19 AiConfig SSOT violations,');
        console.log('when ai/ implementation code adds module-scope AiConfig leaf captures,');
        console.log('when test code imports an ignored overlay / exports a config-template-derived authority,');
        console.log('when Compose restates a config default / derived-retired env,');
        console.log('or when a declared config path leaves a template surface without updating the snapshot.');
        console.log('');
        console.log('  --update-parity   rewrite the config-leaf-parity snapshot from the live templates');
        process.exit(0);
    }

    if (arg === '--update-parity') {
        // Deliberately NOT a --fix: this rewrites the record of what the repo declares, so it must be
        // an explicit act whose diff a reviewer reads. A flag that silently reconciled on every lint
        // run would turn the guard into a rubber stamp for the exact removal it exists to catch.
        const
            parityPath = path.join(ROOT_DIR, CONFIG_LEAF_PARITY_REL),
            current    = fs.existsSync(parityPath) ? JSON.parse(fs.readFileSync(parityPath, 'utf8')) : {},
            reserved   = Object.fromEntries(Object.entries(current).filter(([key]) => key.startsWith('$'))),
            snapshot   = await buildConfigLeafParitySnapshot(),
            total      = Object.values(snapshot).reduce((sum, paths) => sum + (Array.isArray(paths) ? paths.length : 0), 0);

        if (Object.values(snapshot).some(paths => !Array.isArray(paths))) {
            console.error('[lint-config-template-ssot] parity update REFUSED: at least one template could not be resolved (see errors above) — the snapshot would record an unverifiable surface. Resolve the declaration form first.');
            process.exit(1);
        }

        fs.writeFileSync(parityPath, `${JSON.stringify({...reserved, ...snapshot}, null, 4)}\n`);
        console.log(`[lint-config-template-ssot] parity snapshot updated: ${Object.keys(snapshot).length} template(s), ${total} declared path(s).`);
        console.log('Commit it in the SAME commit as the change it records.');
        process.exit(0);
    }

    const {exitCode} = await runLint();
    process.exit(exitCode);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main();
}
