#!/usr/bin/env node
import * as acorn            from 'acorn';
import {execSync, spawnSync} from 'child_process';
import {readFileSync}        from 'fs';
import path                  from 'path';
import {fileURLToPath}       from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const scriptRoot = path.resolve(__dirname, '../..');

/**
 * @summary Guards the readiness contract for members a class assigns in `initAsync()`.
 *
 * `core.Base` schedules `initAsync()` on a microtask, so anything it assigns is `undefined` for an
 * unbounded window after `construct()` returns. A method that reads such a member without
 * establishing readiness does not fail loudly — it reads `undefined` and fails somewhere else,
 * later, as a different symptom.
 *
 * ## Two disciplines are valid, and this recognises BOTH
 *
 * 1. **`await this.ready()`** before the read.
 * 2. **A require-style accessor** — a method that tests the member and THROWS when it is unset
 *    (`GraphService.requireDb()`), so every consumer gets a loud, attributable failure instead of
 *    `undefined`. This is not a weaker discipline; it is the one that works for synchronous callers.
 *
 * Crediting only the first would fail `GraphService`, which is correct code. That is the difference
 * between a guard that is recognised and one that is merely tolerated.
 *
 * ## Why this is an AST analyser and not a regex
 *
 * Its predecessor was a regex predicate, and it was dropped after two review cycles on
 * evidence rather than taste: each cycle closed its named fixtures and the next found a new class the
 * scanner could not reach — multiline declarations, `const me = this` aliases, regex literals read as
 * structure, single-statement branch extent, compound guards, `&&`/`!!` conditions. The population
 * kept admitting shapes a line-oriented predicate has no way to see, so the parse is the fix.
 *
 * ## WHAT THIS DOES NOT ESTABLISH — read this before trusting a green run
 *
 * - **Per-file only.** A member guarded by a caller in another module is invisible here, and reads
 *   as unguarded. That is why the registry exists and why every entry states a reason.
 * - **Textual order, not branch dominance.** A `ready()` earlier in the method body credits every
 *   later read in that method, including reads on paths the `await` cannot actually dominate.
 *   Ordering is the approximation; a control-flow analysis is not attempted.
 * - **No cross-method following.** A private helper that guards internally does not credit its
 *   callers, and a helper called BEFORE the read does not transfer its guard.
 * - It proves a discipline is **present**, never that it is **correct**.
 */

/** Members whose readiness is established by a require-style accessor rather than by `ready()`. */
const READY_CALL = 'ready';

/**
 * Known-unguarded reads, each with the reason it is not yet fixed. NOT a grandfathering queue: this
 * is the baseline to shrink, and its size at introduction is recorded in the PR that adds it.
 *
 * Keyed `repo/relative/path.mjs::method::member`, so moving a read to another method re-reports it
 * rather than inheriting an exemption granted somewhere else.
 */
export const REGISTRY = new Map([
    ['ai/services/memory-core/SessionService.mjs::findSessionsToSummarize::memoryCollection',
     'The read this guard was written to catch. Left unfixed ON PURPOSE for one commit so the lint is ' +
     'observed failing on the real tree; the repair follows and this entry goes with it.']
]);

/**
 * @summary Parses one module, tolerating nothing — an unparseable file is a hard error rather than a
 * silent skip, because a skipped file reads as a clean one.
 * @param {String} source
 * @param {String} file For the thrown message.
 * @returns {Object} acorn Program node.
 */
function parseModule(source, file) {
    try {
        return acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module', locations: true})
    } catch (error) {
        throw new Error(`check-init-async-readiness: ${file} did not parse: ${error.message}`)
    }
}

/**
 * @summary Walks every node, depth-first, invoking `visit` on each.
 *
 * Hand-rolled because `acorn-walk` is not a dependency here and this needs no node-type knowledge —
 * only "reach every object that looks like a node".
 * @param {Object} node
 * @param {Function} visit
 * @returns {void}
 */
