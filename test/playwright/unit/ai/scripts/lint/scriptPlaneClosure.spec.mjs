import {test, expect} from '@playwright/test';

import {
    FINDING,
    HOST_CAPABILITY,
    collectModuleFacts,
    handlerAborts,
    invocationChain,
    isGracefullyDegraded,
    normalizeSpecifier,
    parseModule,
    resolveEntrypointPlane,
    walkCapabilityClosure,
    walkWithAncestors
}                     from '../../../../../../ai/scripts/lint/scriptPlaneClosure.mjs';
import {buildTaskDefinitions} from '../../../../../../ai/daemons/orchestrator/taskDefinitions.mjs';
import fs                     from 'node:fs';
import os                     from 'node:os';
import path                   from 'node:path';

import {
    CENSUS_TASK_CONFIG,
    buildAuthorityByScript,
    readEntrypoints,
    readWorkflowEntrypoints,
    runLint
} from '../../../../../../ai/scripts/lint/lint-script-plane.mjs';

/**
 * The complete unresolved-edge population of `backup.mjs` — MEASURED against the live tree, which is
 * what makes the substitution arm below a real falsifier rather than a fixture arguing with itself.
 *
 * **Two edges, and the second one is why this fixture is worth keeping honest.** The config
 * provider's runtime-path dynamic import has always been here. The tenant-parser loader arrived with
 * per-tenant parser registration: `IngestionService` imports it statically, so every closure that
 * reaches that service now reaches the loader's runtime-path `import()` too — including a maintenance
 * entrypoint like `backup.mjs`, which has nothing to do with parsing.
 *
 * That widening is real and this fixture caught it, so it is recorded rather than trimmed. Moving the
 * loader behind a lazy import inside `resolveTenantParser` was considered and does NOT help: the
 * inner specifier is a static literal the closure follows anyway, so it adds a hop and removes
 * nothing. The edge is genuinely in the population; a fixture that said otherwise would be the
 * count-keeping this suite exists to prevent.
 * @type {String[]}
 */
const KNOWN_BACKUP_EDGES = [
    'ai/ConfigProvider.mjs::dynamic-import::load',
    'ai/services/knowledge-base/source/tenantParserLoader.mjs::dynamic-import::importModule'
];

/**
 * The subject is the DISTINCTION, not the detection.
 *
 * A directory-keyed predicate and a per-file header were both tried and both retired against measured
 * falsifiers, on the same finding: a directory name and a header are both names, and a name can be
 * wrong while the code moves on without it. What replaced them derives the plane from what an
 * entrypoint REACHES — and the moment you do that, the load-bearing question stops being "does this
 * file touch a shell" and becomes "does it REQUIRE one".
 *
 * ADR-0014 is the fixture that settles it — ticket-ref-ok: the ADR is the authority these arms
 * implement. `backup.mjs` stamps a bundle with `git rev-parse HEAD`
 * inside a swallowing try, and the ADR rules that not a host dependency because it degrades to
 * `null`. Any predicate that convicts it is wrong against an accepted decision record — which is what
 * the retired token classifier did.
 *
 * Fixtures are in-memory: `walkCapabilityClosure` takes injected `readFile`/`resolve`, so these arms
 * pin the resolver's logic rather than the current shape of the repository. A closure test that reads
 * real files fails when someone edits an unrelated script, and then gets deleted for being flaky.
 */

// A fixture graph: `{path: source}` plus the two injectables the walker needs.
const graphOf = files => ({
    readFile: absPath => (absPath in files ? files[absPath] : null),
    resolve : (specifier, fromFile) => {
        const dir      = fromFile.slice(0, fromFile.lastIndexOf('/')),
              resolved = specifier.startsWith('./') ? `${dir}/${specifier.slice(2)}` : specifier;

        return resolved in files ? resolved : null
    }
});

