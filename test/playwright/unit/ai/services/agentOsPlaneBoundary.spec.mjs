import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';

import {
    PROOF_CLASS,
    assertNoAncestorNodeModules,
    buildReceipt,
    injectDriverStub,
    materializeBoundaryFixture,
    runComputedEdgeReconciliation,
    runResolutionProof,
    runRuntimeDenialProof,
    runStaticClosureProof
} from '../../../../../ai/scripts/diagnostics/agentOsPlaneBoundaryProof.mjs';
import {SURFACE, rowKey} from '../../../../../ai/scripts/diagnostics/agentOsExtractionInventory.mjs';

/**
 * @summary Red-proofs every detector arm of the C′ plane-boundary proof's resolution layer.
 *
 * The proof's contract is red-capability: instrument integrity and paired controls must be able to
 * fail FOR THEIR STATED REASON, and topology findings must be exact and successor-owned. Each arm
 * below builds an offline stub layout that makes one detector fire (or provably stay quiet), so no
 * arm depends on a registry, the network, or the repository's own pre-severance topology — the
 * hosted-CI independence the ticket's AC names.
 *
 * The stub layouts use `injectDriverStub` — materialized `node_modules` directories, not npm — so
 * the resolver semantics under test are Node's real ones over real directories.
 */

const
    FAKE_DRIVER = 'neo-proof-fake-driver',
    // spec -> services -> ai -> unit -> playwright -> test -> repo root
    REPO_ROOT   = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../..');

/** @returns {String} A fresh scratch dir for one arm. */
function scratchDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'neo-plane-boundary-spec-'))
}

/**
 * Materializes the standard two-root fixture for an arm, with the fake driver declared on the
 * cloud side — declaration alone; each arm decides what is actually installed where.
 * @param {String} baseDir
 * @returns {{fixtureRoot: String, edgeRoot: String, cloudRoot: String}}
 */
function armFixture(baseDir) {
    return materializeBoundaryFixture({
        baseDir,
        edgeDependencies : {'neo-proof-edge-dep': '0.0.0'},
        cloudDependencies: {[FAKE_DRIVER]: '0.0.0'}
    })
}

