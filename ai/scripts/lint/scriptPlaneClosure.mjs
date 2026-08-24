import {parse} from 'acorn';
import fs      from 'node:fs';
import path    from 'node:path';

/**
 * Derives an `ai/scripts` entrypoint's execution plane from what it REACHES, never from what it is
 * called or where it sits.
 *
 * Two cheaper shapes were tried and retired against measured falsifiers: keying the plane on the
 * directory, and declaring it in a per-file header. Both fail the same way — **a directory name and a
 * header are both names, and a name can be wrong while the code moves on without it.** What survives
 * is entrypoint-owned authority × transitive capability closure, and this module is the closure half.
 *
 * **The load-bearing distinction is REQUIREMENT vs USE.** A script that *reaches* a host capability
 * on a path that degrades gracefully does not *require* a host. ADR-0014 settles this — ticket-ref-ok:
 * the ADR is the authority that defines the distinction, not background reading — on
 * `ai/scripts/maintenance/backup.mjs`, whose `git rev-parse HEAD` bundle-meta stamp is explicitly
 * ruled a non-dependency because it degrades to `null` without `.git`:
 *
 *     let gitSha = null;
 *     try   { const {stdout} = await execFileAsync('git', ['rev-parse', 'HEAD'], …); gitSha = …; }
 *     catch (err) { logger.warn?.(…); }          // swallowed — the function returns normally
 *
 * A predicate keyed on "imports `child_process`" convicts that file against an accepted ADR. So the
 * capability is only a REQUIREMENT when its call site can actually abort the program: a bare call, or
 * one inside a `try` whose `catch` rethrows or exits. That test needs real syntax, which is why this
 * parses with `acorn` rather than matching tokens — a regex over `try`/`catch` nesting would be the
 * same unit error the retired classifier made, wearing a better costume.
 */

const
    // Both spellings are live in this tree (37 files reach child_process, split across `x` and
    // `node:x`), so every specifier is normalised before it is compared to anything.
    NODE_PREFIX = 'node:',
    SOURCE_EXTS = ['.mjs', '.js', '.json'];

/**
 * @summary Capabilities whose REQUIRED use pins an entrypoint to the host edge.
 *
 * Deliberately small and grounded in Local Runtime Parity's actual constraint — a client topology has
 * **no host shell and no Docker socket** — rather than in a wide list of things that merely feel
 * host-ish. `fs` is excluded on purpose: it is imported by most of the tree and therefore
 * discriminates nothing, and the plane question is about the shell and the socket, not about files.
 * @type {Object}
 */
export const HOST_CAPABILITY = Object.freeze({
    shell : 'host-shell',
    socket: 'docker-socket'
});

/**
 * @summary Bare specifiers that grant each host capability.
 * @type {Object}
 */
export const HOST_CAPABILITY_SOURCES = Object.freeze({
    [HOST_CAPABILITY.shell] : Object.freeze(['child_process']),
    [HOST_CAPABILITY.socket]: Object.freeze(['dockerode', 'docker-modem'])
});

/**
 * @summary Normalises a module specifier for comparison: strips the `node:` prefix, keeps the package root.
 * @param {String} specifier Raw import specifier.
 * @returns {String}
 */
export function normalizeSpecifier(specifier) {
    const value = String(specifier || '');

    if (value.startsWith('.') || value.startsWith('/')) {
        return value
    }

    const bare = value.startsWith(NODE_PREFIX) ? value.slice(NODE_PREFIX.length) : value;

    // Scoped packages keep two segments (`@scope/name`); everything else keeps one, so a deep import
    // like `fs-extra/lib/json` compares equal to `fs-extra`.
    const parts = bare.split('/');

    return bare.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

/**
 * @summary Parses a module, returning `null` rather than throwing on syntax this parser cannot read.
 *
 * A parse failure is an UNRESOLVED EDGE, not a plane verdict — the caller turns it into a named
 * finding. Swallowing it into a default would reproduce the defect this whole lane exists to remove.
 *
 * @param {String} source Module text.
 * @returns {Object|null} ESTree program, or null when unparseable.
 */
export function parseModule(source) {
    try {
        return parse(String(source || ''), {ecmaVersion: 'latest', sourceType: 'module', locations: true})
    } catch {
        return null
    }
}

/**
 * @summary Depth-first walk yielding every node with its ancestor chain, nearest parent first.
 *
 * Hand-rolled because `acorn-walk` is not a dependency here and adding one to read a chain of
 * `TryStatement` ancestors is not worth the surface. Ancestors are what the requirement test needs;
 * a plain visitor cannot answer "is this call inside a swallowing try".
 *
 * @param {Object} node ESTree node.
 * @param {Function} visit Called as `(node, ancestors)`.
 * @param {Object[]} [ancestors] Internal.
 */
export function walkWithAncestors(node, visit, ancestors = []) {
    if (!node || typeof node.type !== 'string') {
        return
    }

    visit(node, ancestors);

    const nextAncestors = [node, ...ancestors];

    for (const key of Object.keys(node)) {
        if (key === 'type' || key === 'loc' || key === 'start' || key === 'end') {
            continue
        }

        const value = node[key];

        if (Array.isArray(value)) {
            value.forEach(child => walkWithAncestors(child, visit, nextAncestors))
        } else if (value && typeof value.type === 'string') {
            walkWithAncestors(value, visit, nextAncestors)
        }
    }
}

/**
 * @summary Whether a `catch` clause lets the failure abort the program.
 *
 * Rethrowing or exiting means the capability was REQUIRED after all — the guard only converts the
 * error's shape, it does not survive its absence. Anything else (logging, a fallback assignment, an
 * empty body) means the program continues without the capability — the graceful-degradation shape
 * ADR-0014 accepts. ticket-ref-ok: the ADR is the authority this predicate implements.
 *
 * @param {Object} handler ESTree CatchClause.
 * @returns {Boolean} true when the handler rethrows or exits.
 */
export function handlerAborts(handler) {
    if (!handler) {
        // `try { … } finally { … }` with no catch does NOT swallow: the error still propagates.
        return true
    }

    let aborts = false;

    walkWithAncestors(handler.body, node => {
        if (node.type === 'ThrowStatement') {
            aborts = true
        }

        // `process.exit(…)` — the other way a handler declines to continue.
        if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression'
            && node.callee.object?.name === 'process' && node.callee.property?.name === 'exit') {
            aborts = true
        }
    });

    return aborts
}