test.describe('scriptPlaneClosure', () => {
    test.describe('normalizeSpecifier — one identity for two live spellings', () => {
        // Both spellings are in use across ai/scripts, so a comparison that misses one silently
        // under-detects on roughly half the tree.
        test('`node:` prefix and bare name normalise together', () => {
            expect(normalizeSpecifier('node:child_process')).toBe('child_process');
            expect(normalizeSpecifier('child_process')).toBe('child_process');
        });

        test('deep imports collapse to the package root', () => {
            expect(normalizeSpecifier('fs-extra/lib/json')).toBe('fs-extra');
        });

        test('scoped packages keep both segments', () => {
            expect(normalizeSpecifier('@modelcontextprotocol/sdk/server')).toBe('@modelcontextprotocol/sdk');
        });

        test('relative specifiers are returned untouched', () => {
            expect(normalizeSpecifier('./sibling.mjs')).toBe('./sibling.mjs');
        });
    });

    test.describe('requirement vs use — the ADR-0014 distinction', () => {
        const CALL = `import {execFile} from 'child_process';\n`;

        test('a bare capability call is REQUIRED', () => {
            const facts = collectModuleFacts(`${CALL}execFile('git', ['status']);`);

            expect(facts.capabilities).toHaveLength(1);
            expect(facts.capabilities[0].capability).toBe(HOST_CAPABILITY.shell);
            expect(facts.capabilities[0].required).toBe(true);
        });

        test('a call inside a swallowing try is USE, not requirement — the ADR-0014 shape', () => {
            const facts = collectModuleFacts(
                `${CALL}let sha = null;\ntry { sha = execFile('git', ['rev-parse']); } catch (err) { console.warn(err); }`
            );

            expect(facts.capabilities[0].required).toBe(false);
        });

        test('a catch that RETHROWS leaves the capability required', () => {
            const facts = collectModuleFacts(
                `${CALL}try { execFile('git', []); } catch (err) { throw err; }`
            );

            expect(facts.capabilities[0].required).toBe(true);
        });

        test('a catch that process.exit()s leaves the capability required', () => {
            const facts = collectModuleFacts(
                `${CALL}try { execFile('git', []); } catch { process.exit(1); }`
            );

            expect(facts.capabilities[0].required).toBe(true);
        });

        test('try/finally with NO catch does not swallow', () => {
            // The error still propagates past a finalizer, so the capability is required. Reading
            // `TryStatement` as "protected" without checking for a handler gets this backwards.
            const facts = collectModuleFacts(
                `${CALL}try { execFile('git', []); } finally { cleanup(); }`
            );

            expect(facts.capabilities[0].required).toBe(true);
        });

        test('a call inside the CATCH limb is not protected by that catch', () => {
            const facts = collectModuleFacts(
                `${CALL}try { risky(); } catch (err) { execFile('git', []); }`
            );

            expect(facts.capabilities[0].required).toBe(true);
        });

        test('a promisified binding is still the capability — the false negative that hid ADR-0014', () => {
            // `const execFileAsync = promisify(execFile)` is how the real fixture calls it. Tracking
            // only import bindings reports ZERO capability sites for backup.mjs, which reads as a
            // clean file rather than as a detector that cannot see.
            const facts = collectModuleFacts(
                `${CALL}import {promisify} from 'util';\nconst run = promisify(execFile);\nrun('git', []);`
            );

            expect(facts.capabilities).toHaveLength(1);
            expect(facts.capabilities[0].required).toBe(true);
        });

        test('a plain alias carries the capability too', () => {
            const facts = collectModuleFacts(`${CALL}const run = execFile;\nrun('git', []);`);

            expect(facts.capabilities).toHaveLength(1);
        });

        test('an unrelated import contributes no capability — non-vacuity for the detector', () => {
            const facts = collectModuleFacts(`import path from 'node:path';\npath.join('a', 'b');`);

            expect(facts.capabilities).toHaveLength(0);
        });
    });

    test.describe('handlerAborts / isGracefullyDegraded', () => {
        test('a missing handler aborts', () => {
            expect(handlerAborts(null)).toBe(true);
        });

        test('a logging handler does not abort', () => {
            const ast     = parseModule('try { a(); } catch (e) { console.warn(e); }'),
                  tryStmt = ast.body[0];

            expect(handlerAborts(tryStmt.handler)).toBe(false);
        });

        test('an empty ancestor chain is not degraded', () => {
            expect(isGracefullyDegraded([])).toBe(false);
        });
    });

    test.describe('walkWithAncestors', () => {
        test('yields nearest parent first', () => {
            const ast   = parseModule('try { a(); } catch { b(); }');
            let   chain = null;

            walkWithAncestors(ast, (node, ancestors) => {
                if (node.type === 'Identifier' && node.name === 'a') {
                    chain = ancestors.map(entry => entry.type)
                }
            });

            expect(chain[0]).toBe('CallExpression');
            expect(chain).toContain('TryStatement');
        });

        test('a non-node is a safe no-op', () => {
            expect(() => walkWithAncestors(null, () => {})).not.toThrow();
            expect(() => walkWithAncestors({notANode: true}, () => {})).not.toThrow();
        });
    });

    test.describe('walkCapabilityClosure — transitive reach', () => {
        test('a capability required TWO hops away is reached', () => {
            const files = {
                '/e.mjs'   : `import './mid.mjs';`,
                '/mid.mjs' : `import './leaf.mjs';`,
                '/leaf.mjs': `import {execFile} from 'child_process';\nexecFile('git', []);`
            };

            const closure = walkCapabilityClosure({entrypoint: '/e.mjs', ...graphOf(files)});

            expect(closure.required).toHaveLength(1);
            expect(closure.required[0].module).toBe('/leaf.mjs');
        });

        test('an import cycle terminates rather than hanging', () => {
            const files = {
                '/a.mjs': `import './b.mjs';`,
                '/b.mjs': `import './a.mjs';`
            };

            const closure = walkCapabilityClosure({entrypoint: '/a.mjs', ...graphOf(files)});

            expect(closure.reached.sort()).toEqual(['/a.mjs', '/b.mjs']);
        });

        test('a bare package is a leaf and is not walked', () => {
            const files   = {'/e.mjs': `import commander from 'commander';`};
            const closure = walkCapabilityClosure({entrypoint: '/e.mjs', ...graphOf(files)});

            expect(closure.reached).toEqual(['/e.mjs']);
            expect(closure.unresolved).toHaveLength(0);
        });

        test('an unreadable module is an unresolved edge, not a silent skip', () => {
            const closure = walkCapabilityClosure({entrypoint: '/missing.mjs', ...graphOf({})});

            expect(closure.unresolved[0].reason).toBe('unreadable');
        });

        test('a non-literal dynamic import is an unresolved edge', () => {
            const files   = {'/e.mjs': `const p = compute();\nawait import(p);`};
            const closure = walkCapabilityClosure({entrypoint: '/e.mjs', ...graphOf(files)});

            expect(closure.unresolved[0].reason).toBe('dynamic-import');
        });

        test('a LITERAL dynamic import is followed like a static one', () => {
            const files = {
                '/e.mjs'   : `await import('./leaf.mjs');`,
                '/leaf.mjs': `import {execFile} from 'child_process';\nexecFile('x', []);`
            };

            const closure = walkCapabilityClosure({entrypoint: '/e.mjs', ...graphOf(files)});

            expect(closure.required).toHaveLength(1);
            expect(closure.unresolved).toHaveLength(0);
        });

        test('an unparseable module is an unresolved edge rather than a throw', () => {
            // This arm earns its keep: adding invoked-import tracking left the unparseable EARLY
            // RETURN without an `invokedSpecifiers` field, so the walker threw on `undefined.forEach`
            // for any tree containing one bad file. A defensive arm caught a real regression in its
            // neighbour's happy path.
            const files   = {'/e.mjs': 'this is (not js'};
            const closure = walkCapabilityClosure({entrypoint: '/e.mjs', ...graphOf(files)});

            expect(closure.unresolved[0].reason).toBe('unparseable');
        });
    });

    test.describe('invocation-chain attribution — reaching is not invoking', () => {
        /*
         * The distinction that lets BOTH canonical fixtures pass at once, which no pure-reachability
         * rule can do:
         *
         *   - `backup.mjs` reaches `spawn` inside service methods it never calls -> NOT host-required,
         *     which is what the bundle-stamp decision demands.
         *   - `syncGithubWorkflow.mjs` calls `GH_SyncService.runFullSync()`, and that method spawns
         *     git -> host-required, which is what its declared authority says.
         *
         * Same import-graph shape, opposite verdicts. The only difference is whether the entrypoint
         * CALLS the binding.
         */
        const serviceWithDeferredShell = `import {spawn} from 'child_process';
export default {run() { return spawn('git', []); }};`;

        test('an imported-but-never-called service does NOT make the entrypoint host-required', () => {
            const files = {
                '/e.mjs'  : `import Svc from './svc.mjs';\nconsole.log('no call');`,
                '/svc.mjs': serviceWithDeferredShell
            };

            const closure = walkCapabilityClosure({entrypoint: '/e.mjs', ...graphOf(files)});

            expect(closure.required, 'reaching a service is not invoking it').toHaveLength(0);
            // Still RECORDED, so the evidence is not lost — it is simply not a requirement.
            expect(closure.used.length).toBeGreaterThan(0);
        });

        test('an imported AND called service DOES make the entrypoint host-required', () => {
            const files = {
                '/e.mjs'  : `import Svc from './svc.mjs';\nSvc.run();`,
                '/svc.mjs': serviceWithDeferredShell
            };

            const closure = walkCapabilityClosure({entrypoint: '/e.mjs', ...graphOf(files)});

            expect(closure.required, 'calling into the service is what makes its spawn run').toHaveLength(1);
            expect(closure.required[0].module).toBe('/svc.mjs');
        });

        test('attribution follows the WHOLE proven chain, not just the first hop', () => {
            // The arm this file used to assert the opposite of, and the correction is the content.
            //
            // A one-level bound read as conservatism and was a FALSE SAFE: every step of
            // `/e -> Svc.run -> Deep.go -> spawn` is named in the source, and stopping after the first
            // hop reported `required: []` for a chain nothing had to guess about. What protects the
            // bundle-stamp case is MEMBER granularity, not a hop count — calling
            // `ConnectionService.connect()` still proves nothing about `spawnBridgeProcess()`, at any
            // depth. The two arms below hold that line while this one crosses three modules.
            const files = {
                '/e.mjs'   : `import Svc from './svc.mjs';\nSvc.run();`,
                '/svc.mjs' : `import Deep from './deep.mjs';\nexport default {run() { return Deep.go(); }};`,
                '/deep.mjs': `import {spawn} from 'child_process';\nexport default {go() { return spawn('git', []); }};`
            };

            const closure = walkCapabilityClosure({entrypoint: '/e.mjs', ...graphOf(files)});

            expect(closure.required, 'two hops is still a proof').toHaveLength(1);
            expect(closure.required[0].module).toBe('/deep.mjs');
            expect(closure.unresolved, 'nothing about this chain is unknown').toHaveLength(0);
        });

        test('a SIBLING member of a called module is still not promoted, at any depth', () => {
            // Member granularity is the real guard, and this is the arm that proves it survives the
            // unbounded walk. `/e` drives `Svc.run` two modules deep; `Deep.danger` is never named by
            // anything on that path, so its spawn stays unattributed no matter how far the walk goes.
            const files = {
                '/e.mjs'   : `import Svc from './svc.mjs';\nSvc.run();`,
                '/svc.mjs' : `import Deep from './deep.mjs';\nexport default {run() { return Deep.safe(); }};`,
                '/deep.mjs': `import {spawn} from 'child_process';
export default {safe() { return 1 }, danger() { return spawn('git', []); }};`
            };

            const closure = walkCapabilityClosure({entrypoint: '/e.mjs', ...graphOf(files)});

            expect(closure.required, 'a sibling method is not a call').toHaveLength(0);
            expect(closure.used, 'and the evidence is still recorded').toHaveLength(1);
        });

        test('a call the walk cannot follow is UNRESOLVED, never safe', () => {
            // The other half of the proof boundary. `Deep.go` does not exist on the module `Deep`
            // resolves to, so the chain cannot be completed — and the answer is "I could not tell",
            // not "nothing found". A capability sits behind that edge, which is what makes it matter.
            const files = {
                '/e.mjs'   : `import Svc from './svc.mjs';\nSvc.run();`,
                '/svc.mjs' : `import Deep from './deep.mjs';\nexport default {run() { return Deep.go(); }};`,
                '/deep.mjs': serviceWithDeferredShell
            };

            const closure = walkCapabilityClosure({entrypoint: '/e.mjs', ...graphOf(files)});

            expect(closure.required).toHaveLength(0);
            expect(closure.unresolved, 'the unfollowable call is reported').toHaveLength(1);
            expect(closure.unresolved[0].reason).toBe('unresolved-dispatch');
            expect(closure.unresolved[0].callee).toBe('Deep.go');
        });

        test('an unfollowable call with NO capability behind it is not an edge', () => {
            // The filter that keeps the ledger legible. `Data.map(…)` cannot be followed either, but
            // there is no shell anywhere behind `/data.mjs`, so calling it unresolved would be true
            // and useless. Reporting every unnameable call produced 656 edges on `backup.mjs` alone.
            const files = {
                '/e.mjs'   : `import Svc from './svc.mjs';\nSvc.run();`,
                '/svc.mjs' : `import Data from './data.mjs';\nexport default {run() { return Data.map(); }};`,
                '/data.mjs': `export default ['a', 'b'];`
            };

            const closure = walkCapabilityClosure({entrypoint: '/e.mjs', ...graphOf(files)});

            expect(closure.required).toHaveLength(0);
            expect(closure.unresolved, 'an edge that leads nowhere dangerous is not a gap').toHaveLength(0);
        });

        test('an inherited member resolves through `extends` rather than reporting a gap', () => {
            // A subclass never mentions what it inherits, so a member-existence test that reads only
            // the subclass is unsound by construction — the same blind spot a single-file grep has,
            // and one that would turn every base-class seam in this tree into a false unresolved edge.
            const files = {
                '/e.mjs'  : `import Svc from './svc.mjs';\nSvc.run();`,
                '/svc.mjs': `import Base from './base.mjs';
export default class Svc extends Base { run() { return this.shell() } }`,
                '/base.mjs' : `import {spawn} from 'child_process';
export default class Base { shell() { return spawn('git', []) } }`
            };

            const closure = walkCapabilityClosure({entrypoint: '/e.mjs', ...graphOf(files)});

            expect(closure.required, 'the inherited seam is reached').toHaveLength(1);
            expect(closure.required[0].module).toBe('/base.mjs');
            expect(closure.unresolved).toHaveLength(0);
        });

        test('a call in an object-literal VALUE belongs to the enclosing method, not to the key', () => {
            // The defect that hid a six-deep production chain. `{adrs: await this.fetch()}` sits under
            // a Property whose key is `adrs`, and attributing the call to a member called `adrs`
            // ended the walk on a data key — `aggregate-temporal-summary` came back host-free with
            // `runCycle -> … -> execCommand` fully static in front of it.
            const files = {
                '/e.mjs'  : `import Svc from './svc.mjs';\nSvc.run();`,
                '/svc.mjs': `import {spawn} from 'child_process';
export default {
    run()   { return {adrs: this.fetch()} },
    fetch() { return spawn('git', []) }
};`
            };

            const closure = walkCapabilityClosure({entrypoint: '/e.mjs', ...graphOf(files)});

            expect(closure.required, 'a key name is not a member boundary').toHaveLength(1);
        });

        test('code behind the import-safe guard does NOT run for an importer', () => {
            // 98 modules under `ai/` carry `if (process.argv[1] && … === __filename)`. Without this
            // test the walk concludes that importing a script runs its `main()`, which promoted
            // `lint-skill-manifest`'s git calls onto `backup.mjs`, convicting it against the
            // bundle-stamp decision — ADR-0014, ticket-ref-ok: it is the authority contradicted.
            const guarded = `import {spawn} from 'child_process';
export function main() { return spawn('git', []) }
if (process.argv[1] && process.argv[1] === 'x') { main() }`;

            const asImport = walkCapabilityClosure({
                entrypoint: '/e.mjs',
                ...graphOf({'/e.mjs': `import {main} from './s.mjs';\nconsole.log('no call');`, '/s.mjs': guarded})
            });

            expect(asImport.required, 'importing a script does not run it').toHaveLength(0);

            // The same module AS the entrypoint: the guard is true, so its `main()` does run.
            const asEntry = walkCapabilityClosure({entrypoint: '/s.mjs', ...graphOf({'/s.mjs': guarded})});

            expect(asEntry.required, 'running it as the script is the case the guard admits').toHaveLength(1);
        });

        test('a capability INSIDE the guard is dormant for an importer', () => {
            // Distinct from the arm above, and the red-proof battery is what found the gap: there the
            // guard holds back a CALL, here it holds back a capability site directly. A module-scope
            // `spawn` is `required` on sight — nothing defers it — so only the guard keeps it from
            // being attributed to everyone who imports the module.
            const guarded = `import {spawn} from 'child_process';
if (process.argv[1] && process.argv[1] === 'x') { spawn('git', []) }
export default {};`;

            const asImport = walkCapabilityClosure({
                entrypoint: '/e.mjs',
                ...graphOf({'/e.mjs': `import S from './s.mjs';\nconsole.log(S);`, '/s.mjs': guarded})
            });

            expect(asImport.required, 'importing does not take the guarded branch').toHaveLength(0);

            const asEntry = walkCapabilityClosure({entrypoint: '/s.mjs', ...graphOf({'/s.mjs': guarded})});

            expect(asEntry.required, 'being the script does').toHaveLength(1);
        });

        test('the hoisted spelling of the guard is recognised too', () => {
            // `const cliEntryPath = process.argv[1] ? … : null` above, `if (cliEntryPath === modulePath)`
            // below. Reading only the inline spelling is what let `buildScripts/docs/index/labels.mjs`
            // report its whole CLI as running on import.
            const files = {
                '/e.mjs': `import Svc from './s.mjs';\nconsole.log('no call');`,
                '/s.mjs': `import {spawn} from 'child_process';
const cliEntryPath = process.argv[1] ? process.argv[1] : null;
const modulePath   = 'x';
function main() { return spawn('git', []) }
if (cliEntryPath && cliEntryPath === modulePath) { main() }
export default {};`
            };

            const closure = walkCapabilityClosure({entrypoint: '/e.mjs', ...graphOf(files)});

            expect(closure.required, 'the guard is the same guard, hoisted').toHaveLength(0);
        });

        test('a re-export barrel is followed to where the value LIVES', () => {
            // `ai/services.mjs` is 225 lines of exactly this. Stopping at the barrel reported five
            // dispatch gaps on `backup.mjs` whose only cause was an indirection the code is explicit
            // about, and hid whatever sits on the far side of it.
            const files = {
                '/e.mjs'     : `import {Svc} from './barrel.mjs';\nSvc.run();`,
                '/barrel.mjs': `import _Svc from './svc.mjs';\nconst Svc = makeSafe(_Svc, {});\nexport {Svc};`,
                '/svc.mjs'   : `import {spawn} from 'child_process';
export default {run() { return spawn('git', []) }};`
            };

            const closure = walkCapabilityClosure({entrypoint: '/e.mjs', ...graphOf(files)});

            expect(closure.required, 'the barrel is an indirection, not a boundary').toHaveLength(1);
            expect(closure.required[0].module).toBe('/svc.mjs');
        });

        test('a function passed as an ARGUMENT is followed — higher-order dispatch is not safe', () => {
            // @neo-gpt's exact falsifier, and the worst class this file has held: every name is in
            // the source, and the callee-only walk returned `required: []` AND `unresolved: []` —
            // not a conservative stop but a SILENT safe verdict. `fn` is a parameter, parameters
            // were leaves, so the reference died at the call boundary.
            const files = {
                '/e.mjs': `import {run, danger} from './m.mjs';\nrun(danger);`,
                '/m.mjs': `import {spawn} from 'child_process';
export function run(fn) { return fn() }
export function danger() { return spawn('git', []) }`
            };

            const closure = walkCapabilityClosure({entrypoint: '/e.mjs', ...graphOf(files)});

            expect(closure.required, 'handing a function to something that runs is evidence it runs')
                .toHaveLength(1);
            expect(closure.required[0].member).toBe('danger');
        });

        test('two unfollowable edges in ONE module keep separate identities', () => {
            // The substitution the ledger exists to catch, scoped inside a file. Keyed on
            // `module::reason` alone, swapping one site for another passed a Set-backed ratchet
            // unchanged. Measured against the live tree the collision hid THREE edges: the real
            // population was 12 while the ledger recorded 9.
            const files = {'/e.mjs': `function a() { const x = 'p'; return import(x) }
function b() { const y = 'q'; return import(y) }
a(); b();`},
                  closure = walkCapabilityClosure({entrypoint: '/e.mjs', ...graphOf(files)});

            expect(closure.unresolved).toHaveLength(2);
            expect(new Set(closure.unresolved.map(edge => edge.member)).size, 'distinct owners').toBe(2);
        });

        test('the finding PROJECTION carries the discriminators, not just the closure edge', () => {
            // The defect my own fix hid behind, and the reason this arm exists separately from the
            // one above. `resolveEntrypointPlane` rebuilt each finding field by field and dropped
            // `member` and `callee`, so the identity function's discriminating branch could never
            // fire in production — while an in-memory test that fed it RAW closure edges passed.
            // Testing the producer's object instead of the consumer's proves nothing about the consumer.
            const files      = {'/e.mjs': `function a() { const x = 'p'; return import(x) }\na();`},
                  closure    = walkCapabilityClosure({entrypoint: '/e.mjs', ...graphOf(files)}),
                  {findings} = resolveEntrypointPlane({closure, entrypoint: '/e.mjs'});

            expect(findings[0].member, 'the projection must not drop what identity depends on').toBe('a');
        });

        test('the chain that proved a requirement is reconstructable', () => {
            // A conflict finding that names only a file and a line leaves the reader to find the
            // calls that get there. This is what turns the finding into a repair instruction.
            const files = {
                '/e.mjs'   : `import Svc from './svc.mjs';\nSvc.run();`,
                '/svc.mjs' : `import Deep from './deep.mjs';\nexport default {run() { return Deep.go(); }};`,
                '/deep.mjs': `import {spawn} from 'child_process';\nexport default {go() { return spawn('git', []); }};`
            };

            const closure = walkCapabilityClosure({entrypoint: '/e.mjs', ...graphOf(files)}),
                  site    = closure.required[0];

            expect(invocationChain(closure.invokedBy, `${site.module}::${site.member}`))
                .toEqual(['/e.mjs::<module-scope>', '/svc.mjs::run', '/deep.mjs::go']);
        });

        test('a called service whose shell degrades gracefully is still NOT required', () => {
            // The promotion must not override graceful degradation — that would re-convict the
            // bundle-stamp case through the call path instead of the reach path.
            const files = {
                '/e.mjs'  : `import Svc from './svc.mjs';\nSvc.run();`,
                '/svc.mjs': `import {spawn} from 'child_process';
export default {run() { try { return spawn('git', []); } catch (e) { return null; } }};`
            };

            const closure = walkCapabilityClosure({entrypoint: '/e.mjs', ...graphOf(files)});

            expect(closure.required).toHaveLength(0);
        });
    });

    test.describe('resolveEntrypointPlane — authority is consumed, never re-derived', () => {
        const hostClosure    = {required: [{module: '/e.mjs', line: 3}], used: [], unresolved: [], reached: []},
              cleanClosure   = {required: [], used: [], unresolved: [], reached: []},
              unknownClosure = {required: [], used: [], unresolved: [{module: '/e.mjs', reason: 'dynamic-import'}], reached: []};

        test('AC-2 — authority `container-plane` against a host closure is a hard failure', () => {
            const result = resolveEntrypointPlane({
                closure: hostClosure, authorityClass: 'container-plane', taskName: 'someTask'
            });

            expect(result.plane).toBe('container-plane');
            expect(result.basis).toBe('authority');
            expect(result.findings.map(f => f.kind)).toContain(FINDING.authorityConflictInPlane);
            // The evidence must name WHERE, or the finding cannot be acted on.
            expect(result.findings.find(f => f.kind === FINDING.authorityConflictInPlane).evidence).toEqual(['/e.mjs:3']);
        });

        test('AC-2 — authority `host-edge` against a clean closure is also reported', () => {
            const result = resolveEntrypointPlane({closure: cleanClosure, authorityClass: 'host-edge'});

            expect(result.findings.map(f => f.kind)).toContain(FINDING.authorityConflictHost);
        });

        test('AC-3 — githubWorkflowSync shape: authority host-edge AND a host closure AGREE', () => {
            // The false negative the retired per-file classifier produced. Agreement must be silent:
            // a rule that fires on the correct case has no teeth left for the wrong one.
            const result = resolveEntrypointPlane({
                closure: hostClosure, authorityClass: 'host-edge', taskName: 'githubWorkflowSync'
            });

            expect(result.plane).toBe('host-edge');
            expect(result.findings).toHaveLength(0);
        });

        test('AC-6 non-vacuity — a genuine in-plane entrypoint resolves clean and silent', () => {
            const result = resolveEntrypointPlane({closure: cleanClosure});

            expect(result.plane).toBe('container-plane');
            expect(result.basis).toBe('closure');
            expect(result.findings).toHaveLength(0);
        });

        test('AC-6 non-vacuity — a genuine host entrypoint resolves host and silent', () => {
            const result = resolveEntrypointPlane({closure: hostClosure});

            expect(result.plane).toBe('host-edge');
            expect(result.findings).toHaveLength(0);
        });

        test('AC-5 — an unresolved edge NEVER falls back to a plane', () => {
            const result = resolveEntrypointPlane({closure: unknownClosure, entrypoint: '/e.mjs'});

            expect(result.plane).toBeNull();
            expect(result.basis).toBe('unresolved');
            expect(result.findings.map(f => f.kind)).toContain(FINDING.unresolvedEdge);
        });

        test('an unresolved edge does NOT weaken a host verdict', () => {
            // Asymmetric on purpose: more reachable code cannot REMOVE a requirement already found,
            // so a host verdict survives an incomplete graph while a clean verdict does not.
            const closure = {...hostClosure, unresolved: [{module: '/e.mjs', reason: 'dynamic-import'}]};
            const result  = resolveEntrypointPlane({closure});

            expect(result.plane).toBe('host-edge');
        });

        test('an unresolved edge under an authority still reports, and the authority still stands', () => {
            const result = resolveEntrypointPlane({closure: unknownClosure, authorityClass: 'container-plane'});

            expect(result.plane).toBe('container-plane');
            expect(result.findings.map(f => f.kind)).toContain(FINDING.unresolvedEdge);
            // Must NOT claim a host conflict: the closure found no requirement, only an unknown.
            expect(result.findings.map(f => f.kind)).not.toContain(FINDING.authorityConflictInPlane);
        });
    });
});

