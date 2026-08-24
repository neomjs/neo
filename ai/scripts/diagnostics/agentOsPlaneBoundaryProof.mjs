#!/usr/bin/env node

import {execFileSync, spawnSync} from 'node:child_process';
import {isBuiltin}               from 'node:module';
import fs                        from 'node:fs';
import os                        from 'node:os';
import path                      from 'node:path';
import {fileURLToPath}           from 'node:url';
import {Command}                 from 'commander';

import {
    collectModuleFacts,
    normalizeSpecifier,
    resolveRelative,
    walkCapabilityClosure
}                                from '../lint/scriptPlaneClosure.mjs';
import {SURFACE, buildInventory, rowKey} from './agentOsExtractionInventory.mjs';
import {edgeIdentity}                    from '../lint/lint-script-plane.mjs';

/**
 * Pre-Flight (structural fast-path): authoring
 * `ai/scripts/diagnostics/agentOsPlaneBoundaryProof.mjs` matches the read-only, rerunnable
 * diagnostic-CLI role of its sibling `agentOsExtractionInventory.mjs` (same epic, same folder, same
 * exported-functions-plus-CLI shape); sibling-file-lift applies and no novel directory choice is
 * introduced.
 *
 * @module ai/scripts/diagnostics/agentOsPlaneBoundaryProof
 * @summary Materializes the disposable C′ two-root fixture and runs the paired plane-boundary
 * proof's resolution layer, emitting the red-capable current-head receipt — the extraction wave's
 * second blocking proof, gating every relocation leaf.
 *
 * ## The two result layers are the contract
 *
 * **Instrument integrity** must be green: a control that cannot fire (the nested Cloud root failing
 * to resolve its own declared driver, an ancestor `node_modules` above the fixture, an empty
 * manifest population) invalidates the run and lands in `instrumentErrors`. **Topology findings**
 * are exact current-head truth and MAY be non-empty before the store-edge severance leaf: each
 * finding names its class, its exact identity, and its successor owner. The CLI exits non-zero when
 * EITHER layer is non-empty; only the meaning differs. Green-by-omission is the failure mode this
 * separation exists to kill.
 *
 * ## Why resolution is probed from a file inside each package root
 *
 * Node resolves upward from the REQUIRING FILE. A probe anchored anywhere else (the repo, a shell
 * cwd, a `-e` eval) answers a different question than "can THIS package's own code see that
 * dependency". Each materialized root therefore carries `resolve-probe.cjs`, and the probe result
 * is that root's genuine resolver verdict. CJS and ESM resolution differ on exports-map subpaths,
 * but agree on whole-package presence/absence — which is the property under proof here.
 *
 * ## Why the fixture lives in OS-temp, and why the guard walks to the filesystem root
 *
 * Ancestor hoisting is the falsifier this topology exists to defeat: a `node_modules` anywhere
 * above the fixture can make an undeclared Cloud driver resolvable from the Edge root, turning a
 * manifest omission into a false green. The guard therefore refuses ANY ancestor `node_modules`,
 * not merely the repository's — a superset search region is the difference between "we looked" and
 * "it cannot be there".
 *
 * ## Authority discipline
 *
 * The Cloud-only package set is read from `package.brain.json` (the committed brain-tier
 * declaration); populations are parameters, never re-derived config. This module owns fixture
 * materialization and the resolution layer only — static closure and runtime denial remain owned by
 * `scriptPlaneClosure.mjs` and the `denyCloudPlanePackages` loader lineage, composed by the proof
 * runner as they are, never re-implemented.
 *
 * @example
 * node ai/scripts/diagnostics/agentOsPlaneBoundaryProof.mjs --json
 * node ai/scripts/diagnostics/agentOsPlaneBoundaryProof.mjs --keep-fixture
 */

const
    __filename       = fileURLToPath(import.meta.url),
    PROJECT_ROOT     = path.resolve(path.dirname(__filename), '../../..'),
    BRAIN_MANIFEST   = path.join(PROJECT_ROOT, 'package.brain.json'),
    DENIAL_LOADER    = path.join(path.dirname(__filename), 'denyCloudPlanePackages.loader.mjs'),
    PROBE_BASENAME   = 'resolve-probe.cjs',
    REGISTRY_REGION  = 'ai',
    PROBE_TIMEOUT_MS = 30000,

    /**
     * The probe deliberately prints ONLY machine-parseable verdict lines. `require.resolve` throwing
     * `MODULE_NOT_FOUND` is the genuine can-not-see answer; every other throw is an instrument
     * problem and is reported as such by the caller.
     */
    PROBE_SOURCE = [
        'const specifier = process.argv[2];',
        'try {',
        '    console.log(`RESOLVED:${require.resolve(specifier)}`);',
        '} catch (error) {',
        '    console.log(`UNRESOLVED:${error.code || error.name}`);',
        '    process.exitCode = 1;',
        '}',
        ''
    ].join('\n');

/**
 * Stable finding/error class names in the machine receipt.
 * @type {Object}
 */
