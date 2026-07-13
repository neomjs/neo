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

import {parse} from 'acorn';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, '../../..');

const CONFIG_TEMPLATE_BASENAME           = 'config.template.mjs';
const CONFIG_OVERLAY_BASENAME            = 'config.mjs';
const SCAN_ROOT_REL                      = 'ai';
const TEST_SCAN_ROOT_REL                 = 'test';
const SELF_REL_FILE                      = 'ai/scripts/lint/lint-config-template-ssot.mjs';
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
    },
    {
        file  : 'ai/daemons/orchestrator/services/TenantRepoSyncService.mjs',
        kind  : 'config-parameter-default',
        text  : 'async resolveTenantReposConfig({tier1MirrorRoot, orchestratorConfig = AiConfig.orchestrator, env = process.env, ingestionService} = {}) {',
        ticket: '#13939',
        reason: 'Existing test seam; cleanup belongs to the #12456 fan-out.'
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
        } else if (entry.name === CONFIG_TEMPLATE_BASENAME) {
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
 * @param {String} templatePath Absolute template path.
 * @returns {{primitiveLeafPaths: Set<String>, liveProxyPaths: Set<String>}}
 */
function getConfigPathKindsForTemplate(templatePath) {
    const key = normalizeFile(templatePath);

    if (!CONFIG_TEMPLATE_KIND_CACHE.has(key)) {
        CONFIG_TEMPLATE_KIND_CACHE.set(
            key,
            collectConfigPathKindsFromSource(fs.readFileSync(templatePath, 'utf8'))
        );
    }

    return CONFIG_TEMPLATE_KIND_CACHE.get(key);
}

/**
 * @summary Maps imported config identifiers in one implementation file to config path kinds.
 * @param {Object} options
 * @param {String} [options.rootDir] Repo root.
 * @param {String} options.file Repo-relative file.
 * @param {String} options.source File source.
 * @returns {Map<String,{primitiveLeafPaths: Set<String>, liveProxyPaths: Set<String>}>}
 */
export function buildConfigPathKindsByIdentifier({rootDir = ROOT_DIR, file, source} = {}) {
    const out = new Map();

    if (!file || !source) return out;

    for (const match of source.matchAll(/\bimport\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]*config\.mjs)['"]/g)) {
        const template = resolveConfigTemplatePath({rootDir, file, specifier: match[2]});
        if (template) {
            out.set(match[1], getConfigPathKindsForTemplate(template));
        }
    }

    for (const match of source.matchAll(/\bimport\s*\{([^}]+)\}\s*from\s+['"]([^'"]*services\.mjs)['"]/g)) {
        for (const rawBinding of match[1].split(',')) {
            const binding = rawBinding.trim();
            if (!binding) continue;

            const [imported, alias] = binding.split(/\s+as\s+/),
                  rel               = SERVICE_EXPORT_CONFIG_TEMPLATE_REL[imported];

            if (rel) {
                out.set(alias || imported, getConfigPathKindsForTemplate(path.join(rootDir, rel)));
            }
        }
    }

    if (!out.has('AiConfig')) {
        const rootTemplate = path.join(rootDir, 'ai/config.template.mjs');
        if (fs.existsSync(rootTemplate)) {
            out.set('AiConfig', getConfigPathKindsForTemplate(rootTemplate));
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
export function lintAiConfigModuleScopeCaptures({
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

        const configPathKindsByIdentifier = buildConfigPathKindsByIdentifier({rootDir, file, source});

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
export function runLint(options = {}) {
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
          moduleScopeResult = lintAiConfigModuleScopeCaptures({
              rootDir,
              files   : moduleScopeFiles,
              baseline: moduleScopeBaseline
          }),
          testConfigResult = lintTestConfigAuthority({rootDir, files: testConfigFiles}),
          {violations, newViolations, staleBaseline} = result,
          hasImplementationFailures = implementationResult.newViolations.length > 0 ||
              implementationResult.staleBaseline.length > 0,
          hasModuleScopeFailures = moduleScopeResult.newViolations.length > 0 ||
              moduleScopeResult.staleBaseline.length > 0,
          hasTestConfigFailures = testConfigResult.violations.length > 0;

    if (newViolations.length === 0 && staleBaseline.length === 0 && !hasImplementationFailures &&
        !hasModuleScopeFailures && !hasTestConfigFailures
    ) {
        console.log(`[lint-config-template-ssot] OK - ${violations.length} inline-env leaf default(s), ${implementationResult.violations.length} AiConfig implementation SSOT hit(s), ${moduleScopeResult.violations.length} module-scope AiConfig capture(s), ${testConfigResult.violations.length} test config-authority violation(s), all baselined or target-zero.`);
        return {
            exitCode: 0,
            ...result,
            implementation: implementationResult,
            moduleScope   : moduleScopeResult,
            testConfig    : testConfigResult
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
        implementation: implementationResult,
        moduleScope   : moduleScopeResult,
        testConfig    : testConfigResult
    };
}

function main() {
    const arg = process.argv[2];

    if (arg === '--help' || arg === '-h') {
        console.log('Usage: node ai/scripts/lint/lint-config-template-ssot.mjs');
        console.log('');
        console.log('Fails when a config.template.mjs leaf default reads process.env inline');
        console.log('(outside the BASELINE), when a BASELINE row no longer matches a violation,');
        console.log('when ai/ implementation code adds mechanical ADR-19 AiConfig SSOT violations,');
        console.log('when ai/ implementation code adds module-scope AiConfig leaf captures,');
        console.log('or when test code imports an ignored overlay / exports a config-template-derived authority.');
        process.exit(0);
    }

    const {exitCode} = runLint();
    process.exit(exitCode);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main();
}