/**
 * @summary Whether a call site is DEFERRED — inside a function, so it runs only if something calls it.
 *
 * This is the second half of requirement-vs-use, and without it the transitive closure is wrong in a
 * way that convicts an accepted ADR. Importing a module executes its MODULE SCOPE, not its function
 * bodies. `backup.mjs` transitively reaches `spawn` inside `ConnectionService.spawnBridgeProcess()`,
 * `execFileSync` inside a `collect` arrow in the skill-manifest lint, and `spawn` inside a promise
 * executor in `gitMirror` — none of which run because `backup.mjs` was imported.
 *
 * Attributing those to the entrypoint marks it host-required, which is precisely the false positive
 * ADR-0014 rules out — ticket-ref-ok: the ADR is the authority this predicate implements.
 * Reachability is not invocation, and a closure that conflates them says
 * "everything is host-edge" with great confidence.
 *
 * @param {Object[]} ancestors Ancestor chain, nearest parent first.
 * @returns {Boolean}
 */
export function isDeferredCallSite(ancestors) {
    return ancestors.some(node => node.type === 'FunctionDeclaration'
        || node.type === 'FunctionExpression'
        || node.type === 'ArrowFunctionExpression')
}

/**
 * @summary The pseudo-member holding a module's top-level statements.
 *
 * Importing a module executes exactly this member and nothing else, which is why it is the only part
 * of a reached module that is invoked by construction.
 * @type {String}
 */
export const MODULE_SCOPE = '<module-scope>';

/**
 * @summary The nearest NAMED function-ish ancestor of a node — the member a call site belongs to.
 *
 * Member granularity is what makes the invocation walk sound. A module-level answer would say
 * "`backup.mjs` calls into `ConnectionService`, therefore everything `ConnectionService` can do is
 * required", which promotes `spawnBridgeProcess()` on the strength of an unrelated call to a sibling
 * method. The proof has to name the member, or it is reachability again with an extra step.
 *
 * Anonymous callbacks attribute to their enclosing named member: a `spawn` inside a `forEach` inside
 * `run()` runs when `run()` runs, which is the same approximation `isDeferredCallSite` already makes.
 *
 * @param {Object[]} ancestors Ancestor chain, nearest parent first.
 * @returns {String} member name, or `MODULE_SCOPE` when the node sits in top-level code.
 */
export function owningMember(ancestors) {
    // Whether a function boundary lies BELOW the ancestor under test. A key only owns a call site when
    // the site is inside that key's function VALUE.
    let crossedFunction = false;

    for (const node of ancestors) {
        if (isMemberKeyNode(node) && crossedFunction) {
            return node.key?.name ?? node.key?.value ?? MODULE_SCOPE
        }

        if (node.type === 'FunctionDeclaration' && node.id?.name) {
            return node.id.name
        }

        if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier'
            && (node.init?.type === 'FunctionExpression' || node.init?.type === 'ArrowFunctionExpression')) {
            return node.id.name
        }

        if (isFunctionNode(node)) {
            crossedFunction = true
        }
    }

    return MODULE_SCOPE
}

/** @summary Whether a node introduces a function scope. */
function isFunctionNode(node) {
    return node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression'
        || node.type === 'ArrowFunctionExpression'
}

/** @summary Whether a node is a keyed member slot — class method, class field, or object property. */
function isMemberKeyNode(node) {
    return node.type === 'MethodDefinition' || node.type === 'PropertyDefinition' || node.type === 'Property'
}

/**
 * @summary Whether a node sits inside this repository's import-safe guard.
 *
 * `if (process.argv[1] && path.resolve(process.argv[1]) === __filename) { … }` is the house pattern —
 * 98 modules under `ai/` carry it — and it means exactly one thing: **this runs when I am the process
 * entry, and not when someone imports me.** A module-scope call is otherwise invoked by construction,
 * so without this test the walk concludes that importing `lint-skill-manifest.mjs` runs its `main()`,
 * and from there its `execFileSync` sites, and from there that `backup.mjs` requires a host shell —
 * convicting the one file ADR-0014 rules the other way. ticket-ref-ok: the ADR is the authority the
 * conclusion would have contradicted.
 *
 * This is requirement-vs-use again, one level up: the guard is the syntax that separates "this module's
 * top level ran" from "this module's top level ran AS THE SCRIPT".
 *
 * @param {Object} node ESTree node to scan — an `if` test, or a declarator's initialiser.
 * @param {Set<String>} [bindings] Locals already known to hold an entry path.
 * @returns {Boolean}
 */
