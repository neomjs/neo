import {test, expect}                from '@playwright/test';
import {mkdtemp, readFile, rm, stat} from 'node:fs/promises';
import os                            from 'node:os';
import path                          from 'node:path';

import {
    appendDeploymentPrescription,
    readDeploymentPrescriptions,
    validateDeploymentPrescriptionLedger
} from '../../../../../../../ai/services/memory-core/helpers/deploymentPrescriptionStore.mjs';

const
    KNOB             = 'container-memory-ceiling',
    LEAF             = 'deploy.chroma.memoryCeilingBytes',
    LIVE_LIMIT_BYTES = 8 * 1024 ** 3,
    VALUE_BYTES      = 12 * 1024 ** 3;

/**
 * @summary Creates one complete semantic prescription; transport fields are deliberately absent.
 * @param {Object} [overrides]
 * @returns {Object}
 */
function semanticPrescription(overrides = {}) {
    return {
        prescriptionId          : 'P:base',
        supersedesPrescriptionId: null,
        diagnosisId             : 'D:base',
        recoveryRunId           : 'R:base',
        targetIdentity          : {kind: 'compose-service', id: 'chroma'},
        knob                    : KNOB,
        values                  : {[LEAF]: VALUE_BYTES},
        validatedAgainst        : {
            context               : {'runtime.chroma.liveMemoryLimitBytes': LIVE_LIMIT_BYTES},
            observationFingerprint: 'obs:100',
            observedAt            : 100
        },
        ...overrides
    }
}

