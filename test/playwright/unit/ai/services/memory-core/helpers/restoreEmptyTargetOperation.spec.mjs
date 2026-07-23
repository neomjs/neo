import fs   from 'fs/promises';
import os   from 'os';
import path from 'path';

import {test, expect} from '@playwright/test';

import {createRestoreEmptyTargetOperation} from '../../../../../../../ai/services/memory-core/helpers/restoreEmptyTargetOperation.mjs';
import {
    appendRestoreTargetSetTransition,
    readRestoreTargetSetTransitions
} from '../../../../../../../ai/services/memory-core/helpers/restoreTargetSetStateStore.mjs';
import {
    createRestoreTargetSetDescriptor,
    deriveRestoreTargetSetIdentity
} from '../../../../../../../ai/services/memory-core/helpers/restoreTargetSetContract.mjs';

const TARGET_SET = createRestoreTargetSetDescriptor({
    memoriesCollection            : 'neo-agent-memory',
    summariesCollection           : 'neo-agent-sessions',
    graphDestination              : '/data/graph.sqlite',
    bundleManifestFingerprint     : `sha256:${'a'.repeat(64)}`,
    admissionDescriptorFingerprint: `sha256:${'b'.repeat(64)}`
});
const IDENTITY = deriveRestoreTargetSetIdentity(TARGET_SET);