export function referencesEntryPath(node, bindings = new Set()) {
    let found = false;

    walkWithAncestors(node, current => {
        if (current.type === 'MemberExpression' && current.object?.name === 'process'
            && current.property?.name === 'argv') {
            found = true
        }

        // `import.meta.url` — acorn models `import.meta` as a MetaProperty.
        if (current.type === 'MetaProperty') {
            found = true
        }

        // The hoisted spelling: `const modulePath = fileURLToPath(import.meta.url)` above, and a test
        // of `cliEntryPath === modulePath` below. Both spellings are live in this tree, and reading
        // only the inline one is how the walk concluded that importing `labels.mjs` runs its CLI.
        if (current.type === 'Identifier' && bindings.has(current.name)) {
            found = true
        }
    });

    return found
}

/**
 * @summary Whether a node sits inside this repository's import-safe guard. See `referencesEntryPath`.
 * @param {Object[]} ancestors Ancestor chain, nearest parent first.
 * @param {Set<String>} [entryPathBindings] Locals derived from `process.argv` / `import.meta`.
 * @returns {Boolean}
 */
export function isEntrypointGuarded(ancestors, entryPathBindings = new Set()) {
    for (let i = 0; i < ancestors.length; i++) {
        const node = ancestors[i];

        if (node.type !== 'IfStatement') {
            continue
        }

        // Only the consequent is guarded; an `else` branch runs on import.
        if (i > 0 && ancestors[i - 1] === node.alternate) {
            continue
        }

        if (referencesEntryPath(node.test, entryPathBindings)) {
            return true
        }
    }

    return false
}

/**
 * @summary Whether a node sits inside a `try` block whose `catch` swallows the failure.
 *
 * The node must be in the try's BLOCK, not in its handler or finalizer — a call inside the catch is
 * not protected by that catch.
 *
 * @param {Object[]} ancestors Ancestor chain, nearest parent first.
 * @returns {Boolean}
 */
export function isGracefullyDegraded(ancestors) {
    for (let i = 0; i < ancestors.length; i++) {
        const node = ancestors[i];

        if (node.type !== 'TryStatement') {
            continue
        }

        // Identify which limb we came from by finding the previous ancestor in the chain.
        const cameFrom = i === 0 ? null : ancestors[i - 1];

        if (cameFrom && (cameFrom === node.handler || cameFrom === node.finalizer)) {
            continue
        }

        if (!handlerAborts(node.handler)) {
            return true
        }
    }

    return false
}

/**
 * @summary Static imports and required host capabilities for one module.
 *
 * Only STATIC imports are followed. A dynamic `import(expr)` with a non-literal specifier is an
 * unresolved edge and is reported as one — see `collectModuleFacts().unresolved`.
 *
 * @param {String} source Module text.
 * `importEdges` preserves the syntax kind and source coordinate for consumers that need to
 * reconcile package-boundary crossings. `imports` remains the compatibility projection consumed
 * by the closure and denial proof; both arrays are populated by one AST walk so they cannot drift.
 *
 * @returns {{imports: String[], importEdges: Object[], capabilities: Object[], unresolved: Object[], parsed: Boolean}}
 */