export const PROOF_CLASS = Object.freeze({
    ancestorNodeModules             : 'instrument-ancestor-node-modules',
    cloudControlUnresolved          : 'instrument-cloud-positive-control-unresolved',
    cloudControlWrongRoot           : 'instrument-cloud-positive-control-resolved-via-ancestor',
    closureEntrypointUnreadable     : 'instrument-closure-entrypoint-unreadable',
    closureEscapesPlaneRoot         : 'topology-edge-closure-escapes-plane-root',
    closureImportsCloudPackage      : 'topology-edge-closure-imports-cloud-package',
    closureReachesCloudModule       : 'topology-edge-closure-reaches-cloud-module',
    closureReachedWithoutCustody    : 'topology-edge-closure-reaches-module-without-custody',
    closureOutOfRegistryRegion      : 'topology-edge-closure-reaches-out-of-registry-region',
    closureUnresolvedEdge           : 'instrument-closure-unresolved-edge',
    computedEdgeAdded               : 'topology-computed-edge-unregistered-addition',
    computedEdgeStale               : 'topology-computed-edge-authority-without-observation',
    denialCloudControlSurvived      : 'instrument-runtime-denial-cloud-control-survived',
    denialEdgePackageControlSurvived: 'instrument-runtime-denial-edge-package-control-survived',
    denialProbeFailure              : 'instrument-runtime-denial-probe-failure',
    dirtyWorktreeBinding            : 'instrument-source-binding-dirty-worktree',
    edgeDeniedAtRuntime             : 'topology-edge-entrypoint-denied-under-cloud-denial',
    edgeProbeIneligible             : 'topology-edge-entrypoint-runtime-probe-ineligible',
    edgePopulationInterim           : 'topology-edge-dependency-population-derived-not-authoritative',
    edgeResolvesCloudPackage        : 'topology-edge-resolves-cloud-package',
    emptyPopulation                 : 'instrument-empty-manifest-population',
    probeFailure                    : 'instrument-resolution-probe-failure'
});

/**
 * @summary Walks every ancestor of `dir` up to the filesystem root, refusing any `node_modules`.
 *
 * A hit is an instrument error, not a topology finding: with a resolvable ancestor tree in place,
 * an Edge "cannot resolve" result would be untrustworthy in the other direction too — the fixture
 * placement, not the topology, would own the verdict.
 *
 * @param {String} dir Absolute fixture root.
 * @returns {{ok: Boolean, offender: String|null}} `offender` is the ancestor `node_modules` path.
 */
export function assertNoAncestorNodeModules(dir) {
    let current = path.dirname(path.resolve(dir));

    for (let previous = null; current !== previous; previous = current, current = path.dirname(current)) {
        const candidate = path.join(current, 'node_modules');

        if (fs.existsSync(candidate)) return {ok: false, offender: candidate}
    }

    return {ok: true, offender: null}
}

/**
 * @summary Materializes the disposable two-root C′ fixture: Edge root + independently installed
 * nested `cloud/` package, with a resolution probe inside each root.
 *
 * The empty-population refusal is by name and happens BEFORE any write: an empty dependency
 * population would make every downstream denial vacuous (nothing declared, nothing resolvable,
 * green forever). The manifests are written literally here and carry no `workspaces` key — the
 * hoist path the proof exists to refuse never has a manifest slot to enter through.
 *
 * @param {Object}   config
 * @param {String}   config.baseDir           Existing directory to create the fixture inside.
 * @param {Object}   config.edgeDependencies  Non-empty `{name: version}` map for the Edge root.
 * @param {Object}   config.cloudDependencies Non-empty `{name: version}` map for `cloud/`.
 * @returns {{fixtureRoot: String, edgeRoot: String, cloudRoot: String}} Absolute paths.
 */
export function materializeBoundaryFixture({baseDir, edgeDependencies, cloudDependencies}) {
    for (const [plane, dependencies] of [['edge', edgeDependencies], ['cloud', cloudDependencies]]) {
        if (!dependencies || Object.keys(dependencies).length === 0) {
            throw Object.assign(
                new Error(`${PROOF_CLASS.emptyPopulation}: the ${plane} dependency population is empty`),
                {proofClass: PROOF_CLASS.emptyPopulation, plane}
            )
        }
    }

    const
        fixtureRoot = fs.mkdtempSync(path.join(baseDir, 'neo-plane-boundary-')),
        edgeRoot    = fixtureRoot,
        cloudRoot   = path.join(fixtureRoot, 'cloud'),

        manifest = (name, dependencies) => JSON.stringify({
            name,
            version: '0.0.0',
            private: true,
            type   : 'module',
            dependencies
        }, null, 4);

    fs.mkdirSync(cloudRoot, {recursive: true});
    fs.writeFileSync(path.join(edgeRoot,  'package.json'), manifest('neo-plane-proof-edge',  edgeDependencies));
    fs.writeFileSync(path.join(cloudRoot, 'package.json'), manifest('neo-plane-proof-cloud', cloudDependencies));
    fs.writeFileSync(path.join(edgeRoot,  PROBE_BASENAME), PROBE_SOURCE);
    fs.writeFileSync(path.join(cloudRoot, PROBE_BASENAME), PROBE_SOURCE);

    return {fixtureRoot, edgeRoot, cloudRoot}
}

/**
 * @summary Asks one package root's own resolver whether it can see a specifier.
 *
 * `NODE_OPTIONS` is cleared for the same reason the runtime-denial sibling clears it: an inherited
 * harness loader would answer for the harness, not for the root under proof.
 *
 * @param {Object} config
 * @param {String} config.packageRoot Absolute root containing `resolve-probe.cjs`.
 * @param {String} config.specifier   Package specifier to resolve.
 * @returns {{resolved: Boolean, detail: String, instrumentError: String|null}}
 */
export function resolveFromRoot({packageRoot, specifier}) {
    const result = spawnSync(process.execPath, [path.join(packageRoot, PROBE_BASENAME), specifier], {
        cwd     : packageRoot,
        encoding: 'utf8',
        env     : {...process.env, NODE_OPTIONS: ''}
    });

    const stdout = `${result.stdout || ''}`.trim();

    if (/^RESOLVED:/.test(stdout))   return {resolved: true,  detail: stdout.slice('RESOLVED:'.length),   instrumentError: null};
    if (/^UNRESOLVED:/.test(stdout)) return {resolved: false, detail: stdout.slice('UNRESOLVED:'.length), instrumentError: null};

    return {
        resolved       : false,
        detail         : `${stdout}\n${`${result.stderr || ''}`.trim()}`.trim(),
        instrumentError: PROOF_CLASS.probeFailure
    }
}

/**
 * @summary Installs a stub package directly into one root's `node_modules`.
 *
 * Two callers, one shape: unit fixtures use it to build offline layouts that make every detector
 * arm provable without a registry, and the mutation control uses it to prove that ADDING one Cloud
 * driver to the Edge root turns the proof red.
 *
 * @param {Object} config
 * @param {String} config.packageRoot Absolute package root.
 * @param {String} config.name        Package name to stub.
 */
