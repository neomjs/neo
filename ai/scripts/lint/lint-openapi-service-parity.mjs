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
 * Detection covers **four statically decidable forms**, unioned, and compared against the operation's
 * declared parameters and request-body properties:
 *
 * 1. **Parameter destructuring** — `foo({a, b})`, `foo({a, b} = {})`.
 * 2. **Dotted bag read** — `payload.viaMcp`.
 * 3. **Body destructuring** — `const {a, b} = bag`, `= bag || {}`, `= bag ?? {}`.
 * 4. **Literal computed read** — `options['file']`.
 *
 * Forms 3 and 4 were missing from the first version, and their absence was a **false green on real
 * production code**: `PullRequestService#getPullRequestDiff(options)` does
 * `const {pr_number, file, sha, files_only} = options || {}`, and the checker reported ZERO consumed
 * names for it while CI was fully green. A guard that claims an invariant and misses the most common
 * production shape is worse than no guard, because its green is read as coverage.
 *
 * A `...rest` element in either destructuring position re-admits every key, so absence cannot be
 * proven and the bundle is skipped rather than passed.
 *
 * ## Known blind spots, stated rather than discovered
 *
 * - **Dynamic access with a NON-LITERAL key** (`payload[someVar]`) is undecidable and not reported.
 *   The earlier wording said "dynamic access" without separating a string literal from a variable
 *   key, which let a fully decidable form hide behind an honest-sounding caveat — the caveat is real,
 *   it was just wider than the truth.
 * - **Wholesale forwarding** (`helper(payload)`) hides consumption in the callee; only direct reads
 *   on the bound parameter are seen.
 *
 * Both are narrower than the JSDoc approach's blind spot, not wider. A guard that overstated its
 * coverage would be worse than one that names its edges — which is why this list is now shorter than
 * it was, rather than longer.
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

import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import * as yaml       from 'js-yaml';
import {
    collectImports,
    extractOperations,
    extractServiceMapping,
    parseModule,
    resolveHandlerNode,
    resolveRef,
    SERVERS
} from '../diagnostics/mcpHandlerSignatureCensus.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, '../../..');

/**
 * Suppression entries for parameters a method legitimately reads without the contract declaring
 * them. Each row must state WHY, so a suppression is a visible decision rather than an omission.
 *
 * Keyed **`<serverId>.<operationId>.<paramName>`** — three coordinates, because `operationId` is
 * unique per document and NOT repository-global. `healthcheck` and `get_mcp_tool_handbook` already
 * exist on several servers, so an operation-scoped key would let a suppression on one server silently
 * absolve the same-named operation on another; a param-only key is worse still, since `viaMcp` has
 * three live instances across two operations and one row would have hidden all of them.
 * @type {Object<String,String>}
 */