export function collectModuleFacts(source) {
    const
        ast          = parseModule(source),
        imports      = [],
        importEdges  = [],
        capabilities = [],
        unresolved   = [];

    if (!ast) {
        return {
            imports, importEdges, capabilities, unresolved: [{reason: 'unparseable'}],
            calls: [], members: [], bindings: {}, superBindings: [], parsed: false
        }
    }

    const addImport = (specifier, kind, node) => {
        imports.push(specifier);
        importEdges.push({
            kind,
            line: node.loc?.start?.line ?? null,
            specifier
        })
    };

    // Which local binding names came from a host-capability package, so a later call can be traced
    // back to it. Matching the CALL rather than the import is what separates requirement from use.
    const
        hostBindings   = new Map(),
        // localName -> {specifier, imported}, so a call on an imported binding resolves to a MEMBER of
        // another module rather than merely to that module.
        importBindings = new Map(),
        superBindings  = new Set(),
        members        = new Set([MODULE_SCOPE]),
        // Locals holding the process entry path or this module's own path — the hoisted half of the
        // import-safe guard.
        entryPaths     = new Set(),
        calls          = [];

    walkWithAncestors(ast, (node, ancestors) => {
        if (node.type === 'ImportDeclaration') {
            const specifier = node.source.value;

            addImport(specifier, 'static-import', node);

            const normalized = normalizeSpecifier(specifier),
                  capability = Object.entries(HOST_CAPABILITY_SOURCES)
                      .find(([, sources]) => sources.includes(normalized))?.[0];

            node.specifiers.forEach(spec => importBindings.set(spec.local.name, {
                specifier,
                imported: spec.type === 'ImportDefaultSpecifier'   ? 'default'
                        : spec.type === 'ImportNamespaceSpecifier' ? '*'
                        : spec.imported?.name ?? spec.local.name
            }));

            if (capability) {
                node.specifiers.forEach(spec => hostBindings.set(spec.local.name, capability))
            }
            return
        }

        // `export {X as Y} from './p.mjs'` — a re-export binds a name to another module's value
        // without ever importing it locally, so it is invisible to the ImportDeclaration branch.
        if (node.type === 'ExportNamedDeclaration' && node.source?.value) {
            addImport(node.source.value, 'named-reexport', node);

            (node.specifiers ?? []).forEach(spec => importBindings.set(
                spec.exported?.name ?? spec.local?.name,
                {specifier: node.source.value, imported: spec.local?.name ?? 'default'}
            ));
            return
        }

        // `export * from './module.mjs'` is a real static reach edge. Keeping it out of the shared
        // parser made a barrel crossing invisible to both the capability closure and the extraction
        // consumer ledger even though every runtime follows it.
        if (node.type === 'ExportAllDeclaration' && node.source?.value) {
            addImport(node.source.value, 'export-all', node);
            return
        }

        // Declared members, so a caller in another module can be told "this target does not exist
        // here" — the difference between a resolved edge and an honest unresolved one.
        // A key is a MEMBER only when it holds a function. `{module: StateProvider}` is configuration,
        // and admitting it would let a foreign `X.module()` resolve to a config value.
        if (isMemberKeyNode(node)) {
            const name = node.key?.name ?? node.key?.value;

            if (name && (node.type === 'MethodDefinition' || isFunctionNode(node.value ?? {}))) {
                members.add(String(name))
            }
        }

        if (node.type === 'FunctionDeclaration' && node.id?.name) {
            members.add(node.id.name)
        }

        // `class Service extends Base` — the inherited half of the member map. Without this, a
        // `this.someInheritedMethod()` call resolves to nothing in the subclass and the walk stops at a
        // member that is defined one file up. A subclass never mentions what it inherits, so a
        // member-existence test that reads only the subclass is unsound by construction here.
        if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
            if (node.superClass?.type === 'Identifier') {
                superBindings.add(node.superClass.name)
            }
        }

        if (node.type === 'ImportExpression') {
            if (node.source?.type === 'Literal' && typeof node.source.value === 'string') {
                addImport(node.source.value, 'literal-dynamic-import', node)
            } else {
                unresolved.push({
                    reason: 'dynamic-import',
                    // The owning member discriminates two dynamic imports in one module without
                    // reintroducing the line number. Keying identity on `module::reason` alone let
                    // one site be swapped for another inside the same file with the ledger none the
                    // wiser — the substitution the ledger exists to catch, scoped down one level.
                    member: owningMember(ancestors),
                    line  : node.loc?.start?.line ?? null
                })
            }
            return
        }

        // A capability rarely reaches its call site under its imported name. `backup.mjs` binds
        // `const execFileAsync = promisify(execFile)` — so a detector that only knows import bindings
        // reports ZERO capability sites for the very file ADR-0014 uses as its fixture — ticket-ref-ok:
        // the ADR names that file as the canonical case — which is a
        // false negative dressed as a clean result. Derivation is therefore tracked through simple
        // aliasing and single-argument wrappers (`promisify`, `util.promisify`) before calls are read.
        if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.init) {
            const {init} = node,
                  alias  = init.type === 'Identifier' ? init.name
                         : init.type === 'CallExpression' && init.arguments?.length === 1
                           && init.arguments[0].type === 'Identifier' ? init.arguments[0].name
                         : null;

            if (alias && hostBindings.has(alias)) {
                hostBindings.set(node.id.name, hostBindings.get(alias))
            }

            if (init.type === 'FunctionExpression' || init.type === 'ArrowFunctionExpression') {
                members.add(node.id.name)
            }

            if (referencesEntryPath(init, entryPaths)) {
                entryPaths.add(node.id.name)
            }

            // Where a VALUE came from, which is a wider question than where a capability came from —
            // and deliberately answered more loosely. `ai/services.mjs` binds its exports as
            // `const KB_DatabaseService = makeSafe(_KB_DatabaseService, kbSpec)`, a two-argument
            // wrapper the capability rule above will not follow. Routing a call through it costs at
            // worst a hop into a module whose members do not match, which becomes an honest gap;
            // NOT routing it costs the whole chain past every barrel in the tree.
            //
            // "Exactly one argument is an import binding" is what keeps that loose rule from guessing:
            // `makeSafe(_X, spec)` has one, `compare(a, b)` over two imports has two and is skipped.
            const wrapped = init.type === 'CallExpression'
                ? (init.arguments ?? []).filter(arg => arg.type === 'Identifier' && importBindings.has(arg.name))
                : [];

            if (alias && importBindings.has(alias)) {
                importBindings.set(node.id.name, importBindings.get(alias))
            } else if (wrapped.length === 1) {
                importBindings.set(node.id.name, importBindings.get(wrapped[0].name))
            } else if (init.type === 'NewExpression' && init.callee?.type === 'Identifier'
                && importBindings.has(init.callee.name)) {
                // `const svc = new Svc()` — the instance pattern. Without it every call on a
                // constructed service dispatches through a local whose origin cannot be named, and
                // the chain stops one step after the `new`.
                importBindings.set(node.id.name, importBindings.get(init.callee.name))
            }
            return
        }

        if (node.type !== 'CallExpression') {
            return
        }

        // `execFile(…)` / `execFileAsync(…)` / `spawn(…)` — a bare identifier, or a member expression
        // rooted at one (`cp.execSync(…)`), or a promisified wrapper bound from one.
        const
            {callee} = node,
            isMember = callee.type === 'MemberExpression' && !callee.computed,
            root     = callee.type === 'Identifier' ? callee.name
                     : isMember && callee.object?.type === 'Identifier' ? callee.object.name
                     : null;

        // Every call a proven-invoked member makes, recorded so the invocation walk can follow it.
        // `viaSelf` covers `this.x()` / `super.x()`, which is how a class reaches its own seams —
        // `TemporalSummaryAggregationService` reaches `execSync` only through `this.execCommand()`.
        calls.push({
            member      : owningMember(ancestors),
            binding     : root,
            targetMember: isMember ? (callee.property?.name ?? null) : null,
            viaSelf     : isMember && (callee.object?.type === 'ThisExpression' || callee.object?.type === 'Super'),
            // Bare identifiers handed to this call. `run(danger)` passes a function REFERENCE and
            // `run(fn)` then calls `fn()` — a chain where every name is in the source, and which a
            // callee-only walk drops entirely because `fn` is a parameter and parameters are leaves.
            // The result was not a conservative stop but a SILENT safe verdict: `required: []` and
            // `unresolved: []` for code that plainly spawns. Handing a function to something that
            // runs is evidence it may run, so the reference is followed; names that are not members
            // resolve to nothing and cost one lookup.
            argRefs     : (node.arguments ?? []).filter(arg => arg.type === 'Identifier').map(arg => arg.name),
            // `obj[key]()` — a destination chosen at runtime, and the one call form whose target is
            // genuinely unnameable rather than merely unowned by this closure.
            computed         : callee.type === 'MemberExpression' && callee.computed === true,
            entrypointGuarded: isEntrypointGuarded(ancestors, entryPaths),
            line             : node.loc?.start?.line ?? null
        });

        if (!root) {
            return
        }

        const capability = hostBindings.get(root);

        if (capability) {
            const deferred = isDeferredCallSite(ancestors);

            capabilities.push({
                capability,
                deferred,
                // Module-scope code behind the import-safe guard runs only when this module IS the
                // script, so it is not promoted merely because something imported it.
                entrypointGuarded: isEntrypointGuarded(ancestors, entryPaths),
                // The member that OWNS this site. A deferred site is promoted only when this exact
                // member is proven invoked — not when some sibling of it is.
                member         : owningMember(ancestors),
                // Kept separately from `required` so the invocation walk below can promote a deferred
                // call WITHOUT promoting a gracefully-degraded one — the bundle-stamp case in the
                // module header, where the program continues with a null instead of failing.
                degradedInPlace: isGracefullyDegraded(ancestors),
                // REQUIRED means: this runs, and its failure stops the program. A deferred site fails
                // the first half (it may never be called) and a gracefully-degraded one fails the
                // second (the program continues without it).
                required: !deferred && !isGracefullyDegraded(ancestors),
                line    : node.loc?.start?.line ?? null
            })
        }
    });

    return {
        imports,
        importEdges,
        capabilities,
        unresolved,
        calls,
        members      : [...members],
        bindings     : Object.fromEntries(importBindings),
        superBindings: [...superBindings],
        parsed       : true
    }
}