test.describe('authority join — keyed on the script PATH, never on a name', () => {
    /*
     * The join this replaced transformed the npm entry into a task name:
     * `ai:sync-github-workflow` -> `syncGithubWorkflow`, against an authority key of
     * `githubWorkflowSync`. Same words, opposite order. It matched 1 of 62 entrypoints, and the
     * `githubWorkflowSync` fixture — the case the whole authority rule exists to catch — was not
     * among the matches. The cross-check was very nearly inert and its red-proof had been run with
     * the authority hand-fed, so nothing failed.
     *
     * A task definition already carries the joinable fact: its `args` hold the resolved module path.
     * Two names for one lane can disagree; a path is what the process actually runs.
     */
    const definitions = {
        githubWorkflowSync: {command: 'node', args: ['/repo/ai/scripts/maintenance/syncGithubWorkflow.mjs']},
        backup            : {command: 'node', args: ['/repo/ai/scripts/maintenance/backup.mjs']},
        chromaServer      : {command: 'chroma', args: ['run', '--path', '/data']},
        unmapped          : {command: 'node', args: ['/repo/ai/scripts/maintenance/nomap.mjs']}
    };
    const authorityByName = {
        githubWorkflowSync: 'host-edge',
        backup            : 'container-plane',
        chromaServer      : 'shared-primitive'
    };

    test('joins on the module path a task actually executes', () => {
        const map = buildAuthorityByScript({definitions, authorityByName, projectRoot: '/repo'});

        expect(map['ai/scripts/maintenance/syncGithubWorkflow.mjs']).toEqual({
            taskName: 'githubWorkflowSync', authorityClass: 'host-edge'
        });
    });

    test('the fixture the NAME-based join could never reach is joined', () => {
        // The regression arm. `ai:sync-github-workflow` camelises to `syncGithubWorkflow`, which is
        // not the authority key — so any name transformation misses this and reports no authority,
        // which reads identically to "this entrypoint has no declared plane".
        const map   = buildAuthorityByScript({definitions, authorityByName, projectRoot: '/repo'}),
              camel = 'ai:sync-github-workflow'.replace(/^ai:/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());

        expect(camel, 'the name transformation genuinely produces the wrong key').toBe('syncGithubWorkflow');
        expect(camel in authorityByName, 'and that key is absent from the authority map').toBe(false);
        expect(map['ai/scripts/maintenance/syncGithubWorkflow.mjs'].authorityClass).toBe('host-edge');
    });

    test('a task with no .mjs arg is skipped rather than guessed at', () => {
        const map = buildAuthorityByScript({definitions, authorityByName, projectRoot: '/repo'});

        expect(Object.values(map).some(entry => entry.taskName === 'chromaServer')).toBe(false);
    });

    test('a task absent from the authority map contributes nothing', () => {
        // Presence in taskDefinitions is not an authority claim; only the authority map is.
        const map = buildAuthorityByScript({definitions, authorityByName, projectRoot: '/repo'});

        expect(map['ai/scripts/maintenance/nomap.mjs']).toBeUndefined();
    });
});

