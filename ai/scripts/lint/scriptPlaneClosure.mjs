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
 * @returns {{imports: String[], capabilities: Object[], unresolved: Object[], parsed: Boolean}}
 */
export function collectModuleFacts(source) {
    const
        ast          = parseModule(source),
        imports      = [],
        capabilities = [],
        unresolved   = [];

    if (!ast) {
        return {imports, capabilities, unresolved: [{reason: 'unparseable'}], invokedSpecifiers: [], parsed: false}
    }

    // Which local binding names came from a host-capability package, so a later call can be traced
    // back to it. Matching the CALL rather than the import is what separates requirement from use.
    const
        hostBindings    = new Map(),
        // localName -> specifier, so a call on an imported binding can be traced back to its module.
        importBindings  = new Map(),
        invokedBindings = new Set();

    walkWithAncestors(ast, (node, ancestors) => {
        if (node.type === 'ImportDeclaration') {
            const specifier = node.source.value;

            imports.push(specifier);

            const normalized = normalizeSpecifier(specifier),
                  capability = Object.entries(HOST_CAPABILITY_SOURCES)
                      .find(([, sources]) => sources.includes(normalized))?.[0];

            node.specifiers.forEach(spec => importBindings.set(spec.local.name, specifier));

            if (capability) {
                node.specifiers.forEach(spec => hostBindings.set(spec.local.name, capability))
            }
            return
        }

        if (node.type === 'ImportExpression') {
            if (node.source?.type === 'Literal' && typeof node.source.value === 'string') {
                imports.push(node.source.value)
            } else {
                unresolved.push({
                    reason: 'dynamic-import',
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
            return
        }

        if (node.type !== 'CallExpression') {
            return
        }

        // `execFile(…)` / `execFileAsync(…)` / `spawn(…)` — a bare identifier, or a member expression
        // rooted at one (`cp.execSync(…)`), or a promisified wrapper bound from one.
        const root = node.callee.type === 'Identifier'       ? node.callee.name
                   : node.callee.type === 'MemberExpression' ? node.callee.object?.name
                   : null;

        if (!root) {
            return
        }

        if (importBindings.has(root)) {
            invokedBindings.add(root)
        }

        const capability = hostBindings.get(root);

        if (capability) {
            const deferred = isDeferredCallSite(ancestors);

            capabilities.push({
                capability,
                deferred,
                // Kept separately from `required` so the entrypoint-own rule below can promote a
                // deferred call WITHOUT promoting a gracefully-degraded one — the bundle-stamp case
                // in the module header, where the program continues with a null instead of failing.
                degradedInPlace: isGracefullyDegraded(ancestors),
                // REQUIRED means: this runs, and its failure stops the program. A deferred site fails
                // the first half (it may never be called) and a gracefully-degraded one fails the
                // second (the program continues without it).
                required: !deferred && !isGracefullyDegraded(ancestors),
                line    : node.loc?.start?.line ?? null
            })
        }
    });

    // The specifiers this module does not merely import but CALLS. One level of this is what
    // separates `syncGithubWorkflow` (which invokes `GH_SyncService.runFullSync()`, and so genuinely
    // needs what that method spawns) from `backup.mjs` (which reaches the same class of code without
    // ever calling into it).
    const invokedSpecifiers = [...invokedBindings].map(name => importBindings.get(name)).filter(Boolean);

    return {imports, capabilities, unresolved, invokedSpecifiers: [...new Set(invokedSpecifiers)], parsed: true}
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
 * @summary Walks an entrypoint's static import graph to fixpoint, collecting required capabilities.
 *
 * `readFile` and `resolve` are injected so the whole closure is testable without a repository — the
 * fixtures that red-prove `githubWorkflowSync` and `backup` run entirely in memory.
 *
 * @param {Object} options
 * @param {String} options.entrypoint Absolute path.
 * @param {Function} [options.readFile] `(absPath) => String|null`.
 * @param {Function} [options.resolve] `(specifier, fromFile) => String|null`.
 * @returns {{reached: String[], required: Object[], used: Object[], unresolved: Object[]}}
 */
export function walkCapabilityClosure({
    entrypoint,
    readFile = absPath => (fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf8') : null),
    resolve  = resolveRelative
}) {
    const
        seen       = new Set(),
        // Modules the entrypoint CALLS into, not merely imports. Populated while the entrypoint is
        // read, and the queue is FIFO with the entrypoint seeded first, so every callee is visited
        // after this set is known.
        directlyInvoked = new Set(),
        queue      = [entrypoint],
        required   = [],
        used       = [],
        unresolved = [];

    while (queue.length > 0) {
        const current = queue.shift();

        if (seen.has(current)) {
            continue
        }

        seen.add(current);

        const isEntrypoint = current === entrypoint,
              source       = readFile(current);

        if (source === null) {
            unresolved.push({module: current, reason: 'unreadable'});
            continue
        }

        const facts = collectModuleFacts(source);

        facts.unresolved.forEach(edge => unresolved.push({module: current, ...edge}));

        // What "required" can mean here, stated because neither pure answer is usable.
        //
        // A static import graph cannot decide INVOCATION, and the two sound extremes are both wrong:
        // counting every reachable call convicts `backup.mjs` against ADR-0014 — ticket-ref-ok: the
        // ADR is the authority being satisfied — (its closure reaches
        // `spawn` inside methods nothing calls), while counting only module-scope calls classifies
        // the ENTIRE tree as in-plane, because real code puts its shell calls inside functions.
        //
        // So the rule is: a capability is required when the ENTRYPOINT'S OWN code calls it — its
        // functions are what running the script executes — or when a reached module runs it at MODULE
        // SCOPE, which importing alone triggers. A deferred call in a transitively reached module is
        // recorded as `used`, never as a requirement, because nothing here proves it is reached.
        if (isEntrypoint) {
            facts.invokedSpecifiers.forEach(specifier => {
                if (!specifier.startsWith('.')) {
                    return
                }

                const target = resolve(specifier, current);

                if (target) {
                    directlyInvoked.add(target)
                }
            })
        }

        facts.capabilities.forEach(entry => {
            const runs = entry.required
                || (isEntrypoint && !entry.degradedInPlace)
                || (directlyInvoked.has(current) && !entry.degradedInPlace);

            (runs ? required : used).push({module: current, ...entry})
        });

        facts.imports.forEach(specifier => {
            if (!specifier.startsWith('.')) {
                // A bare package is a leaf: its own graph is not ours to police, and the capability
                // taxonomy already names the ones that matter.
                return
            }

            const target = resolve(specifier, current);

            if (target) {
                queue.push(target)
            } else {
                unresolved.push({module: current, specifier, reason: 'unresolved-specifier'})
            }
        });
    }

    return {reached: [...seen], required, used, unresolved}
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
            line     : edge.line ?? null,
            message  : `unresolved edge (${edge.reason}) — the plane cannot be derived through it`
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