export function injectDriverStub({packageRoot, name}) {
    const dir = path.join(packageRoot, 'node_modules', ...name.split('/'));

    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name, version: '0.0.0', main: 'index.cjs'}, null, 4));
    fs.writeFileSync(path.join(dir, 'index.cjs'), 'module.exports = {};\n')
}

/**
 * @summary Runs the resolution layer of the paired proof over one materialized fixture.
 *
 * Per Cloud-only package, two verdicts compose: the Edge root must NOT resolve it (resolving is the
 * `edge-resolves-cloud-package` topology finding — exact identity, successor-owned), and the nested
 * Cloud root MUST resolve it from its own install (failure is the dead-control instrument error
 * that invalidates the Edge result's meaning). The ancestor guard runs first because its failure
 * poisons both directions.
 *
 * @param {Object}   config
 * @param {String}   config.edgeRoot          Absolute Edge package root.
 * @param {String}   config.cloudRoot         Absolute nested Cloud package root.
 * @param {String[]} config.cloudOnlyPackages The declared Cloud-only dependency set.
 * @returns {{instrumentErrors: Object[], topologyFindings: Object[]}}
 */
export function runResolutionProof({edgeRoot, cloudRoot, cloudOnlyPackages}) {
    const
        instrumentErrors = [],
        topologyFindings = [],
        ancestors        = assertNoAncestorNodeModules(edgeRoot);

    if (!ancestors.ok) {
        instrumentErrors.push({
            class   : PROOF_CLASS.ancestorNodeModules,
            identity: ancestors.offender,
            detail  : 'an ancestor node_modules makes both resolution directions untrustworthy'
        });

        return {instrumentErrors, topologyFindings}
    }

    for (const name of [...cloudOnlyPackages].sort()) {
        const
            edge  = resolveFromRoot({packageRoot: edgeRoot,  specifier: name}),
            cloud = resolveFromRoot({packageRoot: cloudRoot, specifier: name});

        for (const [root, verdict] of [[edgeRoot, edge], [cloudRoot, cloud]]) {
            if (verdict.instrumentError) {
                instrumentErrors.push({class: verdict.instrumentError, identity: `${root} → ${name}`, detail: verdict.detail})
            }
        }

        if (edge.resolved) {
            topologyFindings.push({
                class               : PROOF_CLASS.edgeResolvesCloudPackage,
                identity            : name,
                detail              : `resolves to ${edge.detail}`,
                successorOwner      : 'store-edge severance leaves (#16202 / #17627) + the Edge manifest authority',
                preRelocationBlocker: true
            })
        }

        if (!cloud.resolved && !cloud.instrumentError) {
            instrumentErrors.push({
                class   : PROOF_CLASS.cloudControlUnresolved,
                identity: name,
                detail  : `the nested Cloud root cannot resolve its own declared driver (${cloud.detail}); the Edge denial for this package proves nothing`
            })
        }

        // Node's resolver walks UP, so the nested Cloud root genuinely CAN reach a package installed
        // in the Edge root above it. A bare "resolved" verdict cannot see that; the resolved PATH
        // can. A control satisfied from an ancestor install is a dead control wearing a green light
        // — the C′ contract says Cloud never falls back to Edge/ancestor installs. Both sides of the
        // comparison are canonicalized: `require.resolve` returns real paths, while an OS-temp
        // fixture root is typically reached through a symlink (macOS `/var` → `/private/var`).
        if (cloud.resolved) {
            const cloudModules = path.join(fs.realpathSync(cloudRoot), 'node_modules') + path.sep;

            if (!cloud.detail.startsWith(cloudModules)) {
                instrumentErrors.push({
                    class   : PROOF_CLASS.cloudControlWrongRoot,
                    identity: name,
                    detail  : `resolved to ${cloud.detail}, outside ${cloudModules}`
                })
            }
        }
    }

    return {instrumentErrors, topologyFindings}
}

/**
 * @summary Runs the static-closure layer: what an Edge entrypoint's source graph can REACH, scored
 * against the reconciled registry authority.
 *
 * ## Why this layer needs no installed fixture, unlike its resolution sibling
 *
 * The resolution layer must materialize and `npm install` two roots, because "can this package see
 * that dependency" is a question only a real resolver against a real tree can answer. Static
 * closure asks a different question — "what does this source graph reach" — and source is source.
 * Running it against the REAL current head is therefore strictly better than running it against a
 * fixture: it reports current-head truth instead of fixture truth. The in-memory red arms live in
 * the spec, which is exactly the testability contract `walkCapabilityClosure` was built for (its
 * `readFile`/`resolve` are injected for this reason).
 *
 * ## Two instruments, because one of them cannot see half the question
 *
 * `walkCapabilityClosure` **treats a bare package specifier as a leaf** and never follows it — its
 * own comment says a bare package's graph "is not ours to police". So `reached` contains relative
 * module paths ONLY, and an arm that hunted Cloud *packages* inside `reached` could never fire: a
 * green proving nothing. Package reach is therefore read from `collectModuleFacts().imports`, the
 * raw specifier list, normalized through `normalizeSpecifier` so a deep import (`fs-extra/lib/json`)
 * compares equal to its package. Module reach and package reach are two questions and they need two
 * instruments; conflating them is the false-green this comment exists to prevent.
 *
 * ## The authority is consumed, never re-derived
 *
 * Dispositions come from the reconciled inventory rows, scoped by BOTH surface and identity. Only a
 * `script-module` row answers module custody; a same-path plane-opener/config/workflow row answers a
 * different question and cannot classify the module by collision. Proof 1 owns exact membership and
 * residue for its DECLARED surfaces, so a reached dependency with no `script-module` row is not a
 * missing-inventory blocker. Proof 1 cannot observe that reach-derived null, though, so this layer
 * retains it as a non-blocking custody observation rather than turning absence into silence.
 *
 * ## An unaccounted unresolved edge is an INSTRUMENT error, not a topology finding
 *
 * The closure reports an edge it cannot name (a computed callee, a member missing from its module).
 * With such a hole in the graph, "this Edge entrypoint reaches no Cloud module" is **unsound** — the
 * hole could be hiding exactly that. So an unresolved edge carrying no ledger disposition invalidates
 * the run, the same doctrine the dead-control arm applies to the resolution layer. An edge the
 * ledger already dispositions is accounted for and stays silent.
 *
 * @param {Object}   config
 * @param {String[]} config.entrypoints          Absolute Edge entrypoint paths.
 * @param {Map}      config.dispositionBySurfaceIdentity `rowKey(surface, identity)` → disposition.
 * @param {String[]} config.cloudOnlyPackages    Declared Cloud-only dependency names.
 * @param {String}   config.planeRoot            Absolute root every Edge module must stay inside.
 * @param {Set}      [config.ledgeredEdges]      Edge identities the registry already dispositions.
 * @param {Function} [config.readFile]           `(absPath) => String|null`; injected for the spec.
 * @param {Function} [config.resolve]            `(specifier, fromFile) => String|null`.
 * @returns {{instrumentErrors: Object[], topologyFindings: Object[]}}
 */
