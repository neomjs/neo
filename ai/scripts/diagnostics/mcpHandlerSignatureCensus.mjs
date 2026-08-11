#!/usr/bin/env node
/**
 * @module ai/scripts/diagnostics/mcpHandlerSignatureCensus
 * @summary Re-runnable census answering one question: which MCP handler signatures silently
 * degrade under positional dispatch?
 *
 * ## Why the handlers, not the contracts
 *
 * `ai/mcp/ToolService.mjs#callTool` dispatches one of two ways:
 *
 * ```js
 * if (tool.passAsObject) {
 *     return tool.handler(validatedArgs);
 * }
 * const handlerArgs = tool.argNames.map(name => validatedArgs[name]);
 * return tool.handler(...handlerArgs);
 * ```
 *
 * Without `x-pass-as-object: true`, arguments arrive **positionally, in contract order**. Whether
 * that is correct depends entirely on the handler signature, which the contract never references.
 * The three-way split:
 *
 * 1. handler takes positional params in contract order → correct without the annotation
 * 2. handler destructures a single object → silently degrades (destructuring a primitive boxes it:
 *    every key binds `undefined`, no throw; with `= {}` even an absent value stays silent)
 * 3. handler declares fewer params than the contract → silently truncates (extras dropped)
 *
 * A contract-only sweep cannot produce this census: the contract cannot see the handler signature.
 * This instrument therefore resolves every operation through its server's `serviceMapping` binding
 * table into the service module and reads the handler's parameter list from the AST (acorn).
 *
 * ## Method (all local, all reproducible)
 *
 * 1. Contract side mirrors `ToolService#initializeToolMapping` exactly: `argNames` =
 *    `operation.parameters[].name` + request-body JSON schema property keys (`$ref`-resolved one
 *    level, exactly like `openApiValidator.mjs#resolveRef`); `passAsObject` =
 *    `operation['x-pass-as-object'] === true`. Deliberate mirror: if the runtime cannot see an
 *    arg, the census must not see it either.
 * 2. Binding side parses each server's `toolService.mjs`: `Service.method.bind(Service)` chains
 *    resolve into the imported service module (class methods, exported arrows, one superclass
 *    hop); inline arrows/functions answer in place; local identifiers resolve one hop.
 * 3. Classification is dispatch-mode aware and evidence-carrying — every row reports the contract
 *    arg names and the handler parameter list it was judged from:
 *    - class 1   correct under its dispatch mode (positional match, annotated destructure/bag,
 *      nullary, contract-exposed superset with aligned prefix)
 *    - class 2   destructures under positional dispatch — silent degrade
 *    - class 2M  annotation-mismatch: contract arg names shadowed by injectable-position params
 *      under object dispatch
 *    - class 3   declares fewer params than the contract — silent truncation
 *    - suspect   mechanically ambiguous (renamed positional, generic bag name, nested-object
 *      destructure) — reported with evidence, never auto-forgiven
 *    - unresolved handler could not be located mechanically (named, counted, never dropped)
 *
 * The two known positives (`get_ingestion_progress`, `get_pull_request_diff`) are fixed on
 * current dev (both contracts now carry `x-pass-as-object`). Validation: run this script with
 * `--root` pointing at a worktree of the pre-fix tree — both MUST appear in that run's defect
 * set. A census that misses its own known positives has not been validated.
 *
 * Usage:
 *   node ai/scripts/diagnostics/mcpHandlerSignatureCensus.mjs [--root <dir>]
 *        [--out <path>] [--json <path>] [--fail-on-defects]
 *
 * No flags: census the current checkout, print the markdown report to stdout. `--fail-on-defects`
 * exits 1 when the defect set (classes 2, 2M, 3) is non-empty — the mechanical-checkability proof
 * for the lint follow-up. Generated reports are derived data: regenerable, never committed.
 * @plane host
 */
import {execFileSync}                 from 'node:child_process';
import fs                             from 'node:fs';
import path                           from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parse}                        from 'acorn';
import * as yaml                      from 'js-yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * The six MCP servers, with the file-system server's divergent `services/` layout named
 * explicitly. `OpenApiValidatorCompliance.spec.mjs` lists five — `gitlab-workflow` is absent
 * there but is a live server (own `openapi.yaml`, `toolService.mjs`, `Server.mjs`, referenced by
 * `ai/mcp/server/BaseServer.mjs`), so the census covers it and says so.
 * Entries carry `{id, openApi, toolService}` repo-relative paths.
 * @type {Object[]}
 */
