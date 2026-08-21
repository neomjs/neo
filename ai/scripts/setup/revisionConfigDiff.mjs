import {execFileSync, spawnSync}                 from 'node:child_process';
import path                                      from 'node:path';
import {fileURLToPath}                           from 'node:url';
import * as acorn                                from 'acorn';
import {classifyRequirement, diffCohortLeafSets} from './cohortAdmissibility.mjs';

/**
 * @module ai/scripts/setup/revisionConfigDiff
 * @summary Compares declared AiConfig inputs across two immutable Git revisions without executing
 * either revision. Revision-local config surfaces are acquired from git objects, statically parsed,
 * and reported as added, removed, or same-path declaration changes in one JSON receipt.
 */

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const TEMPLATE_RE  = /^ai\/mcp\/server\/([^/]+)\/config\.template\.mjs$/;
const AST_IGNORED  = new Set(['start', 'end', 'loc', 'raw']);

/**
 * @summary Closed receipt schema for revision-aware declared-config diffs.
 * @type {String}
 */
export const REVISION_CONFIG_DIFF_SCHEMA_VERSION = 'revision-config-diff.v1';

/**
 * @summary First Neo revision where every template-backed MCP server uses the AiConfig configBase model.
 * @type {String}
 */
export const REVISION_CONFIG_DIFF_SUPPORTED_FROM_REVISION = '4749eef99e044afecae21c68be4ee8cf2f2f64d2';

/**
 * @summary Typed fail-loud boundary for revision/tree/object/declaration failures.
 */
export class RevisionConfigDiffError extends Error {
    /**
     * @param {String} message
     * @param {Object} [options]
     */
    constructor(message, options = {}) {
        super(message, options);
        this.name = 'RevisionConfigDiffError'
    }
}

/**
 * @summary Runs one read-only git command and preserves stderr in a typed diagnostic.
 * @param {String} repoRoot
 * @param {String[]} args
 * @returns {String}
 */
function runGit(repoRoot, args) {
    try {
        return execFileSync('git', ['-C', repoRoot, ...args], {
            encoding: 'utf8',
            stdio   : ['ignore', 'pipe', 'pipe']
        })
    } catch (error) {
        const detail = String(error.stderr ?? error.message ?? '').trim();

        throw new RevisionConfigDiffError(
            `revisionConfigDiff: git ${args[0]} failed${detail ? `: ${detail}` : ''}`,
            {cause: error}
        )
    }
}

/**
 * @summary Resolves a caller ref to an immutable commit SHA before reading any tree objects.
 * @param {String} revision
 * @param {String} repoRoot
 * @returns {String}
 */
function resolveRevision(revision, repoRoot) {
    if (typeof revision !== 'string' || revision.trim() === '') {
        throw new RevisionConfigDiffError('revisionConfigDiff: both revisions must be non-empty strings.')
    }

    return runGit(repoRoot, ['rev-parse', '--verify', `${revision}^{commit}`]).trim()
}

/**
 * @summary Refuses revisions outside the single configBase-supported history horizon.
 *
 * A template without a sibling base means corruption only AFTER this horizon. Before it, templates
 * used the retired legacy config model. Keeping the ancestry check separate prevents both conditions
 * from collapsing into the same misleading missing-base diagnostic.
 *
 * @param {Object} options
 * @param {String} options.repoRoot
 * @param {String} options.revision Resolved commit SHA.
 * @param {String} options.supportedFromRevision
 */
function assertSupportedRevision({repoRoot, revision, supportedFromRevision}) {
    const result = spawnSync('git', [
        '-C', repoRoot,
        'merge-base', '--is-ancestor', supportedFromRevision, revision
    ], {
        encoding: 'utf8',
        stdio   : ['ignore', 'pipe', 'pipe']
    });

    if (result.status === 0) return;

    if (result.status === 1) {
        throw new RevisionConfigDiffError(
            `revisionConfigDiff: ${revision} is pre-horizon and does not contain the supported ` +
            `configBase contract from ${supportedFromRevision}; choose revisions descending from that commit.`
        )
    }

    const detail = String(result.stderr ?? result.error?.message ?? '').trim();

    throw new RevisionConfigDiffError(
        `revisionConfigDiff: cannot verify supported configBase horizon ${supportedFromRevision}` +
        `${detail ? `: ${detail}` : '.'}`,
        {cause: result.error}
    )
}

