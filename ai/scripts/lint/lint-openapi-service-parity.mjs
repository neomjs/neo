#!/usr/bin/env node
/**
 * @module ai/scripts/lint/lint-openapi-service-parity
 * @summary Fails when a service method CONSUMES a parameter its OpenAPI operation does not declare,
 * because `ai/services.mjs` routes every such call through a Zod facade that silently strips it.
 *
 * ## The failure this exists to make loud
 *
 * `ai/services.mjs#makeSafe` wraps each MCP-backed service in a validating Proxy:
 *
 * ```js
 * const parsedArgs = zodSchema.parse(args || {});
 * ```
 *
 * The schema is built from the server's `openapi.yaml`, and Zod object parsing **strips keys the
 * schema does not declare**. So a method that gains a parameter without a matching spec property
 * still compiles, still lints, and still passes every unit test that constructs the service
 * directly — then silently never receives that parameter in production, where the call goes through
 * the Proxy. There is no throw, no warning, and nothing in the returned summary. The parameter is
 * simply absent, and the method reads `undefined`.
 *
 * Two live instances shipped this way on `ingest_source_files`: `materializationAttempt` (no
 * receipt ever minted, so every full pull materialization was rejected as `EMPTY_MATERIALIZATION`)
 * and `viaMcp` (`payload.viaMcp !== false` re-read as `true`, forcing in-process bulk paths through
 * the MCP work-volume gate). The first went undetected for weeks. Diagnosing one of them cost about
 * a session, and the defect was a line of YAML that did not exist.
 *
 * ## Why CONSUMPTION is the signal, not JSDoc
 *
 * `ingestSourceFiles(payload = {})` takes a bag and destructures nothing, so its signature carries
 * no parameter names at all — a signature-based check finds nothing on the very operation that
 * motivated this guard. The names appear only as member reads (`payload.viaMcp`) in the body, and
 * that read *is* the failure site. Keying on JSDoc instead would false-positive on a documented but
 * unused param (harmless) while missing a read with no JSDoc at all (the worst case, undeclared
 * everywhere). Consumption also subsumes destructuring, since destructured names are reads.
 *
 * Detection is therefore: **destructured parameter names ∪ `<bagParam>.X` member reads**, compared
 * against the operation's declared parameters and request-body properties.
 *
 * ## Known blind spots, stated rather than discovered
 *
 * - **Dynamic access** (`payload[key]`) is undecidable here and is not reported.
 * - **Wholesale forwarding** (`helper(payload)`) hides consumption in the callee; only direct reads
 *   on the bound parameter are seen.
 *
 * Both are narrower than the JSDoc approach's blind spot, not wider. A guard that overstated its
 * coverage would be worse than one that names its edges.
 *
 * ## Relationship to the sibling instrument
 *
 * `ai/scripts/diagnostics/mcpHandlerSignatureCensus.mjs` covers the **ToolService** dispatch path —
 * whether a handler's signature matches its dispatch mode. This covers the **`services.mjs` Proxy**
 * path — whether the contract is complete with respect to what the method reads. Same pair of
 * artifacts, different join and different failure mode; the coverage is complementary rather than
 * overlapping, which is why both exist. Shared AST helpers are imported from that module so the two
 * cannot drift into disagreeing about what a parameter is.
 */

import fs                                        from 'node:fs';
import path                                      from 'node:path';
import {fileURLToPath}                           from 'node:url';
import * as yaml                                 from 'js-yaml';
import {collectImports, parseModule, resolveRef} from '../diagnostics/mcpHandlerSignatureCensus.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, '../../..');

/**
 * Suppression entries for parameters a method legitimately reads without the contract declaring
 * them. Each row must state WHY, so a suppression is a visible decision rather than an omission.
 * Keyed `<operationId>.<paramName>`.
 * @type {Object<String,String>}
 */
export const PARITY_BASELINE = Object.freeze({
    // PERMANENT — correct as designed, and declaring it would be a regression. `now` is an injected
    // clock with a working default (`now = new Date()`), used identically across `bootstrap`,
    // `retireStaleHarnessPresence` and `whoIsOnline`. Exposing it in the contract would let a caller
    // supply an arbitrary "current time" to a liveness computation — i.e. lie about whether a peer is
    // online. Do not "fix" this by widening the schema.
    'who_is_online.now': 'Injected clock (test seam) with a working default; agent-settable time would let a caller falsify peer liveness. Deliberately internal.',

    // DEBT — genuine contract gaps awaiting individual disposition; each row's reason names the
    // tracking ticket, which is where a decay-prone reference belongs. Not suppressed: the capability
    // exists in the service and is unreachable from outside it, and declaring a parameter makes it
    // agent-settable, which is a per-parameter design decision (bounds for traversal knobs, payload
    // cost for response-widening flags).
    'manage_knowledge_base.viaMcp'       : 'Work-volume-gate selector, always false. Third live instance of this parameter name; disposition under #16611 citing #16577.',
    'manage_knowledge_base.staleStrategy': 'Stale-row handling strategy, always undefined. Disposition under #16611; adjacent to #16590 stale-id scoping.',
    'query_documents.includeMetadata'    : 'Metadata unreachable through the tool, always false. Disposition under #16611; interacts with #16588 payload size.',
    'get_context_frontier.depth'         : 'Frontier depth permanently 2. Disposition under #16611; needs a maximum if declared, or an agent can request an arbitrarily deep walk.'
});