/**
 * @summary Spawns one Edge entrypoint under a resolver that denies the Cloud-only packages, and
 * reports whether it survived.
 *
 * Extracted from the host-barrel spec rather than reimplemented — the ticket's reuse AC is not
 * stylistic here: the loader's `ERR_MODULE_NOT_FOUND` fidelity is what makes the child unable to
 * tell simulated absence from real absence, and a second copy would drift from it silently.
 *
 * `NODE_OPTIONS` is cleared for the reason the sibling documents: an inherited harness loader makes
 * the child resolve through the harness instead of the denial hook, and the probe then proves
 * nothing while looking green. The 400ms settle is likewise load-bearing — a target whose failure
 * arrives on a later microtask would otherwise exit 0 before its rejection lands.
 *
 * @param {Object}   config
 * @param {String}   config.target      Repo-relative module to import in the spawned child.
 * @param {String[]} config.denied      Package specifiers the resolve hook must refuse.
 * @param {String}   [config.projectRoot=PROJECT_ROOT]
 * @returns {{survived: Boolean, stdout: String, status: Number}}
 */
export function readSource(absPath) {
    try { return fs.readFileSync(absPath, 'utf8') } catch { return null }
}

export function runDenialProbe({target, denied, projectRoot = PROJECT_ROOT}) {
    const
        dir     = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-plane-denial-probe-')),
        probeJs = path.join(dir, 'probe.mjs'),
        regJs   = path.join(dir, 'register.mjs');

    fs.writeFileSync(probeJs, [
        "process.on('unhandledRejection', e => {",
        "    console.log('DENIED_AT_RUNTIME: ' + (e && e.message));",
        '    process.exit(1);',
        '});',
        'await import(process.env.NEO_PROBE_TARGET);',
        'await new Promise(r => setTimeout(r, 400));',
        "console.log('SURVIVED');",
        'process.exit(0);',
        ''
    ].join('\n'));

    fs.writeFileSync(regJs, [
        "import {register} from 'node:module';",
        "import {pathToFileURL} from 'node:url';",
        `register(${JSON.stringify(DENIAL_LOADER)}, pathToFileURL('./'));`,
        ''
    ].join('\n'));

    try {
        const result = spawnSync(process.execPath, ['--import', regJs, probeJs], {
            cwd     : projectRoot,
            encoding: 'utf8',
            stdio   : ['ignore', 'pipe', 'pipe'],
            timeout : PROBE_TIMEOUT_MS,
            env     : {
                ...process.env,
                NODE_OPTIONS       : '',
                NEO_DENIED_PACKAGES: denied.join(','),
                NEO_PROBE_TARGET   : path.join(projectRoot, target)
            }
        });

        return {
            survived: result.status === 0 && /SURVIVED/.test(`${result.stdout || ''}`),
            status  : result.status,
            stdout  : `${result.stdout || ''}${result.stderr || ''}`.trim()
        }
    } finally {
        fs.rmSync(dir, {recursive: true, force: true})
    }
}

/**
 * @summary Runs the runtime-denial layer: every ELIGIBLE Edge entrypoint must import cleanly while
 * the Cloud-only packages are unresolvable, and the two controls must prove the denial is real.
 *
 * ## Why a survival result means nothing without both controls
 *
 * "Every Edge entrypoint survived Cloud denial" is the shape of a green that a broken instrument
 * produces for free — a loader that never engages denies nothing and everything survives. So two
 * controls run alongside, and either failing makes the whole layer an INSTRUMENT error rather than
 * a topology result:
 *
 * - **Cloud positive control** — a Cloud-dispositioned entrypoint is probed under the same denial
 *   and MUST die. If it survives, the denial is not reaching imports at all.
 * - **Edge-used-package control** — one Edge entrypoint is re-probed with a package it genuinely
 *   imports added to the denied set, and MUST die. This is the sharper of the two: the Cloud
 *   control can pass while the hook still misses the specific resolution path Edge code takes.
 *
 * Ineligible entrypoints are NOT run — importing one starts a listener, parses argv, or spawns
 * durable work. Their registry reason is carried into the receipt instead, so the population stays
 * complete and an ineligible target can never be mistaken for an untested one.
 *
 * @param {Object}   config
 * @param {Object[]} config.eligibilityRows Reconciled runtime-probe-eligibility rows.
 * @param {String[]} config.cloudOnlyPackages
 * @param {String}   [config.cloudControlTarget] A Cloud entrypoint that must die under denial.
 * @param {String}   [config.projectRoot=PROJECT_ROOT]
 * @param {Function} [config.probe=runDenialProbe] Injected for the spec's arms.
 * @returns {{instrumentErrors: Object[], topologyFindings: Object[]}}
 */