test.describe('deploymentPrescriptionStore — trusted compare-and-append ingress', () => {
    let ledgerPath, tmpDir;

    test.beforeEach(async () => {
        tmpDir     = await mkdtemp(path.join(os.tmpdir(), 'neo-deployment-prescription-store-'));
        ledgerPath = path.join(tmpDir, 'deployment-prescriptions.jsonl')
    });

    test.afterEach(async () => {
        await rm(tmpDir, {recursive: true, force: true})
    });

    /**
     * @summary Reads exact ledger bytes without turning absence into a test failure.
     * @returns {Promise<String>}
     */
    async function ledgerBytes() {
        try {
            return await readFile(ledgerPath, 'utf8')
        } catch (error) {
            if (error?.code === 'ENOENT') return '';
            throw error
        }
    }

    test('first append is registry-valid, sink-stamped, sequenced, and durable', async () => {
        const result = await appendDeploymentPrescription({
            ledgerPath,
            prescription: semanticPrescription(),
            now         : () => 1_234
        });

        expect(result).toEqual({
            appended: true,
            replayed: false,
            record  : expect.objectContaining({
                schemaVersion    : 1,
                recordType       : 'deployment-prescription',
                prescriptionId   : 'P:base',
                sequence         : 1,
                producerPrincipal: 'operator-local',
                prescribedAt     : 1_234
            }),
            reason: null
        });

        const records = await readDeploymentPrescriptions(ledgerPath);

        expect(records).toEqual([result.record]);
        expect(validateDeploymentPrescriptionLedger(records)).toEqual({
            valid      : true,
            recordCount: 1,
            activeCount: 1,
            maxSequence: 1
        });
        expect((await stat(ledgerPath)).size).toBe(Buffer.byteLength(`${JSON.stringify(result.record)}\n`))
    });

    test('the public ledger audit rejects forged sink provenance and schema', async () => {
        const {record} = await appendDeploymentPrescription({
            ledgerPath,
            prescription: semanticPrescription()
        });

        expect(() => validateDeploymentPrescriptionLedger([{...record, producerPrincipal: ''}]))
            .toThrow(/producer principal/);
        expect(() => validateDeploymentPrescriptionLedger([{...record, schemaVersion: 99}]))
            .toThrow(/schema or record type/)
    });

    test('the public ledger audit rejects broken sequence and predecessor continuity', async () => {
        const first = await appendDeploymentPrescription({ledgerPath, prescription: semanticPrescription()});
        const next  = await appendDeploymentPrescription({
            ledgerPath,
            prescription: semanticPrescription({
                prescriptionId          : 'P:next',
                supersedesPrescriptionId: 'P:base',
                values                  : {[LEAF]: 16 * 1024 ** 3},
                validatedAgainst        : {
                    context               : {'runtime.chroma.liveMemoryLimitBytes': LIVE_LIMIT_BYTES},
                    observationFingerprint: 'obs:200',
                    observedAt            : 200
                }
            })
        });

        expect(() => validateDeploymentPrescriptionLedger([first.record, {...next.record, sequence: 1}]))
            .toThrow(/monotonic sequence/);
        expect(() => validateDeploymentPrescriptionLedger([
            first.record,
            {...next.record, supersedesPrescriptionId: 'P:foreign'}
        ])).toThrow(/predecessor CAS/)
    });

    test('caller-forged sink fields and registry-owned transport fields write zero ledger bytes', async () => {
        const forgeries = [
            ['sequence', 99],
            ['producerPrincipal', 'forged'],
            ['prescribedAt', 99],
            ['recordType', 'deployment-prescription'],
            ['schemaVersion', 1],
            ['env', 'NEO_UNRELATED_SECRET']
        ];

        for (const [field, value] of forgeries) {
            const result = await appendDeploymentPrescription({
                ledgerPath,
                prescription: semanticPrescription({[field]: value})
            });

            expect(result.appended, field).toBe(false);
            expect(result.replayed, field).toBe(false);
            expect(result.record, field).toBeNull();
            expect(result.reason, field).toContain(field)
        }

        const wrongTarget = await appendDeploymentPrescription({
            ledgerPath,
            prescription: semanticPrescription({targetIdentity: {kind: 'shell-target', id: 'chroma'}})
        });

        expect(wrongTarget).toMatchObject({appended: false, replayed: false, record: null});
        expect(wrongTarget.reason).toBe('ledger-refused:target-mismatch');
        expect(await ledgerBytes()).toBe('')
    });

    test('an exact semantic replay is idempotent even when object key order changes', async () => {
        const original = semanticPrescription();
        const first    = await appendDeploymentPrescription({ledgerPath, prescription: original, now: () => 1_000});
        const before   = await ledgerBytes();
        const replay   = await appendDeploymentPrescription({
            ledgerPath,
            producerPrincipal: 'operator-second-seat',
            now              : () => 9_999,
            prescription     : {
                values          : {[LEAF]: VALUE_BYTES},
                validatedAgainst: {
                    observedAt            : 100,
                    observationFingerprint: 'obs:100',
                    context               : {'runtime.chroma.liveMemoryLimitBytes': LIVE_LIMIT_BYTES}
                },
                targetIdentity          : {id: 'chroma', kind: 'compose-service'},
                supersedesPrescriptionId: null,
                recoveryRunId           : 'R:base',
                prescriptionId          : 'P:base',
                knob                    : KNOB,
                diagnosisId             : 'D:base'
            }
        });

        expect(replay).toEqual({appended: false, replayed: true, record: first.record, reason: null});
        expect(await ledgerBytes()).toBe(before)
    });

    test('the same prescriptionId with a different semantic payload refuses without writing', async () => {
        await appendDeploymentPrescription({ledgerPath, prescription: semanticPrescription()});

        const before = await ledgerBytes();
        const result = await appendDeploymentPrescription({
            ledgerPath,
            prescription: semanticPrescription({values: {[LEAF]: 16 * 1024 ** 3}})
        });

        expect(result).toEqual({
            appended: false,
            replayed: false,
            record  : null,
            reason  : 'prescription-id-conflict'
        });
        expect(await ledgerBytes()).toBe(before)
    });

    test('compare-and-append requires the active predecessor, including on a first append', async () => {
        const premature = await appendDeploymentPrescription({
            ledgerPath,
            prescription: semanticPrescription({supersedesPrescriptionId: 'P:not-there'})
        });

        expect(premature.reason).toBe('predecessor-mismatch');
        expect(await ledgerBytes()).toBe('');

        const first  = await appendDeploymentPrescription({ledgerPath, prescription: semanticPrescription()});
        const before = await ledgerBytes();
        const stale  = await appendDeploymentPrescription({
            ledgerPath,
            prescription: semanticPrescription({
                prescriptionId          : 'P:next',
                supersedesPrescriptionId: 'P:wrong',
                validatedAgainst        : {
                    context               : {'runtime.chroma.liveMemoryLimitBytes': LIVE_LIMIT_BYTES},
                    observationFingerprint: 'obs:200',
                    observedAt            : 200
                }
            })
        });

        expect(first.appended).toBe(true);
        expect(stale.reason).toBe('predecessor-mismatch');
        expect(await ledgerBytes()).toBe(before)
    });

    test('a lower validation watermark cannot complete after a newer active prescription', async () => {
        await appendDeploymentPrescription({
            ledgerPath,
            prescription: semanticPrescription({
                validatedAgainst: {
                    context               : {'runtime.chroma.liveMemoryLimitBytes': LIVE_LIMIT_BYTES},
                    observationFingerprint: 'obs:200',
                    observedAt            : 200
                }
            })
        });

        const before = await ledgerBytes();
        const result = await appendDeploymentPrescription({
            ledgerPath,
            prescription: semanticPrescription({
                prescriptionId          : 'P:stale',
                supersedesPrescriptionId: 'P:base',
                validatedAgainst        : {
                    context               : {'runtime.chroma.liveMemoryLimitBytes': LIVE_LIMIT_BYTES},
                    observationFingerprint: 'obs:100',
                    observedAt            : 100
                }
            })
        });

        expect(result.reason).toBe('stale-observation-watermark');
        expect(await ledgerBytes()).toBe(before)
    });

    test('the sink assigns one global monotonic sequence across valid successors', async () => {
        const first = await appendDeploymentPrescription({ledgerPath, prescription: semanticPrescription()});
        const next  = await appendDeploymentPrescription({
            ledgerPath,
            prescription: semanticPrescription({
                prescriptionId          : 'P:next',
                supersedesPrescriptionId: 'P:base',
                values                  : {[LEAF]: 16 * 1024 ** 3},
                validatedAgainst        : {
                    context               : {'runtime.chroma.liveMemoryLimitBytes': LIVE_LIMIT_BYTES},
                    observationFingerprint: 'obs:200',
                    observedAt            : 200
                }
            })
        });

        expect(first.record.sequence).toBe(1);
        expect(next.record.sequence).toBe(2);
        expect((await readDeploymentPrescriptions(ledgerPath)).map(record => record.sequence)).toEqual([1, 2])
    });

    test('a concurrent first-append pair cannot both pass the same CAS read', async () => {
        const [a, b] = await Promise.all([
            appendDeploymentPrescription({
                ledgerPath,
                prescription: semanticPrescription({prescriptionId: 'P:a'})
            }),
            appendDeploymentPrescription({
                ledgerPath,
                prescription: semanticPrescription({prescriptionId: 'P:b'})
            })
        ]);

        expect([a, b].filter(result => result.appended)).toHaveLength(1);
        expect([a, b].filter(result => result.reason === 'predecessor-mismatch')).toHaveLength(1);

        const records = await readDeploymentPrescriptions(ledgerPath);

        expect(records).toHaveLength(1);
        expect(records[0].sequence).toBe(1)
    });
});