test.describe('C′ plane-boundary proof — every arm fires, and for its stated reason (#17533)', () => {
    test('an empty manifest population is refused by name, before any write', () => {
        const baseDir = scratchDir();

        try {
            let thrown = null;

            try {
                materializeBoundaryFixture({baseDir, edgeDependencies: {}, cloudDependencies: {[FAKE_DRIVER]: '0.0.0'}})
            } catch (error) {
                thrown = error
            }

            expect(thrown, 'an empty Edge population must refuse — a fixture declaring nothing can deny nothing').not.toBeNull();
            expect(thrown.proofClass).toBe(PROOF_CLASS.emptyPopulation);
            expect(thrown.plane).toBe('edge');
            expect(fs.readdirSync(baseDir), 'the refusal must precede materialization').toEqual([])
        } finally {
            fs.removeSync(baseDir)
        }
    });

    test('the ancestor guard names the exact offending node_modules, and passes a clean lineage', () => {
        const baseDir = scratchDir();

        try {
            const
                dirty    = path.join(baseDir, 'poisoned', 'fixture'),
                offender = path.join(baseDir, 'poisoned', 'node_modules');

            fs.mkdirpSync(dirty);
            fs.mkdirpSync(offender);

            const verdict = assertNoAncestorNodeModules(dirty);

            expect(verdict.ok).toBe(false);
            expect(verdict.offender, 'the guard must name the exact ancestor, not merely fail').toBe(offender);

            // The clean arm is environment-honest: if the host running this suite genuinely has a
            // node_modules above os.tmpdir(), that host cannot carry the proof and this arm SHOULD
            // fail loudly — the same verdict the CLI would give there.
            fs.removeSync(offender);
            expect(assertNoAncestorNodeModules(dirty).ok).toBe(true)
        } finally {
            fs.removeSync(baseDir)
        }
    });

    test('GREEN path: Edge cannot resolve the Cloud driver, the nested Cloud control resolves it from its own root', () => {
        const baseDir = scratchDir();

        try {
            const {edgeRoot, cloudRoot} = armFixture(baseDir);

            injectDriverStub({packageRoot: cloudRoot, name: FAKE_DRIVER});

            const {instrumentErrors, topologyFindings} = runResolutionProof({
                edgeRoot, cloudRoot, cloudOnlyPackages: [FAKE_DRIVER]
            });

            expect(instrumentErrors).toEqual([]);
            expect(topologyFindings).toEqual([]);
            expect(buildReceipt({instrumentErrors, topologyFindings}).exitCode).toBe(0)
        } finally {
            fs.removeSync(baseDir)
        }
    });

    test('MUTATION RED: adding one Cloud driver to the Edge root turns the proof red with the exact identity', () => {
        const baseDir = scratchDir();

        try {
            const {edgeRoot, cloudRoot} = armFixture(baseDir);

            injectDriverStub({packageRoot: cloudRoot, name: FAKE_DRIVER});
            injectDriverStub({packageRoot: edgeRoot,  name: FAKE_DRIVER});

            const
                {instrumentErrors, topologyFindings} = runResolutionProof({
                    edgeRoot, cloudRoot, cloudOnlyPackages: [FAKE_DRIVER]
                }),
                receipt = buildReceipt({instrumentErrors, topologyFindings});

            expect(instrumentErrors, 'the Cloud control still resolves from its own root — no instrument error').toEqual([]);
            expect(topologyFindings).toHaveLength(1);
            expect(topologyFindings[0].class).toBe(PROOF_CLASS.edgeResolvesCloudPackage);
            expect(topologyFindings[0].identity).toBe(FAKE_DRIVER);
            expect(topologyFindings[0].preRelocationBlocker).toBe(true);
            expect(topologyFindings[0].successorOwner, 'an unowned finding is invalid by contract').toBeTruthy();
            expect(receipt.exitCode).toBe(1)
        } finally {
            fs.removeSync(baseDir)
        }
    });

    test('DEAD-CONTROL RED: a Cloud root that cannot resolve its own declared driver is an INSTRUMENT error, never a topology finding', () => {
        const baseDir = scratchDir();

        try {
            const {edgeRoot, cloudRoot} = armFixture(baseDir);

            // Nothing installed anywhere: Edge "cannot resolve" would look green, but the control
            // that licenses that reading is dead — the layers must separate exactly here.
            const {instrumentErrors, topologyFindings} = runResolutionProof({
                edgeRoot, cloudRoot, cloudOnlyPackages: [FAKE_DRIVER]
            });

            expect(topologyFindings).toEqual([]);
            expect(instrumentErrors).toHaveLength(1);
            expect(instrumentErrors[0].class).toBe(PROOF_CLASS.cloudControlUnresolved);
            expect(instrumentErrors[0].identity).toBe(FAKE_DRIVER);
            expect(buildReceipt({instrumentErrors, topologyFindings}).exitCode).toBe(1)
        } finally {
            fs.removeSync(baseDir)
        }
    });

    test('ANCESTOR-FALLBACK RED: a Cloud control satisfied from the Edge root above it is flagged as resolved-via-ancestor', () => {
        const baseDir = scratchDir();

        try {
            const {edgeRoot, cloudRoot} = armFixture(baseDir);

            // Installed in Edge ONLY. Node's upward walk lets cloud/ resolve it from the Edge root —
            // a bare resolved/unresolved verdict reads green while the control proves nothing about
            // cloud/'s own install. The resolved PATH is what convicts it.
            injectDriverStub({packageRoot: edgeRoot, name: FAKE_DRIVER});

            const {instrumentErrors, topologyFindings} = runResolutionProof({
                edgeRoot, cloudRoot, cloudOnlyPackages: [FAKE_DRIVER]
            });

            const wrongRoot = instrumentErrors.filter(error => error.class === PROOF_CLASS.cloudControlWrongRoot);

            expect(wrongRoot).toHaveLength(1);
            expect(wrongRoot[0].identity).toBe(FAKE_DRIVER);

            // Both layers fire here, each for its own reason: the ancestor install ALSO means the
            // Edge root resolves a Cloud-only package.
            expect(topologyFindings).toHaveLength(1);
            expect(topologyFindings[0].class).toBe(PROOF_CLASS.edgeResolvesCloudPackage)
        } finally {
            fs.removeSync(baseDir)
        }
    });

    test('the receipt is deterministic: shuffled inputs produce byte-identical JSON', () => {
        const
            errors = [
                {class: PROOF_CLASS.probeFailure,           identity: 'b', detail: '2'},
                {class: PROOF_CLASS.cloudControlUnresolved, identity: 'a', detail: '1'}
            ],
            findings = [
                {class: PROOF_CLASS.edgeResolvesCloudPackage, identity: 'z', detail: '3'},
                {class: PROOF_CLASS.edgeResolvesCloudPackage, identity: 'a', detail: '4'}
            ],

            first  = buildReceipt({instrumentErrors: errors,             topologyFindings: findings}),
            second = buildReceipt({instrumentErrors: [...errors].reverse(), topologyFindings: [...findings].reverse()});

        expect(JSON.stringify(first)).toBe(JSON.stringify(second));
        expect(first.exitCode).toBe(1)
    })
});