export function runRuntimeDenialProof({
    eligibilityRows,
    cloudOnlyPackages,
    cloudControlTarget = null,
    projectRoot        = PROJECT_ROOT,
    probe              = runDenialProbe
}) {
    const
        instrumentErrors = [],
        topologyFindings = [],
        denied           = [...cloudOnlyPackages].sort();

    if (cloudControlTarget) {
        const control = probe({target: cloudControlTarget, denied, projectRoot});

        if (control.survived) {
            instrumentErrors.push({
                class   : PROOF_CLASS.denialCloudControlSurvived,
                identity: cloudControlTarget,
                detail  : 'a Cloud entrypoint survived Cloud-package denial — the loader is not reaching imports, so every Edge survival below is vacuous'
            });

            return {instrumentErrors, topologyFindings}
        }
    }

    for (const row of [...eligibilityRows].sort((a, b) => a.identity.localeCompare(b.identity))) {
        if (row.eligibility !== 'eligible') {
            topologyFindings.push({
                class               : PROOF_CLASS.edgeProbeIneligible,
                identity            : row.identity,
                detail              : `not run under denial — ${row.reason || 'no reason recorded'}`,
                successorOwner      : 'the runtime-probe eligibility authority',
                preRelocationBlocker: false
            });

            continue
        }

        const result = probe({target: row.identity, denied, projectRoot});

        if (!result.survived) {
            const died = /DENIED_CLOUD_PLANE_PACKAGE|DENIED_AT_RUNTIME|ERR_MODULE_NOT_FOUND/.test(result.stdout);

            // A target that died for a reason OTHER than the denial is an instrument problem, not a
            // topology one: a syntax error or a missing unrelated dependency would otherwise be
            // reported as "Edge needs a Cloud package", which is a false accusation with an owner.
            (died ? topologyFindings : instrumentErrors).push(died ? {
                class               : PROOF_CLASS.edgeDeniedAtRuntime,
                identity            : row.identity,
                detail              : result.stdout.split('\n').find(line => /DENIED/.test(line)) || 'denied under Cloud-package denial',
                successorOwner      : 'store-edge severance leaves (#16202 / #17627)',
                preRelocationBlocker: true
            } : {
                class   : PROOF_CLASS.denialProbeFailure,
                identity: row.identity,
                detail  : `exited ${result.status} without a denial marker — instrument problem, not a topology finding: ${result.stdout.slice(0, 200)}`
            })
        }
    }

    // The Edge-used-package control runs LAST and is self-calibrating, because a hand-picked
    // control target is a guess that rots: pick one that already dies under plain denial and the
    // control proves nothing. So it re-probes an actual SURVIVOR with a package that survivor
    // genuinely imports, which is the only version of this control that can discriminate "the hook
    // reaches Edge's resolution path" from "the hook reached the Cloud entrypoint's".
    //
    // A survivor is required for it to run at all. Zero survivors is not a silent skip — it is
    // reported, because "every eligible Edge entrypoint was denied" is exactly the result a
    // catastrophically broken instrument also produces.
    const survivors = eligibilityRows
        .filter(row => row.eligibility === 'eligible')
        .map(row => row.identity)
        .filter(identity => !topologyFindings.some(finding =>
            finding.class === PROOF_CLASS.edgeDeniedAtRuntime && finding.identity === identity) &&
            !instrumentErrors.some(error => error.identity === identity));

    if (survivors.length > 0) {
        const
            target = survivors[0],
            source = readSource(path.join(projectRoot, target)),
            // `isBuiltin`, not a `node:` prefix test: `normalizeSpecifier` STRIPS that prefix, so
            // `node:child_process` arrives as `child_process` and a prefix check waves every
            // builtin through. Denying a builtin is not a control — the loader would refuse
            // something Node resolves internally and the arm would prove nothing about packages.
            ownPkg  = source && collectModuleFacts(source).imports
                .map(normalizeSpecifier)
                .find(name => name && !name.startsWith('.') && !isBuiltin(name) && !denied.includes(name));

        if (!ownPkg) {
            instrumentErrors.push({
                class   : PROOF_CLASS.denialEdgePackageControlSurvived,
                identity: target,
                detail  : 'no external package import found on the chosen survivor, so the Edge-used-package control cannot be constructed — Edge survivals are unlicensed'
            })
        } else {
            const control = probe({target, denied: [...denied, ownPkg].sort(), projectRoot});

            if (control.survived) {
                instrumentErrors.push({
                    class   : PROOF_CLASS.denialEdgePackageControlSurvived,
                    identity: `${target} → ${ownPkg}`,
                    detail  : 'an Edge entrypoint survived denial of a package it imports — the hook misses the resolution path Edge code takes, so every Edge survival above is vacuous'
                })
            }
        }
    }

    return {instrumentErrors, topologyFindings}
}