function walk(node, visit, parent = null) {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
        node.forEach(child => walk(child, visit, parent));
        return
    }

    if (typeof node.type === 'string') visit(node, parent);

    for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'start' || key === 'end') continue;
        walk(node[key], visit, typeof node.type === 'string' ? node : parent)
    }
}

/**
 * @summary `this.<name>` member expressions inside a subtree, with their source offsets.
 * @param {Object} node
 * @returns {Object[]} `[{name, start, line}]`
 */
function thisMemberReads(node) {
    const found = [];

    walk(node, (current, parent) => {
        if (current.type === 'MemberExpression' &&
            current.object?.type === 'ThisExpression' &&
            current.property?.type === 'Identifier' &&
            !current.computed) {
            // `this.writer?.publish()` is undefined-safe BY CONSTRUCTION — the whole defect class is
            // "reads undefined and fails later as a different symptom", and an optional chain cannot
            // propagate the undefined onward. Telemetry lanes use this deliberately: the record is
            // best-effort, and a missing writer must degrade rather than throw.
            //
            // The `optional` flag sits on the CONSUMING node, not on `this.writer` itself — an
            // earlier draft tested `current.optional` and credited nothing, because that flag is
            // always false here.
            const optionallyConsumed = parent &&
                (parent.type === 'MemberExpression' || parent.type === 'CallExpression') &&
                parent.optional === true &&
                (parent.object === current || parent.callee === current);

            if (optionallyConsumed) return;

            found.push({name: current.property.name, start: current.start, line: current.loc?.start.line})
        }
    });

    return found
}

/**
 * @summary The source offset after which each member is established by an in-method truthiness
 * guard — `if (!this.db) return …`.
 *
 * A degraded return is a real discipline, not a weaker one: `getMemoryCoreToolMetrics()` answers
 * `{status: 'unavailable'}` rather than throwing, which is the correct contract for an observation
 * surface whose absence must not take down its caller. Crediting only `throw` would report every
 * such method and turn this lint's own narrowness into repo debt.
 * @param {Object} methodNode
 * @returns {Map<String,Number>} member -> offset after which reads are guarded
 */
function inMethodTruthinessGuards(methodNode) {
    const guardedFrom = new Map(),
          testSpans   = [];

    walk(methodNode, node => {
        if (node.type !== 'IfStatement') return;

        const test    = node.test,
              negated = test?.type === 'UnaryExpression' && test.operator === '!' ? test.argument : null,
              subject = negated ?? test;

        if (subject?.type !== 'MemberExpression' ||
            subject.object?.type !== 'ThisExpression' ||
            subject.property?.type !== 'Identifier') return;

        // `if (!this.x) { return/throw }` guards what follows; `if (this.x) { … }` guards its own body.
        let exits = false;
        walk(node.consequent, inner => {
            if (inner.type === 'ReturnStatement' || inner.type === 'ThrowStatement') exits = true
        });

        const name = subject.property.name,
              from = negated && exits ? node.end : node.start;

        // The guard's OWN test reads the member it protects. Without this the lint reports every
        // correctly-guarded method for the act of checking — `ensureSchema()`'s `if (!this.db) return`
        // was flagged at the `if` line itself.
        testSpans.push([test.start, test.end]);

        guardedFrom.set(name, Math.min(guardedFrom.get(name) ?? Infinity, from))
    });

    return {guardedFrom, testSpans}
}

/**
 * @summary The members a class assigns in `initAsync()` — the population, DERIVED.
 *
 * Derived from the assignment rather than from a hardcoded member list, because the predecessor's
 * defect was a hand-written query shaping its own population. Assignments nested in the arrow
 * functions and try blocks `initAsync` bodies actually use are included; the walk does not care
 * about depth.
 * @param {Object} classBody
 * @returns {Set<String>}
 */