/**
 * @summary Red-proofs every arm of the static-closure layer over in-memory module graphs.
 *
 * No fixture, no `npm install`, no repository: `walkCapabilityClosure`'s injected `readFile`/
 * `resolve` make the whole layer testable from a plain object, which is why this layer runs against
 * the real head in production and against these graphs here.
 *
 * The first arm is the one that matters most. An instrument that only ever fires red is as useless
 * as one that never does, so a clean graph MUST come back empty — otherwise every red below proves
 * only that the detector is stuck on.
 */
test.describe('C′ plane-boundary proof — static-closure layer arms (#17533)', () => {
    const
        PLANE_ROOT = '/plane',

        /** Resolves `./x` inside the plane and `../x` above it; everything else is unresolvable. */
        resolveInPlane = specifier => specifier.startsWith('./')
            ? `${PLANE_ROOT}/${specifier.slice(2)}`
            : (specifier.startsWith('../') ? `/${specifier.slice(3)}` : null),

        /** @returns {Function} A `readFile` over a literal `{absPath: source}` map. */
        graph = files => absPath => files[absPath] ?? null,

        /** @returns {String[]} Sorted `class` values across both layers, for exact-set asserts. */
        classesOf = result => [
            ...result.instrumentErrors.map(entry => entry.class),
            ...result.topologyFindings.map(finding => finding.class)
        ].sort(),

        /** @returns {Map<String,String>} Surface-qualified module-custody authority. */
        moduleDispositions = entries => new Map(entries.map(([identity, disposition]) => [
            rowKey(SURFACE.scriptModule, identity),
            disposition
        ])),

        run = overrides => runStaticClosureProof({
            entrypoints                 : [`${PLANE_ROOT}/e.mjs`],
            planeRoot                   : PLANE_ROOT,
            cloudOnlyPackages           : [],
            dispositionBySurfaceIdentity: moduleDispositions([['e.mjs', 'edge']]),
            resolve                     : resolveInPlane,
            ...overrides
        });

    test('POSITIVE CONTROL: a wholly Edge-dispositioned graph returns both layers empty', () => {
        const result = run({
            dispositionBySurfaceIdentity: moduleDispositions([['e.mjs', 'edge'], ['svc.mjs', 'edge']]),
            cloudOnlyPackages           : ['chromadb'],
            readFile                    : graph({
                '/plane/e.mjs'  : "import {a} from './svc.mjs'; a();",
                '/plane/svc.mjs': 'export function a() {}'
            })
        });

        expect(result.instrumentErrors).toEqual([]);
        expect(result.topologyFindings).toEqual([])
    });

    test('a reached module the registry dispositions as cloud is a topology finding, by exact identity', () => {
        const result = run({
            dispositionBySurfaceIdentity: moduleDispositions([['e.mjs', 'edge'], ['svc.mjs', 'cloud']]),
            readFile                    : graph({
                '/plane/e.mjs'  : "import {a} from './svc.mjs'; a();",
                '/plane/svc.mjs': 'export function a() {}'
            })
        });

        expect(classesOf(result)).toEqual([PROOF_CLASS.closureReachesCloudModule]);
        expect(result.topologyFindings[0].identity).toBe('svc.mjs');
        expect(result.topologyFindings[0].preRelocationBlocker).toBe(true)
    });

    test('#17707 a same-path non-module surface cannot classify module custody', () => {
        const inventoryRows = [{
                  surface    : 'script-module',
                  identity   : 'ai/e.mjs',
                  disposition: 'edge'
              }, {
                  surface    : 'plane-opener',
                  identity   : 'ai/svc.mjs',
                  disposition: 'cloud'
              }],
              result = run({
                  planeRoot  : '/root',
                  entrypoints: ['/root/ai/e.mjs'],
                  // Mirrors the production bug: dropping `surface` lets the plane-opener row
                  // impersonate module custody solely because the strings collide.
                  dispositionBySurfaceIdentity: new Map(inventoryRows.map(row => [
                      rowKey(row.surface, row.identity),
                      row.disposition
                  ])),
                  readFile                   : graph({
                      '/root/ai/e.mjs'  : "import {a} from './svc.mjs'; a();",
                      '/root/ai/svc.mjs': 'export function a() {}'
                  }),
                  resolve: specifier => specifier.startsWith('./') ? `/root/ai/${specifier.slice(2)}` : null
        });

        expect(result.instrumentErrors).toEqual([]);
        expect(classesOf(result)).toEqual([PROOF_CLASS.closureReachedWithoutCustody]);
        expect(result.topologyFindings[0]).toMatchObject({
            identity            : '1 module(s)',
            identities          : ['ai/svc.mjs'],
            preRelocationBlocker: false
        })
    });

    test('a Cloud-only PACKAGE import fires even though the closure never follows bare specifiers, and a deep import normalizes to its package', () => {
        const result = run({
            cloudOnlyPackages: ['chromadb'],
            readFile         : graph({'/plane/e.mjs': "import client from 'chromadb/lib/deep'; client();"})
        });

        expect(classesOf(result)).toEqual([PROOF_CLASS.closureImportsCloudPackage]);
        // The identity carries the NORMALIZED package, not the deep specifier — a finding keyed on
        // `chromadb/lib/deep` could not be reconciled against a manifest that declares `chromadb`.
        expect(result.topologyFindings[0].identity).toBe('e.mjs → chromadb')
    });

    test('a relative import escaping the plane root is a topology finding, not an unregistered module', () => {
        const result = run({
            readFile: graph({
                '/plane/e.mjs'  : "import {a} from '../outside/x.mjs'; a();",
                '/outside/x.mjs': 'export function a() {}'
            })
        });

        expect(classesOf(result)).toEqual([PROOF_CLASS.closureEscapesPlaneRoot])
    });

    test('#17707 reached dependencies without a script-module row stay visible but non-blocking', () => {
        const result = run({
            planeRoot                   : '/root',
            entrypoints                 : ['/root/ai/e.mjs'],
            dispositionBySurfaceIdentity: moduleDispositions([['ai/e.mjs', 'edge']]),
            readFile                    : graph({
                '/root/ai/e.mjs'     : "import {a} from './ghost.mjs'; import {b} from './wraith.mjs'; a(); b();",
                '/root/ai/ghost.mjs' : 'export function a() {}',
                '/root/ai/wraith.mjs': 'export function b() {}'
            }),
            resolve: specifier => specifier.startsWith('./') ? `/root/ai/${specifier.slice(2)}` : null
        });

        // Proof 1 owns exact surface membership, but its declared-row population cannot observe this
        // reach-derived null. The modules stay visible without becoming missing-inventory blockers.
        expect(result.instrumentErrors).toEqual([]);
        expect(classesOf(result)).toEqual([PROOF_CLASS.closureReachedWithoutCustody]);
        expect(result.topologyFindings[0]).toMatchObject({
            identity            : '2 module(s)',
            identities          : ['ai/ghost.mjs', 'ai/wraith.mjs'],
            preRelocationBlocker: false
        })
    });

    test('a module OUTSIDE the registry region gets its own class and owner — the authority never claimed that region', () => {
        const result = run({
            planeRoot                   : '/root',
            entrypoints                 : ['/root/ai/e.mjs'],
            dispositionBySurfaceIdentity: moduleDispositions([['ai/e.mjs', 'edge']]),
            readFile                    : graph({
                '/root/ai/e.mjs'   : "import {a} from '../src/Neo.mjs'; a();",
                '/root/src/Neo.mjs': 'export function a() {}'
            }),
            // Real path resolution, not string surgery. The previous form chained
            // `.replace('../', '')`, which rewrites only the FIRST occurrence — so `../../x`
            // resolved to `../x` and the fixture would have mis-decided which side of the region
            // boundary a module sat on, which is the exact judgement this arm exists to test.
            resolve: (specifier, from) => specifier.startsWith('.')
                ? path.resolve(path.dirname(from), specifier)
                : null
        });

        // `src/**` is Engine source; scoring it as an inventory population gap would point the
        // registry owner at a repair that is not theirs.
        expect(classesOf(result)).toEqual([PROOF_CLASS.closureOutOfRegistryRegion]);
        expect(result.topologyFindings[0].successorOwner).toContain('#17631')
    });

    test('an unresolved SPECIFIER is an instrument error: the hole could be hiding the Cloud reach', () => {
        const result = run({
            readFile: graph({'/plane/e.mjs': "import {a} from './missing.mjs'; a();"}),
            resolve : () => null
        });

        expect(classesOf(result)).toEqual([PROOF_CLASS.closureUnresolvedEdge]);
        expect(result.topologyFindings).toEqual([])
    });

    test('a resolved-but-UNREADABLE module is the instrument error ONLY — never also an unregistered-population finding', () => {
        const result = run({
            readFile: graph({'/plane/e.mjs': "import {a} from './missing.mjs'; a();"})
        });

        // The unreadable module lands in `reached` too. Scoring it as topology would report one
        // defect twice and point a custody owner at a repair that would not fix the instrument.
        expect(classesOf(result)).toEqual([PROOF_CLASS.closureUnresolvedEdge]);
        expect(result.topologyFindings).toEqual([])
    });

    test('the ledger silences BOTH unresolved shapes — the two emitted forms carry different fields', () => {
        const
            specifierForm = run({
                ledgeredEdges: new Set(['e.mjs::unresolved-specifier::./missing.mjs']),
                readFile     : graph({'/plane/e.mjs': "import {a} from './missing.mjs'; a();"}),
                resolve      : () => null
            }),
            unreadableForm = run({
                ledgeredEdges: new Set(['missing.mjs::unreadable']),
                readFile     : graph({'/plane/e.mjs': "import {a} from './missing.mjs'; a();"})
            });

        // Keys come from the registry's own `edgeIdentity()`, so they match the inventory's
        // `closure-edge` ledger by construction. A hand-rolled format matched nothing: wiring this
        // to the real ledger took the live run from 31 instrument errors to 0.
        expect(specifierForm.instrumentErrors).toEqual([]);
        expect(unreadableForm.instrumentErrors).toEqual([])
    });

    test('an entrypoint the registry declares but that cannot be read invalidates the run', () => {
        const result = run({
            entrypoints: ['/plane/gone.mjs'],
            readFile   : () => null
        });

        expect(classesOf(result)).toEqual([PROOF_CLASS.closureEntrypointUnreadable]);
        expect(result.instrumentErrors[0].identity).toBe('gone.mjs')
    });

    test('one shared module reached from many entrypoints is ONE finding, not one per entrypoint', () => {
        const result = run({
            entrypoints                 : ['/plane/e.mjs', '/plane/f.mjs'],
            dispositionBySurfaceIdentity: moduleDispositions([
                ['e.mjs', 'edge'], ['f.mjs', 'edge'], ['svc.mjs', 'cloud']
            ]),
            readFile                   : graph({
                '/plane/e.mjs'  : "import {a} from './svc.mjs'; a();",
                '/plane/f.mjs'  : "import {a} from './svc.mjs'; a();",
                '/plane/svc.mjs': 'export function a() {}'
            })
        });

        expect(result.topologyFindings.filter(f => f.identity === 'svc.mjs')).toHaveLength(1)
    })
});