export function runStaticClosureProof({
    entrypoints,
    dispositionBySurfaceIdentity,
    cloudOnlyPackages,
    planeRoot,
    ledgeredEdges = new Set(),
    readFile      = absPath => { try { return fs.readFileSync(absPath, 'utf8') } catch { return null } },
    resolve       = resolveRelative
}) {
    const
        instrumentErrors = [],
        topologyFindings = [],
        observedEdges    = new Set(),
        reachedModules   = new Set(),
        cloudPackages    = new Set(cloudOnlyPackages),
        withoutCustody   = [],
        outOfRegion      = [],
        relative         = absPath => path.relative(planeRoot, absPath).split(path.sep).join('/'),
        seen             = new Set();

    for (const entrypoint of [...entrypoints].sort()) {
        const source = readFile(entrypoint);

        if (source === null) {
            instrumentErrors.push({
                class   : PROOF_CLASS.closureEntrypointUnreadable,
                identity: relative(entrypoint),
                detail  : 'an Edge entrypoint the registry declares cannot be read; its closure is unmeasured, so a plane-clean verdict would be vacuous'
            });

            continue
        }

        const
            closure = walkCapabilityClosure({entrypoint, readFile, resolve}),
            // A module that resolved but could not be READ is already an instrument error below.
            // It also lands in `reached`, where it would score as `unregistered` — one defect
            // reported twice, in two layers, and the topology half would be a lie: an unmeasurable
            // module is not a population gap, and filing it as one points H1 at the wrong repair.
            // The instrument layer owns it exclusively.
            unreadable = new Set(closure.unresolved
                .filter(edge => edge.reason === 'unreadable')
                .map(edge => edge.module));

        for (const module of closure.reached) {
            if (unreadable.has(module)) continue;

            const identity = relative(module);

            // Dedupe by (entrypoint-independent) identity: the same shared module reached from
            // twelve entrypoints is ONE topology fact, and twelve copies of it would bury the rest.
            reachedModules.add(identity);

            if (seen.has(identity)) continue;
            seen.add(identity);

            if (identity.startsWith('../') || path.isAbsolute(identity)) {
                topologyFindings.push({
                    class               : PROOF_CLASS.closureEscapesPlaneRoot,
                    identity,
                    detail              : `reached from ${relative(entrypoint)}, outside the plane root`,
                    successorOwner      : 'the Edge manifest authority (#17645 H1)',
                    preRelocationBlocker: true
                });

                continue
            }

            const disposition = dispositionBySurfaceIdentity.get(rowKey(SURFACE.scriptModule, identity));

            if (disposition === undefined) {
                if (identity.startsWith(`${REGISTRY_REGION}/`)) {
                    // Proof 1 reconciles DECLARED surfaces, not every module the closure reaches.
                    // Preserve that distinct null as cut context without promoting it into a
                    // missing-inventory blocker or letting an unrelated surface classify custody.
                    withoutCustody.push(identity)
                } else {
                    // The inventory never claims the Engine-side region, so proof 2 carries that
                    // crossing to its dedicated owner.
                    outOfRegion.push(identity)
                }
            } else if (disposition === 'cloud') {
                topologyFindings.push({
                    class               : PROOF_CLASS.closureReachesCloudModule,
                    identity,
                    detail              : `reached from ${relative(entrypoint)}; registry disposition is cloud`,
                    successorOwner      : 'store-edge severance leaves (#16202 / #17627)',
                    preRelocationBlocker: true
                })
            }

            const facts = collectModuleFacts(readFile(module) ?? '');

            for (const specifier of facts.imports) {
                const bare = normalizeSpecifier(specifier);

                if (cloudPackages.has(bare)) {
                    topologyFindings.push({
                        class               : PROOF_CLASS.closureImportsCloudPackage,
                        identity            : `${identity} → ${bare}`,
                        detail              : 'an Edge-reached module imports a declared Cloud-only package',
                        successorOwner      : 'store-edge severance leaves (#16202 / #17627) + the Edge manifest authority',
                        preRelocationBlocker: true
                    })
                }
            }
        }

        for (const edge of closure.unresolved) {
            // Identity comes from the REGISTRY's own `edgeIdentity()`, never a local format. The
            // ledger this matches against is the inventory's `closure-edge` surface, whose keys are
            // built by that function (`<rel>::<reason>::<specifier|member->callee|member>`); a
            // hand-rolled key cannot match it except by luck, which would leave `ledgeredEdges` a
            // guard doing no work. Emitted shapes vary — `{module, specifier}`, `{module, member}`,
            // `{module}` alone — and that function already discriminates all of them.
            const identity = edgeIdentity(edge, planeRoot);

            observedEdges.add(identity);

            if (!ledgeredEdges.has(identity)) {
                instrumentErrors.push({
                    class : PROOF_CLASS.closureUnresolvedEdge,
                    identity,
                    detail: `${edge.reason}: an unaccounted hole in the graph makes this entrypoint's plane-clean verdict unsound`
                })
            }
        }
    }

    if (withoutCustody.length > 0) {
        const identities = [...new Set(withoutCustody)].sort();

        topologyFindings.push({
            class               : PROOF_CLASS.closureReachedWithoutCustody,
            identity            : `${identities.length} module(s)`,
            detail              : 'reached from an Edge entrypoint with no `script-module` custody row — recorded from reach as cut context, not a proof-1 membership gap',
            identities,
            successorOwner      : 'the AgentOS extraction inventory (#17525 / #17645 lineage)',
            preRelocationBlocker: false
        })
    }

    // The inventory's governed surfaces live in `ai/**`; reached Engine source is a real
    // cross-repository boundary with a separate owner, not a module-membership gap.
    if (outOfRegion.length > 0) {
        const identities = [...new Set(outOfRegion)].sort();

        topologyFindings.push({
            class               : PROOF_CLASS.closureOutOfRegistryRegion,
            identity            : `${identities.length} module(s)`,
            detail              : `reached from an Edge entrypoint but outside the registry's \`${REGISTRY_REGION}/\` region — post-cut these cross a package boundary`,
            identities,
            successorOwner      : 'reconcile out-of-AgentOS consumers (#17631)',
            preRelocationBlocker: true
        })
    }

    return {instrumentErrors, topologyFindings, observedEdges, reachedModules}
}