export const SERVERS = [
    {id: 'file-system',    openApi: 'ai/mcp/server/file-system/openapi.yaml',            toolService: 'ai/mcp/server/file-system/services/toolService.mjs'},
    {id: 'github-workflow',openApi: 'ai/mcp/server/github-workflow/openapi.yaml',        toolService: 'ai/mcp/server/github-workflow/toolService.mjs'},
    {id: 'gitlab-workflow',openApi: 'ai/mcp/server/gitlab-workflow/openapi.yaml',        toolService: 'ai/mcp/server/gitlab-workflow/toolService.mjs'},
    {id: 'knowledge-base', openApi: 'ai/mcp/server/knowledge-base/openapi.yaml',         toolService: 'ai/mcp/server/knowledge-base/toolService.mjs'},
    {id: 'memory-core',    openApi: 'ai/mcp/server/memory-core/openapi.yaml',            toolService: 'ai/mcp/server/memory-core/toolService.mjs'},
    {id: 'neural-link',    openApi: 'ai/mcp/server/neural-link/openapi.yaml',            toolService: 'ai/mcp/server/neural-link/toolService.mjs'}
];

/**
 * Generic single-param names that signal bag-expectation (the handler treats its first parameter
 * as the whole args object). Under positional dispatch that expectation is a defect shape; under
 * object dispatch it is the correct one.
 * @type {Set<String>}
 */
const GENERIC_BAG_NAMES = new Set(['args', 'input', 'options', 'params', 'payload', 'query']);

/**
 * The classes that fail the gate: 2 (destructure-under-positional), 2M (annotation-mismatch),
 * 3 (truncation). Suspects deliberately do NOT fail — they stay human-judged; a gate that cries
 * on ambiguity trains contributors to dismiss it. Exported so the unit-suite gate
 * (`test/playwright/unit/ai/mcp/validation/McpHandlerSignatureGate.spec.mjs`) and this CLI's
 * `--fail-on-defects` share one predicate — never two copies that can drift.
 * @type {Set<Number|String>}
 */
export const DEFECT_KLASSES = new Set([2, '2M', 3]);

/**
 * @param {Object} row a census row
 * @returns {Boolean} true when the row's class is a gate-failing defect class
 */
export function isDefectRow(row) {
    return DEFECT_KLASSES.has(row.klass);
}

// ------------------------------------------------------------------ contract side (runtime mirror)

/**
 * One-level `$ref` resolution — a deliberate mirror of
 * `ai/mcp/validation/openApiValidator.mjs#resolveRef` (the runtime's own resolution depth).
 * @param {Object} doc
 * @param {String} ref e.g. '#/components/schemas/X'
 * @returns {Object}
 */
export function resolveRef(doc, ref) {
    return ref.substring(2).split('/').reduce((acc, part) => acc[part], doc);
}

/**
 * Extracts every operation the dispatcher can bind, mirroring
 * `ToolService#initializeToolMapping` (ToolService.mjs:142-166): iteration over
 * `Object.values(pathItem)`, `argNames` = `parameters[].name` + request-body property keys,
 * `passAsObject` = `operation['x-pass-as-object'] === true`. Each arg also carries its declared
 * schema `type` (and `properties` keys for single-object args) so the classifier can tell a
 * nested-object destructure from a class-2 degrade.
 *
 * DRIFT POINTER (named in review): this function necessarily re-derives the argNames union that
 * `ai/mcp/ToolService.mjs#initializeToolMapping` owns — a static tool cannot import the runtime's
 * intermediate. If the runtime's derivation changes (new arg source, different extension name),
 * change this mirror in the same PR or the census silently measures a dispatch that no longer
 * exists.
 * @param {Object} doc parsed openapi.yaml
 * @returns {Object[]} `{operationId, args: [{name, type, properties}], passAsObject}` rows
 */
export function extractOperations(doc) {
    const operations = [];

    for (const pathItem of Object.values(doc.paths || {})) {
        for (const operation of Object.values(pathItem)) {
            if (!operation || typeof operation !== 'object' || !operation.operationId) {
                continue;
            }

            const args = [];

            for (const p of operation.parameters || []) {
                if (p && p.name) {
                    args.push({name: p.name, type: p.schema?.type, properties: Object.keys(p.schema?.properties || {})});
                }
            }

            const bodySchema = operation.requestBody?.content?.['application/json']?.schema;

            if (bodySchema) {
                const resolved = bodySchema.$ref ? resolveRef(doc, bodySchema.$ref) : bodySchema;

                for (const [name, propSchema] of Object.entries(resolved.properties || {})) {
                    args.push({name, type: propSchema?.type, properties: Object.keys(propSchema?.properties || {})});
                }
            }

            operations.push({
                operationId : operation.operationId,
                args,
                passAsObject: operation['x-pass-as-object'] === true
            });
        }
    }

    return operations;
}