/**
 * @summary Red-proofs the runtime-denial layer with an injected probe, so no arm spawns a process.
 *
 * The layer's whole claim is "every eligible Edge entrypoint imports cleanly while the Cloud-only
 * packages are unresolvable" — and that is the shape a broken instrument produces for free, since a
 * loader that never engages denies nothing and everything survives. Two controls exist to make the
 * green mean something, and the arms below prove each one can actually turn the layer red.
 */
test.describe('C′ plane-boundary proof — runtime-denial layer arms (#17533)', () => {
    const
        CLOUD = ['chromadb', 'better-sqlite3'],

        rows = [
            // A REAL, readable entrypoint: the Edge-used-package control reads the survivor's own
            // imports to build itself, so a fictional path would make the control unconstructible
            // and every arm below would inherit that instrument error instead of its own result.
            {identity: 'ai/scripts/agent-preflight.mjs', eligibility: 'eligible'},
            {identity: 'ai/listener.mjs', eligibility: 'ineligible', reason: 'starts a persistent listener on import'}
        ],

        classesOf = result => [
            ...result.instrumentErrors.map(entry => entry.class),
            ...result.topologyFindings.map(finding => finding.class)
        ].sort(),

        /** Survives unless the target is named in `dies.targets`, or `dies.package` is denied. */
        probeThat = dies => ({target, denied}) => {
            const killed = (dies.targets || []).includes(target) || (dies.package && denied.includes(dies.package));

            return killed
                ? {survived: false, status: 1, stdout: `DENIED_AT_RUNTIME: DENIED_CLOUD_PLANE_PACKAGE: ${dies.package || 'chromadb'}`}
                : {survived: true, status: 0, stdout: 'SURVIVED'}
        },

        run = overrides => runRuntimeDenialProof({
            eligibilityRows  : rows,
            cloudOnlyPackages: CLOUD,
            projectRoot      : REPO_ROOT,
            ...overrides
        });

    test('POSITIVE CONTROL: clean population yields only the ineligible carry-through, no instrument errors', () => {
        const result = run({
            cloudControlTarget: 'ai/cloud.mjs',
            probe             : probeThat({targets: ['ai/cloud.mjs'], package: 'commander'})
        });

        expect(result.instrumentErrors).toEqual([]);
        expect(classesOf(result)).toEqual([PROOF_CLASS.edgeProbeIneligible])
    });

    test('the CLOUD control surviving invalidates the run — and short-circuits before any Edge result', () => {
        const result = run({
            cloudControlTarget: 'ai/cloud.mjs',
            probe             : () => ({survived: true, status: 0, stdout: 'SURVIVED'})
        });

        expect(classesOf(result)).toEqual([PROOF_CLASS.denialCloudControlSurvived]);
        // No Edge rows are reported at all: with the denial unproven, every survival below would be
        // a green that means nothing, and emitting them would launder that into a result.
        expect(result.topologyFindings).toEqual([])
    });

    test('the EDGE-PACKAGE control surviving invalidates the run — the sharper of the two controls', () => {
        const result = run({
            cloudControlTarget: 'ai/cloud.mjs',
            // Cloud entrypoint dies (denial reaches ITS imports) but nothing else ever dies, so the
            // hook is missing the resolution path Edge code takes. The Cloud control alone passes.
            probe             : probeThat({targets: ['ai/cloud.mjs']})
        });

        expect(result.instrumentErrors.map(entry => entry.class))
            .toContain(PROOF_CLASS.denialEdgePackageControlSurvived)
    });

    test('an eligible Edge entrypoint denied at runtime is an exact, successor-owned topology finding', () => {
        const result = run({
            cloudControlTarget: 'ai/cloud.mjs',
            // BOTH the cloud control and the Edge target die — the control must pass for the Edge
            // denial below to be reportable at all.
            probe             : probeThat({targets: ['ai/cloud.mjs', 'ai/scripts/agent-preflight.mjs'], package: 'commander'})
        });

        const denied = result.topologyFindings.find(finding => finding.class === PROOF_CLASS.edgeDeniedAtRuntime);

        expect(denied.identity).toBe('ai/scripts/agent-preflight.mjs');
        expect(denied.preRelocationBlocker).toBe(true);
        expect(denied.successorOwner).toContain('#16202')
    });

    test('a target that dies WITHOUT a denial marker is an instrument error — never an accusation', () => {
        const result = run({
            cloudControlTarget: 'ai/cloud.mjs',
            probe             : ({target}) => target === 'ai/scripts/agent-preflight.mjs'
                ? {survived: false, status: 1, stdout: 'ReferenceError: Neo is not defined'}
                : {survived: false, status: 1, stdout: 'DENIED_AT_RUNTIME: DENIED_CLOUD_PLANE_PACKAGE: chromadb'}
        });

        // A syntax error or an unrelated missing dependency would otherwise be reported as "this
        // Edge entrypoint needs a Cloud package" — a false accusation that ships with an owner.
        expect(result.instrumentErrors.map(entry => entry.class)).toContain(PROOF_CLASS.denialProbeFailure);
        expect(result.topologyFindings.some(finding => finding.class === PROOF_CLASS.edgeDeniedAtRuntime)).toBe(false)
    });

    test('an INELIGIBLE entrypoint is never run, and carries its registry reason into the receipt', () => {
        let   probed = false;
        const result = run({
            probe: ({target}) => {
                if (target === 'ai/listener.mjs') probed = true;
                return {survived: true, status: 0, stdout: 'SURVIVED'}
            }
        });

        // Importing one starts a listener or spawns durable work — the population stays complete by
        // recording the reason, so an ineligible target can never read as an untested one.
        expect(probed).toBe(false);
        expect(result.topologyFindings.find(finding => finding.class === PROOF_CLASS.edgeProbeIneligible).detail)
            .toContain('starts a persistent listener on import')
    })
});