/**
 * @summary Reconciles the computed-edge population in BOTH directions against the registry.
 *
 * ## Why a count is not a reconciliation
 *
 * The registry's `closure-edge` surface is a ratchet over edges a static walk cannot resolve —
 * dynamic imports, computed callees. The tempting check is "did the number go up", and it is
 * exactly wrong: **a same-count substitution passes it unchanged.** Swap one dynamic import for a
 * different one in the same module and the count is identical while the dispositioned population
 * silently is not the observed one — which is the case this layer exists to catch, and the reason
 * both sets are compared by IDENTITY rather than by size.
 *
 * Both directions are reported, because they are different defects with different repairs:
 *
 * - **addition** — an observed edge the registry never dispositioned. New unresolvable reach
 *   entered the tree without an authority decision.
 * - **authority-without-observation** — the registry claims an edge the walk no longer sees. Either
 *   the edge was genuinely resolved (delete the row) or the walk stopped reaching it (a coverage
 *   regression wearing the shape of progress). The row cannot tell which, so it names both.
 *
 * The second direction is the one a ratchet that "may only ever SHRINK" cannot express: a shrinking
 * count is indistinguishable from a shrinking closure.
 *
 * @param {Object} config
 * ## The stale direction is scoped to the WALKED region, and must be
 *
 * The registry dispositions edges across every plane; this walk visits Edge launch roots only. So
 * "the registry claims an edge I did not observe" is only evidence when the walk actually visited
 * that edge's owning module — otherwise it reports the walk's own population boundary as a registry
 * defect. Unscoped, the live run produced four such findings, every one of them an edge owned by a
 * Cloud or retired entrypoint this layer never opens. A complement is not a measurement.
 *
 * @param {Set}    config.observedEdges  Edge identities the closure walk actually produced.
 * @param {Set}    config.registryEdges  Edge identities the registry dispositions.
 * @param {Set}    config.reachedModules Repo-relative modules the walk actually visited.
 * @returns {{instrumentErrors: Object[], topologyFindings: Object[]}}
 */
export function runComputedEdgeReconciliation({observedEdges, registryEdges, reachedModules = null}) {
    const
        topologyFindings = [],
        // An identity is `<rel>::<reason>::<detail>`; its first segment is the owning module.
        inWalkedRegion   = identity => reachedModules === null || reachedModules.has(identity.split('::')[0]),
        added            = [...observedEdges].filter(identity => !registryEdges.has(identity)).sort(),
        stale            = [...registryEdges]
            .filter(identity => !observedEdges.has(identity) && inWalkedRegion(identity))
            .sort();

    for (const [bucket, proofClass, detail, owner] of [
        [added, PROOF_CLASS.computedEdgeAdded,
            'observed by the closure walk with no registry disposition — unresolvable reach entered the tree without an authority decision',
            'the computed-edge registry'],
        [stale, PROOF_CLASS.computedEdgeStale,
            'dispositioned by the registry but no longer observed — either the edge resolved (delete the row) or the walk stopped reaching it (a coverage regression)',
            'the computed-edge registry']
    ]) {
        for (const identity of bucket) {
            topologyFindings.push({
                class               : proofClass,
                identity,
                detail,
                successorOwner      : owner,
                preRelocationBlocker: true
            })
        }
    }

    return {instrumentErrors: [], topologyFindings}
}

/**
 * @summary Builds the deterministic machine receipt with its two layers kept apart.
 *
 * Sorted by class then identity so byte-identical inputs give byte-identical receipts — a receipt
 * that diffs on ordering noise cannot anchor an Epic gate.
 *
 * @param {Object}   config
 * @param {Object[]} config.instrumentErrors
 * @param {Object[]} config.topologyFindings
 * @param {Object}   [config.meta={}] Population echoes, head SHA, fixture path.
 * @returns {Object} The receipt; `exitCode` is 0 only when both layers are empty.
 */
export function buildReceipt({instrumentErrors, topologyFindings, meta = {}}) {
    // Code-unit comparison, NOT `localeCompare`: AC-7 claims byte-identical receipts, and a
    // locale-sensitive collator makes that a per-machine property — two agents diffing the same
    // receipt could disagree about its ordering.
    const codeUnits           = (a, b) => a < b ? -1 : a > b ? 1 : 0;
    const byClassThenIdentity = (a, b) =>
        a.class === b.class ? codeUnits(a.identity, b.identity) : codeUnits(a.class, b.class);

    const receipt = {
        meta,
        instrumentErrors: [...instrumentErrors].sort(byClassThenIdentity),
        topologyFindings: [...topologyFindings].sort(byClassThenIdentity)
    };

    receipt.exitCode = (receipt.instrumentErrors.length || receipt.topologyFindings.length) ? 1 : 0;

    return receipt
}

/**
 * @summary Human-readable receipt summary; the JSON stays the machine authority.
 * @param {Object} receipt
 * @returns {String}
 */
export function formatReceipt(receipt) {
    const lines = [
        `[plane-boundary-proof] instrument errors: ${receipt.instrumentErrors.length} · topology findings: ${receipt.topologyFindings.length} · exit ${receipt.exitCode}`
    ];

    for (const error of receipt.instrumentErrors) {
        lines.push(`  INSTRUMENT ${error.class} :: ${error.identity}`)
    }

    for (const finding of receipt.topologyFindings) {
        lines.push(`  TOPOLOGY ${finding.class} :: ${finding.identity} → ${finding.successorOwner || 'unowned (invalid)'}`)
    }

    return lines.join('\n')
}

/**
 * @summary Reads the committed Cloud-only package declaration.
 * @param {String} [manifestPath=BRAIN_MANIFEST]
 * @returns {String[]} Sorted package names.
 */
export function readCloudOnlyPackages(manifestPath = BRAIN_MANIFEST) {
    return Object.keys(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).devDependencies || {}).sort()
}

/**
 * @summary CLI: materialize, install both roots independently, run the resolution proof, emit the
 * receipt, clean up.
 *
 * The Edge dependency population is INTERIM-DERIVED from the root `package.json` runtime
 * dependencies until the manifest-authority promotion lands (the receipt's finding names it); the receipt
 * carries that as a named topology finding rather than silence, because an underived population
 * that looks authoritative is the quiet version of the same defect this proof hunts.
 * @private
 */