/**
 * @summary Reads one git object without checking out or executing the revision.
 * @param {Object} options
 * @param {String} options.repoRoot
 * @param {String} options.revision Resolved commit SHA.
 * @param {String} options.filePath Repo-relative POSIX path.
 * @returns {String}
 */
function readRevisionObject({repoRoot, revision, filePath}) {
    return runGit(repoRoot, ['show', `${revision}:${filePath}`])
}

/**
 * @summary Discovers Tier 1 plus every server config surface declared by a template at ONE revision.
 *
 * Discovery is intentionally revision-local. The caller unions the two results; a whole server absent
 * from one readable tree is therefore a first-class add/remove, while a discovered template whose
 * sibling base cannot be read fails loud.
 *
 * @param {Object} options
 * @param {String} options.revision Resolved commit SHA.
 * @param {String} [options.repoRoot=PROJECT_ROOT]
 * @returns {Object[]} Sorted `{surface, configPath, templatePath}` rows.
 */
export function discoverRevisionConfigSurfaces({revision, repoRoot = PROJECT_ROOT} = {}) {
    const treePaths = runGit(repoRoot, [
        'ls-tree', '-r', '--name-only', revision, '--', 'ai/mcp/server'
    ]).split('\n').filter(Boolean);

    const surfaces = [{
        surface     : 'tier1',
        configPath  : 'ai/configBase.mjs',
        templatePath: null
    }];

    for (const templatePath of treePaths) {
        const match = templatePath.match(TEMPLATE_RE);

        if (!match) continue;

        surfaces.push({
            surface   : `server:${match[1]}`,
            configPath: `ai/mcp/server/${match[1]}/configBase.mjs`,
            templatePath
        })
    }

    return surfaces.sort((a, b) => a.surface.localeCompare(b.surface))
}

/**
 * @summary Returns a non-computed object-property name or fails on an unreadable declaration shape.
 * @param {Object} property
 * @param {String} filePath
 * @returns {String}
 */
function readPropertyName(property, filePath) {
    if (property.computed) {
        throw new RevisionConfigDiffError(
            `revisionConfigDiff: ${filePath} uses a computed config key; static identity would be ambiguous.`
        )
    }

    if (property.key?.type === 'Identifier') return property.key.name;
    if (property.key?.type === 'Literal' && typeof property.key.value === 'string') return property.key.value;

    throw new RevisionConfigDiffError(
        `revisionConfigDiff: ${filePath} contains a config key the static parser cannot name.`
    )
}

/**
 * @summary Finds the `static config = {data:{...}}` declaration without evaluating the module.
 * @param {Object} context Parsed module context.
 * @returns {Object} The `data` ObjectExpression.
 */
function findConfigDataObject(context) {
    const matches = [];

    for (const statement of context.ast.body) {
        if (statement.type !== 'ClassDeclaration') continue;

        for (const member of statement.body.body) {
            if (member.type !== 'PropertyDefinition' || !member.static || member.key?.name !== 'config') continue;
            if (member.value?.type !== 'ObjectExpression') {
                throw new RevisionConfigDiffError(
                    `revisionConfigDiff: ${context.filePath} declares static config in a non-object shape.`
                )
            }

            const dataProperty = member.value.properties.find(property =>
                property.type === 'Property' && readPropertyName(property, context.filePath) === 'data'
            );

            if (dataProperty) matches.push(dataProperty.value)
        }
    }

    if (matches.length !== 1 || matches[0]?.type !== 'ObjectExpression') {
        throw new RevisionConfigDiffError(
            `revisionConfigDiff: ${context.filePath} must expose exactly one literal static config.data tree.`
        )
    }

    return matches[0]
}

/**
 * @summary Canonical AST projection used to ignore whitespace/comments/raw quote style in defaults.
 * @param {*} value
 * @returns {*}
 */
