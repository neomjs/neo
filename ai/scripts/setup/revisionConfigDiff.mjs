import {execFileSync, spawnSync}                 from 'node:child_process';
import {createHash}                              from 'node:crypto';
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

/**
 * @typedef {Object} RevisionConfigDiffRevision
 * @property {String} requested Caller-supplied ref.
 * @property {String} resolved Immutable commit SHA.
 * @property {String[]} surfaces Sorted declared surface identities.
 */

/**
 * @typedef {Object} RevisionConfigDiffTarget
 * @property {String|null} entrypoint
 * @property {String|null} mode
 * @property {String[]|null} consumerClaims
 */

/**
 * @typedef {Object} RevisionConfigDiffAddedRow
 * @property {String} surface
 * @property {String} leafPath
 * @property {String|null} env
 * @property {String|null} type
 * @property {String} defaultExpression
 * @property {{verdict:String,unknownAxes:String[]}} applicability
 * @property {Object[]} requirements
 */

/**
 * @typedef {Object} RevisionConfigDiffRemovedRow
 * @property {String} surface
 * @property {String} leafPath
 * @property {String|null} env
 * @property {String|null} type
 * @property {String} defaultExpression
 */

/**
 * @typedef {Object} RevisionConfigDiffChangedRow
 * @property {String} surface
 * @property {String} leafPath
 * @property {Object} changes Closed changed axes: `default`, `env`, `type`, `requiredFor`, `decoder`.
 */

/**
 * @typedef {Object} RevisionConfigDiffPayload
 * @property {RevisionConfigDiffRevision} from
 * @property {RevisionConfigDiffRevision} to
 * @property {RevisionConfigDiffTarget} target
 * @property {RevisionConfigDiffAddedRow[]} added
 * @property {RevisionConfigDiffRemovedRow[]} removed
 * @property {RevisionConfigDiffChangedRow[]} changed
 */

/**
 * @typedef {RevisionConfigDiffPayload} RevisionConfigDiffReceipt
 * @property {'revision-config-diff.v1'} schemaVersion
 */

/**
 * @typedef {Object} RevisionConfigDefaultProjection
 * @property {String} fingerprint
 * @property {String} resolution `static` or `dependency`.
 * @property {*} value Canonical resolved value, or `null` for dependency projection.
 */

const __filename          = fileURLToPath(import.meta.url);
const __dirname           = path.dirname(__filename);
const PROJECT_ROOT        = path.resolve(__dirname, '../../..');
const TEMPLATE_RE         = /^ai\/mcp\/server\/([^/]+)\/config\.template\.mjs$/;
const AST_IGNORED         = new Set(['start', 'end', 'loc', 'raw']);
const STATIC_GLOBAL_NAMES = new Set([
    'Array', 'ArrayBuffer', 'BigInt', 'Boolean', 'Buffer', 'Date', 'Error', 'EvalError', 'Intl',
    'JSON', 'Map', 'Math', 'Neo', 'Number', 'Object', 'Promise', 'Proxy', 'RangeError', 'ReferenceError',
    'Reflect', 'RegExp', 'Set', 'String', 'Symbol', 'SyntaxError', 'TypeError', 'URIError', 'URL',
    'URLSearchParams', 'WeakMap', 'WeakSet', 'clearInterval', 'clearTimeout', 'console', 'globalThis',
    'process', 'setInterval', 'setTimeout'
]);
const REVISION_CONFIG_DIFF_ERROR_CODE             = 'REVISION_CONFIG_DIFF_FAILED';
const REVISION_CONFIG_DIFF_STATIC_UNRESOLVED_CODE = 'REVISION_CONFIG_DIFF_STATIC_UNRESOLVED';
const DECODER_SOURCE_DIGEST_BOUND                 = 'decoder-own-source-text; imports excluded; formatting-sensitive';

/**
 * @summary Classifies a decoder binding transition without hiding boot-behaviour directionality.
 *
 * - `DECODER_BOUND`: `null` → decoder; a new parse/validation and possible boot-failure path.
 * - `DECODER_UNBOUND`: decoder → `null`; an existing validation gate disappears.
 * - `DECODER_REBOUND`: decoder A → decoder B; the leaf keeps a decoder but changes identity.
 *
 * Same-identity source changes are classified separately as `DECODER_BODY_CHANGED`. Nullish legacy
 * fields normalize to the same absence sentinel as current parser output.
 * @param {String|null|undefined} fromIdentity Decoder identity in the earlier revision.
 * @param {String|null|undefined} toIdentity Decoder identity in the later revision.
 * @returns {{kind: String, from: String|null, to: String|null}|null}
 */
