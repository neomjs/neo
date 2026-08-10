import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import {execFileSync} from 'node:child_process';

import {
    admitLedgerPrescriptions,
    LEDGER_REFUSALS,
    refuseLedgerRecord
} from '../../../../../../../ai/services/memory-core/helpers/deploymentPrescriptionLedger.mjs';
import {renderPrescribedEnvironment} from '../../../../../../../ai/services/memory-core/helpers/deploymentPrescriptionEnvironment.mjs';

/**
 * The three obligations were declared on the ticket BEFORE this file was written, so a green here means
 * the thing that was asked for rather than whatever these tests happen to cover:
 *
 * 1. **Effect witness** — a ledger record changes what Compose CREATES the container with. Asserting
 *    that a record was admitted would have passed against the original `reconfigure` no-op throughout.
 * 2. **Counterfactual** — a record carrying a FORGED `env` field renders only the registry-derived key.
 *    Without this arm the security boundary is a claim in a docblock.
 * 3. **Ordering** — `sequence` decides supersession and `prescribedAt` does not, asserted with a record
 *    whose clock is newer and whose watermark is older.
 *
 * `docker compose config` resolves interpolation with no reachable daemon, so the effect boundary is
 * testable here. It runs against the REAL `ai/deploy/docker-compose.yml` via `--env-file` pointing at a
 * temp file: a hand-written compose fixture could be looser than production and pass on an expression
 * production does not use, and writing the real `ai/deploy/.env` would leave a window in which a peer's
 * recreate picks up a test value.
 */

const
    COMPOSE_RELATIVE = 'ai/deploy/docker-compose.yml',
    KNOB             = 'container-memory-ceiling',
    LEAF             = 'deploy.chroma.memoryCeilingBytes',
    ENV_KEY          = 'NEO_CHROMA_MEMORY_LIMIT',
    // Shaped from the LIVE target, not invented: the registry bounds this leaf to 8..16 GiB and the
    // `raise-not-lower` invariant requires a value strictly above the container's live limit. 12 GiB
    // clears both, and is not a default anywhere in the tree — so a pass cannot come from the baseline.
    LIVE_LIMIT_BYTES = 8 * 1024 ** 3,
    PROBE_BYTES      = 12 * 1024 ** 3;

/**
 * A record that is admissible on purpose, so each negative test can name the ONE field it breaks.
 * @param {Object} [overrides]
 * @returns {Object}
 */
function prescriptionRecord(overrides = {}) {
    return {
        recordType      : 'deployment-prescription',
        prescriptionId  : 'PRESCRIPTION:base',
        sequence        : 1,
        knob            : KNOB,
        targetIdentity  : {kind: 'compose-service', id: 'chroma'},
        values          : {[LEAF]: PROBE_BYTES},
        prescribedAt    : 1_000,
        validatedAgainst: {
            context: {'runtime.chroma.liveMemoryLimitBytes': LIVE_LIMIT_BYTES}
        },
        ...overrides
    }
}

/**
 * @returns {Boolean} whether `docker compose config` can run here
 */
function composeConfigAvailable() {
    try {
        execFileSync('docker', ['compose', 'version'], {stdio: 'ignore'});
        return true
    } catch {
        return false
    }
}

/**
 * Resolves chroma's memory limit exactly as Compose would create it.
 * @param {String} repoRoot
 * @param {String|null} envFilePath
 * @returns {String|null}
 */
function resolvedChromaMemory(repoRoot, envFilePath) {
    const args = ['compose', '-f', path.join(repoRoot, COMPOSE_RELATIVE)];

    envFilePath && args.push('--env-file', envFilePath);
    args.push('config', '--format', 'json');

    try {
        const parsed = JSON.parse(execFileSync('docker', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}));

        return parsed?.services?.chroma?.deploy?.resources?.limits?.memory ?? null
    } catch {
        return null
    }
}