test.describe('the census is the union of every invocation surface', () => {
    /*
     * An npm-only census misses scripts a workflow runs directly, and the omission was
     * self-demonstrating: this lint is invoked from its own workflow and did not score itself.
     * It also counted invocation NAMES rather than modules, so five duplicate npm aliases inflated
     * the population by five.
     */
    const workflowDir = path.join(os.tmpdir(), `plane-wf-${process.pid}`);

    test.beforeAll(() => {
        fs.mkdirSync(workflowDir, {recursive: true});
        fs.writeFileSync(path.join(workflowDir, 'a.yml'), [
            'jobs:',
            '  lint:',
            '    steps:',
            '      - run: node ./ai/scripts/lint/direct-one.mjs',
            '      - run: |',
            '          if node ./ai/scripts/lint/direct-two.mjs; then echo ok; fi'
        ].join('\n'));
        // A path in a COMMENT and in a non-run key must not be mistaken for an invocation.
        fs.writeFileSync(path.join(workflowDir, 'b.yml'), [
            '# node ./ai/scripts/lint/commented-out.mjs',
            'jobs:',
            '  x:',
            '    steps:',
            '      - name: node ./ai/scripts/lint/in-a-name.mjs',
            '        run: echo nothing'
        ].join('\n'));
        fs.writeFileSync(path.join(workflowDir, 'c.yml'), 'this: [is: not: valid: yaml');
    });

    test.afterAll(() => fs.rmSync(workflowDir, {recursive: true, force: true}));

    test('finds single-line AND multi-line `run:` invocations', () => {
        const found = readWorkflowEntrypoints({workflowDir});

        // The multi-line case is the one a naive file grep misses.
        expect(found).toContain('ai/scripts/lint/direct-one.mjs');
        expect(found).toContain('ai/scripts/lint/direct-two.mjs');
    });

    test('a path in a comment or a non-run key is NOT an invocation', () => {
        // Reading through the YAML parser rather than grepping the file is what buys this.
        const found = readWorkflowEntrypoints({workflowDir});

        expect(found).not.toContain('ai/scripts/lint/commented-out.mjs');
        expect(found).not.toContain('ai/scripts/lint/in-a-name.mjs');
    });

    test('an unparseable workflow is skipped, not fatal', () => {
        // Workflow syntax has its own gates; this lint must not become a second one.
        expect(() => readWorkflowEntrypoints({workflowDir})).not.toThrow();
    });

    test('a missing workflow directory yields nothing rather than throwing', () => {
        expect(readWorkflowEntrypoints({workflowDir: path.join(os.tmpdir(), 'definitely-absent-xyz')})).toEqual([]);
    });

    test('the census counts MODULES, not invocation names', () => {
        // The first version of this arm asserted `filter(...).toHaveLength(1)` on a two-alias input —
        // which the backing Map guarantees whatever the code decides, so removing the dedupe left it
        // green. A vacuous arm is worse than none: it reports coverage of a property it cannot see.
        //
        // The falsifiable form compares the two populations directly: FOUR npm entries naming THREE
        // modules must yield three entries, so a name-counting census fails on the count itself.
        const scripts = {
            'ai:one'  : 'node ./ai/scripts/lint/dupe.mjs',
            'ai:two'  : 'node ./ai/scripts/lint/dupe.mjs',
            'ai:three': 'node ./ai/scripts/lint/dupe.mjs',
            'ai:other': 'node ./ai/scripts/lint/other.mjs'
        };
        const entries = readEntrypoints(scripts, {}).filter(entry => entry.via === 'npm');

        expect(Object.keys(scripts), 'four invocation names').toHaveLength(4);
        expect(entries, 'naming two distinct modules').toHaveLength(2);
        expect(entries.map(entry => entry.rel).sort())
            .toEqual(['ai/scripts/lint/dupe.mjs', 'ai/scripts/lint/other.mjs']);
    });

    test('the census includes orchestrator task roots no npm script and no workflow names', () => {
        // The channel that was missing, pinned on the two roots the reviewer named. Both carry a
        // declared authority class, so their absence meant the lint never checked the artifacts whose
        // declarations are strongest — quiet exactly where it is most needed.
        const authorityByScript = {
            'ai/scripts/lifecycle/backfill-memory-summaries.mjs' : {
                taskName: 'memory-summary-backfill', authorityClass: 'container-plane'
            },
            'ai/scripts/maintenance/aggregate-temporal-summary.mjs': {
                taskName: 'temporal-summary', authorityClass: 'container-plane'
            },
            // Already reachable through npm: it must appear ONCE, credited to the channel that found
            // it first, or the population double-counts the roots with the most invocation surface.
            'ai/scripts/lint/dupe.mjs': {taskName: 'dupe', authorityClass: 'host-edge'}
        };

        const entries = readEntrypoints({'ai:one': 'node ./ai/scripts/lint/dupe.mjs'}, authorityByScript),
              byRel   = entries.map(entry => entry.rel);

        expect(byRel).toContain('ai/scripts/lifecycle/backfill-memory-summaries.mjs');
        expect(byRel).toContain('ai/scripts/maintenance/aggregate-temporal-summary.mjs');
        expect(entries.filter(entry => entry.rel === 'ai/scripts/lint/dupe.mjs'), 'no double count')
            .toHaveLength(1);
        expect(entries.find(entry => entry.rel === 'ai/scripts/lint/dupe.mjs').via).toBe('npm');
    });

    test('a CONFIG-GATED production root enters the census', () => {
        // `buildTaskDefinitions({})` is the descriptor default, and two roots exist only when a port
        // is configured. Censusing the default asked "what runs in an unconfigured process" when the
        // question is "which modules can be spawned as a root at all" — so `neuralLinkBridge`, a
        // declared HOST-EDGE root, was never checked by the gate that exists to check declarations.
        const bare     = buildTaskDefinitions({}),
              censused = buildTaskDefinitions(CENSUS_TASK_CONFIG);

        expect(Object.keys(bare)).not.toContain('neuralLinkBridge');
        expect(Object.keys(censused), 'the census config must surface it').toContain('neuralLinkBridge');
        expect(Object.keys(buildAuthorityByScript())).toContain('ai/mcp/server/neural-link/run-bridge.mjs');
    });

    test('the executed module is `node`\'s first ARGUMENT, never the first `.mjs`', () => {
        // `devServer` runs `node …/webpack.js serve -c ./buildScripts/…/webpack.server.config.mjs`.
        // The extension heuristic skipped the `.js` binary and joined the `-c` VALUE, then reported
        // a webpack CONFIG's execution plane — and produced a conflict finding about it. A config
        // file has no plane, and a third-party binary's plane is not ours to derive.
        const byScript = buildAuthorityByScript();

        expect(Object.keys(byScript)).not.toContain('buildScripts/webpack/webpack.server.config.mjs');
        expect(Object.keys(byScript).some(rel => rel.includes('node_modules/')), 'no vendor roots')
            .toBe(false);
    });

    test('the REAL task-definition join reaches both roots the reviewer named', () => {
        // Against the live tree rather than a fixture, because the fixture above cannot fail the way
        // the census did: it proves the union works, not that the join finds anything.
        const rels = readEntrypoints().map(entry => entry.rel);

        expect(rels).toContain('ai/scripts/lifecycle/backfill-memory-summaries.mjs');
        expect(rels).toContain('ai/scripts/maintenance/aggregate-temporal-summary.mjs');
        // Positive control: a root the npm channel already supplies must still be present exactly
        // once, so a passing assertion above cannot be read as "the union returned everything".
        expect(rels.filter(rel => rel === 'ai/scripts/maintenance/backup.mjs')).toHaveLength(1);
    });
});