/**
 * @summary Resolves a relative specifier to a file on disk, or `null` when nothing matches.
 * @param {String} specifier Relative import specifier.
 * @param {String} fromFile Absolute path of the importing module.
 * @returns {String|null}
 */
export function resolveRelative(specifier, fromFile) {
    const base = path.resolve(path.dirname(fromFile), specifier);

    if (fs.existsSync(base) && fs.statSync(base).isFile()) {
        return base
    }

    for (const ext of SOURCE_EXTS) {
        const candidate = base + ext;

        if (fs.existsSync(candidate)) {
            return candidate
        }
    }

    for (const ext of SOURCE_EXTS) {
        const candidate = path.join(base, `index${ext}`);

        if (fs.existsSync(candidate)) {
            return candidate
        }
    }

    return null
}

/**
 * @summary Depth guard for the `extends` walk. Deeper than any hierarchy in this tree, and finite so a
 * cyclic `extends` — which cannot execute, but can be written — cannot hang the lint.
 * @type {Number}
 */
const MAX_SUPERCLASS_DEPTH = 12,
      /** Bound on a reconstructed call chain, so a corrupted parent map cannot spin a build. */
      MAX_CHAIN_LENGTH     = 64;

/**
 * @summary Walks an entrypoint's import graph, then its INVOCATION graph, collecting required capabilities.
 *
 * Two passes, because they answer different questions and only the second one is about running code:
 *
 * 1. **Reach** — follow every static relative import to fixpoint. This yields the module population and
 *    every capability SITE inside it.
 * 2. **Invoke** — walk `(module, member)` nodes from what provably runs, following named calls.
 *
 * What "required" can mean here, stated because neither pure answer is usable. A static graph cannot
 * decide invocation, and the two sound extremes are both wrong: counting every reachable call convicts
 * `backup.mjs` against ADR-0014 — ticket-ref-ok: the ADR is the authority being satisfied — because its
 * closure reaches `spawn` inside methods nothing calls; counting only module-scope calls classifies the
 * ENTIRE tree as in-plane, because real code puts its shell calls inside functions.
 *
 * **The rule is neither extreme: a capability is required when the member that owns it is proven to
 * run.** Proof is seeded by the two things that run by construction — every reached module's top-level
 * code, and every member of the entrypoint itself, since running the script is what its own code is
 * for — and then propagated along named calls for as far as the syntax carries it.
 *
 * An earlier version bounded that propagation at ONE hop, which was a false-safe rather than a
 * conservative choice: `/e -> Svc.run() -> Deep.go() -> spawn` is fully static at every step, and
 * stopping after the first hop reported `required: []` for a chain nothing had to guess about. The
 * bound was not protecting the bundle-stamp case — MEMBER granularity is what protects it, because
 * calling `ConnectionService.connect()` never proves `spawnBridgeProcess()` runs.
 *
 * **What the walk cannot name, it says so about.** A call from a proven-invoked member whose target
 * cannot be located — a member missing from the module it resolves to, a `this.x()` absent from the
 * class and its bases, a computed callee — becomes an `unresolved-dispatch` edge, and an unresolved
 * edge makes a NO-HOST verdict unsound. It is reported only when the closure still holds an
 * unattributed capability the dispatch could reach: an edge that provably leads nowhere dangerous is
 * not a gap in the proof, and reporting it would bury the ones that are.
 *
 * `readFile` and `resolve` are injected so the whole closure is testable without a repository — the
 * fixtures that red-prove `githubWorkflowSync` and `backup` run entirely in memory.
 *
 * @param {Object} options
 * @param {String} options.entrypoint Absolute path.
 * @param {Function} [options.readFile] `(absPath) => String|null`.
 * @param {Function} [options.resolve] `(specifier, fromFile) => String|null`.
 * @returns {{reached: String[], required: Object[], used: Object[], unresolved: Object[], invoked: String[]}}
 */