// ---------------------------------------------------------------------- binding side (acorn AST)

/**
 * Parses an ES module with acorn. The census reads only first-party `.mjs`, so module + latest
 * ecmaVersion is the whole configuration.
 * @param {String} source
 * @returns {Object} ESTree program
 */
export function parseModule(source) {
    return parse(source, {ecmaVersion: 'latest', sourceType: 'module'});
}

/**
 * Names every import binding in a module: local name → {source, imported}.
 * @param {Object} ast
 * @returns {Map<String, {source: String, imported: String}>} `imported` is 'default' for default imports
 */
export function collectImports(ast) {
    const imports = new Map();

    for (const node of ast.body) {
        if (node.type !== 'ImportDeclaration') {
            continue;
        }
        for (const specifier of node.specifiers) {
            // Three specifier kinds, and only two carry `.imported`. `import * as yaml from …`
            // is an ImportNamespaceSpecifier with no `imported` node at all, so reading
            // `.imported.name` throws — which made this helper unusable on any module using a
            // namespace import. It went unnoticed because the census only ever parsed
            // `toolService.mjs` files, none of which have one.
            const imported = specifier.type === 'ImportDefaultSpecifier'   ? 'default'
                           : specifier.type === 'ImportNamespaceSpecifier' ? '*'
                           : specifier.imported.name;

            imports.set(specifier.local.name, {source: node.source.value, imported});
        }
    }

    return imports;
}

/**
 * Describes a handler parameter list in dispatch terms: positional identifier, object
 * destructure (with its key names and whether an `= {}` default shields undefined), or rest.
 * @param {Object[]} paramNodes ESTree params array
 * @returns {Object[]} `{kind, name, keys, hasDefault}` descriptors
 */
export function describeParams(paramNodes) {
    return paramNodes.map(node => {
        let target = node, hasDefault = false;

        if (target.type === 'AssignmentPattern') {
            hasDefault = true;
            target     = target.left;
        }

        if (target.type === 'RestElement') {
            return {kind: 'rest', name: target.argument.name, keys: [], hasDefault};
        }
        if (target.type === 'ObjectPattern') {
            return {
                kind: 'destructure',
                keys: target.properties
                    .filter(p => p.type === 'Property')
                    .map(p => p.key.name ?? p.key.value),
                hasDefault
            };
        }
        if (target.type === 'Identifier') {
            return {kind: 'positional', name: target.name, keys: [], hasDefault};
        }
        return {kind: 'other', name: undefined, keys: [], hasDefault};
    });
}

/**
 * Recursively collects every node in an AST subtree. Small local walker — acorn-walk is not a
 * declared dependency and the census needs nothing fancier.
 * @param {Object} root
 * @returns {Object[]}
 */
function walkNodes(root) {
    const nodes = [];
    const visit = node => {
        if (!node || typeof node.type !== 'string') {
            return;
        }
        nodes.push(node);
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) {
                value.forEach(visit);
            } else if (value && typeof value === 'object' && typeof value.type === 'string') {
                visit(value);
            }
        }
    };
    visit(root);
    return nodes;
}

/**
 * Finds a named callable's parameter nodes inside a module: class methods (including inside
 * `Neo.setupClass(class …)` expressions), exported const arrows, and plain function declarations.
 * Returns the params array of the first match, or null.
 * @param {Object} ast
 * @param {String} name
 * @returns {Object[]|null}
 */
export function findCallableParams(ast, name) {
    return findCallableNode(ast, name)?.params ?? null;
}

/**
 * @summary Finds the callable NODE for `name` — the same search `findCallableParams` performs, one
 * step earlier.
 *
 * Exists because a parameter LIST is not enough for every consumer. The signature-census only needs
 * the params, but a contract-parity check must read the BODY: a handler that takes an opaque bag
 * (`doThing(options)`) consumes its parameters through destructuring and member reads inside the
 * function, so its signature carries no names at all. Returning the node serves both, and keeping
 * `findCallableParams` as a delegation keeps ONE traversal deciding what a callable is — two copies
 * of this search would be two definitions of "the handler", free to disagree about class members,
 * property-definition arrows, or the declaration forms below.
 *
 * @param {Object} ast parsed module
 * @param {String} name method or function name
 * @returns {Object|null} the function/arrow node, or null when not found
 */