async function main() {
    const program = new Command();

    program
        .option('--json', 'Emit the machine receipt JSON on stdout.')
        .option('--keep-fixture', 'Skip fixture cleanup, print its path for inspection.')
        .option('--skip-runtime', 'Skip the runtime-denial layer (it spawns one child per eligible entrypoint).')
        .parse(process.argv);

    const
        options      = program.opts(),
        cloudOnly    = readCloudOnlyPackages(),
        rootManifest = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')),
        // The Engine root declares ZERO runtime dependencies (the package ships dependency-free);
        // the monorepo's toolchain lives entirely in devDependencies. The interim Edge population is
        // therefore devDependencies minus the brain tier — deliberately a SUPERSET of the true Edge
        // set (build/test-only packages included), because a superset keeps the denial exact (the
        // Cloud-only three are still absent by declaration) while an undershot population would make
        // resolution greens vacuous. The authoritative split is H1's deliverable.
        edgeDeps      = Object.fromEntries(Object.entries(rootManifest.devDependencies || {})
            .filter(([name]) => !cloudOnly.includes(name))),
        head          = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: PROJECT_ROOT, encoding: 'utf8'}).trim(),
        // Read from git rather than re-splitting the binding error's joined key: that key is a
        // display string, and parsing a display string back into data loses whatever the join
        // ambiguated. Porcelain v1 is 2 status chars + a space, so the path starts at index 3.
        dirtyPaths    = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'],
            {cwd: PROJECT_ROOT, encoding: 'utf8'}).split('\n').filter(Boolean).map(line => line.slice(3)).sort(),
        cloudDeps     = Object.fromEntries(cloudOnly.map(name =>
            [name, JSON.parse(fs.readFileSync(BRAIN_MANIFEST, 'utf8')).devDependencies[name]]));

    const {fixtureRoot, edgeRoot, cloudRoot} = materializeBoundaryFixture({
        baseDir          : os.tmpdir(),
        edgeDependencies : edgeDeps,
        cloudDependencies: cloudDeps
    });

    try {
        for (const root of [edgeRoot, cloudRoot]) {
            execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--silent'], {
                cwd: root, stdio: ['ignore', 'ignore', 'inherit']
            })
        }

        const {instrumentErrors, topologyFindings} = runResolutionProof({edgeRoot, cloudRoot, cloudOnlyPackages: cloudOnly});

        // The static-closure layer consumes H1's reconciled authority rather than re-deriving it.
        // Surface stays in the key: only `script-module` rows classify module custody. Proof 1
        // remains the sole authority for whether each declared surface reconciles against disk;
        // this proof separately records reached modules with no custody row as non-blocking context.
        const
            // `allowDirty` is the inventory's development/test-only opt-in and its JSDoc says the
            // CLI never enables it. It was enabled here, which let the static closure measure a
            // WORKING TREE while the receipt claimed a committed SHA — an Epic-facing evidence
            // artifact nobody could reproduce, with no indicator that anything differed.
            inventory             = buildInventory(),
            bindingError          = inventory.errors.find(error => error.kind === 'dirty-worktree') ?? null,
            dispositionBySurfaceIdentity = new Map(inventory.rows.map(row => [
                rowKey(row.surface, row.identity),
                row.disposition
            ])),
            edgeEntrypoints       = inventory.launchRoots.rows
                .filter(row => row.disposition === 'edge')
                .map(row => path.join(PROJECT_ROOT, row.identity)),
            closure               = runStaticClosureProof({
                entrypoints      : edgeEntrypoints,
                dispositionBySurfaceIdentity,
                cloudOnlyPackages: cloudOnly,
                planeRoot        : PROJECT_ROOT,
                ledgeredEdges    : new Set(inventory.rows.filter(row => row.surface === SURFACE.closureEdge).map(row => row.identity))
            });

        if (bindingError) {
            // Reported rather than thrown, so the proof stays runnable mid-work — but the receipt
            // below refuses to claim the SHA, because a receipt that names a commit is a promise
            // that a reader can check out that commit and reproduce it.
            instrumentErrors.push({
                class   : PROOF_CLASS.dirtyWorktreeBinding,
                identity: 'worktree',
                detail  : `${bindingError.error} — this run measured the working tree, so the receipt carries no SHA`
            })
        }

        instrumentErrors.push(...closure.instrumentErrors);
        topologyFindings.push(...closure.topologyFindings);

        const reconciliation = runComputedEdgeReconciliation({
            observedEdges : closure.observedEdges,
            reachedModules: closure.reachedModules,
            registryEdges : new Set(inventory.rows
                .filter(row => row.surface === SURFACE.closureEdge)
                .map(row => row.identity))
        });

        topologyFindings.push(...reconciliation.topologyFindings);

        if (!options.skipRuntime) {
            // The Cloud control is a Cloud-DISPOSITIONED launch root, taken from the registry rather
            // than named here: a hardcoded control target rots the moment custody changes, and this
            // one has to die for any Edge survival below to mean anything.
            const
                cloudControl = inventory.launchRoots.rows.find(row => row.disposition === 'cloud'),
                denial       = runRuntimeDenialProof({
                    eligibilityRows   : inventory.runtimeProbeEligibility.rows || [],
                    cloudOnlyPackages : cloudOnly,
                    cloudControlTarget: cloudControl?.identity ?? null,
                    projectRoot       : PROJECT_ROOT
                });

            instrumentErrors.push(...denial.instrumentErrors);
            topologyFindings.push(...denial.topologyFindings)
        }

        const receipt = buildReceipt({
            instrumentErrors,
            topologyFindings,
            meta: {
                // `head` is null when the tree was dirty: a consumer keyed on it then fails loud
                // instead of silently mis-attributing the findings to a commit that never produced
                // them. `sourceBinding` carries the whole truth either way.
                head         : bindingError ? null : head,
                sourceBinding: bindingError
                    ? {bound: false, sha: head, dirtyPaths}
                    : {bound: true, sha: head, dirtyPaths: []},
                cloudOnlyPackages: cloudOnly,
                fixtureRoot      : options.keepFixture ? fixtureRoot : '(cleaned)'
            }
        });

        console.log(options.json ? JSON.stringify(receipt, null, 4) : formatReceipt(receipt));
        process.exitCode = receipt.exitCode
    } finally {
        if (!options.keepFixture) fs.rmSync(fixtureRoot, {recursive: true, force: true});
        else console.error(`[plane-boundary-proof] fixture kept at ${fixtureRoot}`)
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    await main()
}