export function walkCapabilityClosure({
    entrypoint,
    readFile = absPath => (fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf8') : null),
    resolve  = resolveRelative
}) {
    const
        seen       = new Set(),
        factsBy    = new Map(),
        importsBy  = new Map(),
        queue      = [entrypoint],
        required   = [],
        used       = [],
        unresolved = [];

    // ---- Pass 1: reach ----
    while (queue.length > 0) {
        const current = queue.shift();

        if (seen.has(current)) {
            continue
        }

        seen.add(current);

        const source = readFile(current);

        if (source === null) {
            unresolved.push({module: current, reason: 'unreadable'});
            continue
        }

        const facts = collectModuleFacts(source);

        factsBy.set(current, facts);
        facts.unresolved.forEach(edge => unresolved.push({module: current, ...edge}));

        const targets = new Set();

        facts.imports.forEach(specifier => {
            if (!specifier.startsWith('.')) {
                // A bare package is a leaf: its own graph is not ours to police, and the capability
                // taxonomy already names the ones that matter.
                return
            }

            const target = resolve(specifier, current);

            if (target) {
                targets.add(target);
                queue.push(target)
            } else {
                unresolved.push({module: current, specifier, reason: 'unresolved-specifier'})
            }
        });

        importsBy.set(current, targets);
    }

    // ---- Pass 2: invoke ----
    const
        // node key -> the node that proved it, or null for a seed. The chain is what a maintainer
        // staring at a conflict actually needs: "this entrypoint requires a shell" is not actionable
        // until you can see the three calls that get there.
        invoked      = new Map(),
        memberQueue  = [],
        dispatchGaps = [],

        /**
         * Follows a local binding to the module that DEFINES its value, hopping through re-export
         * barrels. `ai/services.mjs` is 225 lines of exactly that, and stopping at the barrel reports
         * a gap whose only cause is an indirection the code is explicit about.
         */
        resolveOrigin = (fromModule, binding, depth = 0) => {
            const record = factsBy.get(fromModule)?.bindings?.[binding];

            if (!record || depth > MAX_SUPERCLASS_DEPTH || !record.specifier.startsWith('.')) {
                return null
            }

            const target      = resolve(record.specifier, fromModule),
                  targetFacts = target ? factsBy.get(target) : null;

            if (!targetFacts) {
                return null
            }

            const {imported} = record;

            if (imported !== 'default' && imported !== '*' && targetFacts.bindings?.[imported]) {
                const onward = resolveOrigin(target, imported, depth + 1);

                if (onward) {
                    return onward
                }
            }

            return {module: target, exported: imported}
        },

        /**
         * Locates a member on a module, walking `extends` chains. A subclass never mentions the
         * members it inherits, so stopping at the subclass would report a gap where the code is
         * perfectly static — the same blind spot a single-file grep has.
         */
        findMember = (module, wanted, depth = 0) => {
            const facts = factsBy.get(module);

            if (!facts || depth > MAX_SUPERCLASS_DEPTH) {
                return null
            }

            if (facts.members.includes(wanted)) {
                return {module, member: wanted}
            }

            for (const superBinding of facts.superBindings) {
                const origin = resolveOrigin(module, superBinding);

                if (origin) {
                    const inherited = findMember(origin.module, wanted, depth + 1);

                    if (inherited) {
                        return inherited
                    }
                }
            }

            return null
        },

        /** Resolves a call on a local binding to the `(module, member)` it lands on. */
        resolveTarget = (fromModule, binding, wantedMember) => {
            const origin = resolveOrigin(fromModule, binding);

            if (!origin) {
                return null
            }

            // `Svc.run()` lands on `run`; a bare `helper()` lands on whatever name was imported.
            const wanted = wantedMember
                ?? (origin.exported === 'default' || origin.exported === '*' ? 'default' : origin.exported);

            return findMember(origin.module, wanted)
        },

        // Whether a host capability exists anywhere behind a module — memoised, cycle-safe.
        capabilityCache = new Map(),

        reachesCapability = (module, stack = new Set()) => {
            if (capabilityCache.has(module)) {
                return capabilityCache.get(module)
            }

            if (stack.has(module)) {
                // Mid-cycle: contribute nothing rather than answering. The outer frame decides.
                return false
            }

            stack.add(module);

            const answer = (factsBy.get(module)?.capabilities.length ?? 0) > 0
                || [...(importsBy.get(module) ?? [])].some(target => reachesCapability(target, stack));

            stack.delete(module);
            capabilityCache.set(module, answer);

            return answer
        },

        enqueue = (module, member, from = null) => {
            const key = `${module}::${member}`;

            if (!invoked.has(key)) {
                invoked.set(key, from);
                memberQueue.push({module, member, key})
            }
        };

    // Seeds. Importing a module executes its top level and nothing else; running the entrypoint is
    // what every member it declares is for.
    seen.forEach(module => enqueue(module, MODULE_SCOPE));
    (factsBy.get(entrypoint)?.members ?? []).forEach(member => enqueue(entrypoint, member));

    while (memberQueue.length > 0) {
        const {module, member, key} = memberQueue.shift(),
              facts                 = factsBy.get(module);

        if (!facts) {
            continue
        }

        facts.calls.filter(call => call.member === member
            // Behind the import-safe guard, and this module is not the script — so it does not run.
            && !(call.entrypointGuarded && module !== entrypoint)).forEach(call => {
            // Function references handed to this call, followed BEFORE the callee itself — the
            // callee may be unresolvable while the reference is perfectly nameable, and dropping
            // the argument because the callee was opaque is how `run(danger)` came back safe.
            (call.argRefs ?? []).forEach(name => {
                if (facts.members.includes(name)) {
                    enqueue(module, name, key);
                    return
                }

                const passed = resolveTarget(module, name, null);

                if (passed) {
                    enqueue(passed.module, passed.member, key)
                }
            });

            // `this.x()` / `super.x()` — the class's own seam. This is the only way
            // `TemporalSummaryAggregationService` reaches `execSync`, three members deep.
            if (call.viaSelf) {
                if (call.targetMember && facts.members.includes(call.targetMember)) {
                    enqueue(module, call.targetMember, key);
                    return
                }

                for (const superBinding of facts.superBindings) {
                    const inherited = resolveTarget(module, superBinding, call.targetMember);

                    if (inherited) {
                        enqueue(inherited.module, inherited.member, key);
                        return
                    }
                }

                dispatchGaps.push({module, member, call, reason: 'self-member-not-found', behind: module});
                return
            }

            if (call.computed) {
                // `obj[key]()` — the destination is chosen at runtime and there is no name to follow.
                dispatchGaps.push({module, member, call, reason: 'computed-callee', behind: module});
                return
            }

            if (!call.binding) {
                // A chained callee — `factory().run()`, `promise.then()`. The receiver is a VALUE, and
                // values are outside what a name-based closure can police. Same declared leaf as a
                // bare package specifier, stated rather than silently dropped.
                return
            }

            // A local function or const-bound arrow in this same module — `main()`.
            if (!call.targetMember && facts.members.includes(call.binding)) {
                enqueue(module, call.binding, key);
                return
            }

            const record = facts.bindings?.[call.binding];

            if (!record) {
                // Not an import, not a local member: a global, a parameter, or a value from elsewhere.
                // A LEAF for the same reason as above — `console.log` is not a hidden shell.
                return
            }

            if (!record.specifier.startsWith('.')) {
                // A bare package. The import walk already treats these as leaves and the capability
                // taxonomy names the ones that matter, so `path.join()` is answered, not unknown.
                return
            }

            const target = resolveTarget(module, call.binding, call.targetMember);

            if (target) {
                enqueue(target.module, target.member, key)
            } else {
                dispatchGaps.push({
                    module, member, call,
                    reason: 'member-not-found',
                    behind: resolveOrigin(module, call.binding)?.module ?? resolve(record.specifier, module)
                })
            }
        })
    }

    // ---- Classify every capability site against what was proven to run ----
    factsBy.forEach((facts, module) => {
        facts.capabilities.forEach(entry => {
            // A guarded site in an imported module is dead code for this entrypoint: the guard is a
            // runtime test on the process entry, and the answer is statically known here.
            const dormant = entry.entrypointGuarded && module !== entrypoint,
                  runs    = !dormant && (entry.required
                      || (!entry.degradedInPlace && invoked.has(`${module}::${entry.member}`)));

            (runs ? required : used).push({module, ...entry})
        })
    });

    // A dispatch we could not follow only threatens the verdict on two conditions, and both must hold.
    //
    // 1. Something must remain for it to reach: once every capability site in the closure is required
    //    or provably degraded, an unnameable call cannot change the answer.
    // 2. A capability must lie BEHIND that particular edge. `IDENTITIES.map(…)` resolves to a module
    //    of string constants — there is no member called `map` there, and there is also no shell, so
    //    calling it an unresolved edge would be true and useless.
    //
    // Reporting every unnameable call instead of these two produced 656 edges on `backup.mjs` alone,
    // which is not a stricter gate — it is the same gate with its signal buried.
    if (used.some(entry => !entry.degradedInPlace)) {
        dispatchGaps
            .filter(gap => gap.behind && reachesCapability(gap.behind))
            .forEach(gap => unresolved.push({
                module: gap.module,
                reason: 'unresolved-dispatch',
                member: gap.member,
                callee: [gap.call.binding, gap.call.targetMember].filter(Boolean).join('.') || null,
                line  : gap.call.line
            }))
    }

    return {reached: [...seen], required, used, unresolved, invoked: [...invoked.keys()], invokedBy: invoked}
}

/**
 * @summary Reconstructs the call chain that proved a `(module, member)` node runs, entrypoint first.
 *
 * A conflict finding without this says "something here needs a shell" and leaves the reader to find
 * the three calls that get there. With it, the finding names them. Cycles cannot occur — a node is
 * recorded once, on the edge that first proved it — but the walk is bounded anyway so a corrupted map
 * cannot hang a build.
 *
 * @param {Map} invokedBy `walkCapabilityClosure().invokedBy`.
 * @param {String} key `${module}::${member}`.
 * @returns {String[]} keys, root first.
 */
export function invocationChain(invokedBy, key) {
    const chain = [];

    let current = key;

    while (current && chain.length <= MAX_CHAIN_LENGTH) {
        chain.unshift(current);
        current = invokedBy.get(current) ?? null
    }

    return chain
}

/**
 * @summary Finding kinds this resolver emits. Every one names a real disagreement or a real gap.
 *
 * There is deliberately no `default` or `assumed` kind. The retired designs all failed by having a
 * plane to fall back to when they could not tell — and the fallback is where a comparator loses its
 * teeth, because nobody argues with the answer nobody had to defend.
 * @type {Object}
 */
export const FINDING = Object.freeze({
    authorityConflictInPlane: 'authority-conflict-in-plane',
    authorityConflictHost   : 'authority-conflict-host',
    unresolvedEdge          : 'unresolved-edge'
});

/**
 * @summary Resolves one entrypoint's plane from its closure, with `TASK_AUTHORITY_BY_NAME` as the
 * authority for mapped tasks.
 *
 * The authority is CONSUMED, never re-derived: for a mapped task the declared class is the answer,
 * and the closure's job is to DISAGREE with it loudly rather than to vote. Both directions of
 * disagreement are findings, but they are not the same defect and the repair differs:
 *
 * - `authority-conflict-in-plane` — the authority says this runs where there is no shell, and the
 *   closure found a required one. The script breaks on the plane it is declared for. Severe.
 * - `authority-conflict-host` — the authority says host-edge and the closure found no requirement.
 *   Usually over-declaration or a runtime dependency the static graph cannot see; still reported,
 *   because an authority nobody can reproduce from the code is the thing this lane exists to fix.
 *
 * An unresolved edge NEVER downgrades to a plane. It is reported and the plane is `null`, so a
 * caller cannot mistake "could not tell" for "safe".
 *
 * @param {Object} options
 * @param {Object} options.closure Result of `walkCapabilityClosure`.
 * @param {String|null} [options.authorityClass] `ORCHESTRATOR_AUTHORITY_CLASS` value for a mapped task.
 * @param {String|null} [options.taskName] Task name, for finding messages.
 * @param {String} [options.entrypoint] Path, for finding messages.
 * @returns {{plane: String|null, basis: String, findings: Object[]}}
 */
export function resolveEntrypointPlane({closure, authorityClass = null, taskName = null, entrypoint = ''}) {
    const
        findings      = [],
        closureIsHost = closure.required.length > 0,
        hostEvidence  = closure.required.map(entry => `${entry.module}:${entry.line}`);

    closure.unresolved.forEach(edge => {
        findings.push({
            kind     : FINDING.unresolvedEdge,
            entrypoint,
            module   : edge.module ?? null,
            reason   : edge.reason,
            specifier: edge.specifier ?? null,
            // The two discriminators that separate one edge from another INSIDE a module. They were
            // collected on the closure edge and then dropped here, so every consumer keyed on
            // `module::reason` alone — a ratchet blind to substitution within a file, and an
            // identity function whose discriminating branch could never fire in production.
            member : edge.member ?? null,
            callee : edge.callee ?? null,
            line   : edge.line ?? null,
            message: `unresolved edge (${edge.reason}) — the plane cannot be derived through it`
        })
    });

    // An unresolved edge means the closure is INCOMPLETE, so a "no host requirement" verdict from it
    // is unsound: the capability could live behind the edge we could not follow. A host verdict still
    // stands — we found a requirement, and more reachable code cannot remove one.
    const closureIsSound = closureIsHost || findings.length === 0;

    if (authorityClass) {
        const authorityIsHost = authorityClass === 'host-edge';

        if (!authorityIsHost && closureIsHost) {
            findings.push({
                kind    : FINDING.authorityConflictInPlane,
                entrypoint,
                taskName,
                authorityClass,
                evidence: hostEvidence,
                message : `authority declares '${authorityClass}' but the closure requires a host capability`
            })
        } else if (authorityIsHost && !closureIsHost && closureIsSound) {
            findings.push({
                kind   : FINDING.authorityConflictHost,
                entrypoint,
                taskName,
                authorityClass,
                message: 'authority declares host-edge but the closure found no required host capability'
            })
        }

        return {plane: authorityClass, basis: 'authority', findings}
    }

    return {
        plane: closureIsSound ? (closureIsHost ? 'host-edge' : 'container-plane') : null,
        basis: closureIsSound ? 'closure' : 'unresolved',
        findings
    }
}
