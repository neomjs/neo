#!/usr/bin/env node

import {execFileSync, spawnSync} from 'node:child_process';
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
    __filename     = fileURLToPath(import.meta.url),
    PROJECT_ROOT   = path.resolve(path.dirname(__filename), '../../..'),
    BRAIN_MANIFEST = path.join(PROJECT_ROOT, 'package.brain.json'),
    PROBE_BASENAME = 'resolve-probe.cjs',

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
    ancestorNodeModules        : 'instrument-ancestor-node-modules',
    cloudControlUnresolved     : 'instrument-cloud-positive-control-unresolved',
    cloudControlWrongRoot      : 'instrument-cloud-positive-control-resolved-via-ancestor',
    closureEntrypointUnreadable: 'instrument-closure-entrypoint-unreadable',
    closureEscapesPlaneRoot    : 'topology-edge-closure-escapes-plane-root',
    closureImportsCloudPackage : 'topology-edge-closure-imports-cloud-package',
    closureReachesCloudModule  : 'topology-edge-closure-reaches-cloud-module',
    closureUnregisteredModule  : 'topology-edge-closure-unregistered-module',
    closureUnresolvedEdge      : 'instrument-closure-unresolved-edge',
    edgePopulationInterim      : 'topology-edge-dependency-population-derived-not-authoritative',
    edgeResolvesCloudPackage   : 'topology-edge-resolves-cloud-package',
    emptyPopulation            : 'instrument-empty-manifest-population',
    probeFailure               : 'instrument-resolution-probe-failure'
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
 * Dispositions come from the reconciled inventory rows, not from re-globbing `custody` here. A
 * module reached from an Edge entrypoint whose registry disposition is Cloud is a topology finding;
 * a module with NO row is `unregistered` — the plane's declared population undershooting its actual
 * reach, which is the quiet half of the same defect.
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
 * @param {Map}      config.dispositionByIdentity Repo-relative identity → registry disposition.
 * @param {String[]} config.cloudOnlyPackages    Declared Cloud-only dependency names.
 * @param {String}   config.planeRoot            Absolute root every Edge module must stay inside.
 * @param {Set}      [config.ledgeredEdges]      Edge identities the registry already dispositions.
 * @param {Function} [config.readFile]           `(absPath) => String|null`; injected for the spec.
 * @param {Function} [config.resolve]            `(specifier, fromFile) => String|null`.
 * @returns {{instrumentErrors: Object[], topologyFindings: Object[]}}
 */
export function runStaticClosureProof({
    entrypoints,
    dispositionByIdentity,
    cloudOnlyPackages,
    planeRoot,
    ledgeredEdges = new Set(),
    readFile      = absPath => { try { return fs.readFileSync(absPath, 'utf8') } catch { return null } },
    resolve       = resolveRelative
}) {
    const
        instrumentErrors = [],
        topologyFindings = [],
        cloudPackages    = new Set(cloudOnlyPackages),
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

            const disposition = dispositionByIdentity.get(identity);

            if (disposition === undefined) {
                topologyFindings.push({
                    class               : PROOF_CLASS.closureUnregisteredModule,
                    identity,
                    detail              : `reached from ${relative(entrypoint)} with no registry row — declared population undershoots actual reach`,
                    successorOwner      : 'the Edge manifest authority (#17645 H1)',
                    preRelocationBlocker: true
                })
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
            // The two emitted shapes carry different fields — `{module, specifier, reason:
            // 'unresolved-specifier'}` and `{module, reason: 'unreadable'}` (no specifier). A key
            // guessed from one shape silently never matches the other, which would leave
            // `ledgeredEdges` as a guard doing no work. Both forms are spelled out.
            const identity = edge.specifier
                ? `${relative(edge.module)} → ${edge.specifier}`
                : `${relative(edge.module)} [${edge.reason}]`;

            if (!ledgeredEdges.has(identity)) {
                instrumentErrors.push({
                    class : PROOF_CLASS.closureUnresolvedEdge,
                    identity,
                    detail: `${edge.reason}: an unaccounted hole in the graph makes this entrypoint's plane-clean verdict unsound`
                })
            }
        }
    }

    return {instrumentErrors, topologyFindings}
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
    const byClassThenIdentity = (a, b) =>
        a.class === b.class ? a.identity.localeCompare(b.identity) : a.class.localeCompare(b.class);

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

        topologyFindings.push({
            class               : PROOF_CLASS.edgePopulationInterim,
            identity            : 'edge dependencies = root devDependencies minus the brain tier',
            detail              : `${Object.keys(edgeDeps).length} packages, a deliberate superset — derived, not authoritative`,
            successorOwner      : '#17533 help-shape H1 (manifest-authority promotion on the #17525 inventory)',
            preRelocationBlocker: true
        });

        const receipt = buildReceipt({
            instrumentErrors,
            topologyFindings,
            meta: {head, cloudOnlyPackages: cloudOnly, fixtureRoot: options.keepFixture ? fixtureRoot : '(cleaned)'}
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