test.describe('restoreEmptyTargetOperation', () => {
    let dir;

    test.beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-restore-empty-target-operation-'));
    });

    test.afterEach(async () => {
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('holds one writer fence across proof, staging, ordered promotion, validation, and commit', async () => {
        const
            events    = [],
            clock     = createClock(),
            operation = createOperation({
                clock,
                onFence(active) {
                    events.push(active ? 'fence:acquired' : 'fence:released')
                },
                inspectFreshTargetSet: async () => {
                    events.push('proof');
                    return {
                        fresh                         : true,
                        destinationTopologyFingerprint: TARGET_SET.destinationTopologyFingerprint
                    }
                },
                stageTargetSet: async () => {
                    events.push('stage');
                    return {id: 'staging'}
                },
                validateStagedTargetSet: async () => {
                    events.push('validate-staged');
                    return {valid: true, componentFingerprints: {memories: 'm', summaries: 's', graph: 'g'}}
                },
                promoteComponent: async ({role}) => {
                    events.push(`promote:${role}`);
                    return {fingerprint: role, count: 1}
                },
                revalidateProductionTargetSet: async () => {
                    events.push('revalidate-production');
                    return {valid: true, componentFingerprints: {memories: 'm', summaries: 's', graph: 'g'}}
                }
            });

        const outcome = await operation({
            targetSet: TARGET_SET,
            ...IDENTITY
        });

        expect(events).toEqual([
            'fence:acquired',
            'proof',
            'stage',
            'validate-staged',
            'promote:memories',
            'promote:summaries',
            'promote:graph',
            'revalidate-production',
            'fence:released'
        ]);
        expect(outcome).toMatchObject({
            status: 'committed',
            detail: {
                terminal       : 'committed',
                serviceEligible: true
            }
        });

        expect((await readLedger()).map(item => item.state)).toEqual([
            'admitted',
            'fenced',
            'staged',
            'promoted:memories',
            'promoted:summaries',
            'promoted:graph',
            'validated',
            'committed'
        ]);
    });

    test('under-fence drift settles deferred-target-not-empty with zero staging or promotion', async () => {
        let staged   = false,
            promoted = false;

        const operation = createOperation({
            inspectFreshTargetSet: async () => ({
                fresh                         : false,
                reason                        : 'memories count is 1',
                destinationTopologyFingerprint: TARGET_SET.destinationTopologyFingerprint
            }),
            stageTargetSet: async () => {
                staged = true
            },
            promoteComponent: async () => {
                promoted = true
            }
        });

        const outcome = await operation({targetSet: TARGET_SET, ...IDENTITY});

        expect(outcome).toMatchObject({
            status: 'deferred-target-not-empty',
            detail: {serviceEligible: false}
        });
        expect(staged).toBe(false);
        expect(promoted).toBe(false);
        expect((await readLedger()).map(item => item.state)).toEqual([
            'admitted',
            'fenced',
            'deferred-target-not-empty'
        ]);
    });

    for (const resumeState of ['staged', 'promoted:memories', 'promoted:summaries', 'promoted:graph', 'validated']) {
        test(`reconciles and resumes the same attempt from ${resumeState}`, async () => {
            await seedLedgerThrough(resumeState);

            const promoted  = [];
            const operation = createOperation({
                reconcileAttempt: async ({transitions}) => ({
                    safe         : true,
                    staging      : {id: 'recovered-staging'},
                    observedState: transitions.at(-1).state
                }),
                promoteComponent: async ({role}) => {
                    promoted.push(role);
                    return {fingerprint: role, count: 1}
                }
            });

            const outcome = await operation({targetSet: TARGET_SET, ...IDENTITY});

            expect(outcome.status).toBe('committed');

            const alreadyPromotedCount = {
                staged              : 0,
                'promoted:memories' : 1,
                'promoted:summaries': 2,
                'promoted:graph'    : 3,
                validated           : 3
            }[resumeState];
            expect(promoted).toEqual(['memories', 'summaries', 'graph'].slice(alreadyPromotedCount));
        });
    }

    test('an observed component ahead of the strict ledger settles failed-contained instead of inferring a transition', async () => {
        await seedLedgerThrough('staged');

        const operation = createOperation({
            reconcileAttempt: async () => ({
                safe         : false,
                observedState: 'promoted:memories',
                reason       : 'live memories changed but promoted:memories was never appended'
            })
        });

        const outcome = await operation({targetSet: TARGET_SET, ...IDENTITY});

        expect(outcome).toMatchObject({
            status: 'failed-contained',
            detail: {serviceEligible: false}
        });
        expect((await readLedger()).at(-1).state).toBe('failed-contained');
    });

    for (const failedState of [
        'admitted',
        'fenced',
        'staged',
        'promoted:memories',
        'promoted:summaries',
        'promoted:graph',
        'validated',
        'committed'
    ]) {
        test(`transition write failure at ${failedState} never opens eligibility`, async () => {
            const operation = createOperation({
                appendTransition: async input => {
                    if (input.state === failedState) {
                        throw new Error(`append failed at ${failedState}`)
                    }
                    return appendRestoreTargetSetTransition(input, {dir})
                }
            });

            await expect(operation({targetSet: TARGET_SET, ...IDENTITY}))
                .rejects.toThrow(`append failed at ${failedState}`);

            const transitions = await readLedger();
            expect(transitions.at(-1)?.state).not.toBe('committed');
        });
    }

    async function seedLedgerThrough(lastState) {
        const states = [
            'admitted',
            'fenced',
            'staged',
            'promoted:memories',
            'promoted:summaries',
            'promoted:graph',
            'validated'
        ];

        for (const [index, state] of states.entries()) {
            await appendRestoreTargetSetTransition({
                ...IDENTITY,
                state,
                at     : 100 + index,
                details: {}
            }, {dir});

            if (state === lastState) {
                return
            }
        }
    }

    function createOperation(overrides = {}) {
        let fenceActive = false;

        const base = {
            clock          : createClock(),
            withWriterFence: async (identity, task) => {
                expect(identity).toEqual({
                    recoveryUnitKey   : IDENTITY.recoveryUnitKey,
                    attemptFingerprint: IDENTITY.attemptFingerprint
                });
                expect(fenceActive).toBe(false);
                fenceActive = true;
                overrides.onFence?.(true);
                try {
                    return await task()
                } finally {
                    overrides.onFence?.(false);
                    fenceActive = false
                }
            },
            inspectFreshTargetSet: async () => ({
                fresh                         : true,
                destinationTopologyFingerprint: TARGET_SET.destinationTopologyFingerprint
            }),
            stageTargetSet         : async () => ({id: 'staging'}),
            validateStagedTargetSet: async () => ({
                valid                : true,
                componentFingerprints: {memories: 'm', summaries: 's', graph: 'g'}
            }),
            promoteComponent             : async ({role}) => ({fingerprint: role, count: 1}),
            revalidateProductionTargetSet: async () => ({
                valid                : true,
                componentFingerprints: {memories: 'm', summaries: 's', graph: 'g'}
            }),
            reconcileAttempt        : async () => ({safe: true, staging: {id: 'staging'}}),
            cleanupUnpromotedStaging: async () => {},
            readTransitions         : async ({attemptFingerprint}) => readRestoreTargetSetTransitions({
                dir,
                attemptFingerprint
            }),
            appendTransition: async input => appendRestoreTargetSetTransition(input, {dir})
        };

        return createRestoreEmptyTargetOperation({...base, ...overrides})
    }

    function readLedger() {
        return readRestoreTargetSetTransitions({
            dir,
            attemptFingerprint: IDENTITY.attemptFingerprint
        })
    }
});

function createClock() {
    let now = 1_000;
    return () => now++
}