function canonicalAst(value) {
    if (Array.isArray(value)) return value.map(canonicalAst);
    if (!value || typeof value !== 'object') return value;

    return Object.fromEntries(Object.keys(value)
        .filter(key => !AST_IGNORED.has(key))
        .sort()
        .map(key => [key, canonicalAst(value[key])]))
}

/**
 * @summary Creates or reuses one parsed module context from a revision's git objects.
 * @param {Object} state Loader state.
 * @param {String} filePath
 * @param {String} [source]
 * @returns {Object}
 */
function getModuleContext(state, filePath, source) {
    const normalized = path.posix.normalize(filePath);

    if (state.modules.has(normalized)) return state.modules.get(normalized);

    const moduleSource = source ?? readRevisionObject({
        repoRoot: state.repoRoot,
        revision: state.revision,
        filePath: normalized
    });

    let ast;

    try {
        ast = acorn.parse(moduleSource, {ecmaVersion: 'latest', sourceType: 'module'})
    } catch (error) {
        throw new RevisionConfigDiffError(
            `revisionConfigDiff: ${normalized} cannot be parsed statically: ${error.message}`,
            {cause: error}
        )
    }

    const context = {ast, filePath: normalized, source: moduleSource, state};

    state.modules.set(normalized, context);

    return context
}

/**
 * @summary Locates one local/imported/exported binding without evaluating revision code.
 * @param {Object} context
 * @param {String} name
 * @param {Set<String>} stack
 * @returns {{context:Object,node:Object}|{namespace:Object}}
 */
function resolveBinding(context, name, stack) {
    const bindingKey = `${context.filePath}#${name}`;

    if (stack.has(bindingKey)) {
        throw new RevisionConfigDiffError(`revisionConfigDiff: cyclic static binding ${bindingKey}.`)
    }

    stack.add(bindingKey);

    try {
        for (const statement of context.ast.body) {
            const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;

            if (declaration?.type === 'VariableDeclaration') {
                for (const declarator of declaration.declarations) {
                    if (declarator.id.type === 'Identifier' && declarator.id.name === name && declarator.init) {
                        return {context, node: declarator.init}
                    }
                }
            }

            if (statement.type === 'ImportDeclaration') {
                const specifier = statement.specifiers.find(item => item.local.name === name);

                if (!specifier) continue;
                if (!statement.source.value.startsWith('.')) {
                    throw new RevisionConfigDiffError(
                        `revisionConfigDiff: ${context.filePath} binds ${name} from a package; it is not a static config literal.`
                    )
                }

                const importedPath = path.posix.normalize(path.posix.join(
                    path.posix.dirname(context.filePath), statement.source.value
                ));
                const importedContext = getModuleContext(context.state, importedPath);

                if (specifier.type === 'ImportNamespaceSpecifier') return {namespace: importedContext};
                if (specifier.type === 'ImportDefaultSpecifier') {
                    throw new RevisionConfigDiffError(
                        `revisionConfigDiff: ${context.filePath} uses default import ${name} where a static literal is required.`
                    )
                }

                const importedName = specifier.imported.name ?? specifier.imported.value;

                return resolveExportedBinding(importedContext, importedName, stack)
            }
        }
    } finally {
        stack.delete(bindingKey)
    }

    throw new RevisionConfigDiffError(
        `revisionConfigDiff: ${context.filePath} cannot statically resolve identifier ${name}.`
    )
}

/**
 * @summary Resolves a named export, including `export {local as public}`.
 * @param {Object} context
 * @param {String} exportName
 * @param {Set<String>} stack
 * @returns {{context:Object,node:Object}|{namespace:Object}}
 */
