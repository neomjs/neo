import {test, expect}                   from '@playwright/test';
import {existsSync, readdirSync}        from 'fs';
import {mkdtemp, readdir, rm, readFile} from 'fs/promises';
import os                               from 'os';
import path                             from 'path';

import Neo       from '../../../../../../../src/Neo.mjs';
import * as core from '../../../../../../../src/core/_export.mjs';
import {
    RecoveryActuatorService,
    isRecoveryActuatorTargetBlocked,
    normalizeRecoveryActuatorTargets
} from '../../../../../../../ai/daemons/orchestrator/services/RecoveryActuatorService.mjs';
import {
    createRecoveryDiagnosisEvent,
    createRecoveryTargetIdentity
} from '../../../../../../../ai/services/memory-core/helpers/recoveryRunStateStore.mjs';
import {RECOVERY_OVERRIDE_FILENAME} from '../../../../../../../ai/services/memory-core/helpers/recoveryOverrideStore.mjs';
import {readHealLedger}             from '../../../../../../../ai/services/memory-core/helpers/healEventLedgerStore.mjs';

const DEFAULT_RUNTIME_ACCESS_CONFIG = {
    allowedServices: ['chroma', 'kb-server', 'mc-server', 'local-model']
};

test.describe('Neo.ai.daemons.services.RecoveryActuatorService', () => {
    let tmpDir;

    test.beforeEach(async () => {
        tmpDir = await mkdtemp(path.join(os.tmpdir(), 'neo-recovery-actuator-'));
    });

    test.afterEach(async () => {
        await rm(tmpDir, {recursive: true, force: true});
    });

    function createService(overrides = {}) {
        const runtimeCalls                 = [],
              supervisorCalls              = [],
              providerResidencyRepairCalls = [],
              taskOutcomes                 = [],
              actuatorConfig               = {
                  enabled                    : true,
                  blockedSupervisedTasks     : [],
                  blockedComposeServices     : [],
                  blockedDeployTargets       : [],
                  healAttemptsPath           : path.join(tmpDir, 'heal-attempts.json'),
                  recoveryRunStateDir        : path.join(tmpDir, 'recovery-runs'),
                  recoveryRunRetentionLimit  : 100,
                  baseBackoffMs              : 0,
                  maxBackoffMs               : 0,
                  maxAttemptsPerWindow       : 2,
                  maxAttemptsWindowMs        : 60_000,
                  verifyCooldownMs           : 5_000,
                  healthyObservationThreshold: 1,
                  ...overrides.actuatorConfig
              },
              service = Neo.create(RecoveryActuatorService, {
                  actuatorConfig,
                  dataDir            : tmpDir,
                  recoveryOverrideDir: path.join(tmpDir, 'deployment-state'),
                  healthService      : {
                      recordTaskOutcome(taskName, status, details) {
                          taskOutcomes.push({taskName, status, details});
                      }
                  },
                  deploymentRuntimeAccessService: {
                      runtimeAccessConfig: DEFAULT_RUNTIME_ACCESS_CONFIG,
                      async applyLifecycle(options) {
                          runtimeCalls.push(options);

                          return {
                              ok        : true,
                              statusCode: 204,
                              proof     : {
                                  capabilityEnvelope: 'lifecycle-write',
                                  operation         : options.operation,
                                  serviceKey        : options.serviceKey,
                                  targetIdentity    : {kind: 'compose-service', id: options.serviceKey}
                              }
                          };
                      },
                      ...overrides.deploymentRuntimeAccessService
                  },
                  processSupervisorService: {
                      taskDefinitions: {
                          chroma: {label: 'chroma daemon'},
                          ollama: {label: 'ollama server'}
                      },
                      killTask(taskName, reason) {
                          supervisorCalls.push({taskName, reason});
                      },
                      ...overrides.processSupervisorService
                  },
                  async providerResidencyRepair(options) {
                      providerResidencyRepairCalls.push(options);
                      return {
                          ready       : true,
                          provider    : 'ollama',
                          warmedModels: [{model: 'gemma4:26b', role: 'chat'}]
                      };
                  },
                  writeLog: () => {},
                  ...overrides.serviceConfig
              });

        return {service, runtimeCalls, supervisorCalls, providerResidencyRepairCalls, taskOutcomes, actuatorConfig};
    }

    async function readAttempts() {
        return JSON.parse(await readFile(path.join(tmpDir, 'heal-attempts.json'), 'utf8'));
    }

    function createScratchSensitiveAuthorityOracle(overrideDir) {
        return () => {
            try {
                return !readdirSync(overrideDir).some(fileName =>
                    fileName.startsWith(`${RECOVERY_OVERRIDE_FILENAME}.`) && fileName.endsWith('.tmp')
                );
            } catch (error) {
                if (error?.code === 'ENOENT') return true;
                throw error;
            }
        };
    }

    function backupEscalationDiagnosis(overrides = {}) {
        return createRecoveryDiagnosisEvent({
            diagnosisId   : 'backup-failed-1',
            recoveryClass : 'ambiguous',
            confidence    : 1,
            targetIdentity: createRecoveryTargetIdentity({kind: 'supervised-task', id: 'backup'}),
            evidenceFacts : [{type: 'task-failure', taskName: 'backup'}],
            observedAt    : 500_000,
            source        : 'process-supervisor-task-outcome',
            details       : {
                actionClass: 'record',
                reasonCode : 'maintenance-task-failure'
            },
            ...overrides
        });
    }

    test('normalizes string and object recovery target entries', () => {
        expect(normalizeRecoveryActuatorTargets([
            'memory-core',
            {serviceKey: 'model', taskName: 'ollama'},
            {serviceKey: 'kb', composeService: 'knowledge-base'},
            {id: 'local-model'}
        ], 'compose-service')).toEqual([
            {kind: 'compose-service', serviceKey: 'memory-core', id: 'memory-core'},
            {kind: 'compose-service', serviceKey: 'model', id: 'ollama', taskName: 'ollama'},
            {kind: 'compose-service', serviceKey: 'kb', id: 'knowledge-base', composeService: 'knowledge-base'},
            {kind: 'compose-service', serviceKey: 'local-model', id: 'local-model'}
        ]);
    });

    test('rejects malformed recovery target collections', () => {
        expect(() => normalizeRecoveryActuatorTargets(null, 'compose-service')).toThrow(
            'Recovery actuator compose-service targets must be an array.'
        );
    });

    test('matches blocklist entries by serviceKey or target id', () => {
        expect(isRecoveryActuatorTargetBlocked(
            {kind: 'compose-service', serviceKey: 'model', id: 'local-model'},
            normalizeRecoveryActuatorTargets(['local-model'], 'compose-service')
        )).toBe(true);
        expect(isRecoveryActuatorTargetBlocked(
            {kind: 'compose-service', serviceKey: 'model', id: 'local-model'},
            normalizeRecoveryActuatorTargets(['other-service'], 'compose-service')
        )).toBe(false);
    });

    test('restart recycles a known supervised task through the B0 supervisor envelope', async () => {
        const {service, runtimeCalls, supervisorCalls, taskOutcomes} = createService();

        const result = await service.apply('ollama', 'restart', {
            now           : 15_000,
            reason        : 'provider-resident-not-serving',
            targetIdentity: {kind: 'supervised-task', id: 'ollama'}
        });

        expect(result.status).toBe('actioned');
        expect(result.targetIdentity).toEqual({kind: 'supervised-task', id: 'ollama'});
        expect(result.reobserveRequest).toMatchObject({
            recoveryClass : 'crash',
            targetIdentity: {kind: 'supervised-task', id: 'ollama'}
        });
        expect(result.supervisor).toMatchObject({
            capabilityEnvelope: 'supervised-task-recycle',
            operation         : 'restart',
            taskName          : 'ollama'
        });
        expect(supervisorCalls).toEqual([{
            taskName: 'ollama',
            reason  : 'provider-resident-not-serving'
        }]);
        expect(runtimeCalls).toEqual([]);
        expect(taskOutcomes).toContainEqual(expect.objectContaining({
            taskName: 'recovery-actuator:ollama',
            status  : 'completed',
            details : expect.objectContaining({
                status      : 'actioned',
                ledgerStatus: 'reobserve-requested'
            })
        }));
    });

    test('restart applies to a known compose service and writes health plus recovery ledger traces', async () => {
        const {service, runtimeCalls, taskOutcomes} = createService();

        const result = await service.apply('mc-server', 'restart', {now: 10_000});

        expect(result.status).toBe('actioned');
        expect(result.reobserveRequest).toMatchObject({
            recoveryClass : 'crash',
            targetIdentity: {kind: 'compose-service', id: 'mc-server'},
            cooldownMs    : 5_000
        });
        expect(runtimeCalls).toEqual([expect.objectContaining({
            serviceKey: 'mc-server',
            operation : 'restart',
            reason    : 'recovery-actuator:mc-server'
        })]);
        expect(result.runtimeAccess).toMatchObject({
            capabilityEnvelope: 'lifecycle-write',
            operation         : 'restart',
            serviceKey        : 'mc-server'
        });
        expect(taskOutcomes).toContainEqual(expect.objectContaining({
            taskName: 'recovery-actuator:mc-server',
            status  : 'completed',
            details : expect.objectContaining({
                status      : 'actioned',
                ledgerStatus: 'reobserve-requested'
            })
        }));

        const attempts = await readAttempts();
        expect(attempts['mc-server:restart']).toMatchObject({
            attemptCount: 1,
            lastAction  : 'restart',
            lastStatus  : 'actioned'
        });
    });

    test('a DENIED gate writes nothing once authority is lost — "no effect" is not "no write"', async () => {
        // The interval @neo-gpt named as unbound: `readHealAttempts()` is awaited, and the
        // gate-denied branch returned through `finishAction()` — which appends a recovery-run entry
        // and persists anti-thrash state — BEFORE any authority recheck. A displaced holder
        // therefore overwrote its successor's envelope state and emitted an owner-authoritative
        // record, without ever touching a container.
        const {service, actuatorConfig} = createService({
            actuatorConfig: {maxAttemptsPerWindow: 1}
        });

        // Burn the envelope so the next call is denied by the gate rather than admitted.
        await service.apply('mc-server', 'restart', {now: 10_000, isAuthorityHeld: () => true});

        const attemptsBefore = JSON.stringify(await readAttempts()),
              runsBefore     = (await readdir(actuatorConfig.recoveryRunStateDir)).length;

        // The oracle must be HELD at entry and LOST afterwards, or this control proves nothing:
        // `apply()` already refuses at its entry check, so a flat `() => false` returns the right
        // status from the wrong line and passes with the interval-under-test removed. Verified by
        // mutation — the first version of this test did exactly that.
        let authorityReads = 0;

        const result = await service.apply('mc-server', 'restart', {
            now            : 11_000,
            isAuthorityHeld: () => ++authorityReads === 1
        });

        // Entry check passed, so the refusal below came from the post-`readHealAttempts` interval.
        expect(authorityReads).toBeGreaterThan(1);

        expect(result).toMatchObject({
            status    : 'declined',
            reasonCode: 'authority-lost',
            serviceKey: 'mc-server'
        });

        // The load-bearing half: no durable trace of a decision this holder no longer had the
        // authority to record. Asserting only the returned status would pass with the write intact.
        expect(JSON.stringify(await readAttempts())).toBe(attemptsBefore);
        expect((await readdir(actuatorConfig.recoveryRunStateDir)).length).toBe(runsBefore);
    });

    for (const [runtimeReason, reasonCode] of [
        ['runtime-effect-not-admitted', 'effect-no-longer-admitted'],
        ['runtime-target-incarnation-changed', 'target-incarnation-changed']
    ]) {
        test(`a last-boundary ${runtimeReason} refusal charges no recovery attempt`, async () => {
            let dispatches = 0;

            const {service, actuatorConfig} = createService({
                deploymentRuntimeAccessService: {
                    async applyLifecycle() {
                        dispatches++;
                        const error = new Error(runtimeReason);
                        error.reason = runtimeReason;
                        throw error;
                    }
                }
            });

            const result = await service.apply('local-model', 'restart', {
                now                  : 10_000,
                expectedContainerId  : 'local-model-A',
                isAuthorityHeld      : () => true,
                isEffectStillAdmitted: () => false
            });

            expect(dispatches).toBe(1);
            expect(result).toMatchObject({
                status    : 'declined',
                reasonCode,
                serviceKey: 'local-model',
                action    : 'restart'
            });
            expect(existsSync(actuatorConfig.healAttemptsPath)).toBe(false);
            expect(existsSync(actuatorConfig.recoveryRunStateDir)).toBe(false);
        });
    }

    test('a dispatched effect whose outcome is lost after takeover is recorded UNCERTAIN, never erased', async () => {
        // @neo-gpt's third interval. The restart POST goes out under held authority; the takeover
        // happens; the socket resets before the outcome is known. This previously returned
        // `declined` with NO audit at all, so a restart that may well have landed left no trace —
        // a silent failure, which outranks a loud one because nothing observes it.
        // The takeover happens INSIDE the dispatch, which is both the real sequence and the only
        // way to reach this interval: a counter-based oracle trips one of the pre-effect guards
        // first and returns the correct `declined`, never exercising the post-dispatch path.
        let held = true;

        const {service, actuatorConfig} = createService({
            deploymentRuntimeAccessService: {
                async applyLifecycle() {
                    held = false;                       // successor claims the lease, POST already sent
                    const error = new Error('socket hang up');
                    error.code    = 'ECONNRESET';       // the answer never comes back
                    throw error;
                }
            }
        });

        const result = await service.apply('mc-server', 'restart', {
            now            : 10_000,
            isAuthorityHeld: () => held
        });

        // NOT `declined`: we do not know that nothing happened.
        expect(result.status).toBe('failed');
        expect(result).toMatchObject({
            effectDisposition         : 'uncertain',
            authorityLostAfterDispatch: true
        });

        // The append-only audit exists — the whole point of the interval.
        expect((await readdir(actuatorConfig.recoveryRunStateDir)).length).toBeGreaterThan(0);
    });

    test('a DISPATCHED audit survives a takeover during store preparation, and says it was displaced', async () => {
        // @neo-gpt-emmy's store interval. The append is separated from every caller-side check by
        // the store's own awaited `mkdir`, so authority is sampled adjacent to `appendFile` —
        // and the record is STAMPED rather than merely gated, so a displaced write is truthful on
        // its own face instead of being indistinguishable from an authorised one.
        let held = true;

        const {service, actuatorConfig} = createService({
            deploymentRuntimeAccessService: {
                async applyLifecycle() {
                    held = false;                  // effect dispatched, then the lease moves
                    const error = new Error('socket hang up');
                    error.code = 'ECONNRESET';
                    throw error;
                }
            }
        });

        const result = await service.apply('mc-server', 'restart', {
            now: 10_000, isAuthorityHeld: () => held
        });

        expect(result.status).toBe('failed');

        // Preserved — erasing a possibly-landed restart is the failure this exists to prevent...
        const files = await readdir(actuatorConfig.recoveryRunStateDir);
        expect(files.length).toBeGreaterThan(0);

        // ...and the surviving record admits the holder no longer held the lease when it landed.
        const rows = (await readFile(path.join(actuatorConfig.recoveryRunStateDir, files[0]), 'utf8'))
            .trim().split('\n').map(line => JSON.parse(line));

        expect(rows.at(-1).heldAtWrite).toBe(false);
    });

    test('warm-provider carries the oracle into the selected repair adapter', async () => {
        // Composition control only: the default LMS/Ollama helpers have their own production-bound
        // per-mutation controls in providerReadinessHelper.spec. This row proves the actuator does
        // not drop the oracle before whichever provider adapter is selected.
        let receivedOracle = null;

        const {service, runtimeCalls} = createService({
            serviceConfig: {
                async providerResidencyRepair({isAuthorityHeld}) {
                    receivedOracle = isAuthorityHeld;
                    held = false;
                    if (typeof isAuthorityHeld === 'function' && isAuthorityHeld() !== true) {
                        const error = new Error('Authority moved before the provider residency repair; refusing.');
                        error.reason = 'runtime-authority-lost';
                        throw error;
                    }

                    return {ready: true, provider: 'ollama', warmedModels: []};
                }
            }
        });

        let held = true;

        const result = await service.apply('local-model', 'warm-provider', {
            now            : 10_000,
            // Held through every pre-dispatch check; the repair flips it from the inside.
            isAuthorityHeld: () => held
        });

        expect(typeof receivedOracle).toBe('function');
        expect(result).toMatchObject({status: 'declined', reasonCode: 'authority-lost'});
        // No lifecycle write may accompany a refused warm.
        expect(runtimeCalls).toEqual([]);
    });

    test('warm-provider live-admission refusal dispatches no repair and charges no recovery attempt', async () => {
        const {service, actuatorConfig, providerResidencyRepairCalls, runtimeCalls} = createService();

        const result = await service.apply('local-model', 'warm-provider', {
            now                  : 20_000,
            isAuthorityHeld      : () => true,
            isEffectStillAdmitted: () => false,
            targetIdentity       : {kind: 'compose-service', id: 'local-model'}
        });

        expect(result).toMatchObject({
            status    : 'declined',
            reasonCode: 'effect-no-longer-admitted',
            serviceKey: 'local-model',
            action    : 'warm-provider'
        });
        expect(providerResidencyRepairCalls).toEqual([]);
        expect(runtimeCalls).toEqual([]);
        expect(existsSync(actuatorConfig.healAttemptsPath)).toBe(false);
        expect(existsSync(actuatorConfig.recoveryRunStateDir)).toBe(false);
    });

    test('warm-provider preserves a post-first-role denial as a charged partial failure', async () => {
        const partialError = Object.assign(
            new Error('Provider demand changed before the embedding warm; refusing.'),
            {
                reason           : 'runtime-effect-partially-applied',
                effectDisposition: 'partial',
                providerResidency: {
                    action         : 'warm-provider',
                    provider       : 'ollama',
                    ready          : false,
                    admission      : 'refused-after-partial',
                    attemptedModels: [{role: 'chat', model: 'gemma4:26b'}],
                    warmedModels   : [{role: 'chat', model: 'gemma4:26b'}],
                    pendingModels  : [],
                    failedModels   : []
                }
            }
        );
        const {service, actuatorConfig, runtimeCalls} = createService({
            serviceConfig: {
                async providerResidencyRepair() {
                    throw partialError;
                }
            }
        });

        const result = await service.apply('local-model', 'warm-provider', {
            now                  : 30_000,
            isEffectStillAdmitted: () => true,
            targetIdentity       : {kind: 'compose-service', id: 'local-model'}
        });

        expect(result).toMatchObject({
            status           : 'failed',
            reasonCode       : 'effect-no-longer-admitted-after-partial',
            effectDisposition: 'partial',
            providerResidency: {
                admission   : 'refused-after-partial',
                warmedModels: [{role: 'chat', model: 'gemma4:26b'}]
            }
        });
        expect(runtimeCalls).toEqual([]);
        expect((await readAttempts())['local-model:warm-provider']).toMatchObject({
            attemptCount: 1,
            lastStatus  : 'failed'
        });
        expect((await readdir(actuatorConfig.recoveryRunStateDir)).length).toBeGreaterThan(0);
    });

    test('warm-provider preserves a failed prior attempt as charged uncertainty', async () => {
        const uncertainError = Object.assign(
            new Error('Provider demand changed after an earlier warm attempt; refusing.'),
            {
                reason           : 'runtime-effect-disposition-uncertain',
                effectDisposition: 'uncertain',
                providerResidency: {
                    action         : 'warm-provider',
                    provider       : 'ollama',
                    ready          : false,
                    admission      : 'refused-after-uncertain-attempt',
                    attemptedModels: [{role: 'chat', model: 'gemma4:26b'}],
                    warmedModels   : [],
                    pendingModels  : [],
                    failedModels   : [{role: 'chat', model: 'gemma4:26b'}]
                }
            }
        );
        const {service, actuatorConfig} = createService({
            serviceConfig: {
                async providerResidencyRepair() {
                    throw uncertainError;
                }
            }
        });

        const result = await service.apply('local-model', 'warm-provider', {
            now                  : 31_000,
            isEffectStillAdmitted: () => true,
            targetIdentity       : {kind: 'compose-service', id: 'local-model'}
        });

        expect(result).toMatchObject({
            status           : 'failed',
            reasonCode       : 'effect-no-longer-admitted-after-uncertain-attempt',
            effectDisposition: 'uncertain',
            providerResidency: {
                admission   : 'refused-after-uncertain-attempt',
                failedModels: [{role: 'chat', model: 'gemma4:26b'}]
            }
        });
        expect((await readAttempts())['local-model:warm-provider']).toMatchObject({
            attemptCount: 1,
            lastStatus  : 'failed'
        });
        expect((await readdir(actuatorConfig.recoveryRunStateDir)).length).toBeGreaterThan(0);
    });

    test('warm-provider restores provider role-set residency through the bounded actuator envelope', async () => {
        const {service, runtimeCalls, providerResidencyRepairCalls, taskOutcomes} = createService();

        const result = await service.apply('local-model', 'warm-provider', {
            now           : 30_000,
            reason        : 'missing-required-model',
            targetIdentity: {kind: 'compose-service', id: 'local-model'}
        });

        expect(result.status).toBe('actioned');
        expect(runtimeCalls).toEqual([]);
        expect(providerResidencyRepairCalls).toHaveLength(1);
        expect(providerResidencyRepairCalls[0]).not.toHaveProperty('isEffectStillAdmitted');
        expect(result.targetIdentity).toEqual({kind: 'compose-service', id: 'local-model'});
        expect(result.reobserveRequest).toMatchObject({
            recoveryClass : 'provider-role-residency',
            targetIdentity: {kind: 'compose-service', id: 'local-model'},
            cooldownMs    : 5_000
        });
        expect(result.providerResidency).toMatchObject({
            capabilityEnvelope: 'provider-role-set-warm',
            operation         : 'warm-provider',
            serviceKey        : 'local-model',
            reason            : 'missing-required-model',
            result            : {
                ready   : true,
                provider: 'ollama'
            }
        });
        expect(taskOutcomes).toContainEqual(expect.objectContaining({
            taskName: 'recovery-actuator:local-model',
            status  : 'completed',
            details : expect.objectContaining({
                status      : 'actioned',
                ledgerStatus: 'reobserve-requested'
            })
        }));

        const attempts = await readAttempts();
        expect(attempts['local-model:warm-provider']).toMatchObject({
            attemptCount: 1,
            lastAction  : 'warm-provider',
            lastStatus  : 'actioned'
        });
    });

    test('warm-provider honors persisted backoff and does not loop warm attempts', async () => {
        const {service, providerResidencyRepairCalls} = createService({
            actuatorConfig: {
                baseBackoffMs: 30_000,
                maxBackoffMs : 30_000
            }
        });

        const first = await service.apply('local-model', 'warm-provider', {
            now           : 40_000,
            targetIdentity: {kind: 'compose-service', id: 'local-model'}
        });
        const second = await service.apply('local-model', 'warm-provider', {
            now           : 41_000,
            targetIdentity: {kind: 'compose-service', id: 'local-model'}
        });

        expect(first.status).toBe('actioned');
        expect(second).toMatchObject({
            status    : 'deferred',
            reasonCode: 'backoff-active'
        });
        expect(providerResidencyRepairCalls).toHaveLength(1);
    });

    test('warm-provider reports failed provider repair without restarting the target', async () => {
        const {service, runtimeCalls, providerResidencyRepairCalls} = createService({
            serviceConfig: {
                async providerResidencyRepair() {
                    providerResidencyRepairCalls.push({});
                    return {
                        ready  : false,
                        warning: 'provider cannot hold chat and embedding together'
                    };
                }
            }
        });

        const result = await service.apply('local-model', 'warm-provider', {
            now           : 50_000,
            targetIdentity: {kind: 'compose-service', id: 'local-model'}
        });

        expect(result).toMatchObject({
            status    : 'failed',
            reasonCode: 'executor-failed',
            error     : 'provider cannot hold chat and embedding together'
        });
        expect(runtimeCalls).toEqual([]);
        expect(providerResidencyRepairCalls).toHaveLength(1);
    });

    test('blocked compose services are rejected before any executor call', async () => {
        const {service, runtimeCalls, taskOutcomes} = createService({
            actuatorConfig: {
                blockedComposeServices: ['mc-server']
            }
        });

        const result = await service.apply('mc-server', 'restart', {now: 20_000});

        expect(result).toMatchObject({
            status    : 'rejected',
            reasonCode: 'target-not-recoverable'
        });
        expect(runtimeCalls).toEqual([]);
        expect(taskOutcomes).toContainEqual(expect.objectContaining({
            taskName: 'recovery-actuator:mc-server',
            status  : 'skipped'
        }));
    });

    test('unknown targets are rejected before any executor call', async () => {
        const {service, runtimeCalls, taskOutcomes} = createService();

        const result = await service.apply('not-allowed', 'restart', {now: 20_000});

        expect(result).toMatchObject({
            status    : 'rejected',
            reasonCode: 'target-not-recoverable'
        });
        expect(runtimeCalls).toEqual([]);
        expect(taskOutcomes).toContainEqual(expect.objectContaining({
            taskName: 'recovery-actuator:not-allowed',
            status  : 'skipped'
        }));
    });

    test('disabled actuator refuses known targets before any executor call', async () => {
        const {service, runtimeCalls} = createService({
            actuatorConfig: {
                enabled: false
            }
        });

        const result = await service.apply('mc-server', 'restart', {now: 25_000});

        expect(result).toMatchObject({
            status    : 'rejected',
            reasonCode: 'actuator-disabled'
        });
        expect(runtimeCalls).toEqual([]);
    });

    test('persisted backoff defers a repeated restart without touching docker', async () => {
        const {service, runtimeCalls} = createService({
            actuatorConfig: {
                baseBackoffMs: 30_000,
                maxBackoffMs : 30_000
            }
        });

        const first  = await service.apply('mc-server', 'restart', {now: 100_000});
        const second = await service.apply('mc-server', 'restart', {now: 101_000});

        expect(first.status).toBe('actioned');
        expect(second).toMatchObject({
            status    : 'deferred',
            reasonCode: 'backoff-active'
        });
        expect(runtimeCalls).toHaveLength(1);
    });

    test('the envelope defers a repeated reconfigure — the action with the highest bounce cost is not exempt', async () => {
        // AC3, and it has to be driven through `apply()` rather than the inner method: the anti-thrash
        // envelope lives in `apply`, so every reconfigure spec that calls `reconfigureComposeService`
        // directly proves the transaction and proves NOTHING about the rate limit. A new action reaching
        // the privileged path without inheriting the envelope is precisely what §2.5 exists to prevent —
        // and reconfigure restarts its target, so an unbounded loop here costs a bounce per iteration.
        const {service, runtimeCalls} = createService({
            actuatorConfig: {
                baseBackoffMs: 30_000,
                maxBackoffMs : 30_000
            }
        });

        const knobValues = {
                  'memoryService.generateMiniSummaryTimeoutMs': 40000,
                  'memoryService.miniSummaryTimeoutMs'        : 60000
              },
              first  = await service.apply('mc-server', 'reconfigure', {knob: 'minisummary-generation-window', knobValues, now: 100_000}),
              second = await service.apply('mc-server', 'reconfigure', {knob: 'minisummary-generation-window', knobValues, now: 101_000});

        expect(first.status).toBe('actioned');
        expect(second).toMatchObject({
            status    : 'deferred',
            reasonCode: 'backoff-active'
        });

        // One restart, not two: the deferred call must not reach the target at all.
        expect(runtimeCalls).toHaveLength(1);
    });

    test('attempt cap records as alarm-only and never loops the privileged action', async () => {
        const {service, runtimeCalls} = createService({
            actuatorConfig: {
                maxAttemptsPerWindow: 1,
                baseBackoffMs       : 0
            }
        });

        const first  = await service.apply('mc-server', 'restart', {now: 200_000});
        const second = await service.apply('mc-server', 'restart', {now: 201_000});

        expect(first.status).toBe('actioned');
        expect(second).toMatchObject({
            status    : 'recorded',
            reasonCode: 'attempt-cap-reached'
        });
        expect(runtimeCalls).toHaveLength(1);

        const attempts = await readAttempts();
        expect(attempts['mc-server:restart'].alarmOnly).toBe(true);
    });

    test('deploy-target redeploy records to the heal-event ledger without paging (no human to page in cloud)', async () => {
        const {service, runtimeCalls, taskOutcomes} = createService();

        const result = await service.apply('cloud-deploy', 'redeploy', {
            now   : 300_000,
            reason: 'config-drift'
        });

        expect(result).toMatchObject({
            status        : 'recorded',
            targetIdentity: {kind: 'deploy-target', id: 'cloud-deploy'}
        });
        expect(runtimeCalls).toEqual([]);

        // The last human-page path is gone: an un-auto-executable redeploy records, never pages.
        const healEvents = await readHealLedger({dir: service.healEventLedgerDir});
        expect(healEvents).toContainEqual(expect.objectContaining({
            type      : 'redeploy',
            collection: 'cloud-deploy',
            status    : 'recorded',
            detail    : expect.objectContaining({deployTarget: 'cloud-deploy', reason: 'config-drift'})
        }));
        expect(taskOutcomes).toContainEqual(expect.objectContaining({
            taskName: 'recovery-actuator:cloud-deploy',
            status  : 'completed',
            details : expect.objectContaining({
                status      : 'recorded',
                ledgerStatus: 'recorded'
            })
        }));
    });

    test('deploy-target record-only takeover during store setup leaves no owner-success audit', async () => {
        const {service, runtimeCalls} = createService();

        const result = await service.apply('cloud-deploy', 'redeploy', {
            now   : 301_000,
            reason: 'config-drift',
            // Held through apply preparation and dispatch; flips only after the real heal-store
            // directory appears, proving this deploy branch carries the oracle into that store.
            isAuthorityHeld : () => !existsSync(service.healEventLedgerDir)
        });

        expect(result).toMatchObject({status: 'declined', reasonCode: 'authority-lost'});
        expect(runtimeCalls).toEqual([]);
        expect(await readHealLedger({dir: service.healEventLedgerDir})).toEqual([]);
    });

    test('recordDiagnosis records a supervised-task diagnosis to the heal-event ledger without executing target actions', async () => {
        const {service, runtimeCalls, supervisorCalls, taskOutcomes} = createService();
        let   executedTargetAction                                   = false;

        service.executeTargetAction = async () => {
            executedTargetAction = true;
            throw new Error('should not execute');
        };

        const result = await service.recordDiagnosis(backupEscalationDiagnosis(), {
            now   : 500_000,
            reason: 'backup-failed'
        });

        expect(result).toMatchObject({
            status        : 'recorded',
            reasonCode    : 'maintenance-task-failure',
            targetIdentity: {kind: 'supervised-task', id: 'backup'}
        });
        expect(result.reobserveRequest).toBeNull();
        expect(executedTargetAction).toBe(false);
        expect(runtimeCalls).toEqual([]);
        expect(supervisorCalls).toEqual([]);

        // record-with-diagnosis never pages — it appends to the heal-event ledger instead.
        const healEvents = await readHealLedger({dir: service.healEventLedgerDir});
        expect(healEvents).toContainEqual(expect.objectContaining({
            type      : 'ambiguous',
            collection: 'backup',
            status    : 'recorded',
            detail    : expect.objectContaining({reasonCode: 'maintenance-task-failure'})
        }));
        expect(taskOutcomes).toContainEqual(expect.objectContaining({
            taskName: 'recovery-actuator:backup',
            status  : 'failed',
            details : expect.objectContaining({
                status      : 'recorded',
                ledgerStatus: 'recorded'
            })
        }));
    });

    test('recordDiagnosis carries authority to the first store and refuses a takeover before its append', async () => {
        const {service, actuatorConfig} = createService();
        let   authorityReads            = 0;

        const write = service.recordDiagnosis(backupEscalationDiagnosis(), {
            now            : 505_000,
            isAuthorityHeld: () => ++authorityReads === 1
        });

        await expect(write).rejects.toMatchObject({reason: 'runtime-authority-lost'});
        expect(authorityReads).toBe(2); // entry admitted; store-adjacent sample refused
        expect(await readHealLedger({dir: service.healEventLedgerDir})).toEqual([]);
        await expect(readdir(actuatorConfig.recoveryRunStateDir)).rejects.toMatchObject({code: 'ENOENT'});
    });

    test('takeover between the two record-only sinks preserves only the admitted first-source proof', async () => {
        const {service, actuatorConfig} = createService();
        let   authorityReads            = 0;

        const write = service.recordDiagnosis(backupEscalationDiagnosis(), {
            now            : 506_000,
            // Entry + heal-event source append are held; finishAction and its recovery-run source
            // append observe the successor. Removing either downstream fence makes this row red.
            isAuthorityHeld: () => ++authorityReads <= 2
        });

        await expect(write).rejects.toMatchObject({reason: 'runtime-authority-lost'});

        const healEvents = await readHealLedger({dir: service.healEventLedgerDir});
        expect(healEvents).toHaveLength(1);
        expect(healEvents[0]).toMatchObject({status: 'recorded', heldAtWrite: true});
        expect(await readdir(actuatorConfig.recoveryRunStateDir)).toEqual([]);
    });

    test('recordDiagnosis rejects non-record diagnoses without privileged actions', async () => {
        const {service, runtimeCalls, supervisorCalls} = createService();

        const result = await service.recordDiagnosis(backupEscalationDiagnosis({
            details: {actionClass: 'restart'}
        }), {now: 510_000});

        expect(result).toEqual({
            status        : 'rejected',
            reasonCode    : 'diagnosis-not-recordable',
            targetIdentity: {kind: 'supervised-task', id: 'backup'}
        });
        expect(runtimeCalls).toEqual([]);
        expect(supervisorCalls).toEqual([]);
    });

    test('arbitrary actions are rejected before target lookup or executor access', async () => {
        const {service, runtimeCalls} = createService();

        const result = await service.apply('mc-server', 'exec', {now: 400_000});

        expect(result).toMatchObject({
            status    : 'rejected',
            reasonCode: 'unsupported-action'
        });
        expect(runtimeCalls).toEqual([]);
    });

    test.describe('reconfigure', () => {
        const KNOB   = 'minisummary-generation-window',
              INNER  = 'memoryService.generateMiniSummaryTimeoutMs',
              OUTER  = 'memoryService.miniSummaryTimeoutMs',
              VALUES = {[INNER]: 40000, [OUTER]: 60000};

        test('is admitted for a compose service and refused for a supervised task', () => {
            const {service} = createService();

            // A supervised in-process child has no mount to read a durable overlay from, so admitting
            // the action there would write a file nothing consults and report success over it.
            expect(service.isActionAllowedForTarget({
                action: 'reconfigure',
                target: {kind: 'compose-service', id: 'mc-server'}
            })).toBe(true);

            expect(service.isActionAllowedForTarget({
                action: 'reconfigure',
                target: {kind: 'supervised-task', id: 'chroma'}
            })).toBe(false);

            expect(service.isActionAllowedForTarget({
                action: 'reconfigure',
                target: {kind: 'deploy-target', id: 'cloud-deploy'}
            })).toBe(false);
        });

        test('the full reconfigure action carries authority through its durable overlay into the restart', async () => {
            const {service, runtimeCalls} = createService();
            const result                  = await service.apply('mc-server', 'reconfigure', {
                knob           : KNOB,
                knobValues     : VALUES,
                now            : 100_000,
                isAuthorityHeld: () => true
            });

            expect(result.status).toBe('actioned');
            expect(runtimeCalls).toHaveLength(1);
            expect(runtimeCalls[0]).toMatchObject({serviceKey: 'mc-server', operation: 'restart'});
            expect(typeof runtimeCalls[0].isAuthorityHeld).toBe('function');
        });

        test('the full reconfigure action refuses takeover after its scratch write and before overlay publication', async () => {
            const overrideDir             = path.join(tmpDir, 'reconfigure-takeover'),
                  {service, runtimeCalls} = createService({serviceConfig: {recoveryOverrideDir: overrideDir}}),
                  result                  = await service.apply('mc-server', 'reconfigure', {
                      knob      : KNOB,
                      knobValues: VALUES,
                      now       : 100_000,
                      // This stays held through every caller-side sample and flips only when the real
                      // override writer has created its UUID scratch file. Omitting the oracle from
                      // `writeKnobOverride()` therefore makes this control action the target.
                      isAuthorityHeld : createScratchSensitiveAuthorityOracle(overrideDir)
                  });

            expect(result).toMatchObject({status: 'declined', reasonCode: 'authority-lost'});
            expect(runtimeCalls).toEqual([]);
            expect(await readdir(overrideDir)).toEqual([]);
        });

        test('a refused transaction costs the target NO restart', async () => {
            const {service, runtimeCalls} = createService();

            // Ordering that matters operationally: a rejected proposal must not bounce a healthy
            // service. The violations travel back so a controller learns what would have been valid.
            // Failure is signalled by throwing, matching how this service reports every other failed
            // action; `apply` wraps the call and records the attempt as failed.
            await expect(service.reconfigureComposeService({
                knob      : KNOB,
                knobValues: {[INNER]: 60000, [OUTER]: 40000},
                target    : {kind: 'compose-service', id: 'mc-server', serviceKey: 'mc-server'}
            })).rejects.toThrow(/inner-strictly-below-outer/);

            expect(runtimeCalls).toEqual([]);
        });

        test('an unknown knob is refused without touching the target', async () => {
            const {service, runtimeCalls} = createService();

            await expect(service.reconfigureComposeService({
                knob      : 'not-in-the-closed-set',
                knobValues: VALUES,
                target    : {kind: 'compose-service', id: 'mc-server', serviceKey: 'mc-server'}
            })).rejects.toThrow(/unknown knob/);

            expect(runtimeCalls).toEqual([]);
        });

        test('an accepted transaction writes the overlay AND restarts, because a write alone changes nothing', async () => {
            const {service, runtimeCalls} = createService();

            // The overlay is read at boot. A write without a restart leaves the target running its old
            // values while every surface reports the action succeeded — the exact no-op-reported-as-
            // success this action exists to avoid, so the two halves stay one operation.
            const result = await service.reconfigureComposeService({
                knob      : KNOB,
                knobValues: VALUES,
                target    : {kind: 'compose-service', id: 'mc-server', serviceKey: 'mc-server'}
            });

            expect(result.knob).toBe(KNOB);
            expect(result.runtimeAccess).toBeTruthy();
            expect(result.overridePath).toContain('recovery-actuator-overrides.json');

            expect(runtimeCalls.length).toBe(1);
            expect(runtimeCalls[0].serviceKey).toBe('mc-server');

            expect(JSON.parse(await readFile(result.overridePath, 'utf8'))).toEqual({
                memoryService: {
                    generateMiniSummaryTimeoutMs: 40000,
                    miniSummaryTimeoutMs        : 60000
                }
            });
        });
    });

    test.describe('raise-ceiling — the store-variant envelope: mutate + live activate, NO restart (#16596)', () => {
        const GIB          = 1024 ** 3,
              CEILING_KNOB = 'container-memory-ceiling',
              CEIL_LEAF    = 'deploy.chroma.memoryCeilingBytes',
              // The fixture registers `chroma` as BOTH a supervised task and a compose service, so a
              // bare serviceKey is ambiguous by construction; the typed identity is how a real
              // controller disambiguates, and these specs exercise that same path.
              CHROMA_TARGET = {kind: 'compose-service', id: 'chroma'};

        function createRaiseService({liveLimitBytes = 2 * GIB, inspectData, ...overrides} = {}) {
            const readCalls = [],
                  created   = createService({
                      ...overrides,
                      deploymentRuntimeAccessService: {
                          async readObserve(options) {
                              readCalls.push(options);

                              return {
                                  ok   : true,
                                  data : inspectData ?? {HostConfig: {Memory: liveLimitBytes}},
                                  proof: {capabilityEnvelope: 'read-observe', operation: options.operation, serviceKey: options.serviceKey}
                              };
                          },
                          ...overrides.deploymentRuntimeAccessService
                      }
                  });

            return {...created, readCalls};
        }

        test('the incident heal: overlay written, LIVE limit moved, and the target is NEVER restarted', async () => {
            // The negative half of this assertion is the contract: a store crosses its ceiling
            // WHILE INGESTING, and the restart `reconfigure` couples to its mutation is what killed a
            // 59,754-row restore at 24,000 rows. Every lifecycle write the actuator performs flows
            // through the recorded `applyLifecycle` seam, so a re-added restart on this path would
            // surface here as a second call with `operation: 'restart'` — and fail.
            const {service, runtimeCalls, readCalls} = createRaiseService({liveLimitBytes: 2 * GIB});

            const result = await service.apply('chroma', 'raise-ceiling', {
                knob          : CEILING_KNOB,
                knobValues    : {[CEIL_LEAF]: 8 * GIB},
                now           : 100_000,
                reason        : 'store-ceiling-exhaustion',
                targetIdentity: CHROMA_TARGET
            });

            expect(result).toMatchObject({
                status        : 'actioned',
                action        : 'raise-ceiling',
                targetIdentity: {kind: 'compose-service', id: 'chroma'},
                ceilingRaise  : {
                    previousLimitBytes: 2 * GIB,
                    memoryLimitBytes  : 8 * GIB
                }
            });

            // The live bound was read from the runtime, not assumed from config.
            expect(readCalls).toEqual([expect.objectContaining({serviceKey: 'chroma', operation: 'inspect'})]);

            // Exactly ONE lifecycle write, and it is the update — no restart, before or after.
            expect(runtimeCalls).toHaveLength(1);
            expect(runtimeCalls[0]).toMatchObject({
                serviceKey      : 'chroma',
                operation       : 'update-memory-limit',
                memoryLimitBytes: 8 * GIB
            });

            // The durable half: the validated intent landed in the overlay for the converge layer.
            const overlayPath = path.join(tmpDir, 'deployment-state', 'recovery-actuator-overrides.json');
            expect(JSON.parse(await readFile(overlayPath, 'utf8'))).toEqual({
                deploy: {chroma: {memoryCeilingBytes: 8 * GIB}}
            });
        });

        test('the full raise-ceiling action carries authority into the live update after its durable overlay', async () => {
            let held           = true,
                receivedOracle = null,
                liveEffects    = 0;

            const {service} = createRaiseService({
                liveLimitBytes                : 2 * GIB,
                deploymentRuntimeAccessService: {
                    async applyLifecycle(options) {
                        receivedOracle = options.isAuthorityHeld;
                        held = false; // takeover during the runtime adapter's awaited target resolution

                        if (typeof options.isAuthorityHeld === 'function' && options.isAuthorityHeld() !== true) {
                            const error = new Error('Authority moved before the live ceiling update; refusing.');
                            error.reason = 'runtime-authority-lost';
                            throw error;
                        }

                        liveEffects++;
                        return {ok: true, proof: {operation: options.operation}};
                    }
                }
            });

            const result = await service.apply('chroma', 'raise-ceiling', {
                knob           : CEILING_KNOB,
                knobValues     : {[CEIL_LEAF]: 8 * GIB},
                now            : 100_000,
                targetIdentity : CHROMA_TARGET,
                isAuthorityHeld: () => held
            });

            expect(result).toMatchObject({status: 'declined', reasonCode: 'authority-lost'});
            expect(typeof receivedOracle).toBe('function');
            expect(liveEffects).toBe(0);

            // The durable intent was admitted while held; only the later live mutation was refused.
            const overlayPath = path.join(tmpDir, 'deployment-state', 'recovery-actuator-overrides.json');
            expect(JSON.parse(await readFile(overlayPath, 'utf8'))).toEqual({
                deploy: {chroma: {memoryCeilingBytes: 8 * GIB}}
            });
        });

        test('the full raise-ceiling action refuses takeover before its scratch overlay becomes durable intent', async () => {
            const overrideDir             = path.join(tmpDir, 'deployment-state');
            const {service, runtimeCalls} = createRaiseService({liveLimitBytes: 2 * GIB});

            const result = await service.apply('chroma', 'raise-ceiling', {
                knob           : CEILING_KNOB,
                knobValues     : {[CEIL_LEAF]: 8 * GIB},
                now            : 100_000,
                targetIdentity : CHROMA_TARGET,
                isAuthorityHeld: createScratchSensitiveAuthorityOracle(overrideDir)
            });

            expect(result).toMatchObject({status: 'declined', reasonCode: 'authority-lost'});
            expect(runtimeCalls).toEqual([]);
            expect(await readdir(overrideDir)).toEqual([]);
        });

        test('is admitted for the store-classed compose service ONLY — the matrix row is mechanical', async () => {
            const {service, runtimeCalls, readCalls} = createRaiseService();

            // Declared-store compose target: admitted.
            expect(service.isActionAllowedForTarget({
                action: 'raise-ceiling',
                target: {kind: 'compose-service', id: 'chroma'}
            })).toBe(true);

            // Transient compose target: refused through the FULL apply path, without ever touching the
            // runtime — widening a transient service's ceiling would spend host memory to mask the
            // arrival-rate signal `throttle-shed` exists to answer.
            const rejected = await service.apply('kb-server', 'raise-ceiling', {
                knob      : CEILING_KNOB,
                knobValues: {[CEIL_LEAF]: 8 * GIB},
                now       : 100_000
            });

            expect(rejected).toMatchObject({status: 'rejected', reasonCode: 'action-not-allowed-for-target'});
            expect(runtimeCalls).toEqual([]);
            expect(readCalls).toEqual([]);

            // And the other kinds have no ceiling to raise at all.
            expect(service.isActionAllowedForTarget({
                action: 'raise-ceiling',
                target: {kind: 'supervised-task', id: 'chroma'}
            })).toBe(false);
            expect(service.isActionAllowedForTarget({
                action: 'raise-ceiling',
                target: {kind: 'deploy-target', id: 'cloud-deploy'}
            })).toBe(false);
        });

        test('the ratchet terminates: a raise past the registry cap is a recorded refusal, and no live write happens', async () => {
            // The anti-thrash VALUE bound, driven through the full path. From the 16 GiB cap the
            // doubling policy proposes 32 GiB; the registry refuses with a named violation, the refusal
            // is thrown before any lifecycle write, and the attempt is persisted as failed — so the
            // cadence envelope marches a repeating refusal into alarm-only instead of looping it.
            const {service, runtimeCalls} = createRaiseService({liveLimitBytes: 16 * GIB});

            const result = await service.apply('chroma', 'raise-ceiling', {
                knob          : CEILING_KNOB,
                now           : 100_000,
                targetIdentity: CHROMA_TARGET
            });

            expect(result).toMatchObject({status: 'failed', reasonCode: 'executor-failed'});
            expect(result.error).toContain('Automatic knob transaction refused');
            expect(result.error).toContain(`${8 * GIB}..${16 * GIB}`);
            expect(runtimeCalls).toEqual([]);

            const attempts = await readAttempts();
            expect(attempts['chroma:raise-ceiling']).toMatchObject({lastStatus: 'failed'});

            // Refused means NOT durably recorded either: the overlay carries applied intents only.
            await expect(readFile(path.join(tmpDir, 'deployment-state', 'recovery-actuator-overrides.json'), 'utf8'))
                .rejects.toMatchObject({code: 'ENOENT'});
        });

        test('raise-not-lower binds against the LIVE limit the runtime reports', async () => {
            // A plane already at 8 GiB must refuse a "raise" to 8 GiB: the corpus does not shrink to
            // fit, and an equal-or-lower proposal is an OOM instruction whatever config claims.
            const {service, runtimeCalls} = createRaiseService({liveLimitBytes: 8 * GIB});

            const result = await service.apply('chroma', 'raise-ceiling', {
                knob          : CEILING_KNOB,
                knobValues    : {[CEIL_LEAF]: 8 * GIB},
                now           : 100_000,
                targetIdentity: CHROMA_TARGET
            });

            expect(result).toMatchObject({status: 'failed', reasonCode: 'executor-failed'});
            expect(result.error).toContain('raise-not-lower');
            expect(runtimeCalls).toEqual([]);
        });

        test('an unreadable live limit refuses — an unknown bound is a refusal, never an absent one', async () => {
            const {service, runtimeCalls} = createRaiseService({inspectData: {}});

            const result = await service.apply('chroma', 'raise-ceiling', {
                knob          : CEILING_KNOB,
                knobValues    : {[CEIL_LEAF]: 8 * GIB},
                now           : 100_000,
                targetIdentity: CHROMA_TARGET
            });

            expect(result).toMatchObject({status: 'failed', reasonCode: 'executor-failed'});
            expect(result.error).toContain('unreadable');
            expect(runtimeCalls).toEqual([]);
        });

        test('a ceiling intent cannot be re-aimed: the knob\'s declared service must match the target', async () => {
            // The knob's sizing derivation belongs to one service by declaration. Naming a different
            // knob (or a different target) fails before the runtime is touched.
            const {service, runtimeCalls, readCalls} = createRaiseService();

            const result = await service.apply('chroma', 'raise-ceiling', {
                knob          : 'minisummary-generation-window',
                knobValues    : {[CEIL_LEAF]: 8 * GIB},
                now           : 100_000,
                targetIdentity: CHROMA_TARGET
            });

            expect(result).toMatchObject({status: 'failed', reasonCode: 'executor-failed'});
            expect(result.error).toContain('cannot be re-aimed');
            expect(runtimeCalls).toEqual([]);
            expect(readCalls).toEqual([]);
        });

        test('the restart-coupled channel fails closed on this knob — reconfigure cannot resolve its runtime bound', async () => {
            // The ceiling knob's raise-not-lower bound resolves only from the RUNTIME; `reconfigure`
            // resolves context from config. Routing the knob through the restart-coupled channel must
            // therefore refuse on missing context BEFORE the restart that channel couples to — the
            // mechanical guarantee that the store's ceiling can never be moved by a path that would
            // bounce the store to do it.
            const {service, runtimeCalls} = createRaiseService();

            const result = await service.apply('chroma', 'reconfigure', {
                knob          : CEILING_KNOB,
                knobValues    : {[CEIL_LEAF]: 8 * GIB},
                now           : 100_000,
                targetIdentity: CHROMA_TARGET
            });

            expect(result).toMatchObject({status: 'failed', reasonCode: 'executor-failed'});
            expect(result.error).toContain('missing context');
            expect(runtimeCalls).toEqual([]);
        });
    });

    // The healLedgerRetention boundary getter's VALID path is exercised by the heal-ledger append tests above
    // (recordDiagnosis / deploy-target redeploy spread `...this.healLedgerRetention` into every appended event).
    // Its fail-visible INVALID path is covered without mutating the shared AiConfig singleton: the pure-function
    // validateHealLedgerRetention unit spec (healEventLedgerStore.spec) plus the config-template boundary spec,
    // which drives an invalid env-resolved retention leaf through the same guard (config.template.spec).
});