test.describe('the ledger admits against the registry, not against the record', () => {
    test('a well-formed record is admitted and its env key comes from the REGISTRY', () => {
        const {prescriptions, admitted, refused} = admitLedgerPrescriptions([prescriptionRecord()]);

        expect(refused).toEqual([]);
        expect(admitted).toHaveLength(1);
        expect(prescriptions).toEqual([{key: ENV_KEY, value: PROBE_BYTES}])
    });

    test('OBLIGATION 2 — a forged `env` field renders NOTHING of its own', () => {
        const {prescriptions} = admitLedgerPrescriptions([
            prescriptionRecord({env: 'NEO_ORCHESTRATOR_HEAP_MB', leafPath: 'deploy.orchestrator.heapMb'})
        ]);

        // The forged key is absent and the registry key is present — both halves matter. Asserting only
        // that the registry key appears would pass while the forged one was ALSO written.
        expect(prescriptions.map(entry => entry.key)).toEqual([ENV_KEY]);
        expect(renderPrescribedEnvironment(prescriptions).content).not.toContain('NEO_ORCHESTRATOR_HEAP_MB')
    });

    test('a record aiming a knob at a service the registry does not give it is refused', () => {
        const refusal = refuseLedgerRecord(prescriptionRecord({targetIdentity: {kind: 'compose-service', id: 'kb-server'}}));

        expect(refusal?.reason).toBe(LEDGER_REFUSALS.targetMismatch)
    });

    test('an unknown knob is refused rather than rendered', () => {
        expect(refuseLedgerRecord(prescriptionRecord({knob: 'not-a-knob'}))?.reason).toBe(LEDGER_REFUSALS.unknownKnob)
    });

    test('the producer\'s validation is re-run, not trusted — an out-of-bounds value is refused', () => {
        const refusal = refuseLedgerRecord(prescriptionRecord({values: {[LEAF]: 64 * 1024 ** 3}}));

        expect(refusal?.reason).toBe(LEDGER_REFUSALS.invalidTransaction);
        expect(refusal.detail.join(' ')).toContain(LEAF)
    });

    test('a record whose context no longer bounds it is refused, not skipped', () => {
        const refusal = refuseLedgerRecord(prescriptionRecord({validatedAgainst: {context: {}}}));

        expect(refusal?.reason).toBe(LEDGER_REFUSALS.invalidTransaction);
        expect(refusal.detail.join(' ')).toContain('runtime.chroma.liveMemoryLimitBytes')
    });

    test('raise-not-lower is enforced HERE — a value at the live limit is refused', () => {
        const refusal = refuseLedgerRecord(prescriptionRecord({values: {[LEAF]: LIVE_LIMIT_BYTES}}));

        expect(refusal?.reason).toBe(LEDGER_REFUSALS.invalidTransaction)
    });
});