export function membersAssignedInInitAsync(classBody) {
    const assigned = new Set();

    for (const member of classBody.body ?? []) {
        if (member.type !== 'MethodDefinition' || member.key?.name !== 'initAsync') continue;

        walk(member.value, node => {
            if (node.type === 'AssignmentExpression' &&
                node.left?.type === 'MemberExpression' &&
                node.left.object?.type === 'ThisExpression' &&
                node.left.property?.type === 'Identifier' &&
                !node.left.computed) {
                assigned.add(node.left.property.name)
            }
        })
    }

    return assigned
}

/**
 * @summary Methods that are require-style guards: they test a member and throw when it is unset.
 *
 * Recognising this is what lets `GraphService` pass without `await this.ready()`. The shape is
 * deliberately narrow — a member test whose consequent throws — so an ordinary `if (x) { ... }` that
 * merely returns early does not silently count as a readiness guarantee.
 * @param {Object} classBody
 * @returns {Map<String,String>} guarded member -> guarding method name
 */
export function requireStyleGuards(classBody) {
    const guards = new Map();

    for (const member of classBody.body ?? []) {
        if (member.type !== 'MethodDefinition' || !member.key?.name) continue;

        walk(member.value, node => {
            if (node.type !== 'IfStatement') return;

            const test    = node.test,
                  negated = test?.type === 'UnaryExpression' && test.operator === '!' ? test.argument : null,
                  subject = negated ?? test;

            if (subject?.type !== 'MemberExpression' ||
                subject.object?.type !== 'ThisExpression' ||
                subject.property?.type !== 'Identifier') return;

            let throws = false;
            walk(node.consequent, inner => { if (inner.type === 'ThrowStatement') throws = true });

            if (throws) guards.set(subject.property.name, member.key.name)
        })
    }

    return guards
}

/**
 * @summary Finds unguarded reads of `initAsync`-assigned members.
 * @param {String} source
 * @param {String} [file='<inline>']
 * @returns {Object[]} `[{method, member, line}]`
 */
