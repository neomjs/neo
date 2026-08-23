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
    runResolutionProof
} from '../../../../../ai/scripts/diagnostics/agentOsPlaneBoundaryProof.mjs';

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

const FAKE_DRIVER = 'neo-proof-fake-driver';

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
