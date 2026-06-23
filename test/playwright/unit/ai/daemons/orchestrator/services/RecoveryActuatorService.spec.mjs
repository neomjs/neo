import {test, expect}            from '@playwright/test';
import {mkdtemp, rm}             from 'fs/promises';
import os                        from 'os';
import path                      from 'path';
import Neo                       from '../../../../../../../src/Neo.mjs';
import * as core                 from '../../../../../../../src/core/_export.mjs';
import {RecoveryActuatorService} from '../../../../../../../ai/daemons/orchestrator/services/RecoveryActuatorService.mjs';
import {
    appendRecoveryRunState,
    createRecoveryDiagnosisEvent,
    createRecoveryRunStateEntry,
    createRecoveryTargetIdentity,
    readRecentRecoveryRunStates
} from '../../../../../../../ai/services/memory-core/helpers/recoveryRunStateStore.mjs';

function createDiagnosis(overrides = {}) {
    return createRecoveryDiagnosisEvent({
        diagnosisId   : 'diagnosis-ollama-crash',
        recoveryClass : 'crash',
        confidence    : 0.94,
        targetIdentity: createRecoveryTargetIdentity({kind: 'supervised-task', id: 'ollama'}),
        evidenceFacts : [{kind: 'process-exit', value: 1}],
        observedAt    : 9000,
        ...overrides
    });
}

async function seedAttempt({dir, diagnosisId, attempt, updatedAt}) {
    const diagnosisEvent = createDiagnosis({diagnosisId});

    await appendRecoveryRunState(createRecoveryRunStateEntry({
        recoveryRunId: `recovery:supervised-task:ollama:${diagnosisId}`,
        diagnosisEvent,
        rung       : 'rung-2',
        attempt,
        status     : 'reobserve-requested',
        startedAt  : updatedAt - 100,
        updatedAt,
        completedAt: updatedAt,
        details    : {
            action  : 'restart-supervised-process',
            taskName: 'ollama',
            tier    : 'B0'
        }
    }), {dir});
}