/**
 * Mirrors `ai/services.mjs#camelToSnake` — the in-process join from method name to `operationId`.
 * @param {String} str
 * @returns {String}
 */
export function camelToSnake(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * @summary Reads the `makeSafe(service, spec)` declaration table out of `ai/services.mjs`.
 *
 * Derived from the source rather than restated, so adding a service to the SDK brings it under this
 * guard automatically. A hand-maintained list would silently exempt exactly the newest code, which
 * is the code most likely to carry the defect.
 *
 * @param {String} rootDir Repository root.
 * @returns {Array<{serviceName: String, modulePath: String, specPath: String}>}
 */
export function extractWrappedServices(rootDir) {
    const servicesPath = path.join(rootDir, 'ai/services.mjs'),
          source       = fs.readFileSync(servicesPath, 'utf8'),
          ast          = parseModule(source),
          imports      = collectImports(ast),
          specPaths    = new Map(),
          wrapped      = [];

    // `const ghSpec = safeLoadYaml(path.join(__dirname, 'mcp/server/…/openapi.yaml'))`
    for (const node of ast.body) {
        if (node.type !== 'VariableDeclaration') continue;

        for (const declarator of node.declarations) {
            const init = declarator.init;

            if (init?.type === 'CallExpression' && init.callee?.name === 'safeLoadYaml') {
                const literal = findFirstStringLiteral(init);
                if (literal) {
                    specPaths.set(declarator.id.name, path.join(rootDir, 'ai', literal));
                }
            }

            if (init?.type === 'CallExpression' && init.callee?.name === 'makeSafe') {
                const [serviceArg, specArg] = init.arguments;

                if (serviceArg?.type === 'Identifier' && specArg?.type === 'Identifier') {
                    wrapped.push({
                        serviceName  : declarator.id.name,
                        importedAs   : serviceArg.name,
                        importBinding: imports.get(serviceArg.name) ?? null,
                        specPathToken: specArg.name
                    });
                }
            }
        }
    }

    // `collectImports` returns `{source, imported}` per binding, not a bare path — reading it as a
    // string would silently produce `undefined` module paths and a guard that scanned nothing.
    return wrapped.map(entry => {
        const source = entry.importBinding?.source ?? null;

        return {
            serviceName: entry.serviceName,
            modulePath : source ? path.join(rootDir, 'ai', source.replace(/^\.\//, '')) : null,
            specPath   : specPaths.get(entry.specPathToken) ?? null
        };
    }).filter(entry => entry.modulePath && entry.specPath);
}

/**
 * Walks a call expression for its first string literal — `path.join(__dirname, '<here>')`.
 * @param {Object} node
 * @returns {String|null}
 */
function findFirstStringLiteral(node) {
    for (const arg of node.arguments ?? []) {
        if (arg.type === 'Literal' && typeof arg.value === 'string') return arg.value;
        if (arg.type === 'CallExpression') {
            const nested = findFirstStringLiteral(arg);
            if (nested) return nested;
        }
    }
    return null;
}

/**
 * @summary The names an operation DECLARES: query/path parameters plus request-body properties.
 *
 * `$ref` is resolved one level, matching `openApiValidator.mjs#resolveRef`, because the runtime
 * schema resolves it — a guard that stopped at the `$ref` would report a declared param as missing.
 *
 * @param {Object} doc       Parsed OpenAPI document.
 * @param {Object} operation
 * @returns {Set<String>}
 */
export function declaredNames(doc, operation) {
    const names = new Set();

    for (const parameter of operation.parameters ?? []) {
        if (parameter.name) names.add(parameter.name);
    }

    const bodySchema = operation.requestBody?.content?.['application/json']?.schema;

    if (bodySchema) {
        const resolved = bodySchema.$ref ? resolveRef(doc, bodySchema.$ref) : bodySchema;

        for (const key of Object.keys(resolved?.properties ?? {})) {
            names.add(key);
        }
    }

    return names;
}

/**
 * @summary The names a method CONSUMES: destructured parameter keys plus member reads on its bag.
 *
 * @param {Object} fnNode Function/method AST node.
 * @returns {{consumed: Set<String>, bagParam: String|null, destructured: Boolean}}
 */
export function consumedNames(fnNode) {
    const consumed     = new Set();
    const first        = fnNode.params?.[0];
    let   bagParam     = null;
    let   destructured = false;

    if (first) {
        // `foo({a, b})` and `foo({a, b} = {})` — the destructured keys ARE the reads.
        const pattern = first.type === 'AssignmentPattern' ? first.left : first;

        if (pattern.type === 'ObjectPattern') {
            destructured = true;
            for (const property of pattern.properties) {
                if (property.type === 'Property' && property.key?.name) consumed.add(property.key.name);
                // A rest element re-exposes everything, so nothing can be proven absent.
                if (property.type === 'RestElement') return {consumed, bagParam: null, destructured, rest: true};
            }
        } else if (pattern.type === 'Identifier') {
            bagParam = pattern.name;
        }
    }

    // `payload.viaMcp` — the read that evaluates `undefined` once Zod has stripped the key.
    if (bagParam) {
        walk(fnNode.body, node => {
            if (node.type === 'MemberExpression' &&
                node.object?.type === 'Identifier' && node.object.name === bagParam &&
                !node.computed && node.property?.type === 'Identifier') {
                consumed.add(node.property.name);
            }
        });
    }

    return {consumed, bagParam, destructured};
}

/**
 * Minimal AST walk. Deliberately local and shape-agnostic: it visits every object with a `type`
 * rather than switching on node kinds, so a syntax form this file has not anticipated is traversed
 * instead of silently skipped — an unvisited branch would read as "no reads found".
 * @param {Object} root
 * @param {Function} visit
 */
function walk(root, visit) {
    if (!root || typeof root !== 'object') return;

    if (Array.isArray(root)) {
        for (const item of root) walk(item, visit);
        return;
    }

    if (typeof root.type === 'string') visit(root);

    for (const key of Object.keys(root)) {
        if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
        walk(root[key], visit);
    }
}

/**
 * @summary Collects every class method / assigned function in a module, keyed by name.
 * @param {Object} ast
 * @returns {Map<String,Object>}
 */
export function collectMethods(ast) {
    const methods = new Map();

    walk(ast, node => {
        if (node.type === 'MethodDefinition' && node.key?.name && node.value) {
            if (!methods.has(node.key.name)) methods.set(node.key.name, node.value);
        }
    });

    return methods;
}

/**
 * @summary Runs the parity check over every service `ai/services.mjs` wraps.
 * @param {Object}  [options]
 * @param {String}  [options.rootDir=ROOT_DIR]
 * @returns {{violations: Object[], checked: Number, operationsMatched: Number, servicesScanned: Number}}
 */
export function lintOpenApiServiceParity({rootDir = ROOT_DIR} = {}) {
    const services   = extractWrappedServices(rootDir),
          violations = [],
          specCache  = new Map();

    let operationsMatched = 0;

    for (const service of services) {
        if (!fs.existsSync(service.modulePath) || !fs.existsSync(service.specPath)) continue;

        if (!specCache.has(service.specPath)) {
            specCache.set(service.specPath, yaml.load(fs.readFileSync(service.specPath, 'utf8')));
        }

        const doc     = specCache.get(service.specPath),
              ast     = parseModule(fs.readFileSync(service.modulePath, 'utf8')),
              methods = collectMethods(ast),
              byId    = indexOperations(doc);

        for (const [methodName, fnNode] of methods) {
            const operationId = camelToSnake(methodName),
                  operation   = byId.get(operationId);

            if (!operation) continue;

            operationsMatched++;

            const declared         = declaredNames(doc, operation),
                  {consumed, rest} = consumedNames(fnNode);

            // A rest element re-admits every key, so absence cannot be proven and silence here
            // would be a false green rather than a pass.
            if (rest) continue;

            for (const name of consumed) {
                if (declared.has(name)) continue;
                if (PARITY_BASELINE[`${operationId}.${name}`]) continue;

                violations.push({
                    operationId,
                    param  : name,
                    method : methodName,
                    service: service.serviceName,
                    module : path.relative(rootDir, service.modulePath),
                    spec   : path.relative(rootDir, service.specPath)
                });
            }
        }
    }

    return {
        violations,
        checked        : services.length,
        operationsMatched,
        servicesScanned: services.length
    };
}

/**
 * Indexes a document's operations by `operationId`.
 * @param {Object} doc
 * @returns {Map<String,Object>}
 */
function indexOperations(doc) {
    const byId = new Map();

    for (const pathItem of Object.values(doc?.paths ?? {})) {
        for (const operation of Object.values(pathItem ?? {})) {
            if (operation?.operationId) byId.set(operation.operationId, operation);
        }
    }

    return byId;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const result = lintOpenApiServiceParity();

    if (result.violations.length > 0) {
        console.error(`[lint-openapi-service-parity] FAILED — ${result.violations.length} consumed-but-undeclared parameter(s):\n`);

        for (const violation of result.violations) {
            console.error(`- ${violation.operationId} reads \`${violation.param}\` — not declared in ${violation.spec}`);
            console.error(`    ${violation.module} → ${violation.method}()`);
        }

        console.error(
            `\nThe Zod facade in ai/services.mjs STRIPS undeclared keys, so each of these reads ` +
            `\`undefined\` in production while every direct-construction unit test passes. Declare the ` +
            `parameter in the operation's schema, or add an explicit PARITY_BASELINE row stating why ` +
            `the read is legitimate.\n`
        );
        process.exit(1);
    }

    console.log(
        `[lint-openapi-service-parity] OK — ${result.servicesScanned} wrapped service(s), ` +
        `${result.operationsMatched} operation-bound method(s), 0 consumed-but-undeclared parameter(s).`
    );
}