test.describe('OBLIGATION 3 — sequence orders supersession; prescribedAt does not', () => {
    test('a higher sequence supersedes, whatever order the records are read in', () => {
        const records = [
            prescriptionRecord({prescriptionId: 'P:old', sequence: 1, values: {[LEAF]: 10 * 1024 ** 3}}),
            prescriptionRecord({prescriptionId: 'P:new', sequence: 2, values: {[LEAF]: PROBE_BYTES}})
        ];

        expect(admitLedgerPrescriptions(records).prescriptions).toEqual([{key: ENV_KEY, value: PROBE_BYTES}]);
        // Reversed read order must not change the outcome, or arrival order is the real authority.
        expect(admitLedgerPrescriptions([...records].reverse()).prescriptions).toEqual([{key: ENV_KEY, value: PROBE_BYTES}])
    });

    test('a NEWER prescribedAt with an OLDER sequence loses — the clock is not the authority', () => {
        const {prescriptions, refused} = admitLedgerPrescriptions([
            prescriptionRecord({prescriptionId: 'P:winner', sequence: 9, prescribedAt: 1, values: {[LEAF]: PROBE_BYTES}}),
            prescriptionRecord({prescriptionId: 'P:latecomer', sequence: 2, prescribedAt: 9_999_999, values: {[LEAF]: 16 * 1024 ** 3}})
        ]);

        expect(prescriptions).toEqual([{key: ENV_KEY, value: PROBE_BYTES}]);
        expect(refused[0]?.reason).toBe(LEDGER_REFUSALS.conflictingSequence)
    });

    // This test previously asserted `refused.length === 1` and a substring of the refusal message, and
    // it PASSED against an implementation that rendered 10 GiB in one input order and 12 GiB in the
    // other. A refusal assertion is not an outcome assertion: "something was rejected" says nothing
    // about which value is live. @neo-gpt's counterexample terminated that revision.
    //
    // So the assertion is now the SURVIVING value, under BOTH orders. A single-order test of an
    // order-sensitivity property is structurally blind.
    test('one watermark holding two different payloads renders NOTHING, in either order', () => {
        const
            a        = prescriptionRecord({prescriptionId: 'P:a', sequence: 5, values: {[LEAF]: 10 * 1024 ** 3}}),
            b        = prescriptionRecord({prescriptionId: 'P:b', sequence: 5, values: {[LEAF]: PROBE_BYTES}}),
            forward  = admitLedgerPrescriptions([a, b]),
            backward = admitLedgerPrescriptions([b, a]);

        // Fail closed on the WHOLE competition: refusing only the newcomer kept the incumbent, and the
        // incumbent is whichever record was read first — so the env variable took its value from input
        // order. Not materializing it at all is the honest state until the ledger is repaired.
        expect(forward.prescriptions,  'forward order renders no value').toEqual([]);
        expect(backward.prescriptions, 'reverse order renders no value').toEqual([]);
        expect(forward.admitted).toEqual([]);
        expect(backward.admitted).toEqual([]);
        // Both records are reported, so a caller can see WHY the key is missing rather than inferring it.
        expect(forward.refused.length).toBe(2);
        expect(backward.refused.length).toBe(2)
    });

    test('an undeclared target KIND cannot mint a second competition for the same env key', () => {
        const
            declared   = prescriptionRecord({prescriptionId: 'P:declared', values: {[LEAF]: 10 * 1024 ** 3}}),
            undeclared = prescriptionRecord({
                prescriptionId: 'P:undeclared',
                targetIdentity: {kind: 'not-a-declared-kind', id: 'chroma'},
                values        : {[LEAF]: 16 * 1024 ** 3}
            });

        // `competitionKey()` includes `kind`, so an unvalidated kind opened a SECOND competition for one
        // env variable and the renderer picked by array position — order-dependent again, one field over.
        expect(refuseLedgerRecord(undeclared)?.reason).toBe(LEDGER_REFUSALS.targetMismatch);

        for (const order of [[declared, undeclared], [undeclared, declared]]) {
            const {prescriptions} = admitLedgerPrescriptions(order);

            expect(prescriptions, 'exactly one entry per env key, whatever the order').toEqual([
                {key: ENV_KEY, value: 10 * 1024 ** 3}
            ])
        }
    });

    test('an unordered record cannot be folded at all', () => {
        expect(refuseLedgerRecord(prescriptionRecord({sequence: undefined}))?.reason).toBe(LEDGER_REFUSALS.unorderable);
        expect(refuseLedgerRecord(prescriptionRecord({sequence: 1.5}))?.reason).toBe(LEDGER_REFUSALS.unorderable)
    });
});

test.describe('OBLIGATION 1 — the effect witness', () => {
    test('a ledger record changes what Compose CREATES the container with', () => {
        test.skip(!composeConfigAvailable(), 'docker compose CLI unavailable');

        const
            repoRoot = process.cwd(),
            envPath  = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'neo-prescription-')), 'prescribed.env'),
            baseline = resolvedChromaMemory(repoRoot, null);

        // The control: without the prescription the field resolves to the compose default. A witness
        // whose baseline already equals the probe proves nothing about delivery.
        expect(baseline, 'the compose default resolves before any prescription').not.toBe(String(PROBE_BYTES));

        const {prescriptions} = admitLedgerPrescriptions([prescriptionRecord()]),
              {content}       = renderPrescribedEnvironment(prescriptions);

        fs.writeFileSync(envPath, content);

        expect(resolvedChromaMemory(repoRoot, envPath), 'the ledger record reaches the created container')
            .toBe(String(PROBE_BYTES))
    });

    test('a REFUSED record reaches nothing — the same file renders the default', () => {
        test.skip(!composeConfigAvailable(), 'docker compose CLI unavailable');

        const
            repoRoot = process.cwd(),
            envPath  = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'neo-prescription-')), 'prescribed.env'),
            // Same value, same knob, aimed at a service the registry does not give this knob.
            {prescriptions} = admitLedgerPrescriptions([
                prescriptionRecord({targetIdentity: {kind: 'compose-service', id: 'kb-server'}})
            ]);

        expect(prescriptions).toEqual([]);

        fs.writeFileSync(envPath, renderPrescribedEnvironment(prescriptions).content);

        // The negative arm of the SAME instrument that showed delivery, so a pass above cannot be an
        // artifact of the harness resolving the probe value by some other route.
        expect(resolvedChromaMemory(repoRoot, envPath)).toBe(resolvedChromaMemory(repoRoot, null))
    });
});