test.describe('Neo.ai.daemons.services.RecoveryActuatorService', () => {
    let tmpDir;

    test.beforeEach(async () => {
        tmpDir = await mkdtemp(path.join(os.tmpdir(), 'neo-recovery-actuator-'));
    });

    test.afterEach(async () => {
        await rm(tmpDir, {recursive: true, force: true});
    });

    function createService(config = {}) {
        const calls      = [],
              logEntries = [],
              outcomes   = [];

        const processSupervisorService = {
            taskDefinitions: {
                ollama: {label: 'ollama server'}
            },
            superviseTask(taskName, now, cooldownMs) {
                calls.push({cooldownMs, now, taskName});
            }
        };

        const service = Neo.create(RecoveryActuatorService, {
            healthService: {
                recordTaskOutcome(taskName, status, details) {
                    outcomes.push({details, status, taskName});
                }
            },
            processSupervisorService,
            recoveryRunStateDir      : tmpDir,
            recoveryRunRetentionLimit: 20,
            nowFn                    : () => 10000,
            writeLog                 : (level, message) => logEntries.push({level, message}),
            ...config
        });

        return {calls, logEntries, outcomes, processSupervisorService, service};
    }

    test('routes supervised crash diagnoses through ProcessSupervisorService and records reobserve state', async () => {
        const {calls, outcomes, service} = createService();

        const result = await service.applyDiagnosis(createDiagnosis(), {cooldownMs: 15000});

        expect(calls).toEqual([{taskName: 'ollama', now: 10000, cooldownMs: 15000}]);
        expect(result).toMatchObject({
            action  : 'restart-supervised-process',
            attempt : 1,
            rung    : 'rung-2',
            status  : 'reobserve-requested',
            taskName: 'ollama'
        });
        expect(result.reobserveRequest).toMatchObject({
            cooldownMs           : 15000,
            earliestObservationAt: 25000,
            targetIdentity       : {kind: 'supervised-task', id: 'ollama'}
        });

        const recent = await readRecentRecoveryRunStates({dir: tmpDir, limit: 1});
        expect(recent[0]).toMatchObject({
            recoveryRunId : 'recovery:supervised-task:ollama:diagnosis-ollama-crash',
            recoveryClass : 'crash',
            targetIdentity: {kind: 'supervised-task', id: 'ollama'},
            rung          : 'rung-2',
            attempt       : 1,
            status        : 'reobserve-requested',
            details       : {
                action    : 'restart-supervised-process',
                cooldownMs: 15000,
                taskName  : 'ollama',
                tier      : 'B0'
            }
        });
        expect(outcomes).toEqual([{
            taskName: 'recovery-actuator',
            status  : 'completed',
            details : expect.objectContaining({
                action        : 'restart-supervised-process',
                cooldownMs    : 15000,
                recoveryRunId : 'recovery:supervised-task:ollama:diagnosis-ollama-crash',
                status        : 'reobserve-requested',
                targetIdentity: {kind: 'supervised-task', id: 'ollama'},
                taskName      : 'ollama',
                tier          : 'B0'
            })
        }]);
    });

    test('routes supervised exhaustion diagnoses to the same restart half of the B0 ladder', async () => {
        const {calls, service} = createService();

        const result = await service.applyDiagnosis(createDiagnosis({
            diagnosisId  : 'diagnosis-ollama-exhaustion',
            recoveryClass: 'exhaustion'
        }));

        expect(calls).toEqual([{taskName: 'ollama', now: 10000, cooldownMs: 15000}]);
        expect(result.status).toBe('reobserve-requested');
        expect(result.attempt).toBe(1);
    });

    test('does not apply B0 to external targets', async () => {
        const {calls, outcomes, service} = createService();

        const result = await service.applyDiagnosis(createDiagnosis({
            diagnosisId   : 'diagnosis-memory-core-crash',
            targetIdentity: createRecoveryTargetIdentity({kind: 'compose-service', id: 'memory-core'})
        }));

        expect(calls).toEqual([]);
        expect(result).toMatchObject({
            action: 'none',
            rung  : 'rung-2',
            status: 'no-action'
        });

        const recent = await readRecentRecoveryRunStates({dir: tmpDir, limit: 1});
        expect(recent[0].details).toMatchObject({
            action    : 'none',
            reason    : 'unsupported-target-kind',
            targetKind: 'compose-service'
        });
        expect(outcomes).toEqual([{
            taskName: 'recovery-actuator',
            status  : 'skipped',
            details : expect.objectContaining({
                action        : 'none',
                reason        : 'unsupported-target-kind',
                recoveryRunId : 'recovery:compose-service:memory-core:diagnosis-memory-core-crash',
                status        : 'no-action',
                targetIdentity: {kind: 'compose-service', id: 'memory-core'}
            })
        }]);
    });

    test('escalates instead of restarting after the supervised attempt cap', async () => {
        await seedAttempt({dir: tmpDir, diagnosisId: 'diagnosis-old-1', attempt: 1, updatedAt: 8000});
        await seedAttempt({dir: tmpDir, diagnosisId: 'diagnosis-old-2', attempt: 2, updatedAt: 9000});

        const {calls, outcomes, service} = createService({maxSupervisedAttempts: 2});

        const result = await service.applyDiagnosis(createDiagnosis({
            diagnosisId: 'diagnosis-ollama-crash-3'
        }));

        expect(calls).toEqual([]);
        expect(result).toMatchObject({
            action : 'escalate-supervised-process',
            attempt: 3,
            rung   : 'rung-3',
            status : 'escalated'
        });

        const recent = await readRecentRecoveryRunStates({dir: tmpDir, limit: 1});
        expect(recent[0]).toMatchObject({
            recoveryRunId: 'recovery:supervised-task:ollama:diagnosis-ollama-crash-3',
            rung         : 'rung-3',
            attempt      : 3,
            status       : 'escalated',
            details      : {
                action     : 'escalate-supervised-process',
                reason     : 'max-supervised-attempts-exceeded',
                maxAttempts: 2,
                taskName   : 'ollama'
            }
        });
        expect(outcomes).toEqual([{
            taskName: 'recovery-actuator',
            status  : 'failed',
            details : expect.objectContaining({
                action     : 'escalate-supervised-process',
                attempt    : 3,
                maxAttempts: 2,
                reason     : 'max-supervised-attempts-exceeded',
                rung       : 'rung-3',
                status     : 'escalated',
                taskName   : 'ollama'
            })
        }]);
    });

    test('fails loud when the supervised task id is not in the task table', async () => {
        const {calls, outcomes, service} = createService();

        const result = await service.applyDiagnosis(createDiagnosis({
            diagnosisId   : 'diagnosis-unknown-task',
            targetIdentity: createRecoveryTargetIdentity({kind: 'supervised-task', id: 'unknown'})
        }));

        expect(calls).toEqual([]);
        expect(result).toMatchObject({
            action: 'restart-supervised-process',
            rung  : 'rung-2',
            status: 'failed'
        });

        const recent = await readRecentRecoveryRunStates({dir: tmpDir, limit: 1});
        expect(recent[0].details).toMatchObject({
            reason  : 'unknown-supervised-task',
            taskName: 'unknown'
        });
        expect(outcomes).toEqual([{
            taskName: 'recovery-actuator',
            status  : 'failed',
            details : expect.objectContaining({
                action        : 'restart-supervised-process',
                reason        : 'unknown-supervised-task',
                status        : 'failed',
                targetIdentity: {kind: 'supervised-task', id: 'unknown'},
                taskName      : 'unknown'
            })
        }]);
    });

    test('keeps recovery non-fatal when HealthService outcome recording fails', async () => {
        const {calls, logEntries, service} = createService({
            healthService: {
                recordTaskOutcome() {
                    throw new Error('health sink down');
                }
            }
        });

        const result = await service.applyDiagnosis(createDiagnosis());

        expect(result.status).toBe('reobserve-requested');
        expect(calls).toEqual([{taskName: 'ollama', now: 10000, cooldownMs: 15000}]);
        expect(logEntries).toEqual([{
            level  : 'ERROR',
            message: '[RecoveryActuator] Failed to record recovery outcome: health sink down'
        }]);
    });
});