function resolveExportedBinding(context, exportName, stack) {
    for (const statement of context.ast.body) {
        if (statement.type !== 'ExportNamedDeclaration') continue;

        if (statement.declaration?.type === 'VariableDeclaration') {
            const declarator = statement.declaration.declarations.find(item =>
                item.id.type === 'Identifier' && item.id.name === exportName
            );

            if (declarator?.init) return {context, node: declarator.init};
        }

        const specifier = statement.specifiers?.find(item =>
            (item.exported.name ?? item.exported.value) === exportName
        );

        if (specifier) {
            if (statement.source) {
                if (!statement.source.value.startsWith('.')) {
                    throw new RevisionConfigDiffError(
                        `revisionConfigDiff: ${context.filePath} re-exports ${exportName} from a package.`
                    )
                }

                const importedPath = path.posix.normalize(path.posix.join(
                    path.posix.dirname(context.filePath), statement.source.value
                ));

                return resolveExportedBinding(
                    getModuleContext(context.state, importedPath),
                    specifier.local.name ?? specifier.local.value,
                    stack
                )
            }

            return resolveBinding(context, specifier.local.name ?? specifier.local.value, stack)
        }
    }

    throw new RevisionConfigDiffError(
        `revisionConfigDiff: ${context.filePath} exports no static ${exportName} binding.`
    )
}

/**
 * @summary Evaluates the deliberately small literal grammar used by env/type/requiredFor metadata.
 * @param {Object} node
 * @param {Object} context
 * @param {Set<String>} [stack]
 * @returns {*}
 */
function evaluateStatic(node, context, stack = new Set()) {
    if (!node) return null;

    switch (node.type) {
        case 'Literal':
            return node.value
        case 'Identifier': {
            if (node.name === 'undefined') return undefined;
            const bindingKey = `${context.filePath}#${node.name}`;

            if (stack.has(bindingKey)) {
                throw new RevisionConfigDiffError(`revisionConfigDiff: cyclic static binding ${bindingKey}.`)
            }

            const nextStack = new Set(stack);
            nextStack.add(bindingKey);

            // Export/import alias cycles are independent from value-reference cycles, so the
            // binding lookup gets its own stack while value evaluation carries `nextStack`.
            const binding = resolveBinding(context, node.name, new Set());
            return binding.namespace ?? evaluateStatic(binding.node, binding.context, nextStack)
        }
        case 'ArrayExpression':
            return node.elements.map(element => evaluateStatic(element, context, stack))
        case 'ObjectExpression': {
            const value = {};

            for (const property of node.properties) {
                if (property.type !== 'Property' || property.kind !== 'init' || property.method) {
                    throw new RevisionConfigDiffError(
                        `revisionConfigDiff: ${context.filePath} contains non-literal metadata.`
                    )
                }

                value[readPropertyName(property, context.filePath)] = evaluateStatic(property.value, context, stack)
            }

            return value
        }
        case 'MemberExpression': {
            const object = evaluateStatic(node.object, context, stack);
            const key    = node.computed
                ? evaluateStatic(node.property, context, stack)
                : node.property.name;

            if (object?.ast && object?.filePath && object?.state) {
                const binding = resolveExportedBinding(object, String(key), stack);
                return binding.namespace ?? evaluateStatic(binding.node, binding.context, stack)
            }

            if (!object || !Object.hasOwn(object, key)) {
                throw new RevisionConfigDiffError(
                    `revisionConfigDiff: ${context.filePath} cannot statically resolve member ${String(key)}.`
                )
            }

            return object[key]
        }
        case 'TemplateLiteral':
            return node.quasis.reduce((output, quasi, index) =>
                output + quasi.value.cooked + (node.expressions[index]
                    ? String(evaluateStatic(node.expressions[index], context, stack))
                    : ''), '')
        case 'UnaryExpression': {
            const argument = evaluateStatic(node.argument, context, stack);
            if (node.operator === '+') return +argument;
            if (node.operator === '-') return -argument;
            if (node.operator === '!') return !argument;
            if (node.operator === '~') return ~argument;
            if (node.operator === 'void') return undefined;
            break
        }
        case 'BinaryExpression': {
            const left  = evaluateStatic(node.left, context, stack),
                  right = evaluateStatic(node.right, context, stack);

            if (node.operator === '+') return left + right;
            if (node.operator === '-') return left - right;
            if (node.operator === '*') return left * right;
            if (node.operator === '/') return left / right;
            if (node.operator === '%') return left % right;
            if (node.operator === '**') return left ** right;
            break
        }
        case 'ConditionalExpression':
            return evaluateStatic(node.test, context, stack)
                ? evaluateStatic(node.consequent, context, stack)
                : evaluateStatic(node.alternate, context, stack)
        case 'CallExpression':
            if (node.callee.type === 'MemberExpression' && !node.callee.computed &&
                node.callee.object.name === 'Object' && node.callee.property.name === 'freeze' &&
                node.arguments.length === 1) {
                return evaluateStatic(node.arguments[0], context, stack)
            }
            break
        case 'ChainExpression':
            return evaluateStatic(node.expression, context, stack)
    }

    throw new RevisionConfigDiffError(
        `revisionConfigDiff: ${context.filePath} uses unsupported static ${node.type} metadata.`
    )
}