test.describe('the unresolved ratchet holds IDENTITIES, not a count', () => {
    const entrypoints = [{name: 'ai:probe', rel: 'ai/scripts/maintenance/backup.mjs', via: 'npm'}];

    test('an edge already in the ledger passes', () => {
        const result = runLint({entrypoints, authorityByScript: {}, ledger: KNOWN_BACKUP_EDGES});

        expect(result.exitCode).toBe(0);
        expect(result.appeared).toEqual([]);
    });

    test('a SUBSTITUTED edge fails even though the count is unchanged', () => {
        // The property a scalar baseline cannot hold, and the reason this is a ledger. Swap one known
        // identity for a fictional one: the total is identical, the closure is no sounder, and a
        // count-based gate stays green through it.
        const substituted = [...KNOWN_BACKUP_EDGES.slice(1), 'ai/invented/Module.mjs::dynamic-import'],
              result      = runLint({entrypoints, authorityByScript: {}, ledger: substituted});

        expect(substituted, 'the same number of entries').toHaveLength(KNOWN_BACKUP_EDGES.length);
        expect(result.exitCode, 'and it must still fail').toBe(1);
        expect(result.appeared, 'naming the edge that appeared').toEqual([KNOWN_BACKUP_EDGES[0]]);
        expect(result.resolved, 'and the one that vanished').toEqual(['ai/invented/Module.mjs::dynamic-import']);
    });

    test('a ledger entry that no longer reproduces is reported, not silently kept', () => {
        // The other direction. A ledger that only grows is a record; one that reports its own dead
        // entries is a ratchet, because the next author is told exactly what to delete.
        const result = runLint({
            entrypoints,
            authorityByScript: {},
            ledger           : [...KNOWN_BACKUP_EDGES, 'ai/gone/Module.mjs::unparseable']
        });

        expect(result.exitCode, 'a stale entry is not a failure on its own').toBe(0);
        expect(result.resolved).toEqual(['ai/gone/Module.mjs::unparseable']);
    });

    test('an unlisted authority conflict fails; a ticketed one is held and still printed', () => {
        // `syncGithubWorkflow` genuinely requires a shell, so declaring it container-plane is the
        // severe direction: the script breaks on the plane it is declared for. Chosen over the
        // reverse because `authority-conflict-host` is suppressed while an unresolved edge stands,
        // which would make this arm pass for a reason that has nothing to do with the ledger.
        const roots       = [{name: 'x', rel: 'ai/scripts/maintenance/syncGithubWorkflow.mjs', via: 'npm'}],
              conflicting = {
                  'ai/scripts/maintenance/syncGithubWorkflow.mjs': {
                      taskName: 'githubWorkflowSync', authorityClass: 'container-plane'
                  }
              },
              identity    = 'ai/scripts/maintenance/syncGithubWorkflow.mjs::githubWorkflowSync::'
                  + 'authority-conflict-in-plane';

        const unlisted = runLint({entrypoints: roots, authorityByScript: conflicting, ledger: KNOWN_BACKUP_EDGES});

        expect(unlisted.exitCode).toBe(1);
        expect(unlisted.conflicts).toHaveLength(1);

        const held = runLint({
            entrypoints      : roots,
            authorityByScript: conflicting,
            ledger           : KNOWN_BACKUP_EDGES,
            knownConflicts   : [identity]
        });

        expect(held.exitCode, 'a ticketed conflict is held').toBe(0);
        expect(held.conflicts, 'and it is still surfaced, never hidden').toHaveLength(1);
    });
});