/**
 * @summary Red-proofs the computed-edge reconciliation, whose whole reason for existing is the one
 * case a count-based ratchet cannot see.
 */
test.describe('C′ plane-boundary proof — computed-edge reconciliation arms (#17533)', () => {
    const
        edges     = (...identities) => new Set(identities),
        reconcile = (observed, registry) => runComputedEdgeReconciliation({
            observedEdges: observed,
            registryEdges: registry
        }),
        idsOf = result => result.topologyFindings.map(finding => `${finding.class}::${finding.identity}`).sort();

    test('POSITIVE CONTROL: identical populations reconcile clean in both directions', () => {
        const result = reconcile(edges('a.mjs::dynamic-import::load'), edges('a.mjs::dynamic-import::load'));

        expect(result.topologyFindings).toEqual([]);
        expect(result.instrumentErrors).toEqual([])
    });

    test('an observed edge with no registry row is an ADDITION', () => {
        const result = reconcile(
            edges('a.mjs::dynamic-import::load', 'b.mjs::dynamic-import::boot'),
            edges('a.mjs::dynamic-import::load')
        );

        expect(idsOf(result)).toEqual([`${PROOF_CLASS.computedEdgeAdded}::b.mjs::dynamic-import::boot`])
    });

    test('a registry row the walk no longer observes is reported, not silently dropped', () => {
        const result = reconcile(
            edges('a.mjs::dynamic-import::load'),
            edges('a.mjs::dynamic-import::load', 'b.mjs::dynamic-import::boot')
        );

        // A ratchet that "may only ever SHRINK" cannot express this: a shrinking count is
        // indistinguishable from a shrinking closure, so a coverage regression reads as progress.
        expect(idsOf(result)).toEqual([`${PROOF_CLASS.computedEdgeStale}::b.mjs::dynamic-import::boot`])
    });

    test('RED: a SAME-COUNT substitution fires both directions — the case a count check waves through', () => {
        const
            observed = edges('a.mjs::dynamic-import::load', 'b.mjs::dynamic-import::AFTER'),
            registry = edges('a.mjs::dynamic-import::load', 'b.mjs::dynamic-import::BEFORE'),
            result   = reconcile(observed, registry);

        // The counts are equal and the populations are not. This is the whole layer.
        expect(observed.size).toBe(registry.size);
        expect(idsOf(result)).toEqual([
            `${PROOF_CLASS.computedEdgeStale}::b.mjs::dynamic-import::BEFORE`,
            `${PROOF_CLASS.computedEdgeAdded}::b.mjs::dynamic-import::AFTER`
        ])
    });

    test('substitution is caught at MEMBER granularity, not just per module', () => {
        // Two dynamic imports in one module: swapping which member carries it keeps the module set
        // AND the count identical. Only the member half of the identity discriminates.
        const result = reconcile(
            edges('a.mjs::dynamic-import::loadOverlay'),
            edges('a.mjs::dynamic-import::loadDefaults')
        );

        expect(idsOf(result)).toEqual([
            `${PROOF_CLASS.computedEdgeStale}::a.mjs::dynamic-import::loadDefaults`,
            `${PROOF_CLASS.computedEdgeAdded}::a.mjs::dynamic-import::loadOverlay`
        ])
    })
;

    test('a registry edge OUTSIDE the walked region is not reported — a complement is not a measurement', () => {
        const result = runComputedEdgeReconciliation({
            observedEdges : edges('ai/walked.mjs::dynamic-import::load'),
            registryEdges : edges('ai/walked.mjs::dynamic-import::load', 'ai/never-opened.mjs::dynamic-import::boot'),
            reachedModules: new Set(['ai/walked.mjs'])
        });

        // The registry dispositions edges across every plane; this walk visits Edge launch roots
        // only. Unscoped, the live run reported four Cloud/retired entrypoints' edges as registry
        // defects — the walk's own population boundary, dressed as a finding.
        expect(result.topologyFindings).toEqual([])
    })
});