/**
 * @summary Follows a local metadata binding to its object expression without evaluating parser hooks.
 * @param {Object|null} node
 * @param {Object} context
 * @returns {Object|null}
 */
function resolveMetadataObject(node, context) {
    if (!node || (node.type === 'Literal' && node.value === null)) return null;
    if (node.type === 'ObjectExpression') return node;

    if (node.type === 'Identifier') {
        const binding = resolveBinding(context, node.name, new Set());

        if (!binding.namespace) return resolveMetadataObject(binding.node, binding.context)
    }

    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' &&
        node.callee.object.name === 'Object' && node.callee.property.name === 'freeze') {
        return resolveMetadataObject(node.arguments[0], context)
    }

    throw new RevisionConfigDiffError(
        `revisionConfigDiff: ${context.filePath} uses metadata the static parser cannot inspect.`
    )
}

/**
 * @summary Reads only `requiredFor` from metadata; parser functions and other runtime hooks are ignored.
 * @param {Object|null} node
 * @param {Object} context
 * @returns {Object[]}
 */
function readRequiredFor(node, context) {
    const metadata = resolveMetadataObject(node, context);

    if (!metadata) return [];

    for (const property of metadata.properties) {
        if (property.type !== 'Property') {
            throw new RevisionConfigDiffError(
                `revisionConfigDiff: ${context.filePath} spreads metadata; requiredness cannot be certified.`
            )
        }

        if (readPropertyName(property, context.filePath) !== 'requiredFor') continue;

        const value = evaluateStatic(property.value, context);

        if (!value || (typeof value !== 'object')) {
            throw new RevisionConfigDiffError(
                `revisionConfigDiff: ${context.filePath} declares requiredFor in a non-object shape.`
            )
        }

        return Array.isArray(value) ? value : [value]
    }

    return []
}

/**
 * @summary Normalized default fingerprint: syntax plus any statically resolvable bound value.
 * @param {Object} node
 * @param {Object} context
 * @returns {String}
 */
function fingerprintDefault(node, context) {
    let staticValue;

    try {
        staticValue = {resolved: evaluateStatic(node, context)}
    } catch (error) {
        if (!(error instanceof RevisionConfigDiffError)) throw error;
        staticValue = {}
    }

    return JSON.stringify({ast: canonicalAst(node), ...staticValue})
}

/**
 * @summary Parses one config base into a nested descriptor tree and full-path descriptor map.
 * @param {Object} options
 * @param {String} options.source
 * @param {String} options.filePath
 * @param {String} options.surface
 * @param {Object} options.state Revision loader state.
 * @returns {{surface:String,filePath:String,data:Object,leaves:Map<String,Object>}}
 */