export const PARITY_BASELINE = Object.freeze({
    // PERMANENT — correct as designed, and declaring it would be a regression. `now` is an injected
    // clock with a working default (`now = new Date()`), used identically across `bootstrap`,
    // `retireStaleHarnessPresence` and `whoIsOnline`. Exposing it in the contract would let a caller
    // supply an arbitrary "current time" to a liveness computation — i.e. lie about whether a peer is
    // online. Do not "fix" this by widening the schema.
    'memory-core.who_is_online.now': 'Injected clock (test seam) with a working default; agent-settable time would let a caller falsify peer liveness. Deliberately internal.',

    // PERMANENT — the same clock-seam class as `who_is_online.now` above, and the same refusal for the
    // same reason. These three relocate Neural Link's durable data onto the one graph, and every one of
    // them stamps a time a later reader trusts: `archivedAt` on an archive, `lastReplayedAt` on a replay,
    // `timestamp` on an admitted telemetry row. Declaring `now` would make those stamps caller-supplied,
    // so a host could archive a transaction "yesterday", backdate a replay, or place telemetry outside a
    // window an aggregate is computed over — falsifying WHEN something happened rather than whether it
    // did. The default (`Date.now()`) is the production path and the parameter exists only so a spec can
    // assert an exact stamp instead of a tolerance. Do not "fix" these by widening the schema.
    'memory-core.save_nl_transaction.now'         : 'Injected clock (test seam) with a working default; agent-settable time would let a caller backdate an archive stamp a reader trusts. Deliberately internal.',
    'memory-core.mark_nl_transaction_replayed.now': 'Injected clock (test seam) with a working default; agent-settable time would let a caller backdate a replay mark. Deliberately internal.',
    'memory-core.admit_nl_actions.now'            : 'Injected clock (test seam) with a working default; agent-settable time would let a caller place telemetry outside the window an aggregate is computed over. Deliberately internal.',

    // DEBT — genuine contract gaps awaiting individual disposition; each row's reason names the
    // tracking ticket, which is where a decay-prone reference belongs. Not suppressed: the capability
    // exists in the service and is unreachable from outside it, and declaring a parameter makes it
    // agent-settable, which is a per-parameter design decision (bounds for traversal knobs, payload
    // cost for response-widening flags).
    'knowledge-base.manage_knowledge_base.viaMcp'       : 'PERMANENT. Not a gap: MCP dispatch forces true after Zod strips any caller value, and the services.mjs/CLI path correctly defaults to false (the documented long-running-work bypass). Declaring it would let a caller disable the work-volume gate through a public surface. Withdrawn from #16611.',
    'knowledge-base.manage_knowledge_base.staleStrategy': 'PERMANENT. One of its two values (delete-upfront) removes stale rows BEFORE embedding, so a failure between the two loses both; the operator surface already exists as NEO_KB_STALE_STRATEGY. Declaring it would only add remote selection of the destructive branch. #16577 is what makes that cost concrete rather than theoretical: it measured a materialization that reported success while leaving no durable proof, so the window between "stale rows deleted" and "replacements embedded" is a state this pipeline demonstrably reaches — and a caller who selects the destructive branch remotely cannot see that it did. Dispositioned on #16611.',
    'knowledge-base.query_documents.includeMetadata'    : 'PERMANENT. An internal RAG-synthesis hydration flag with exactly one caller (SearchService), not a caller-facing capability — the surface that needs metadata is ask_knowledge_base, which sets it. Nothing is unreachable. Dispositioned on #16611.',
    // PERMANENT — and the row's own history is the warning. It previously read TRANSITIONAL, claiming
    // `depth` was measured dead and should be DELETED. That measurement was taken on the wrong method:
    // there are two `getContextFrontier`s. The one bound to this operation (`MemoryService`) takes no
    // parameters at all and calls `GraphService.getContextFrontier()` forwarding nothing; the live
    // `depth` read belongs to `GraphService`, whose only caller passes a literal
    // (`GoldenPathSynthesizer` → `{depth: 1}`). So the parameter is neither dead nor reachable through
    // MCP, and deleting it would break an internal traversal knob that is genuinely in use. Declaring
    // it would advertise a knob the bound method cannot forward. A shared method name is not a shared
    // method — measure the one the operation actually binds.
    'memory-core.get_context_frontier.depth'            : 'PERMANENT. Not reachable through this operation and not dead. The bound method (MemoryService.getContextFrontier) declares no parameters and forwards none; `depth` is an internal graph-traversal knob on the same-named GraphService method, whose sole caller supplies a literal. Declaring it would advertise a knob the bound method cannot pass through; deleting it would remove one that is in use internally. Dispositioned on #16611.',

    // ── First findings from the ToolService dispatch join (the 142-operation object-dispatch path) ──
    // PERMANENT — both are the `now` class: an injected test seam with a working default, where the
    // JSDoc states the intent outright ("Test seam for bounding Chroma metadata reads"). Declaring a
    // timeout would let a caller set an arbitrary bound on a Chroma read — either starving it or
    // removing the bound that exists to stop a slow metadata fetch from hanging the call. A test
    // seam and an input are different things, and the default resolving from config
    // (`aiConfig.memoryService.chromaFetchTimeoutMs`) rather than from a literal is what says so.
    'memory-core.get_session_memories.chromaTimeoutMs': 'Injected Chroma-read timeout seam with a config-resolved default; agent-settable would mean an arbitrary or absent bound on a metadata read. Deliberately internal, same class as who_is_online.now.',
    'memory-core.resume_session.chromaTimeoutMs'      : 'Injected Chroma-read timeout seam with a constant default (CHROMA_SESSION_READ_TIMEOUT_MS); same reason as the sibling row above. Deliberately internal.',

    // DEBT — a genuine caller-facing capability, and NOT one to fix by widening the schema on sight.
    // `memorySharing` is a TENANT-ISOLATION policy override, already declared on two other
    // memory-core operations, so precedent says exposing it is acceptable somewhere. Whether it is
    // acceptable HERE is a security disposition, and a lint PR is the wrong place to silently widen
    // a memory-visibility surface — the row's reason names where that decision is tracked.
    // ── First finding from the ADVISORY direction on the ToolService path ──────────────────────
    // Not a stripped read — the inverse. `get_all_summaries` DECLARES `category` with the
    // description "Filter by category", and its operation description tells an agent to "find
    // sessions related to a specific category of work". The bound handler never read it, so an agent
    // filtering received unfiltered results and no error — documentation actively instructing callers
    // to use a parameter that does nothing is worse than an undocumented gap.
    //
    // RESOLVED by wiring rather than by retreating: `listSummaries` now applies `category` DB-side in
    // the metadata sweep, composing with tenancy via `$and` exactly as `querySummaries` does. The row
    // is deleted rather than converted because the parameter is now both declared AND consumed, which
    // is the state this gate exists to require — a suppression would re-hide it.
    'memory-core.get_session_memories.memorySharing': 'PERMANENT. Deliberately internal: an agent-settable value is a self-service read-scope selector, not a filter. `policy === "team"` sets `tenantScope = null`, dropping the `userId` predicate so the query returns every maintainer\'s records for the session. Harmless on the shipped `team` default — which is exactly why the default is not the case that decides it: a deployment configuring per-org isolation sets `defaultPolicy = "private"`, and there a declared parameter lets a caller re-select `team` and read past the isolation the operator asked for. The risk is concentrated on the one deployment shape that opted in. The siblings that DO declare it (`query_raw_memories`, `query_summaries`) are therefore NOT precedent to follow here — they are over-exposed on a private-default plane, which is a contract-breaking change plus a security disposition and so is not repaired from a lint row.'
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
 * @summary Minimum number of wrapped services this gate must discover.
 *
 * A TRIPWIRE, not a target. The gate's whole value is that every MCP-backed service is inside it, and
 * its one catastrophic failure is losing services while still reporting OK. That is not hypothetical:
 * splitting the SDK into a host barrel and a cloud composition root dropped discovery from 40 services
 * / 121 operation-bound methods to 23 / 38 — reported as `OK`, exit 0. Eighty-three methods left a CI
 * gate with no diagnostic, because a file the gate never opens produces no findings to ignore.
 *
 * Raise this when the service count genuinely grows. Never lower it to make a run pass: a drop means
 * either services were deleted (say so in the commit) or a barrel stopped being discovered, and the
 * second is the failure this constant exists to make loud.
 */
const MIN_WRAPPED_SERVICES = 40;

/**
 * @summary Every SDK barrel that may contain `makeSafe(...)` declarations.
 *
 * Discovered rather than listed. A hardcoded path was correct while there was one barrel and became a
 * silent coverage hole the moment there were two; hardcoding two would be correct until there are
 * three. The glob makes a new barrel join the gate by existing, which is the only version of this that
 * survives the next split.
 * @param {String} rootDir Repository root.
 * @returns {String[]} Absolute paths, sorted for deterministic output.
 */
export function discoverServiceBarrels(rootDir) {
    const aiDir = path.join(rootDir, 'ai');

    return fs.readdirSync(aiDir)
        .filter(name => /^services(\.[a-z0-9-]+)?\.mjs$/.test(name))
        .map(name => path.join(aiDir, name))
        .sort()
}

/**
 * @summary Reads the `makeSafe(service, spec)` declaration table out of every SDK barrel.
 *
 * Derived from the source rather than restated, so adding a service to the SDK brings it under this
 * guard automatically. A hand-maintained list would silently exempt exactly the newest code, which
 * is the code most likely to carry the defect.
 *
 * @param {String} rootDir Repository root.
 * @returns {Array<{serviceName: String, modulePath: String, specPath: String}>}
 */
export function extractWrappedServices(rootDir) {
    return discoverServiceBarrels(rootDir)
        .flatMap(barrelPath => extractWrappedServicesFromBarrel(rootDir, barrelPath))
}

/**
 * @summary Fails closed when discovery over the REAL tree returns fewer services than the floor.
 *
 * Scoped to the real repository on purpose. The end-to-end specs drive this lint against small
 * synthetic fixture roots holding two or three services, so a floor inside the shared extractor
 * would reject every fixture — the guard would be "working" while making its own test suite
 * unrunnable, which is a worse failure than the one it prevents.
 * @param {Object[]} services Discovered services.
 * @param {String}   rootDir  Root the discovery ran against.
 * @throws {Error} When the real tree drops below the floor.
 */
function assertDiscoveryFloor(services, rootDir) {
    if (rootDir !== ROOT_DIR || services.length >= MIN_WRAPPED_SERVICES) return;

    const discovered = discoverServiceBarrels(rootDir).map(file => path.basename(file));

    throw new Error(
        `[lint-openapi-service-parity] discovered ${services.length} wrapped service(s) across ` +
        `${discovered.length} barrel(s) (${discovered.join(', ')}), below the ${MIN_WRAPPED_SERVICES} ` +
        'floor. Either a barrel stopped being discovered or services were removed — a silent drop is ' +
        'the failure this gate exists to prevent, so it fails closed rather than reporting OK on ' +
        'reduced coverage.'
    )
}

/**
 * @summary The single-barrel half of {@link extractWrappedServices}.
 * @param {String} rootDir Repository root.
 * @param {String} servicesPath Absolute path of one barrel.
 * @returns {Array<{serviceName: String, modulePath: String, specPath: String}>}
 */
function extractWrappedServicesFromBarrel(rootDir, servicesPath) {
    const source    = fs.readFileSync(servicesPath, 'utf8'),
          ast       = parseModule(source),
          imports   = collectImports(ast),
          specPaths = new Map(),
          wrapped   = [];

    // `const ghSpec = safeLoadYaml(path.join(__dirname, 'mcp/server/…/openapi.yaml'))`
    //
    // `export const X = makeSafe(…)` is unwrapped rather than skipped. Today every one of the 40
    // live bindings is a bare `const` with a separate export, so this branch is unreachable on the
    // current tree — which is exactly why it is here. Discovery that silently ignores a declaration
    // form means a service written that way disappears from the gate and its absence reads as a
    // pass, and a false green from a silent skip is the precise failure this whole lint exists to
    // make loud. Cheaper to accept the form than to rely on nobody ever typing it.
    for (const outer of ast.body) {
        const node = outer.type === 'ExportNamedDeclaration' ? outer.declaration : outer;

        if (node?.type !== 'VariableDeclaration') continue;

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

    // Three consuming forms on the bag, all statically decidable. The first version recognised only
    // the second and reported ZERO consumed names for `getPullRequestDiff(options)` —
    // `const {pr_number, file, sha, files_only} = options || {}` — a real wrapped method consuming
    // four parameters. A guard that claims an invariant while missing the most common production
    // shape is worse than no guard, because its green is read as coverage.
    let rest = false;

    // Occurrences of the bag identifier we can ACCOUNT for (a named read or a destructuring source)
    // versus every occurrence of it. A surplus means the bag itself travelled somewhere this walker
    // cannot follow — `this.resolveTenantContext(payload)`, `{...payload}`, `return payload`. Those
    // are real reads of names we never see, so `consumed` stops being a complete view.
    //
    // This distinction does not matter for the FAILING direction, which only needs `consumed` to be
    // a lower bound: every name it does see is genuinely read. It is decisive for the advisory
    // direction, whose claim is the complement — "no method reads this" — and a lower bound cannot
    // support an absence claim. Tracking it here rather than in the caller keeps the one walker as
    // the single authority on what it can and cannot see.
    let bagOccurrences = 0,
        bagAccounted   = 0,
        dynamicRead    = false;

    if (bagParam) {
        walk(fnNode.body, node => {
            if (node.type === 'Identifier' && node.name === bagParam) bagOccurrences++;

            // 1. BODY destructuring: `const {a, b} = bag`, `= bag || {}`, `= bag ?? {}`.
            if (node.type === 'VariableDeclarator' && node.id?.type === 'ObjectPattern' && node.init) {
                const source = node.init.type === 'LogicalExpression' ? node.init.left : node.init;

                if (source?.type === 'Identifier' && source.name === bagParam) {
                    bagAccounted++;
                    for (const property of node.id.properties) {
                        if (property.type === 'Property' && property.key?.name) consumed.add(property.key.name);
                        // `...rest` re-exposes every key, so no name can be proven absent.
                        if (property.type === 'RestElement') rest = true;
                    }
                }
            }

            if (node.type !== 'MemberExpression') return;
            if (node.object?.type !== 'Identifier' || node.object.name !== bagParam) return;

            bagAccounted++;

            // 2. Dotted read: `payload.viaMcp` — evaluates `undefined` once Zod has stripped the key.
            if (!node.computed && node.property?.type === 'Identifier') {
                consumed.add(node.property.name);
            }

            // 3. LITERAL computed read: `options['file']`. Decidable, and previously invisible —
            //    the blind-spot list named dynamic access without distinguishing a string literal
            //    from a variable key, so a whole decidable form hid behind an honest-sounding caveat.
            if (node.computed && node.property?.type === 'Literal' && typeof node.property.value === 'string') {
                consumed.add(node.property.value);
            }

            // 4. DYNAMIC computed read: `options[someVar]`. Undecidable, and it must clear
            //    `complete` rather than merely be absent from `consumed`.
            //
            //    This module's blind-spot list already named dynamic access — but named it for the
            //    FAILING direction, where it is harmless: that direction needs `consumed` to be a
            //    lower bound, and an unseen read simply keeps it lower. Carrying the same caveat into
            //    the advisory direction is NOT harmless, because there the claim is the complement.
            //    Without this branch `m(o, k) { return o[k] }` reported `complete: true` with
            //    `consumed: []` — a read that happened, cannot be named, and was certified as a full
            //    view. Every declared parameter on such an operation would have been reported unused.
            //
            //    The lesson generalises past this line: a documented blind spot's harmlessness is
            //    DIRECTION-SPECIFIC, so reusing a helper in the opposite direction re-opens every
            //    caveat its docs had already retired.
            if (node.computed && !(node.property?.type === 'Literal' && typeof node.property.value === 'string')) {
                dynamicRead = true;
            }
        });
    }

    if (rest) return {consumed, bagParam, destructured, rest: true};

    // `complete` = every read of this parameter is visible in `consumed`. True when the signature
    // destructured it (there is no bag left to forward), or when the bag exists and every one of its
    // occurrences was a read we recorded. Consumed by the advisory direction ONLY; the failing
    // direction is sound without it.
    const complete = !dynamicRead && (destructured || (bagParam ? bagOccurrences === bagAccounted : true));

    return {consumed, bagParam, destructured, complete};
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
    const services           = extractWrappedServices(rootDir),
          violations         = [],
          unusedDeclarations = [],
          perOperation       = new Map(),
          specCache          = new Map();

    assertDiscoveryFloor(services, rootDir);

    let operationsMatched = 0;

    for (const service of services) {
        if (!fs.existsSync(service.modulePath) || !fs.existsSync(service.specPath)) continue;

        if (!specCache.has(service.specPath)) {
            specCache.set(service.specPath, yaml.load(fs.readFileSync(service.specPath, 'utf8')));
        }

        const doc     = specCache.get(service.specPath),
              ast     = parseModule(fs.readFileSync(service.modulePath, 'utf8')),
              methods = collectMethods(ast),
              byId    = indexOperations(doc),
              // The owning server directory — `ai/mcp/server/<serverId>/openapi.yaml`. Derived from
              // the spec path rather than restated, so a new server is scoped correctly without a
              // list to forget to update.
              serverId = path.basename(path.dirname(service.specPath));

        for (const [methodName, fnNode] of methods) {
            const operationId = camelToSnake(methodName),
                  operation   = byId.get(operationId);

            if (!operation) continue;

            operationsMatched++;

            const declared                   = declaredNames(doc, operation),
                  {complete, consumed, rest} = consumedNames(fnNode);

            // A rest element re-admits every key, so absence cannot be proven and silence here
            // would be a false green rather than a pass.
            if (rest) continue;

            for (const name of consumed) {
                if (declared.has(name)) continue;
                // SERVER-SCOPED, because `operationId` is unique per document and NOT repository-global.
                // Six servers each own an `openapi.yaml`, and `healthcheck` / `get_mcp_tool_handbook`
                // already exist on several of them — so a bare `<operationId>.<param>` key would let a
                // suppression on one server silently absolve the same-named operation on another. That
                // is the identical failure the `viaMcp` rows warn about (three live instances of one
                // parameter name), one coordinate up.
                if (PARITY_BASELINE[`${serverId}.${operationId}.${name}`]) continue;

                violations.push({
                    operationId,
                    param  : name,
                    method : methodName,
                    service: service.serviceName,
                    module : path.relative(rootDir, service.modulePath),
                    spec   : path.relative(rootDir, service.specPath)
                });
            }

            // ── Accumulate for the inverse direction; it CANNOT be decided here ─────────────────
            // One operation is frequently served by SEVERAL same-named methods on different
            // services — `get_conversation` is implemented by DiscussionService, IssueService and
            // PullRequestService, each destructuring only the keys it owns. Deciding "unused" inside
            // this per-method loop reported every sibling's parameters as dead: 14 findings, all
            // false. So the union across every method bound to an operationId is the only sound
            // denominator, and it is not available until every service has been walked.
            const key   = `${serverId}.${operationId}`;
            let   entry = perOperation.get(key);

            if (!entry) {
                entry = {serverId, operationId, declared, consumed: new Set(), complete: true, methods: [], specs: new Set()};
                perOperation.set(key, entry);
            }

            for (const name of consumed) entry.consumed.add(name);

            // AND across contributors: one un-analysable implementation makes the whole operation's
            // absence claim unprovable, because the names it hides could be exactly these.
            entry.complete &&= complete === true;
            entry.methods.push(`${service.serviceName}.${methodName}`);
            entry.specs.add(path.relative(rootDir, service.specPath));
        }
    }

    // ── The inverse direction, and deliberately NON-FAILING ─────────────────────────────────────
    // A declared parameter nothing reads is the mirror of the failing defect and NOT its equal: the
    // failing direction silently destroys input a caller supplied, while this one costs an agent a
    // plausible parameter that does nothing. Real, worth surfacing, and usually a contract that
    // outlived a refactor.
    //
    // Non-failing is a judgement about incentives rather than importance: a gate that fails the
    // build on stale declarations earns an exemption row per stale declaration, and the baseline
    // then documents debt instead of the invariant. The failing arm stays reserved for data loss.
    //
    // `complete` is the load-bearing gate. `consumedNames` is a LOWER BOUND on reads by
    // construction — sound for "consumed but undeclared", useless for its complement. An operation
    // whose implementation forwards its whole bag (`this.resolveTenantContext(payload)`) reads names
    // this walker never sees, so claiming they are unused would be a fabricated absence. Staying
    // silent there is the same discipline the failing direction applies to a `rest` element.
    for (const entry of perOperation.values()) {
        if (!entry.complete) continue;

        for (const name of entry.declared) {
            if (entry.consumed.has(name)) continue;
            if (PARITY_BASELINE[`${entry.serverId}.${entry.operationId}.${name}`]) continue;

            unusedDeclarations.push({
                operationId: entry.operationId,
                param      : name,
                methods    : entry.methods,
                spec       : [...entry.specs].join(', ')
            });
        }
    }

    return {
        violations,
        unusedDeclarations,
        checked        : services.length,
        operationsMatched,
        servicesScanned: services.length
    };
}

/**
 * @summary The same parity check over the **ToolService dispatch** path.
 *
 * `lintOpenApiServiceParity` above joins an operation to a method on a service `ai/services.mjs`
 * wraps. That join reaches 121 methods and leaves the larger surface uncovered: most operations are
 * dispatched through their server's `serviceMapping` table, whose handlers are `.bind()` chains,
 * inline arrows and imported functions rather than wrapped-service methods. Same Zod strip, same
 * silent-`undefined` read, different join — so the gate needs both or it reports a partial sweep as
 * a clean one.
 *
 * ## Object dispatch ONLY, and that is a correctness bound rather than a scoping convenience
 *
 * `ToolService#callTool` has two modes. With `x-pass-as-object: true` the handler receives the whole
 * validated bag, so its first parameter genuinely IS the args object and `consumedNames` is reading
 * the right thing. Without it, arguments arrive **positionally**: `handler(...argNames.map(...))`, so
 * the first parameter is `argNames[0]` — one specific value, not a bag.
 *
 * Running the bag analysis over a positional handler would be actively wrong, not merely
 * incomplete: `doThing(prNumber, file)` would be read as `bagParam = 'prNumber'`, and any
 * `prNumber.something` member access would be reported as a consumed *parameter* named
 * `something`. That is a fabricated violation, and a gate that invents findings gets ignored — so
 * positional operations are skipped here and counted, with the signature-census owning them (its
 * classes 2 / 2M / 3 are exactly the positional-dispatch failure modes).
 *
 * Unresolved handlers are REPORTED, never silently dropped: a handler this cannot locate is a
 * contract nobody checked, and its absence from the output would read as a pass.
 *
 * @param {Object} [options]
 * @param {String} [options.rootDir=ROOT_DIR]
 * @returns {{violations: Object[], unresolved: Object[], unusedDeclarations: Object[], operationsChecked: Number, positionalSkipped: Number}}
 */
export function lintToolServiceParity({rootDir = ROOT_DIR} = {}) {
    const violations         = [],
          unresolved         = [],
          unusedDeclarations = [];

    let operationsChecked = 0,
        positionalSkipped = 0;

    for (const server of SERVERS) {
        const specPath = path.join(rootDir, server.openApi),
              toolPath = path.join(rootDir, server.toolService);

        if (!fs.existsSync(specPath) || !fs.existsSync(toolPath)) continue;

        const doc                     = yaml.load(fs.readFileSync(specPath, 'utf8')),
              toolAst                 = parseModule(fs.readFileSync(toolPath, 'utf8')),
              {entries, imports, ast} = extractServiceMapping(toolAst),
              fileCache               = new Map();

        for (const operation of extractOperations(doc)) {
            const valueNode = entries.get(operation.operationId);

            // No binding at all is the census's finding, not this one — it reports `no-binding`
            // per operation. Duplicating it here would mean two instruments disagreeing about the
            // same absence.
            if (!valueNode) continue;

            if (!operation.passAsObject) {
                positionalSkipped++;
                continue;
            }

            const resolved = resolveHandlerNode(valueNode, {imports, filePath: toolPath, root: rootDir, fileCache, ast});

            if (resolved.unresolved) {
                unresolved.push({serverId: server.id, operationId: operation.operationId, reason: resolved.unresolved});
                continue;
            }

            operationsChecked++;

            const declared                   = declaredNames(doc, findOperationById(doc, operation.operationId)),
                  {complete, consumed, rest} = consumedNames(resolved.node);

            // A rest element re-admits every key, so absence cannot be proven — the same
            // suppression the services.mjs join applies, for the same reason.
            if (rest) continue;

            for (const name of consumed) {
                if (declared.has(name)) continue;
                if (PARITY_BASELINE[`${server.id}.${operation.operationId}.${name}`]) continue;

                violations.push({
                    operationId: operation.operationId,
                    param      : name,
                    serverId   : server.id,
                    via        : resolved.via,
                    spec       : path.relative(rootDir, specPath)
                });
            }

            // The inverse direction on this path too, gated on `complete` for the same reason as its
            // sibling: `consumed` is a lower bound, so its complement cannot support an absence
            // claim unless every read was visible.
            //
            // No per-operation union is needed here, unlike the services.mjs join. There, several
            // same-named methods on different services bind to ONE operationId and each destructures
            // only its own keys, so the union across contributors is the only sound denominator.
            // A `serviceMapping` is keyed BY operationId, so an operation has exactly one handler and
            // this loop already sees the whole denominator. Stating that rather than leaving the
            // asymmetry to look like an oversight.
            if (!complete) continue;

            for (const name of declared) {
                if (consumed.has(name)) continue;
                if (PARITY_BASELINE[`${server.id}.${operation.operationId}.${name}`]) continue;

                unusedDeclarations.push({
                    operationId: operation.operationId,
                    param      : name,
                    serverId   : server.id,
                    methods    : [resolved.via],
                    spec       : path.relative(rootDir, specPath)
                });
            }
        }
    }

    return {violations, unresolved, unusedDeclarations, operationsChecked, positionalSkipped};
}

/**
 * Finds the raw operation object for an id, since `extractOperations` returns the runtime-mirror
 * projection (`{operationId, args, passAsObject}`) rather than the document node `declaredNames`
 * needs for its one-level `$ref` resolution.
 * @param {Object} doc
 * @param {String} operationId
 * @returns {Object|undefined}
 */
function findOperationById(doc, operationId) {
    return indexOperations(doc).get(operationId);
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

/**
 * @summary Prints the non-failing declared-but-unused report.
 *
 * Separated from the CLI block so the wording is testable without spawning the process, and so the
 * failing arm below stays a single unbroken read.
 *
 * @param {Object[]} unusedDeclarations Rows from `lintOpenApiServiceParity`.
 * @param {Object}   [io=console] Injectable sink for tests.
 */
export function reportUnusedDeclarations(unusedDeclarations, io = console) {
    if (unusedDeclarations.length === 0) return;

    io.warn(
        `[lint-openapi-service-parity] ${unusedDeclarations.length} declared-but-unused parameter(s) ` +
        `— NOT a failure:\n`
    );

    for (const row of unusedDeclarations) {
        io.warn(`- ${row.operationId} declares \`${row.param}\` — read by none of: ${row.methods.join(', ')}`);
    }

    io.warn(
        `\nEach of these is a contract an agent can send and the service will ignore. That is the ` +
        `mirror of the failing direction and not its equal: nothing a caller supplies is destroyed, ` +
        `so this reports rather than blocks. Most are declarations that outlived a refactor — remove ` +
        `the parameter, or start reading it.\n`
    );
}

/**
 * @summary The PRODUCTION COMPOSITION of both joins — the gate's actual verdict.
 *
 * Extracted from the CLI block, and the extraction is the point rather than tidiness. While this
 * lived inside `if (import.meta.url === …)` the composition itself was unreachable from any test:
 * both child analyses were covered, and the step that merges them into one fatal result was not. So
 * deleting the ToolService append would have left every child test green while the gate silently
 * stopped failing on half its surface — a false green in the seam *between* two well-tested parts,
 * which is the one place per-part coverage cannot look.
 *
 * The two joins fail as ONE gate: a violation on either path is the same defect reaching the same
 * Zod strip, so reporting them separately would let a green on one read as a green overall.
 * Advisory, unresolved and coverage counts are all preserved through the merge rather than
 * recomputed, so the CLI renders exactly what a test can assert on.
 *
 * @param {Object} [options]
 * @param {String} [options.rootDir=ROOT_DIR]
 * @returns {{violations: Object[], unusedDeclarations: Object[], unresolved: Object[], servicesScanned: Number, operationsMatched: Number, operationsChecked: Number, positionalSkipped: Number}}
 */
export function lintParity({rootDir = ROOT_DIR} = {}) {
    const service = lintOpenApiServiceParity({rootDir}),
          tool    = lintToolServiceParity({rootDir});

    return {
        violations        : [...service.violations, ...tool.violations],
        unusedDeclarations: [...service.unusedDeclarations, ...tool.unusedDeclarations],
        unresolved        : tool.unresolved,
        servicesScanned   : service.servicesScanned,
        operationsMatched : service.operationsMatched,
        operationsChecked : tool.operationsChecked,
        positionalSkipped : tool.positionalSkipped
    };
}

/**
 * @summary Renders one violation, from either join, with the coordinates that join actually carries.
 *
 * The two joins describe a handler differently and neither is a superset: the `services.mjs` join
 * knows `module` + `method`, while the ToolService join knows `serverId` + `via` (the resolution
 * path — `.bind` chain, inline arrow, imported identifier). Rendering both through the first shape
 * printed `undefined → undefined()` for every ToolService row, which is a finding a reader cannot
 * act on.
 *
 * @param {Object} violation
 * @returns {String[]} the lines to print
 */
export function describeViolation(violation) {
    const where = violation.via
        ? `    ${violation.serverId} serviceMapping → ${violation.via}`
        : `    ${violation.module} → ${violation.method}()`;

    return [`- ${violation.operationId} reads \`${violation.param}\` — not declared in ${violation.spec}`, where];
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const result = lintParity();

    // Printed BEFORE the failing arm, so a run that exits 1 still surfaces both directions rather
    // than hiding the advisory behind the abort.
    reportUnusedDeclarations(result.unusedDeclarations);

    // An unresolved handler is a contract nobody checked. Reported loudly and counted in the OK line
    // rather than dropped, because silence here is indistinguishable from coverage.
    if (result.unresolved.length > 0) {
        console.warn(`[lint-openapi-service-parity] ${result.unresolved.length} ToolService handler(s) could not be resolved — NOT checked:\n`);
        for (const row of result.unresolved) {
            console.warn(`- ${row.serverId}.${row.operationId}: ${row.reason}`);
        }
        console.warn('');
    }

    if (result.violations.length > 0) {
        console.error(`[lint-openapi-service-parity] FAILED — ${result.violations.length} consumed-but-undeclared parameter(s):\n`);

        for (const violation of result.violations) {
            for (const line of describeViolation(violation)) console.error(line);
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
        `${result.operationsMatched} operation-bound method(s) + ${result.operationsChecked} object-dispatch handler(s), ` +
        `0 consumed-but-undeclared parameter(s), ${result.unusedDeclarations.length} declared-but-unused (advisory), ` +
        `${result.positionalSkipped} positional handler(s) owned by the signature census.`
    );
}
