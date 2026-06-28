import {test, expect}          from '@playwright/test';
import {mkdtemp, rm, readFile} from 'fs/promises';
import os                      from 'os';
import path                    from 'path';

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
import {readHealLedger} from '../../../../../../../ai/services/memory-core/helpers/healEventLedgerStore.mjs';
import {TIER1_DEFAULTS} from '../../../../../fixtures/aiConfigDefaults.mjs';

const DEFAULT_ACTUATOR_CONFIG       = TIER1_DEFAULTS.orchestrator.recoveryActuator;
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
                  ...DEFAULT_ACTUATOR_CONFIG,
                  healAttemptsPath    : path.join(tmpDir, 'heal-attempts.json'),
                  recoveryRunStateDir : path.join(tmpDir, 'recovery-runs'),
                  baseBackoffMs       : 0,
                  maxBackoffMs        : 0,
                  maxAttemptsPerWindow: 2,
                  maxAttemptsWindowMs : 60_000,
                  verifyCooldownMs    : 5_000,
                  ...overrides.actuatorConfig
              },
              service = Neo.create(RecoveryActuatorService, {
                  actuatorConfig,
                  dataDir      : tmpDir,
                  healthService: {
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

    // The healLedgerRetention boundary getter's VALID path is exercised by the heal-ledger append tests above
    // (recordDiagnosis / deploy-target redeploy spread `...this.healLedgerRetention` into every appended event).
    // Its fail-visible INVALID path is covered without mutating the shared AiConfig singleton: the pure-function
    // validateHealLedgerRetention unit spec (healEventLedgerStore.spec) plus the config-template boundary spec,
    // which drives an invalid env-resolved retention leaf through the same guard (config.template.spec).
});