export function parseDeclaredConfigSource({source, filePath, surface, state} = {}) {
    if (!state) {
        state = {
            modules : new Map(),
            repoRoot: PROJECT_ROOT,
            revision: 'WORKTREE'
        }
    }

    const context  = getModuleContext(state, filePath, source),
          dataNode = findConfigDataObject(context),
          leaves   = new Map();

    const walk = (objectNode, prefix = '') => {
        const data = {};

        for (const property of objectNode.properties) {
            if (property.type !== 'Property' || property.kind !== 'init' || property.method) {
                throw new RevisionConfigDiffError(
                    `revisionConfigDiff: ${filePath} contains a spread/method in config.data.`
                )
            }

            const key      = readPropertyName(property, filePath),
                  leafPath = prefix ? `${prefix}.${key}` : key,
                  value    = property.value;

            if (value.type === 'ObjectExpression') {
                data[key] = walk(value, leafPath);
                continue
            }

            if (value.type !== 'CallExpression' || value.callee.type !== 'Identifier' || value.callee.name !== 'leaf') {
                throw new RevisionConfigDiffError(
                    `revisionConfigDiff: ${filePath} config leaf ${leafPath} is not a literal leaf(...) call.`
                )
            }

            if (value.arguments.length === 0 || value.arguments.length > 4) {
                throw new RevisionConfigDiffError(
                    `revisionConfigDiff: ${filePath} leaf ${leafPath} has an unsupported argument shape.`
                )
            }

            const defaultNode       = value.arguments[0],
                  env               = value.arguments[1] ? evaluateStatic(value.arguments[1], context) : null,
                  type              = value.arguments[2] ? evaluateStatic(value.arguments[2], context) : null,
                  requirements      = readRequiredFor(value.arguments[3], context),
                  defaultExpression = source.slice(defaultNode.start, defaultNode.end).trim(),
                  descriptor        = {
                      default: defaultExpression,
                      env,
                      type
                  };

            if (!(env === null || typeof env === 'string')) {
                throw new RevisionConfigDiffError(
                    `revisionConfigDiff: ${filePath} leaf ${leafPath} env is not a static string/null.`
                )
            }
            if (!(type === null || typeof type === 'string')) {
                throw new RevisionConfigDiffError(
                    `revisionConfigDiff: ${filePath} leaf ${leafPath} type is not a static string/null.`
                )
            }

            data[key] = descriptor;
            leaves.set(leafPath, {
                defaultExpression,
                defaultFingerprint: fingerprintDefault(defaultNode, context),
                env,
                leafPath,
                requirements,
                surface,
                type
            })
        }

        return data
    };

    const data = walk(dataNode);

    if (leaves.size === 0) {
        throw new RevisionConfigDiffError(
            `revisionConfigDiff: ${filePath} yielded zero leaves; this is an unreadable declaration, not an empty surface.`
        )
    }

    return {surface, filePath, data, leaves}
}

/**
 * @summary Loads all declared config surfaces for one immutable revision.
 * @param {Object} options
 * @param {String} options.revision
 * @param {String} [options.repoRoot=PROJECT_ROOT]
 * @param {String} [options.supportedFromRevision=REVISION_CONFIG_DIFF_SUPPORTED_FROM_REVISION]
 * @returns {{requestedRevision:String,resolvedRevision:String,surfaces:Map<String,Object>}}
 */
export function loadRevisionConfig({
    revision,
    repoRoot = PROJECT_ROOT,
    supportedFromRevision = REVISION_CONFIG_DIFF_SUPPORTED_FROM_REVISION
} = {}) {
    const resolvedRevision = resolveRevision(revision, repoRoot),
          state            = {modules: new Map(), repoRoot, revision: resolvedRevision},
          surfaces         = new Map();

    assertSupportedRevision({repoRoot, revision: resolvedRevision, supportedFromRevision});

    const discovered = discoverRevisionConfigSurfaces({revision: resolvedRevision, repoRoot});

    for (const entry of discovered) {
        let source;

        try {
            source = readRevisionObject({repoRoot, revision: resolvedRevision, filePath: entry.configPath})
        } catch (error) {
            if (entry.templatePath) {
                throw new RevisionConfigDiffError(
                    `revisionConfigDiff: ${resolvedRevision} declares ${entry.templatePath} but its sibling ${entry.configPath} is unreadable.`,
                    {cause: error}
                )
            }
            throw error
        }

        surfaces.set(entry.surface, parseDeclaredConfigSource({
            source,
            filePath: entry.configPath,
            surface : entry.surface,
            state
        }))
    }

    return {requestedRevision: revision, resolvedRevision, surfaces}
}

/**
 * @summary Four-way applicability classification for one newly introduced leaf.
 * @param {Object} leaf
 * @param {Object} target
 * @returns {Object} `{verdict, unknownAxes}` applicability receipt.
 */
