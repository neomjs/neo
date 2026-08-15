import {test, expect} from '@playwright/test';

import {
    FINDING,
    HOST_CAPABILITY,
    collectModuleFacts,
    handlerAborts,
    isGracefullyDegraded,
    normalizeSpecifier,
    parseModule,
    resolveEntrypointPlane,
    walkCapabilityClosure,
    walkWithAncestors
}                     from '../../../../../../ai/scripts/lint/scriptPlaneClosure.mjs';

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
            const files   = {'/e.mjs': 'this is (not js'};
            const closure = walkCapabilityClosure({entrypoint: '/e.mjs', ...graphOf(files)});

            expect(closure.unresolved[0].reason).toBe('unparseable');
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