function classifyDecoderBindingTransition(fromIdentity, toIdentity) {
    const from = fromIdentity ?? null,
          to   = toIdentity   ?? null;

    if (from === to) return null;

    const kind = from === null
        ? 'DECODER_BOUND'
        : to === null
            ? 'DECODER_UNBOUND'
            : 'DECODER_REBOUND';

    return {kind, from, to}
}

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
 * @summary Creates one stable coded error without inventing a nominal class hierarchy for a pure
 * data-plane script. Callers branch on `code`; prose remains operator-facing context.
 * @param {String} message
 * @param {Object} [options]
 * @param {Error} [options.cause]
 * @param {String} [options.code=REVISION_CONFIG_DIFF_ERROR_CODE]
 * @returns {Error}
 */
function createRevisionConfigDiffError(message, {
    cause,
    code = REVISION_CONFIG_DIFF_ERROR_CODE
} = {}) {
    const error = cause === undefined ? new Error(message) : new Error(message, {cause});

    error.code = code;

    return error
}

/**
 * @summary Distinguishes expected static-declaration limits from programmer/runtime failures.
 * @param {*} error
 * @param {String} [code] Specific code to match; omitted accepts either module-owned code.
 * @returns {Boolean}
 */
function isRevisionConfigDiffError(error, code) {
    return code
        ? error?.code === code
        : [REVISION_CONFIG_DIFF_ERROR_CODE, REVISION_CONFIG_DIFF_STATIC_UNRESOLVED_CODE].includes(error?.code)
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

        throw createRevisionConfigDiffError(
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
        throw createRevisionConfigDiffError('revisionConfigDiff: both revisions must be non-empty strings.')
    }

    return runGit(repoRoot, ['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`]).trim()
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
 * @param {String} [options.supportedFromRevision=REVISION_CONFIG_DIFF_SUPPORTED_FROM_REVISION]
 */
export function assertSupportedRevision({
    repoRoot,
    revision,
    supportedFromRevision = REVISION_CONFIG_DIFF_SUPPORTED_FROM_REVISION
}) {
    const result = spawnSync('git', [
        '-C', repoRoot,
        'merge-base', '--is-ancestor', supportedFromRevision, revision
    ], {
        encoding: 'utf8',
        stdio   : ['ignore', 'pipe', 'pipe']
    });

    if (result.status === 0) return;

    if (result.status === 1) {
        throw createRevisionConfigDiffError(
            `revisionConfigDiff: ${revision} is pre-horizon and does not contain the supported ` +
            `configBase contract from ${supportedFromRevision}; choose revisions descending from that commit.`
        )
    }

    const detail = String(result.stderr ?? result.error?.message ?? '').trim();

    throw createRevisionConfigDiffError(
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
function discoverRevisionConfigSurfaces({revision, repoRoot = PROJECT_ROOT} = {}) {
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
        throw createRevisionConfigDiffError(
            `revisionConfigDiff: ${filePath} uses a computed config key; static identity would be ambiguous.`
        )
    }

    if (property.key?.type === 'Identifier') return property.key.name;
    if (property.key?.type === 'Literal' && typeof property.key.value === 'string') return property.key.value;

    throw createRevisionConfigDiffError(
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
                throw createRevisionConfigDiffError(
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
        throw createRevisionConfigDiffError(
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
 * @summary Adds every identifier declared by one binding pattern to a local-name set.
 * @param {Object|null} pattern
 * @param {Set<String>} names
 * @returns {void}
 */
function addPatternNames(pattern, names) {
    if (!pattern) return;

    if (pattern.type === 'Identifier') {
        names.add(pattern.name);
        return
    }
    if (pattern.type === 'RestElement') {
        addPatternNames(pattern.argument, names);
        return
    }
    if (pattern.type === 'AssignmentPattern') {
        addPatternNames(pattern.left, names);
        return
    }
    if (pattern.type === 'ArrayPattern') {
        pattern.elements.forEach(item => addPatternNames(item, names));
        return
    }
    if (pattern.type === 'ObjectPattern') {
        pattern.properties.forEach(property => addPatternNames(
            property.type === 'RestElement' ? property.argument : property.value,
            names
        ))
    }
}

/**
 * @summary Whether an AST node opens a lexical function scope.
 * @param {Object|null} node
 * @returns {Boolean}
 */
function isFunctionNode(node) {
    return ['ArrowFunctionExpression', 'FunctionDeclaration', 'FunctionExpression'].includes(node?.type)
}

/**
 * @summary Collects one function's parameters and function-scoped declarations, never a nested body.
 * @param {Object} functionNode
 * @returns {Set<String>}
 */
function collectFunctionDefinedNames(functionNode) {
    const names = new Set();

    addPatternNames(functionNode.id, names);
    functionNode.params.forEach(param => addPatternNames(param, names));

    const walk = (node, root = false) => {
        if (!node || typeof node !== 'object') return;

        if (!root && isFunctionNode(node)) {
            if (node.type === 'FunctionDeclaration') addPatternNames(node.id, names);
            return
        }
        if (node.type === 'VariableDeclaration' && node.kind === 'var') {
            node.declarations.forEach(declaration => addPatternNames(declaration.id, names))
        }

        for (const [key, value] of Object.entries(node)) {
            if (AST_IGNORED.has(key)) continue;
            if (Array.isArray(value)) value.forEach(item => walk(item));
            else if (value && typeof value === 'object') walk(value)
        }
    };

    walk(functionNode, true);

    return names
}

/**
 * @summary Collects declarations owned directly by one block scope.
 * @param {Object} block
 * @returns {Set<String>}
 */
function collectBlockDefinedNames(block) {
    const names = new Set();

    for (const statement of block.body || []) {
        if (statement.type === 'VariableDeclaration' && statement.kind !== 'var') {
            statement.declarations.forEach(declaration => addPatternNames(declaration.id, names))
        } else if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') {
            addPatternNames(statement.id, names)
        }
    }

    return names
}

/**
 * @summary Whether an identifier node is a value reference rather than a declaration/property label.
 * @param {Object|null} parent
 * @param {String|null} key
 * @returns {Boolean}
 */
function isIdentifierReference(parent, key) {
    if (!parent) return true;

    if (parent.type === 'MetaProperty') return false;

    if (parent.type === 'MemberExpression' && key === 'property' && !parent.computed
    ) return false;

    if ((parent.type === 'Property' || parent.type === 'MethodDefinition' ||
        parent.type === 'PropertyDefinition') && key === 'key' && !parent.computed
    ) return false;

    return !(
        parent.type === 'VariableDeclarator' && key === 'id' ||
        (parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression' ||
            parent.type === 'ArrowFunctionExpression') && (key === 'id' || key === 'params') ||
        parent.type === 'LabeledStatement' && key === 'label' ||
        (parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') && key === 'label'
    )
}

/**
 * @summary Collects free identifier references from one expression or function declaration.
 * @param {Object|null} node
 * @param {Array<Set<String>>} [scopes]
 * @param {Set<String>} [references]
 * @param {Object|null} [parent]
 * @param {String|null} [parentKey]
 * @returns {Set<String>}
 */
function collectReferencedNames(
    node,
    scopes = [new Set()],
    references = new Set(),
    parent = null,
    parentKey = null
) {
    if (!node || typeof node !== 'object') return references;

    if (isFunctionNode(node)) {
        const functionScopes = [...scopes, collectFunctionDefinedNames(node)];

        for (const [key, value] of Object.entries(node)) {
            if (AST_IGNORED.has(key)) continue;
            if (Array.isArray(value)) {
                value.forEach(item => collectReferencedNames(item, functionScopes, references, node, key))
            } else if (value && typeof value === 'object') {
                collectReferencedNames(value, functionScopes, references, node, key)
            }
        }

        return references
    }

    if (node.type === 'BlockStatement') {
        scopes = [...scopes, collectBlockDefinedNames(node)]
    }

    if (node.type === 'Identifier' && isIdentifierReference(parent, parentKey) &&
        !scopes.some(scope => scope.has(node.name)) && node.name !== 'undefined'
    ) {
        references.add(node.name)
    }

    for (const [key, value] of Object.entries(node)) {
        if (AST_IGNORED.has(key)) continue;
        if (Array.isArray(value)) {
            value.forEach(item => collectReferencedNames(item, scopes, references, node, key))
        } else if (value && typeof value === 'object') {
            collectReferencedNames(value, scopes, references, node, key)
        }
    }

    return references
}

/**
 * @summary Projects the reachable local/imported binding graph behind a syntax-only default.
 * Package/global names remain represented by the leaf AST; failures reading a relative git object
 * still propagate, so missing evidence can never become an unchanged default.
 * @param {Object} node
 * @param {Object} context
 * @param {Set<String>} [stack]
 * @returns {Object[]}
 */
function projectStaticDependencies(node, context, stack = new Set()) {
    const names        = collectReferencedNames(node);
    const dependencies = [];

    for (const name of [...names].sort()) {
        const binding = resolveBinding(context, name, new Set());

        if (binding.external) {
            dependencies.push({binding: `${context.filePath}#${name}`, external: binding.external});
            continue
        }

        if (binding.namespace) {
            dependencies.push({binding: `${context.filePath}#${name}`, namespace: binding.namespace.filePath});
            continue
        }

        const bindingKey = `${binding.context.filePath}#${name}`;

        if (stack.has(bindingKey)) {
            dependencies.push({binding: bindingKey, cycle: true});
            continue
        }

        const nextStack = new Set(stack);
        nextStack.add(bindingKey);
        dependencies.push({
            binding     : bindingKey,
            ast         : canonicalAst(binding.node),
            dependencies: projectStaticDependencies(binding.node, binding.context, nextStack)
        })
    }

    return dependencies
}

/**
 * @summary Makes statically resolved values JSON-stable, including `undefined` and BigInt literals.
 * @param {*} value
 * @param {WeakSet<Object>} [seen]
 * @returns {*}
 */
function canonicalStaticValue(value, seen = new WeakSet()) {
    if (value === undefined) return {$type: 'undefined'};
    if (typeof value === 'bigint') return {$type: 'bigint', value: String(value)};
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) {
        throw createRevisionConfigDiffError(
            'revisionConfigDiff: a statically resolved default contains a cycle.',
            {code: REVISION_CONFIG_DIFF_STATIC_UNRESOLVED_CODE}
        )
    }

    seen.add(value);

    if (Array.isArray(value)) return value.map(item => canonicalStaticValue(item, seen));

    return Object.fromEntries(Object.keys(value).sort()
        .map(key => [key, canonicalStaticValue(value[key], seen)]))
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

    if (source === undefined && (!state.repoRoot || !state.revision)) {
        throw createRevisionConfigDiffError(
            `revisionConfigDiff: resolving imported object ${normalized} requires an explicit revision loader state.`
        )
    }

    const moduleSource = source ?? readRevisionObject({
        repoRoot: state.repoRoot,
        revision: state.revision,
        filePath: normalized
    });

    let ast;

    try {
        ast = acorn.parse(moduleSource, {ecmaVersion: 'latest', sourceType: 'module'})
    } catch (error) {
        throw createRevisionConfigDiffError(
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
 * @returns {{context:Object,node:Object}|{namespace:Object}|{external:Object}}
 */
function resolveBinding(context, name, stack) {
    const bindingKey = `${context.filePath}#${name}`;

    if (stack.has(bindingKey)) {
        throw createRevisionConfigDiffError(`revisionConfigDiff: cyclic static binding ${bindingKey}.`)
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

            if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name === name) {
                return {context, node: declaration}
            }

            if (statement.type === 'ImportDeclaration') {
                const specifier = statement.specifiers.find(item => item.local.name === name);

                if (!specifier) continue;
                if (!statement.source.value.startsWith('.')) {
                    return {external: {
                        source  : statement.source.value,
                        kind    : specifier.type,
                        imported: specifier.type === 'ImportNamespaceSpecifier'
                            ? '*'
                            : specifier.type === 'ImportDefaultSpecifier'
                                ? 'default'
                                : specifier.imported.name ?? specifier.imported.value
                    }}
                }

                const importedPath = path.posix.normalize(path.posix.join(
                    path.posix.dirname(context.filePath), statement.source.value
                ));
                const importedContext = getModuleContext(context.state, importedPath);

                if (specifier.type === 'ImportNamespaceSpecifier') return {namespace: importedContext};
                if (specifier.type === 'ImportDefaultSpecifier') {
                    return resolveExportedBinding(importedContext, 'default', stack)
                }

                const importedName = specifier.imported.name ?? specifier.imported.value;

                return resolveExportedBinding(importedContext, importedName, stack)
            }
        }
    } finally {
        stack.delete(bindingKey)
    }

    if (STATIC_GLOBAL_NAMES.has(name)) {
        return {external: {source: 'global', kind: 'global', imported: name}}
    }

    throw createRevisionConfigDiffError(
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
    const exportKey = `${context.filePath}#export:${exportName}`;

    if (stack.has(exportKey)) {
        throw createRevisionConfigDiffError(`revisionConfigDiff: cyclic static export ${exportKey}.`)
    }

    stack.add(exportKey);

    try {
        for (const statement of context.ast.body) {
            if (statement.type === 'ExportDefaultDeclaration' && exportName === 'default') {
                return statement.declaration.type === 'Identifier'
                    ? resolveBinding(context, statement.declaration.name, stack)
                    : {context, node: statement.declaration}
            }

            if (statement.type !== 'ExportNamedDeclaration') continue;

            if (statement.declaration?.type === 'VariableDeclaration') {
                const declarator = statement.declaration.declarations.find(item =>
                    item.id.type === 'Identifier' && item.id.name === exportName
                );

                if (declarator?.init) return {context, node: declarator.init};
            }

            if (statement.declaration?.type === 'FunctionDeclaration' &&
                statement.declaration.id?.name === exportName
            ) {
                return {context, node: statement.declaration}
            }

            const specifier = statement.specifiers?.find(item =>
                (item.exported.name ?? item.exported.value) === exportName
            );

            if (specifier) {
                if (statement.source) {
                    if (!statement.source.value.startsWith('.')) {
                        throw createRevisionConfigDiffError(
                            `revisionConfigDiff: ${context.filePath} re-exports ${exportName} from a package.`,
                            {code: REVISION_CONFIG_DIFF_STATIC_UNRESOLVED_CODE}
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
    } finally {
        stack.delete(exportKey)
    }

    throw createRevisionConfigDiffError(
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
                throw createRevisionConfigDiffError(`revisionConfigDiff: cyclic static binding ${bindingKey}.`)
            }

            const nextStack = new Set(stack);
            nextStack.add(bindingKey);

            // Export/import alias cycles are independent from value-reference cycles, so the
            // binding lookup gets its own stack while value evaluation carries `nextStack`.
            const binding = resolveBinding(context, node.name, new Set());

            if (binding.external) {
                throw createRevisionConfigDiffError(
                    `revisionConfigDiff: ${context.filePath} cannot evaluate external binding ${node.name}.`,
                    {code: REVISION_CONFIG_DIFF_STATIC_UNRESOLVED_CODE}
                )
            }
            return binding.namespace ?? evaluateStatic(binding.node, binding.context, nextStack)
        }
        case 'ArrayExpression':
            return node.elements.map(element => evaluateStatic(element, context, stack))
        case 'ObjectExpression': {
            const value = {};

            for (const property of node.properties) {
                if (property.type !== 'Property' || property.kind !== 'init' || property.method) {
                    throw createRevisionConfigDiffError(
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
                throw createRevisionConfigDiffError(
                    `revisionConfigDiff: ${context.filePath} cannot statically resolve member ${String(key)}.`,
                    {code: REVISION_CONFIG_DIFF_STATIC_UNRESOLVED_CODE}
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

    throw createRevisionConfigDiffError(
        `revisionConfigDiff: ${context.filePath} uses unsupported static ${node.type} metadata.`,
        {code: REVISION_CONFIG_DIFF_STATIC_UNRESOLVED_CODE}
    )
}

/**
 * @summary Follows a local metadata binding to its object expression without evaluating parser hooks.
 * @param {Object|null} node
 * @param {Object} context
 * @returns {{context:Object,node:Object}|null}
 */
function resolveMetadataObject(node, context) {
    if (!node || (node.type === 'Literal' && node.value === null)) return null;
    if (node.type === 'ObjectExpression') return {context, node};

    if (node.type === 'Identifier') {
        const binding = resolveBinding(context, node.name, new Set());

        if (!binding.namespace) return resolveMetadataObject(binding.node, binding.context)
    }

    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' &&
        node.callee.object.name === 'Object' && node.callee.property.name === 'freeze') {
        return resolveMetadataObject(node.arguments[0], context)
    }

    throw createRevisionConfigDiffError(
        `revisionConfigDiff: ${context.filePath} uses metadata the static parser cannot inspect.`
    )
}

/**
 * @summary Returns one named metadata property with the context that owns its bindings.
 * @param {Object|null} node
 * @param {Object} context
 * @param {String} propertyName
 * @returns {{context:Object,node:Object}|null}
 */
function readMetadataProperty(node, context, propertyName) {
    const metadata = resolveMetadataObject(node, context);

    if (!metadata) return null;

    for (const property of metadata.node.properties) {
        if (property.type !== 'Property') {
            throw createRevisionConfigDiffError(
                `revisionConfigDiff: ${metadata.context.filePath} spreads metadata; declaration semantics cannot be certified.`
            )
        }

        if (readPropertyName(property, metadata.context.filePath) === propertyName) {
            return {context: metadata.context, node: property.value}
        }
    }

    return null
}

/**
 * @summary Normalizes `requiredFor` as an order-insensitive OR-set with set-like constraint axes.
 * @param {Object[]} requirements
 * @returns {Object[]}
 */
function normalizeRequirements(requirements) {
    const axes = new Set(['consumerClaims', 'entrypoints', 'modes']);
    const rows = requirements.map(requirement => {
        if (!requirement || typeof requirement !== 'object' || Array.isArray(requirement)) {
            throw createRevisionConfigDiffError('revisionConfigDiff: each requiredFor entry must be an object.')
        }

        return Object.fromEntries(Object.keys(requirement).sort().flatMap(key => {
            if (!axes.has(key)) return [[key, requirement[key]]];

            const value = requirement[key];

            if (value === undefined || value === null || value === '*') return [];

            return [[key, [...new Set(Array.isArray(value) ? value : [value])].sort()]]
        }))
    });

    return [...new Map(rows.map(row => [JSON.stringify(row), row])).values()]
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}

/**
 * @summary Reads and normalizes `requiredFor`; missing metadata means an unconstrained leaf.
 * @param {Object|null} node
 * @param {Object} context
 * @returns {Object[]}
 */
function readRequiredFor(node, context) {
    const property = readMetadataProperty(node, context, 'requiredFor');

    if (!property) return [];

    const value = evaluateStatic(property.node, property.context);

    if (!value || (typeof value !== 'object')) {
        throw createRevisionConfigDiffError(
            `revisionConfigDiff: ${property.context.filePath} declares requiredFor in a non-object shape.`
        )
    }

    return normalizeRequirements(Array.isArray(value) ? value : [value])
}

/**
 * @summary Resolves the decoder binding whose own source text defines the bounded body digest.
 * @param {Object} node
 * @param {Object} context
 * @param {Set<String>} [stack]
 * @returns {{context:Object,node:Object}}
 */
function resolveDecoderBinding(node, context, stack = new Set()) {
    if (node.type === 'Identifier') {
        const bindingKey = `${context.filePath}#decoder:${node.name}`;

        if (stack.has(bindingKey)) {
            throw createRevisionConfigDiffError(`revisionConfigDiff: cyclic decoder binding ${bindingKey}.`)
        }

        const binding = resolveBinding(context, node.name, new Set());

        if (!binding.namespace && !binding.external) {
            const nextStack = new Set(stack);
            nextStack.add(bindingKey);
            return resolveDecoderBinding(binding.node, binding.context, nextStack)
        }
    }

    if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
        node.type === 'FunctionDeclaration'
    ) {
        return {context, node}
    }

    if (node.type === 'MemberExpression' && !node.computed && node.object.type === 'Identifier') {
        const object = resolveBinding(context, node.object.name, new Set());

        if (object.namespace) {
            const binding = resolveExportedBinding(object.namespace, node.property.name, new Set());
            return resolveDecoderBinding(binding.node, binding.context, stack)
        }
    }

    throw createRevisionConfigDiffError(
        `revisionConfigDiff: ${context.filePath} declares a decoder binding the static parser cannot identify.`
    )
}

/**
 * @summary Projects decoder identity separately from the bounded digest of its own source text.
 * @param {Object|null} node
 * @param {Object} context
 * @returns {{identity:String,sourceDigest:String}|null}
 */
function projectMetadataDecoder(node, context) {
    const property = readMetadataProperty(node, context, 'parse');

    if (!property) return null;

    const binding  = resolveDecoderBinding(property.node, property.context),
          source   = binding.context.source.slice(binding.node.start, binding.node.end),
          identity = property.node.type === 'ArrowFunctionExpression' || property.node.type === 'FunctionExpression'
              ? '<inline>'
              : property.context.source.slice(property.node.start, property.node.end).trim();

    return {
        identity,
        sourceDigest: `sha256:${createHash('sha256').update(source).digest('hex')}`
    }
}

/**
 * @summary Projects a default into a stable fingerprint plus operator-readable resolution evidence.
 * A syntax-only expression carries its reachable binding graph, so changing a helper/constant cannot
 * disappear merely because the leaf still spells the same identifier.
 * @param {Object} node
 * @param {Object} context
 * @returns {RevisionConfigDefaultProjection}
 */
function projectDefault(node, context) {
    const ast = canonicalAst(node);

    try {
        const value = canonicalStaticValue(evaluateStatic(node, context));

        return {
            fingerprint: JSON.stringify({resolution: 'static', value}),
            resolution : 'static',
            value
        }
    } catch (error) {
        if (!isRevisionConfigDiffError(error, REVISION_CONFIG_DIFF_STATIC_UNRESOLVED_CODE)) throw error;
    }

    const dependencies = projectStaticDependencies(node, context);

    return {
        fingerprint: JSON.stringify({ast, dependencies, resolution: 'dependency'}),
        resolution : 'dependency',
        value      : null
    }
}

/**
 * @summary Parses one config base into a nested descriptor tree and full-path descriptor map.
 * @param {Object} options
 * @param {String} options.source
 * @param {String} options.filePath
 * @param {String} options.surface
 * @param {Object} [options.state] Revision loader state; required when the source resolves imports.
 * @returns {{surface:String,filePath:String,data:Object,leaves:Map<String,Object>}}
 */
export function parseDeclaredConfigSource({source, filePath, surface, state} = {}) {
    if (!state) {
        state = {
            modules : new Map(),
            repoRoot: null,
            revision: null
        }
    }

    const context  = getModuleContext(state, filePath, source),
          dataNode = findConfigDataObject(context),
          leaves   = new Map();

    const walk = (objectNode, prefix = '') => {
        const data = {};

        for (const property of objectNode.properties) {
            if (property.type !== 'Property' || property.kind !== 'init' || property.method) {
                throw createRevisionConfigDiffError(
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
                throw createRevisionConfigDiffError(
                    `revisionConfigDiff: ${filePath} config leaf ${leafPath} is not a literal leaf(...) call.`
                )
            }

            if (value.arguments.length === 0 || value.arguments.length > 4) {
                throw createRevisionConfigDiffError(
                    `revisionConfigDiff: ${filePath} leaf ${leafPath} has an unsupported argument shape.`
                )
            }

            const defaultNode       = value.arguments[0],
                  env               = value.arguments[1] ? evaluateStatic(value.arguments[1], context) : null,
                  type              = value.arguments[2] ? evaluateStatic(value.arguments[2], context) : null,
                  metadataNode      = value.arguments[3],
                  requirements      = readRequiredFor(metadataNode, context),
                  decoder           = projectMetadataDecoder(metadataNode, context),
                  defaultExpression = source.slice(defaultNode.start, defaultNode.end).trim(),
                  defaultProjection = projectDefault(defaultNode, context),
                  descriptor        = {
                      default: defaultExpression,
                      env,
                      type
                  };

            if (!(env === null || typeof env === 'string')) {
                throw createRevisionConfigDiffError(
                    `revisionConfigDiff: ${filePath} leaf ${leafPath} env is not a static string/null.`
                )
            }
            if (!(type === null || typeof type === 'string')) {
                throw createRevisionConfigDiffError(
                    `revisionConfigDiff: ${filePath} leaf ${leafPath} type is not a static string/null.`
                )
            }

            data[key] = descriptor;
            leaves.set(leafPath, {
                defaultExpression,
                defaultFingerprint     : defaultProjection.fingerprint,
                defaultResolution      : defaultProjection.resolution,
                defaultValue           : defaultProjection.value,
                decoderIdentity        : decoder?.identity ?? null,
                decoderSourceDigest    : decoder?.sourceDigest ?? null,
                env,
                leafPath,
                requirements,
                requirementsFingerprint: JSON.stringify(requirements),
                surface,
                type
            })
        }

        return data
    };

    const data = walk(dataNode);

    if (leaves.size === 0) {
        throw createRevisionConfigDiffError(
            `revisionConfigDiff: ${filePath} yielded zero leaves; this is an unreadable declaration, not an empty surface.`
        )
    }

    return {surface, filePath, data, leaves}
}

/**
 * @summary Loads all declared config surfaces after the caller has resolved and admitted the SHA.
 * @param {Object} options
 * @param {String} options.requestedRevision
 * @param {String} options.resolvedRevision
 * @param {String} options.repoRoot
 * @returns {{requestedRevision:String,resolvedRevision:String,surfaces:Map<String,Object>}}
 */
function loadResolvedRevisionConfig({requestedRevision, resolvedRevision, repoRoot}) {
    const state    = {modules: new Map(), repoRoot, revision: resolvedRevision},
          surfaces = new Map();

    const discovered = discoverRevisionConfigSurfaces({revision: resolvedRevision, repoRoot});

    for (const entry of discovered) {
        let source;

        try {
            source = readRevisionObject({repoRoot, revision: resolvedRevision, filePath: entry.configPath})
        } catch (error) {
            if (entry.templatePath) {
                throw createRevisionConfigDiffError(
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

    return {requestedRevision, resolvedRevision, surfaces}
}

/**
 * @summary Loads a revision's declaration tree without issuing the authoritative operator receipt.
 * This lower-level parser seam deliberately owns no supported-horizon decision; callers producing a
 * `revision-config-diff.v1` receipt must use {@link diffRevisionConfig}, which closes over the fixed horizon.
 * @param {Object} options
 * @param {String} options.revision
 * @param {String} [options.repoRoot=PROJECT_ROOT]
 * @returns {{requestedRevision:String,resolvedRevision:String,surfaces:Map<String,Object>}}
 */
export function loadRevisionConfig({revision, repoRoot = PROJECT_ROOT} = {}) {
    return loadResolvedRevisionConfig({
        requestedRevision: revision,
        resolvedRevision : resolveRevision(revision, repoRoot),
        repoRoot
    })
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
 * @returns {{added:RevisionConfigDiffAddedRow[],removed:RevisionConfigDiffRemovedRow[],changed:RevisionConfigDiffChangedRow[]}}
 */
export function diffDeclaredConfigSurfaces({
    fromSurfaces,
    toSurfaces,
    target = {}
} = {}) {
    const added        = [], removed = [], changed = [];
    const surfaceNames = [...new Set([
        ...fromSurfaces.keys(),
        ...toSurfaces.keys()
    ])].sort();

    for (const surface of surfaceNames) {
        const from    = fromSurfaces.get(surface),
              to      = toSurfaces.get(surface),
              setDiff = diffCohortLeafSets({fromData: from?.data ?? {}, toData: to?.data ?? {}});

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
                    basis: before.defaultExpression === after.defaultExpression ? 'dependency' : 'expression',
                    from : before.defaultExpression,
                    to   : after.defaultExpression
                }

                if (before.defaultResolution === 'static') {
                    changes.default.fromResolved = before.defaultValue
                }
                if (after.defaultResolution === 'static') {
                    changes.default.toResolved = after.defaultValue
                }
            }
            if (before.env !== after.env) changes.env = {from: before.env, to: after.env};
            if (before.type !== after.type) changes.type = {from: before.type, to: after.type};
            if (before.requirementsFingerprint !== after.requirementsFingerprint) {
                changes.requiredFor = {from: before.requirements, to: after.requirements}
            }
            const decoderBindingChange = classifyDecoderBindingTransition(
                before.decoderIdentity,
                after.decoderIdentity
            );

            if (decoderBindingChange) {
                changes.decoder = decoderBindingChange
            } else if (before.decoderIdentity && before.decoderSourceDigest !== after.decoderSourceDigest) {
                changes.decoder = {
                    kind         : 'DECODER_BODY_CHANGED',
                    decoder      : before.decoderIdentity,
                    fromDigest   : before.decoderSourceDigest,
                    toDigest     : after.decoderSourceDigest,
                    evidenceBound: DECODER_SOURCE_DIGEST_BOUND
                }
            }

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
 * @summary Builds the unversioned diff payload from two already-loaded immutable declaration trees.
 * Only {@link diffRevisionConfig} may attach the authoritative receipt schema.
 * @param {Object} options
 * @param {Object} options.from
 * @param {Object} options.to
 * @param {Object} [options.target={}]
 * @returns {RevisionConfigDiffPayload}
 */
export function diffLoadedRevisionConfigs({from, to, target = {}} = {}) {
    for (const axis of ['entrypoint', 'mode']) {
        if (target[axis] != null && (typeof target[axis] !== 'string' || target[axis].trim() === '')) {
            throw createRevisionConfigDiffError(`revisionConfigDiff: target.${axis} must be a non-empty string/null.`)
        }
    }
    if (target.consumerClaims != null && (!Array.isArray(target.consumerClaims) ||
        target.consumerClaims.some(claim => typeof claim !== 'string' || claim.trim() === '')
    )) {
        throw createRevisionConfigDiffError(
            'revisionConfigDiff: target.consumerClaims must be an array of non-empty strings/null.'
        )
    }

    const normalizedTarget = {
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
            target      : normalizedTarget
        })
    }
}

/**
 * @summary Produces the authoritative revision-config-diff receipt without executing either revision.
 * The supported horizon and path-set differ are closed dependencies, not caller-injectable test seams.
 * @param {Object} options
 * @param {String} options.fromRevision
 * @param {String} options.toRevision
 * @param {String} [options.repoRoot=PROJECT_ROOT]
 * @param {Object} [options.target={}]
 * @returns {RevisionConfigDiffReceipt}
 */
export function diffRevisionConfig({
    fromRevision,
    toRevision,
    repoRoot = PROJECT_ROOT,
    target = {}
} = {}) {
    const fromResolved = resolveRevision(fromRevision, repoRoot),
          toResolved   = resolveRevision(toRevision, repoRoot);

    assertSupportedRevision({repoRoot, revision: fromResolved});
    assertSupportedRevision({repoRoot, revision: toResolved});

    return {
        schemaVersion: REVISION_CONFIG_DIFF_SCHEMA_VERSION,
        ...diffLoadedRevisionConfigs({
            from: loadResolvedRevisionConfig({
                requestedRevision: fromRevision,
                resolvedRevision : fromResolved,
                repoRoot
            }),
            to: loadResolvedRevisionConfig({
                requestedRevision: toRevision,
                resolvedRevision : toResolved,
                repoRoot
            }),
            target
        })
    }
}

/**
 * @summary Parses the direct operator CLI; target flags affect requiredness only.
 * @param {String[]} argv
 * @returns {Object}
 */
function parseRevisionConfigDiffArgs(argv = []) {
    const options = {};

    for (let index = 0; index < argv.length; index++) {
        const flag = argv[index];

        if (flag === '--help') {
            options.help = true;
            continue
        }

        if (!['--from', '--to', '--entrypoint', '--mode', '--consumer-claim'].includes(flag)) {
            throw createRevisionConfigDiffError(`revisionConfigDiff: unknown argument ${flag}.`)
        }

        const value = argv[++index];

        if (!value || value.startsWith('--')) {
            throw createRevisionConfigDiffError(`revisionConfigDiff: ${flag} requires a value.`)
        }

        if (flag === '--from') options.fromRevision = value;
        if (flag === '--to') options.toRevision = value;
        if (flag === '--entrypoint') options.entrypoint = value;
        if (flag === '--mode') options.mode = value;
        if (flag === '--consumer-claim') (options.consumerClaims ??= []).push(value)
    }

    if (!options.help && (!options.fromRevision || !options.toRevision)) {
        throw createRevisionConfigDiffError('revisionConfigDiff: --from and --to are required.')
    }

    return options
}

/**
 * @summary Direct JSON operator entrypoint. Successful non-empty diffs still exit zero.
 * @param {Object} [options]
 * @param {String[]} [options.argv=process.argv.slice(2)]
 * @param {String} [options.repoRoot=PROJECT_ROOT]
 * @param {NodeJS.WritableStream} [options.stdout=process.stdout]
 * @returns {RevisionConfigDiffReceipt|null}
 */
export function runRevisionConfigDiffCli({
    argv = process.argv.slice(2),
    repoRoot = PROJECT_ROOT,
    stdout = process.stdout
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
        runRevisionConfigDiffCli()
    } catch (error) {
        process.stderr.write(`${isRevisionConfigDiffError(error)
            ? error.message
            : error?.stack ?? String(error)}\n`);
        process.exitCode = 1
    }
}