export function findCallableNode(ast, name) {
    const nodes = walkNodes(ast);

    for (const node of nodes) {
        if ((node.type === 'ClassDeclaration' || node.type === 'ClassExpression') && node.body) {
            for (const member of node.body.body) {
                if (
                    (member.type === 'MethodDefinition' || member.type === 'PropertyDefinition') &&
                    !member.computed &&
                    (member.key.name === name || member.key.value === name) &&
                    member.value?.params
                ) {
                    return member.value;
                }
            }
        }
    }

    for (const node of nodes) {
        if (node.type === 'FunctionDeclaration' && node.id?.name === name) {
            return node;
        }
        if (
            node.type === 'VariableDeclarator' && node.id?.name === name &&
            (node.init?.type === 'ArrowFunctionExpression' || node.init?.type === 'FunctionExpression')
        ) {
            return node.init;
        }
    }

    return null;
}

/**
 * Finds the direct superclass identifier of the class declaring `name`, for the one-hop
 * inherited-method lookup. Returns null when the method is found locally or no superclass exists.
 * @param {Object} ast
 * @param {String} serviceName class identifier the binding references
 * @returns {String|null}
 */
function findSuperclassName(ast, serviceName) {
    for (const node of walkNodes(ast)) {
        if (
            (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') &&
            (node.id?.name === serviceName || node.superClass)
        ) {
            if (node.superClass?.type === 'Identifier') {
                return node.superClass.name;
            }
        }
    }
    return null;
}

/**
 * Extracts the `serviceMapping` object literal and the module's local callable declarations from
 * a toolService source. The RAW literal is read even where a transparent variadic guard wraps it
 * (github-workflow's `githubWriteIdentityGuard(...args) => delegate(...args)`), because the guard
 * forwards arguments untouched — the delegate's signature is what the census must judge.
 * @param {Object} ast parsed toolService module
 * @returns {{entries: Map<String, Object>, imports: Map, ast: Object}}
 */
export function extractServiceMapping(ast) {
    const imports = collectImports(ast);

    for (const node of ast.body) {
        if (node.type !== 'VariableDeclaration') {
            continue;
        }
        for (const declarator of node.declarations) {
            if (declarator.id?.name === 'serviceMapping' && declarator.init?.type === 'ObjectExpression') {
                const entries = new Map();

                for (const prop of declarator.init.properties) {
                    if (prop.type !== 'Property') {
                        continue;
                    }
                    entries.set(prop.key.name ?? prop.key.value, prop.value);
                }

                return {entries, imports, ast};
            }
        }
    }

    return {entries: new Map(), imports, ast};
}

/**
 * Resolves one serviceMapping value node to its handler CALLABLE NODE.
 * Shapes handled: `Service.method.bind(Service)`, inline arrows/functions, local identifiers
 * (function declarations and const arrows, e.g. github-workflow's `getConversationRouter`), and
 * imported identifiers (one hop into the source module, e.g. knowledge-base's
 * `readDeploymentStateSnapshot` — resolved through its local wrapper). Unresolvable shapes are
 * named, never dropped.
 * @param {Object} valueNode ESTree node of the mapping value
 * @param {Object} ctx {imports, filePath, root, fileCache}
 * @returns {{node: Object, via: String}|{unresolved: String}}
 */
export function resolveHandlerNode(valueNode, ctx) {
    // Service.method.bind(Service) — possibly with extra bound args (none in-repo; noted if seen)
    if (valueNode.type === 'CallExpression' && valueNode.callee?.type === 'MemberExpression' &&
        valueNode.callee.property?.name === 'bind' && valueNode.callee.object?.type === 'MemberExpression') {

        const serviceName = valueNode.callee.object.object.name;
        const methodName  = valueNode.callee.object.property.name;
        const boundExtra  = valueNode.arguments.length - 1;
        const importInfo  = ctx.imports.get(serviceName);

        if (!importInfo) {
            return {unresolved: `${serviceName}.${methodName} — no import for ${serviceName} in ${path.relative(ctx.root, ctx.filePath)}`};
        }

        const servicePath = path.resolve(path.dirname(ctx.filePath), importInfo.source);
        const node        = findCallableNode(loadModule(servicePath, ctx.fileCache), methodName);

        if (node) {
            const via = `${serviceName}.${methodName}` + (boundExtra > 0 ? ` (bind carries ${boundExtra} extra arg(s))` : '');
            return {node, via};
        }

        // One superclass hop: inherited handlers (e.g. a shared HealthService base)
        const superName = findSuperclassName(loadModule(servicePath, ctx.fileCache), serviceName);
        const superInfo = superName && ctx.imports.get(superName);

        if (superInfo) {
            const superPath = path.resolve(path.dirname(ctx.filePath), superInfo.source);
            const superNode = findCallableNode(loadModule(superPath, ctx.fileCache), methodName);

            if (superNode) {
                return {node: superNode, via: `${superName}.${methodName} (inherited by ${serviceName})`};
            }
        }

        return {unresolved: `${serviceName}.${methodName} — method not found in ${path.relative(ctx.root, servicePath)}`};
    }

    // Inline arrow / function expression: the dispatcher binds against THIS signature
    if (valueNode.type === 'ArrowFunctionExpression' || valueNode.type === 'FunctionExpression') {
        return {node: valueNode, via: 'inline handler in serviceMapping'};
    }

    // Local or imported identifier
    if (valueNode.type === 'Identifier') {
        const localNode = findCallableNode(ctx.ast, valueNode.name);

        if (localNode) {
            return {node: localNode, via: `${valueNode.name} (local)`};
        }

        const importInfo = ctx.imports.get(valueNode.name);

        if (importInfo) {
            const targetPath = path.resolve(path.dirname(ctx.filePath), importInfo.source);
            const node       = findCallableNode(loadModule(targetPath, ctx.fileCache),
                importInfo.imported === 'default' ? valueNode.name : importInfo.imported);

            if (node) {
                return {node, via: `${valueNode.name} (imported from ${importInfo.source})`};
            }
        }

        return {unresolved: `${valueNode.name} — neither a local callable nor a resolvable import`};
    }

    return {unresolved: `unhandled mapping value shape: ${valueNode.type}`};
}

/**
 * @summary The parameter-descriptor view of {@link resolveHandlerNode}.
 *
 * Kept as a delegation rather than a second resolver: the `.bind()` unwrapping, superclass hop,
 * local-vs-imported identifier rules and unresolved-naming all live in ONE place, so a new mapping
 * shape is taught to the resolver once and both consumers learn it. The signature-census reads
 * params; the contract-parity lint reads the node.
 *
 * @param {Object} valueNode ESTree node of the mapping value
 * @param {Object} ctx {imports, filePath, root, fileCache, ast}
 * @returns {{params: Object[], via: String}|{unresolved: String}}
 */
export function resolveHandlerParams(valueNode, ctx) {
    const resolved = resolveHandlerNode(valueNode, ctx);

    return resolved.node ? {params: describeParams(resolved.node.params), via: resolved.via} : resolved
}

/**
 * Reads + parses a module once per census run.
 * @param {String} filePath
 * @param {Map} cache
 * @returns {Object} ESTree program
 */
function loadModule(filePath, cache) {
    if (!cache.has(filePath)) {
        cache.set(filePath, parseModule(fs.readFileSync(filePath, 'utf8')));
    }
    return cache.get(filePath);
}

// -------------------------------------------------------------------------------- classification

/**
 * Classifies one operation by reading its handler signature against its dispatch mode.
 * Returns `{klass, form, detail}` where klass is 1 (correct), 2 / 2M / 3 (defect), 'suspect', or
 * 'unresolved'. The classification rules are the mechanical core of the census — every branch
 * names the evidence it judged from, so a contested row is re-judged by re-running, not by prose.
 * @param {Object} row {passAsObject, args, params, via}
 * @returns {{klass: Number|String, form: String, detail: String}}
 */
export function classify({passAsObject, args, params, via}) {
    const argNames    = args.map(a => a.name);
    const positionals = params.filter(p => p.kind === 'positional');
    const hasRest     = params.some(p => p.kind === 'rest');
    const first       = params[0];
    const names       = p => p.map(x => x.name ?? `{${x.keys.join(',')}}`).join(', ');

    if (passAsObject) {
        if (!first) {
            return args.length === 0
                ? {klass: 1, form: 'annotated-nullary', detail: 'no contract args, no handler params'}
                : {klass: 'suspect', form: 'annotated-nullary-with-args', detail: `contract args [${argNames}] unreachable: handler takes no params`};
        }
        if (first.kind === 'destructure') {
            return {klass: 1, form: 'annotated-destructure', detail: `handler destructures the delivered object{${first.keys.join(', ')}}`};
        }
        if (first.kind === 'rest') {
            return {klass: 1, form: 'annotated-variadic', detail: 'rest param receives the object as sole element — tolerated'};
        }
        // first is positional: it receives the whole validated object
        const extras       = positionals.slice(1);
        const shadowed     = extras.filter(p => argNames.includes(p.name));
        const undeclaredOK = extras.every(p => p.hasDefault || !argNames.includes(p.name));

        if (shadowed.length > 0) {
            return {klass: '2M', form: 'annotation-mismatch', detail: `object dispatch binds the whole args object to '${first.name}'; contract-named param(s) [${shadowed.map(p => p.name)}] receive undefined`};
        }
        return {klass: 1, form: extras.length ? 'annotated-bag+injectables' : 'annotated-bag',
            detail: extras.length ? `'${first.name}' receives the object; extra param(s) [${names(extras)}] are injectable seams (undefined from MCP)` : `'${first.name}' receives the whole object`};
    }

    // ---- positional dispatch: handler receives args.length values in contract order
    if (args.length === 0) {
        if (params.length === 0) {
            return {klass: 1, form: 'nullary', detail: 'no contract args, no handler params'};
        }
        if (first.kind === 'destructure') {
            return first.hasDefault
                ? {klass: 1, form: 'nullary-destructure-defaulted', detail: 'handler() falls back to `= {}`; nothing to pass'}
                : {klass: 2, form: 'destructure-nullary-throws', detail: 'handler() destructures undefined with no default — every call throws (loud, not silent)'};
        }
        return positionals.every(p => p.hasDefault)
            ? {klass: 1, form: 'nullary-defaulted', detail: `params [${names(positionals)}] all defaulted`}
            : {klass: 'suspect', form: 'nullary-expects-args', detail: `contract declares no args; handler param(s) [${names(positionals)}] always undefined`};
    }

    if (first?.kind === 'destructure') {
        // Single-object-arg contracts CAN legitimately be destructured (the nested-object case)
        if (args.length === 1 && args[0].type === 'object' && !first.keys.some(k => argNames.includes(k))) {
            const unknownKeys = args[0].properties.length
                ? first.keys.filter(k => !args[0].properties.includes(k))
                : first.keys;

            return unknownKeys.length === 0
                ? {klass: 1, form: 'nested-object-destructure', detail: `destructures keys of the single object arg '${args[0].name}'`}
                : {klass: 'suspect', form: 'nested-object-destructure-unverified', detail: `destructures {${first.keys}} off single object arg '${args[0].name}'; key(s) [${unknownKeys}] not in the contract's declared properties`};
        }
        return {klass: 2, form: 'destructure-under-positional',
            detail: `positional dispatch delivers '${argNames[0]}'${args[0].type ? ` (${args[0].type})` : ''} as the first value; handler destructures {${first.keys.join(', ')}} off it — every key binds undefined${first.hasDefault ? ' (`= {}` keeps even an absent value silent)' : ''}`};
    }

    if (positionals.length < args.length && !hasRest) {
        return {klass: 3, form: 'truncation',
            detail: `handler declares ${positionals.length} param(s) [${names(positionals)}] for ${args.length} contract arg(s) [${argNames}] — [${argNames.slice(positionals.length)}] silently dropped`};
    }

    // positional / superset / variadic: compare the aligned prefix by name
    const prefix     = positionals.slice(0, args.length);
    const misaligned = prefix.filter((p, i) => p.name !== argNames[i]);

    if (misaligned.length > 0) {
        // With exactly one value there is no order to get wrong: a non-generic rename binds the
        // single contract arg correctly regardless of its local name. The only single-arg failure
        // mode is bag-expectation (the handler treats its param as the whole args object).
        if (args.length === 1 && !GENERIC_BAG_NAMES.has(prefix[0]?.name)) {
            return {klass: 1, form: 'positional-rename',
                detail: `single contract arg '${argNames[0]}' binds the renamed handler param '${prefix[0].name}' — no order to mismatch`};
        }
        const genericSingle = args.length === 1 && GENERIC_BAG_NAMES.has(prefix[0]?.name);
        return {klass: 'suspect', form: genericSingle ? 'bag-or-rename' : 'order-mismatch',
            detail: `contract order [${argNames}] vs handler params [${names(positionals)}]${genericSingle ? ` — '${prefix[0].name}' is a generic bag name under positional dispatch` : ''}`};
    }

    if (positionals.length > args.length) {
        return {klass: 1, form: 'positional-superset',
            detail: `contract-exposed prefix [${argNames}] aligns; extra param(s) [${names(positionals.slice(args.length))}] unreachable from MCP (undefined)`};
    }

    return {klass: 1, form: hasRest ? 'positional+rest' : 'positional', detail: `[${argNames}] align with handler params in contract order`};
}

// ---------------------------------------------------------------------------------------- census

/**
 * Censuses one server: contract extraction × binding resolution × classification.
 * @param {String} root repo checkout root
 * @param {Object} server SERVERS entry
 * @returns {Object[]} rows
 */
export function censusServer(root, server) {
    const doc                     = yaml.load(fs.readFileSync(path.join(root, server.openApi), 'utf8'));
    const tsPath                  = path.join(root, server.toolService);
    const tsAst                   = parseModule(fs.readFileSync(tsPath, 'utf8'));
    const {entries, imports, ast} = extractServiceMapping(tsAst);
    const fileCache               = new Map();

    return extractOperations(doc).map(op => {
        const valueNode = entries.get(op.operationId);

        if (!valueNode) {
            return {server: server.id, ...op, klass: 'unresolved', form: 'no-binding', via: '', detail: `no serviceMapping entry for '${op.operationId}'`};
        }

        const resolved = resolveHandlerParams(valueNode, {imports, filePath: tsPath, root, fileCache, ast});

        if (resolved.unresolved) {
            return {server: server.id, ...op, klass: 'unresolved', form: 'handler-not-found', via: '', detail: resolved.unresolved};
        }

        const verdict = classify({passAsObject: op.passAsObject, args: op.args, params: resolved.params, via: resolved.via});

        return {server: server.id, ...op, params: resolved.params, via: resolved.via, ...verdict};
    });
}

/**
 * Runs the census across all servers.
 * @param {String} root
 * @returns {{rows: Object[], totals: Object}}
 */
export function census(root) {
    const rows = SERVERS.flatMap(server => censusServer(root, server));

    const startingSet = rows.filter(r => !r.passAsObject && r.args.length > 0);
    const defectSet   = rows.filter(isDefectRow);
    const suspects    = rows.filter(r => r.klass === 'suspect');
    const unresolved  = rows.filter(r => r.klass === 'unresolved');
    const classOne    = rows.filter(r => r.klass === 1);

    return {
        rows,
        totals: {
            operations : rows.length,
            annotated  : rows.filter(r => r.passAsObject).length,
            startingSet: startingSet.length,
            defectSet  : defectSet.length,
            suspects   : suspects.length,
            unresolved : unresolved.length,
            classOne   : classOne.length
        }
    };
}

// ----------------------------------------------------------------------------------------- report

/**
 * Renders the deterministic markdown report. Row content depends only on the censused tree; the
 * header names the tree by git rev (+ dirty flag) so a re-run against the same rev reproduces
 * every row byte-identically below the header.
 * @param {Object} report census() result
 * @param {Object} meta {root, rev, dirty, generatedAt}
 * @returns {String}
 */
export function renderMarkdown(report, meta) {
    const {rows, totals} = report;
    const lines          = [];

    const defectRows  = rows.filter(isDefectRow);
    const suspectRows = rows.filter(r => r.klass === 'suspect');
    const unresRows   = rows.filter(r => r.klass === 'unresolved');

    lines.push('# MCP Handler-Signature Census');
    lines.push('');
    lines.push(`- tree: \`${meta.rev}\`${meta.dirty ? ' (dirty)' : ''} at \`${meta.root}\``);
    lines.push(`- generated: ${meta.generatedAt}`);
    lines.push(`- method: contract args mirror \`ToolService#initializeToolMapping\`; handler signatures read from AST-resolved \`serviceMapping\` bindings`);
    lines.push('');
    lines.push('## Totals');
    lines.push('');
    lines.push('| measure | count |');
    lines.push('|---|---|');
    lines.push(`| operations censused (6 servers) | ${totals.operations} |`);
    lines.push(`| annotated (\`x-pass-as-object: true\`) | ${totals.annotated} |`);
    lines.push(`| **starting set** — unannotated AND takes arguments | ${totals.startingSet} |`);
    lines.push(`| **defect set** — classes 2 + 2M + 3 | ${totals.defectSet} |`);
    lines.push(`| suspects (mechanically ambiguous, human-judged below) | ${totals.suspects} |`);
    lines.push(`| unresolved bindings (census incomplete there) | ${totals.unresolved} |`);
    lines.push(`| class 1 — correct as-is | ${totals.classOne} |`);
    lines.push('');
    lines.push('> The starting set and the defect set are different numbers by construction: most unannotated operations are genuinely positional and correct. Conflating them is the failure this census exists to avoid.');
    lines.push('');

    lines.push(`## Defect set (${defectRows.length})`);
    lines.push('');
    if (defectRows.length === 0) {
        lines.push('None.');
    } else {
        lines.push('| server | operation | class | form | handler | evidence |');
        lines.push('|---|---|---|---|---|---|');
        for (const r of defectRows) {
            lines.push(`| ${r.server} | \`${r.operationId}\` | ${r.klass} | ${r.form} | \`${r.via}\` | ${r.detail} |`);
        }
    }
    lines.push('');

    lines.push(`## Suspects (${suspectRows.length}) — human judgment, evidence attached`);
    lines.push('');
    if (suspectRows.length === 0) {
        lines.push('None.');
    } else {
        lines.push('| server | operation | form | handler | evidence | verdict |');
        lines.push('|---|---|---|---|---|---|');
        for (const r of suspectRows) {
            lines.push(`| ${r.server} | \`${r.operationId}\` | ${r.form} | \`${r.via}\` | ${r.detail} | ${r.verdict ?? '_open_'} |`);
        }
    }
    lines.push('');

    lines.push(`## Unresolved (${unresRows.length})`);
    lines.push('');
    if (unresRows.length === 0) {
        lines.push('None — every operation resolved to a handler signature.');
    } else {
        lines.push('| server | operation | why |');
        lines.push('|---|---|---|');
        for (const r of unresRows) {
            lines.push(`| ${r.server} | \`${r.operationId}\` | ${r.detail} |`);
        }
    }
    lines.push('');

    lines.push('## Per-server detail');
    for (const server of SERVERS) {
        const serverRows = rows.filter(r => r.server === server.id);
        const nonOne     = serverRows.filter(r => r.klass !== 1);
        const ones       = serverRows.filter(r => r.klass === 1);

        lines.push('');
        lines.push(`### ${server.id} — ${serverRows.length} operations (${ones.length} correct, ${nonOne.length} needing attention)`);
        lines.push('');
        if (nonOne.length > 0) {
            lines.push('| operation | annotated | contract args | class | form | evidence |');
            lines.push('|---|---|---|---|---|---|');
            for (const r of nonOne) {
                lines.push(`| \`${r.operationId}\` | ${r.passAsObject ? 'yes' : 'no'} | [${r.args.map(a => a.name).join(', ')}] | ${r.klass} | ${r.form} | ${r.detail} |`);
            }
            lines.push('');
        }
        lines.push(`<details><summary>Class-1 roll (${ones.length}) — correct as-is; do not "fix" these</summary>`);
        lines.push('');
        lines.push(ones.map(r => `\`${r.operationId}\``).join(', ') || 'None.');
        lines.push('');
        lines.push('</details>');
    }
    lines.push('');

    return lines.join('\n');
}

// -------------------------------------------------------------------------------------------- CLI

/**
 * @param {String[]} argv process.argv.slice(2)
 * @returns {{root: String, out: String|null, json: String|null, failOnDefects: Boolean}}
 */
export function parseCli(argv) {
    const read = flag => argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null;

    return {
        root         : read('--root') ?? repoRoot,
        out          : read('--out'),
        json         : read('--json'),
        failOnDefects: argv.includes('--fail-on-defects')
    };
}

function main() {
    const cli      = parseCli(process.argv.slice(2));
    const root     = path.resolve(cli.root);
    const rev      = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
    const dirty    = execFileSync('git', ['-C', root, 'status', '--porcelain'], {encoding: 'utf8'}).trim().length > 0;
    const report   = census(root);
    const markdown = renderMarkdown(report, {
        root, rev, dirty,
        generatedAt: new Date().toISOString()
    });

    if (cli.out) {
        fs.mkdirSync(path.dirname(path.resolve(cli.out)), {recursive: true});
        fs.writeFileSync(cli.out, markdown);
    }
    if (cli.json) {
        fs.mkdirSync(path.dirname(path.resolve(cli.json)), {recursive: true});
        fs.writeFileSync(cli.json, JSON.stringify(report, null, 2));
    }
    if (!cli.out && !cli.json) {
        process.stdout.write(markdown + '\n');
    }

    console.error(`census: ${report.totals.operations} operations, starting set ${report.totals.startingSet}, defect set ${report.totals.defectSet}, suspects ${report.totals.suspects}, unresolved ${report.totals.unresolved}`);

    if (cli.failOnDefects && report.totals.defectSet > 0) {
        process.exit(1);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