export function classifyAddedLeaf(leaf, target = {}) {
    if (leaf.requirements.length === 0) {
        return {verdict: 'defaulted', unknownAxes: []}
    }

    const results = leaf.requirements.map(requirement => classifyRequirement(requirement, target));

    if (results.some(result => result.verdict === 'applies')) {
        return {verdict: 'required', unknownAxes: []}
    }

    const unknownAxes = [...new Set(results
        .filter(result => result.verdict === 'indeterminate')
        .flatMap(result => result.unknownAxes))].sort();

    return unknownAxes.length > 0
        ? {verdict: 'indeterminate', unknownAxes}
        : {verdict: 'not-required-for-target', unknownAxes: []}
}

/**
 * @summary Composes the existing path-set differ per surface, then adds same-path axis changes.
 * @param {Object} options
 * @param {Map<String,Object>} options.fromSurfaces
 * @param {Map<String,Object>} options.toSurfaces
 * @param {Object} [options.target={}]
 * @param {Function} [options.diffLeafSetsFn=diffCohortLeafSets] Explicit composition seam.
 * @returns {{added:Object[],removed:Object[],changed:Object[]}}
 */
export function diffDeclaredConfigSurfaces({
    fromSurfaces,
    toSurfaces,
    target = {},
    diffLeafSetsFn = diffCohortLeafSets
} = {}) {
    const added        = [], removed = [], changed = [];
    const surfaceNames = [...new Set([
        ...fromSurfaces.keys(),
        ...toSurfaces.keys()
    ])].sort();

    for (const surface of surfaceNames) {
        const from    = fromSurfaces.get(surface),
              to      = toSurfaces.get(surface),
              setDiff = diffLeafSetsFn({fromData: from?.data ?? {}, toData: to?.data ?? {}});

        for (const row of setDiff.introduced) {
            const leaf = to.leaves.get(row.leafPath);

            added.push({
                surface,
                leafPath         : row.leafPath,
                env              : leaf.env,
                type             : leaf.type,
                defaultExpression: leaf.defaultExpression,
                applicability    : classifyAddedLeaf(leaf, target),
                requirements     : leaf.requirements
            })
        }

        for (const row of setDiff.retired) {
            const leaf = from.leaves.get(row.leafPath);

            removed.push({
                surface,
                leafPath         : row.leafPath,
                env              : leaf.env,
                type             : leaf.type,
                defaultExpression: leaf.defaultExpression
            })
        }

        if (!from || !to) continue;

        for (const [leafPath, before] of from.leaves) {
            const after = to.leaves.get(leafPath);

            if (!after) continue;

            const changes = {};

            if (before.defaultFingerprint !== after.defaultFingerprint) {
                changes.default = {
                    from: before.defaultExpression,
                    to  : after.defaultExpression
                }
            }
            if (before.env !== after.env) changes.env = {from: before.env, to: after.env};
            if (before.type !== after.type) changes.type = {from: before.type, to: after.type};

            if (Object.keys(changes).length > 0) changed.push({surface, leafPath, changes})
        }
    }

    const sortRows = rows => rows.sort((a, b) =>
        a.surface.localeCompare(b.surface) || a.leafPath.localeCompare(b.leafPath)
    );

    return {
        added  : sortRows(added),
        removed: sortRows(removed),
        changed: sortRows(changed)
    }
}

/**
 * @summary Produces the closed revision-config-diff receipt without executing either revision.
 * @param {Object} options
 * @param {String} options.fromRevision
 * @param {String} options.toRevision
 * @param {String} [options.repoRoot=PROJECT_ROOT]
 * @param {Object} [options.target={}]
 * @param {Function} [options.diffLeafSetsFn=diffCohortLeafSets]
 * @param {String} [options.supportedFromRevision=REVISION_CONFIG_DIFF_SUPPORTED_FROM_REVISION]
 * @returns {Object}
 */