/**
 * @summary The receipt's own honesty: it may not name a SHA it is not bound to, and its
 * ordering may not depend on the machine that produced it.
 */
test.describe('C′ plane-boundary proof — receipt binding and ordering', () => {
    test('RA-2: ordering is CODE-UNIT, not locale-collated — byte-identical must not be per-machine', () => {
        // `localeCompare` orders these 'B' after 'a' in most locales; code-unit order puts 'B'
        // first because uppercase sorts lower. If the receipt used a collator, two agents diffing
        // the same findings could disagree about their order — and AC-7 claims byte-identity.
        const receipt = buildReceipt({
            instrumentErrors: [],
            topologyFindings: [
                {class: 'topology-x', identity: 'apple'},
                {class: 'topology-x', identity: 'Banana'}
            ]
        });

        expect('a'.localeCompare('B')).toBeLessThan(0);
        expect(receipt.topologyFindings.map(finding => finding.identity)).toEqual(['Banana', 'apple'])
    });

    test('RA-1: the receipt can express NOT BOUND — a null head plus the dirty paths survive intact', () => {
        const receipt = buildReceipt({
            instrumentErrors: [{class: PROOF_CLASS.dirtyWorktreeBinding, identity: 'worktree', detail: 'dirty'}],
            topologyFindings: [],
            meta            : {
                head         : null,
                sourceBinding: {bound: false, sha: 'deadbeef', dirtyPaths: ['ai/x.mjs']}
            }
        });

        // A consumer keyed on `head` fails loud instead of attributing findings to a commit that
        // never produced them; `sourceBinding` carries the SHA that was NOT bound, so the run is
        // still traceable without claiming reproducibility.
        expect(receipt.meta.head).toBeNull();
        expect(receipt.meta.sourceBinding).toEqual({bound: false, sha: 'deadbeef', dirtyPaths: ['ai/x.mjs']});
        expect(receipt.exitCode).toBe(1)
    })
});