export function findUnguardedInitAsyncReads(source, file = '<inline>') {
    const program = parseModule(source, file),
          hits    = [];

    walk(program, node => {
        if (node.type !== 'ClassBody') return;

        const population = membersAssignedInInitAsync(node);
        if (population.size === 0) return;

        const guards         = requireStyleGuards(node),
              guardMachinery = new Set(guards.values());

        // One level: whatever a guard calls on `this` is part of the guard's own path.
        for (const member of node.body ?? []) {
            if (member.type !== 'MethodDefinition' || !guardMachinery.has(member.key?.name)) continue;

            walk(member.value, inner => {
                if (inner.type === 'CallExpression' &&
                    inner.callee?.type === 'MemberExpression' &&
                    inner.callee.object?.type === 'ThisExpression' &&
                    inner.callee.property?.type === 'Identifier') {
                    guardMachinery.add(inner.callee.property.name)
                }
            })
        }

        for (const member of node.body ?? []) {
            if (member.type !== 'MethodDefinition' || !member.key?.name) continue;

            const methodName = member.key.name;

            // `initAsync` assigns the population; a constructor-adjacent lifecycle hook establishing
            // it is not a consumer of it.
            if (methodName === 'initAsync' || methodName === 'construct') continue;

            // A require-style guard reads the member it protects, by construction — and so does the
            // guard's own failure path. `GraphService.requireDb()` throws `createUnavailableError()`,
            // which reads `graphInitError` to build the diagnostic. Treating that helper as a consumer
            // would report the guard for being a guard.
            //
            // This is ONE level and it is exclusion, not credit: being called by a guard removes a
            // method from the consumer set; it never establishes readiness for anything else.
            if (guardMachinery.has(methodName)) continue;

            // Textual order, not dominance — stated in the header as a bound, not hidden as a detail.
            let readyAt = Infinity;
            walk(member.value, node2 => {
                if (node2.type === 'CallExpression' &&
                    node2.callee?.type === 'MemberExpression' &&
                    node2.callee.object?.type === 'ThisExpression' &&
                    node2.callee.property?.name === READY_CALL) {
                    readyAt = Math.min(readyAt, node2.start)
                }
            });

            const {guardedFrom, testSpans} = inMethodTruthinessGuards(member.value),
                  insideAGuardTest         = offset => testSpans.some(([from, to]) => offset >= from && offset < to);

            for (const read of thisMemberReads(member.value)) {
                if (!population.has(read.name)) continue;
                if (guards.has(read.name))      continue;   // a require-style accessor owns this member
                if (read.start > readyAt)       continue;   // `ready()` established earlier in this method
                if (read.start > (guardedFrom.get(read.name) ?? Infinity)) continue; // `if (!this.x) return`
                if (insideAGuardTest(read.start)) continue; // the guard checking the member is not a consumer

                hits.push({method: methodName, member: read.name, line: read.line})
            }
        }
    });

    // One report per (method, member): a member read five times in one method is one obligation.
    const seen = new Set();

    return hits.filter(hit => {
        const key = `${hit.method}::${hit.member}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true
    })
}

/**
 * @summary Normalizes an input path to a repo-relative POSIX path.
 * @param {String} file
 * @param {String} gitRoot
 * @returns {String}
 */
export function toRepoRelative(file, gitRoot) {
    return path.relative(gitRoot, path.resolve(gitRoot, file)).split(path.sep).join('/')
}

function main() {
    let gitRoot;
    try {
        gitRoot = execSync('git rev-parse --show-toplevel', {cwd: scriptRoot, encoding: 'utf-8'}).trim();
    } catch {
        console.error('\x1b[31mError: Could not determine git repository root.\x1b[0m');
        process.exit(1)
    }

    const rawArgv   = process.argv.slice(2),
          quiet     = rawArgv.includes('-q') || rawArgv.includes('--quiet'),
          argvFiles = rawArgv.filter(arg => !arg.startsWith('-'));

    function collectDefaultFiles() {
        const result = spawnSync('find', ['ai', '-type', 'f', '-name', '*.mjs'], {cwd: gitRoot, encoding: 'utf-8'});
        if (result.status !== 0) {
            console.error('\x1b[31mError: find command failed.\x1b[0m');
            process.exit(1)
        }
        return result.stdout.trim().split('\n').filter(Boolean)
    }

    const files = (argvFiles.length > 0 ? argvFiles : collectDefaultFiles())
        .filter(file => file.endsWith('.mjs'))
        .map(file => toRepoRelative(file, gitRoot))
        .filter(file => file.startsWith('ai/'));

    const violations = [],
          startedAt  = Date.now();

    for (const file of files) {
        let content;
        try {
            content = readFileSync(path.resolve(gitRoot, file), 'utf-8')
        } catch (e) {
            console.error(`check-init-async-readiness: could not read ${file}: ${e.message}`);
            continue
        }

        for (const {method, member, line} of findUnguardedInitAsyncReads(content, file)) {
            if (REGISTRY.has(`${file}::${method}::${member}`)) continue;
            violations.push(`${file}:${line}: ${method}() reads this.${member}, assigned in initAsync(), with neither discipline`)
        }
    }

    const elapsedMs = Date.now() - startedAt;

    if (violations.length > 0) {
        console.error(`\x1b[31mcheck-init-async-readiness: ${violations.length} unguarded initAsync-member read(s):\x1b[0m`);
        if (!quiet) {
            violations.forEach(violation => console.error('  ' + violation));
            console.error('\nEstablish readiness before the read, either way:');
            console.error('  • `await this.ready()` earlier in the method, or');
            console.error('  • a require-style accessor that tests the member and THROWS when unset');
            console.error('    (see `GraphService.requireDb()`), so callers fail loudly instead of on undefined.');
            console.error('\nIf neither applies, add a REGISTRY entry stating why — a bare list is not acceptable.');
        }
        process.exit(1)
    }

    console.log(`check-init-async-readiness: ${files.length} ai .mjs file(s) scanned in ${elapsedMs}ms, ${REGISTRY.size} registered, 0 new violations.`)
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (invokedDirectly) {
    main()
}