export function diffRevisionConfig({
    fromRevision,
    toRevision,
    repoRoot = PROJECT_ROOT,
    target = {},
    diffLeafSetsFn = diffCohortLeafSets,
    supportedFromRevision = REVISION_CONFIG_DIFF_SUPPORTED_FROM_REVISION
} = {}) {
    const from             = loadRevisionConfig({revision: fromRevision, repoRoot, supportedFromRevision}),
          to               = loadRevisionConfig({revision: toRevision, repoRoot, supportedFromRevision}),
          normalizedTarget = {
              entrypoint: target.entrypoint ?? null,
              mode      : target.mode ?? null,
              // `null` means the caller did not state this constrained axis. An explicit empty array
              // instead means the target claims nothing. Collapsing both to `[]` turns unknown into
              // not-required-for-target, the exact fail-open classification this receipt forbids.
              consumerClaims: target.consumerClaims == null
                  ? null
                  : [...new Set(target.consumerClaims)].sort()
          };

    return {
        schemaVersion: REVISION_CONFIG_DIFF_SCHEMA_VERSION,
        from         : {
            requested: from.requestedRevision,
            resolved : from.resolvedRevision,
            surfaces : [...from.surfaces.keys()].sort()
        },
        to: {
            requested: to.requestedRevision,
            resolved : to.resolvedRevision,
            surfaces : [...to.surfaces.keys()].sort()
        },
        target: normalizedTarget,
        ...diffDeclaredConfigSurfaces({
            fromSurfaces: from.surfaces,
            toSurfaces  : to.surfaces,
            target      : normalizedTarget,
            diffLeafSetsFn
        })
    }
}

/**
 * @summary Parses the direct operator CLI; target flags affect requiredness only.
 * @param {String[]} argv
 * @returns {Object}
 */
export function parseRevisionConfigDiffArgs(argv = []) {
    const options = {};

    for (let index = 0; index < argv.length; index++) {
        const flag = argv[index];

        if (flag === '--help') {
            options.help = true;
            continue
        }

        if (!['--from', '--to', '--entrypoint', '--mode', '--consumer-claim'].includes(flag)) {
            throw new RevisionConfigDiffError(`revisionConfigDiff: unknown argument ${flag}.`)
        }

        const value = argv[++index];

        if (!value || value.startsWith('--')) {
            throw new RevisionConfigDiffError(`revisionConfigDiff: ${flag} requires a value.`)
        }

        if (flag === '--from') options.fromRevision = value;
        if (flag === '--to') options.toRevision = value;
        if (flag === '--entrypoint') options.entrypoint = value;
        if (flag === '--mode') options.mode = value;
        if (flag === '--consumer-claim') (options.consumerClaims ??= []).push(value)
    }

    if (!options.help && (!options.fromRevision || !options.toRevision)) {
        throw new RevisionConfigDiffError('revisionConfigDiff: --from and --to are required.')
    }

    return options
}

/**
 * @summary Direct JSON operator entrypoint. Successful non-empty diffs still exit zero.
 * @param {Object} [options]
 * @param {String[]} [options.argv=process.argv.slice(2)]
 * @param {String} [options.repoRoot=process.cwd()]
 * @param {NodeJS.WritableStream} [options.stdout=process.stdout]
 * @param {String} [options.supportedFromRevision=REVISION_CONFIG_DIFF_SUPPORTED_FROM_REVISION]
 * @returns {Object|null}
 */
export function main({
    argv = process.argv.slice(2),
    repoRoot = process.cwd(),
    stdout = process.stdout,
    supportedFromRevision = REVISION_CONFIG_DIFF_SUPPORTED_FROM_REVISION
} = {}) {
    const options = parseRevisionConfigDiffArgs(argv);

    if (options.help) {
        stdout.write(
            'Usage: node ai/scripts/setup/revisionConfigDiff.mjs --from <ref> --to <ref> ' +
            '[--entrypoint <name>] [--mode <name>] [--consumer-claim <name> ...]\n'
        );
        return null
    }

    const receipt = diffRevisionConfig({
        fromRevision: options.fromRevision,
        toRevision  : options.toRevision,
        repoRoot,
        supportedFromRevision,
        target      : {
            entrypoint    : options.entrypoint,
            mode          : options.mode,
            consumerClaims: options.consumerClaims
        }
    });

    stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);

    return receipt
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    try {
        main()
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1
    }
}
