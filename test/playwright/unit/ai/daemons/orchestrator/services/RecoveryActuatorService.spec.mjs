import {test, expect}          from '@playwright/test';
import {mkdtemp, rm, readFile} from 'fs/promises';
import os                      from 'os';
import path                    from 'path';

import Neo       from '../../../../../../../src/Neo.mjs';
import * as core from '../../../../../../../src/core/_export.mjs';
import {
    RecoveryActuatorService,
    normalizeRecoveryActuatorAllowlist
} from '../../../../../../../ai/daemons/orchestrator/services/RecoveryActuatorService.mjs';
import {TIER1_DEFAULTS} from '../../../../../fixtures/aiConfigDefaults.mjs';

const DEFAULT_ACTUATOR_CONFIG = TIER1_DEFAULTS.orchestrator.recoveryActuator;

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
              pageCalls                    = [],
              providerResidencyRepairCalls = [],
              taskOutcomes                 = [],
              actuatorConfig               = {
                  ...DEFAULT_ACTUATOR_CONFIG,
                  enabled               : true,
                  allowedSupervisedTasks: [{serviceKey: 'model', taskName: 'ollama'}],
                  allowedComposeServices: ['memory-core'],
                  allowedDeployTargets  : ['cloud-deploy'],
                  healAttemptsPath      : path.join(tmpDir, 'heal-attempts.json'),
                  recoveryRunStateDir   : path.join(tmpDir, 'recovery-runs'),
                  baseBackoffMs         : 0,
                  maxBackoffMs          : 0,
                  maxAttemptsPerWindow  : 2,
                  maxAttemptsWindowMs   : 60_000,
                  verifyCooldownMs      : 5_000,
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
                      killTask(taskName, reason) {
                          supervisorCalls.push({taskName, reason});
                      },
                      ...overrides.processSupervisorService
                  },
                  pageDispatcher(page) {
                      pageCalls.push(page);
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

        return {service, runtimeCalls, supervisorCalls, pageCalls, providerResidencyRepairCalls, taskOutcomes, actuatorConfig};
    }

    async function readAttempts() {
        return JSON.parse(await readFile(path.join(tmpDir, 'heal-attempts.json'), 'utf8'));
    }

    test('normalizes string and object allowlist entries', () => {
        expect(normalizeRecoveryActuatorAllowlist([
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

    test('restart recycles an allowlisted supervised task through the B0 supervisor envelope', async () => {
        const {service, runtimeCalls, supervisorCalls, taskOutcomes} = createService();

        const result = await service.apply('model', 'restart', {
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
            taskName: 'recovery-actuator:model',
            status  : 'completed',
            details : expect.objectContaining({
                status      : 'actioned',
                ledgerStatus: 'reobserve-requested'
            })
        }));
    });

    test('restart applies only to an allowlisted compose service and writes health plus recovery ledger traces', async () => {
        const {service, runtimeCalls, taskOutcomes} = createService();

        const result = await service.apply('memory-core', 'restart', {now: 10_000});

        expect(result.status).toBe('actioned');
        expect(result.reobserveRequest).toMatchObject({
            recoveryClass : 'crash',
            targetIdentity: {kind: 'compose-service', id: 'memory-core'},
            cooldownMs    : 5_000
        });
        expect(runtimeCalls).toEqual([expect.objectContaining({
            serviceKey: 'memory-core',
            operation : 'restart',
            reason    : 'recovery-actuator:memory-core'
        })]);
        expect(result.runtimeAccess).toMatchObject({
            capabilityEnvelope: 'lifecycle-write',
            operation         : 'restart',
            serviceKey        : 'memory-core'
        });
        expect(taskOutcomes).toContainEqual(expect.objectContaining({
            taskName: 'recovery-actuator:memory-core',
            status  : 'completed',
            details : expect.objectContaining({
                status      : 'actioned',
                ledgerStatus: 'reobserve-requested'
            })
        }));

        const attempts = await readAttempts();
        expect(attempts['memory-core:restart']).toMatchObject({
            attemptCount: 1,
            lastAction  : 'restart',
            lastStatus  : 'actioned'
        });
    });

    test('warm-provider restores provider role-set residency through the bounded actuator envelope', async () => {
        const {service, runtimeCalls, providerResidencyRepairCalls, taskOutcomes} = createService({
            actuatorConfig: {
                allowedComposeServices: ['model']
            }
        });

        const result = await service.apply('model', 'warm-provider', {
            now           : 30_000,
            reason        : 'missing-required-model',
            targetIdentity: {kind: 'compose-service', id: 'model'}
        });

        expect(result.status).toBe('actioned');
        expect(runtimeCalls).toEqual([]);
        expect(providerResidencyRepairCalls).toHaveLength(1);
        expect(result.targetIdentity).toEqual({kind: 'compose-service', id: 'model'});
        expect(result.reobserveRequest).toMatchObject({
            recoveryClass : 'provider-role-residency',
            targetIdentity: {kind: 'compose-service', id: 'model'},
            cooldownMs    : 5_000
        });
        expect(result.providerResidency).toMatchObject({
            capabilityEnvelope: 'provider-role-set-warm',
            operation         : 'warm-provider',
            serviceKey        : 'model',
            reason            : 'missing-required-model',
            result            : {
                ready   : true,
                provider: 'ollama'
            }
        });
        expect(taskOutcomes).toContainEqual(expect.objectContaining({
            taskName: 'recovery-actuator:model',
            status  : 'completed',
            details : expect.objectContaining({
                status      : 'actioned',
                ledgerStatus: 'reobserve-requested'
            })
        }));

        const attempts = await readAttempts();
        expect(attempts['model:warm-provider']).toMatchObject({
            attemptCount: 1,
            lastAction  : 'warm-provider',
            lastStatus  : 'actioned'
        });
    });

    test('warm-provider honors persisted backoff and does not loop warm attempts', async () => {
        const {service, providerResidencyRepairCalls} = createService({
            actuatorConfig: {
                allowedComposeServices: ['model'],
                baseBackoffMs         : 30_000,
                maxBackoffMs          : 30_000
            }
        });

        const first = await service.apply('model', 'warm-provider', {
            now           : 40_000,
            targetIdentity: {kind: 'compose-service', id: 'model'}
        });
        const second = await service.apply('model', 'warm-provider', {
            now           : 41_000,
            targetIdentity: {kind: 'compose-service', id: 'model'}
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
            actuatorConfig: {
                allowedComposeServices: ['model']
            },
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

        const result = await service.apply('model', 'warm-provider', {
            now           : 50_000,
            targetIdentity: {kind: 'compose-service', id: 'model'}
        });

        expect(result).toMatchObject({
            status    : 'failed',
            reasonCode: 'executor-failed',
            error     : 'provider cannot hold chat and embedding together'
        });
        expect(runtimeCalls).toEqual([]);
        expect(providerResidencyRepairCalls).toHaveLength(1);
    });

    test('non-allowlisted compose services are rejected before any executor call', async () => {
        const {service, runtimeCalls, taskOutcomes} = createService();

        const result = await service.apply('not-allowed', 'restart', {now: 20_000});

        expect(result).toMatchObject({
            status    : 'rejected',
            reasonCode: 'target-not-allowlisted'
        });
        expect(runtimeCalls).toEqual([]);
        expect(taskOutcomes).toContainEqual(expect.objectContaining({
            taskName: 'recovery-actuator:not-allowed',
            status  : 'skipped'
        }));
    });

    test('disabled actuator refuses allowlisted targets before any executor call', async () => {
        const {service, runtimeCalls} = createService({
            actuatorConfig: {
                enabled: false
            }
        });

        const result = await service.apply('memory-core', 'restart', {now: 25_000});

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

        const first  = await service.apply('memory-core', 'restart', {now: 100_000});
        const second = await service.apply('memory-core', 'restart', {now: 101_000});

        expect(first.status).toBe('actioned');
        expect(second).toMatchObject({
            status    : 'deferred',
            reasonCode: 'backoff-active'
        });
        expect(runtimeCalls).toHaveLength(1);
    });

    test('attempt cap escalates to alarm-only and never loops the privileged action', async () => {
        const {service, runtimeCalls} = createService({
            actuatorConfig: {
                maxAttemptsPerWindow: 1,
                baseBackoffMs       : 0
            }
        });

        const first  = await service.apply('memory-core', 'restart', {now: 200_000});
        const second = await service.apply('memory-core', 'restart', {now: 201_000});

        expect(first.status).toBe('actioned');
        expect(second).toMatchObject({
            status    : 'escalated',
            reasonCode: 'attempt-cap-reached'
        });
        expect(runtimeCalls).toHaveLength(1);

        const attempts = await readAttempts();
        expect(attempts['memory-core:restart'].alarmOnly).toBe(true);
    });

    test('deploy-target redeploy pages without executing arbitrary deployment code', async () => {
        const {service, runtimeCalls, pageCalls, taskOutcomes} = createService();

        const result = await service.apply('cloud-deploy', 'redeploy', {
            now   : 300_000,
            reason: 'config-drift'
        });

        expect(result).toMatchObject({
            status        : 'escalated',
            targetIdentity: {kind: 'deploy-target', id: 'cloud-deploy'}
        });
        expect(runtimeCalls).toEqual([]);
        expect(pageCalls).toEqual([expect.objectContaining({
            deployTarget      : 'cloud-deploy',
            reason            : 'config-drift',
            operatorPageTarget: 'AGENT:*'
        })]);
        expect(taskOutcomes).toContainEqual(expect.objectContaining({
            taskName: 'recovery-actuator:cloud-deploy',
            status  : 'completed',
            details : expect.objectContaining({
                status      : 'escalated',
                ledgerStatus: 'escalated'
            })
        }));
    });

    test('arbitrary actions are rejected before allowlist or executor access', async () => {
        const {service, runtimeCalls} = createService();

        const result = await service.apply('memory-core', 'exec', {now: 400_000});

        expect(result).toMatchObject({
            status    : 'rejected',
            reasonCode: 'unsupported-action'
        });
        expect(runtimeCalls).toEqual([]);
    });
});
