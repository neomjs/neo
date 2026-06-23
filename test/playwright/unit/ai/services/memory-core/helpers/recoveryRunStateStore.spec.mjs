import {test, expect}                            from '@playwright/test';
import Neo                                       from '../../../../../../../src/Neo.mjs';
import * as core                                 from '../../../../../../../src/core/_export.mjs';
import {mkdtemp, rm, readdir, utimes, writeFile} from 'fs/promises';
import os                                        from 'os';
import path                                      from 'path';

import {
    appendRecoveryRunState,
    createRecoveryDiagnosisEvent,
    createRecoveryRunGraphNodes,
    createRecoveryReobserveRequest,
    createRecoveryRunStateEntry,
    createRecoveryTargetIdentity,
    getRecoveryDiagnosisGraphNodeId,
    getRecoveryReobserveGraphNodeId,
    getRecoveryRunGraphNodeId,
    getRecoveryRunStateGraphNodeId,
    getRecoveryRunStateFileName,
    publishRecoveryRunStateToGraph,
    pruneRecoveryRunStates,
    readRecentRecoveryRunStates,
    RECOVERY_RUN_GRAPH_NODE_TYPES,
    selectRecoveryRunGraphRecords
} from '../../../../../../../ai/services/memory-core/helpers/recoveryRunStateStore.mjs';

test.describe('RecoveryRunStateStore', () => {
    let tmpDir;

    test.beforeEach(async () => {
        tmpDir = await mkdtemp(path.join(os.tmpdir(), 'neo-recovery-run-state-'));
    });

    test.afterEach(async () => {
        await rm(tmpDir, {recursive: true, force: true});
    });

    const diagnosisEvent = (overrides = {}) => createRecoveryDiagnosisEvent({
        diagnosisId   : 'diagnosis-1',
        recoveryClass : 'crash',
        confidence    : 0.92,
        targetIdentity: createRecoveryTargetIdentity({kind: 'supervised-task', id: 'ollama'}),
        evidenceFacts : [{kind: 'process-exit', value: 1}],
        observedAt    : 1000,
        ...overrides
    });

    const reobserveRequest = (overrides = {}) => createRecoveryReobserveRequest({
        recoveryRunId              : 'recovery-run-1',
        diagnosisEvent             : diagnosisEvent(),
        requestedAt                : 1500,
        cooldownMs                 : 5000,
        healthyObservationThreshold: 2,
        ...overrides
    });

    const runEntry = (recoveryRunId, updatedAt, overrides = {}) => {
        const event = diagnosisEvent(overrides.diagnosisEventOverrides || {});

        return createRecoveryRunStateEntry({
            recoveryRunId,
            diagnosisEvent  : event,
            rung            : 'rung-2',
            attempt         : 1,
            status          : 'reobserve-requested',
            startedAt       : updatedAt - 100,
            updatedAt,
            completedAt     : updatedAt,
            reobserveRequest: createRecoveryReobserveRequest({
                recoveryRunId,
                diagnosisEvent: event,
                requestedAt   : updatedAt,
                cooldownMs    : 1000
            }),
            ...overrides
        });
    };

    const jsonlCount = async dir => (await readdir(dir)).filter(name => name.endsWith('.jsonl')).length;

    test('sanitizes recovery run ids into portable JSONL file names', () => {
        expect(getRecoveryRunStateFileName('recovery:ollama/2026-06-22T21:00:00.000Z'))
            .toBe('recovery_ollama_2026-06-22T21_00_00.000Z.jsonl');
    });

    test('creates typed target identities for deterministic actuator selection', () => {
        expect(createRecoveryTargetIdentity({kind: 'supervised-task', id: 'ollama'})).toEqual({
            kind: 'supervised-task',
            id  : 'ollama'
        });

        expect(() => createRecoveryTargetIdentity({kind: 'docker-container', id: 'ollama'}))
            .toThrow(/invalid kind/);
        expect(() => createRecoveryTargetIdentity({kind: 'compose-service'}))
            .toThrow(/id is required/);
    });

    test('creates diagnosis events with recovery class, confidence, and targetIdentity', () => {
        expect(diagnosisEvent()).toEqual({
            schemaVersion : 1,
            type          : 'recovery-diagnosis',
            diagnosisId   : 'diagnosis-1',
            recoveryClass : 'crash',
            confidence    : 0.92,
            targetIdentity: {
                kind: 'supervised-task',
                id  : 'ollama'
            },
            evidenceFacts: [{kind: 'process-exit', value: 1}],
            observedAt   : 1000,
            source       : 'diagnostics',
            details      : {}
        });

        expect(() => diagnosisEvent({recoveryClass: 'unknown'})).toThrow(/invalid recoveryClass/);
        expect(() => diagnosisEvent({confidence: 1.01})).toThrow(/confidence/);
        expect(() => diagnosisEvent({targetIdentity: {kind: 'compose-service'}})).toThrow(/id is required/);
    });

    test('creates reobserve requests with cooldown and healthy observation threshold', () => {
        expect(reobserveRequest()).toEqual({
            schemaVersion : 1,
            type          : 'recovery-reobserve-request',
            recoveryRunId : 'recovery-run-1',
            diagnosisId   : 'diagnosis-1',
            recoveryClass : 'crash',
            targetIdentity: {
                kind: 'supervised-task',
                id  : 'ollama'
            },
            requestedAt                : 1500,
            cooldownMs                 : 5000,
            earliestObservationAt      : 6500,
            healthyObservationThreshold: 2,
            reason                     : 'cooldown-expired'
        });

        expect(() => reobserveRequest({cooldownMs: -1})).toThrow(/cooldownMs/);
        expect(() => reobserveRequest({healthyObservationThreshold: 0})).toThrow(/healthyObservationThreshold/);
    });

    test('creates recovery run ledger entries with persisted anti-thrash fields', () => {
        const entry = runEntry('recovery-run-1', 2000, {
            rung        : 'rung-2',
            attempt     : 2,
            status      : 'cooldown',
            startedAt   : 1000,
            completedAt : 1750,
            backoffUntil: 5000,
            details     : {action: 'restart-supervised-process'}
        });

        expect(entry.recoveryRunId).toBe('recovery-run-1');
        expect(entry.diagnosisId).toBe('diagnosis-1');
        expect(entry.recoveryClass).toBe('crash');
        expect(entry.targetIdentity).toEqual({kind: 'supervised-task', id: 'ollama'});
        expect(entry.wallClockMs).toBe(750);
        expect(entry.backoffUntil).toBe(5000);
        expect(entry.details).toEqual({action: 'restart-supervised-process'});

        expect(() => runEntry('bad-rung', 2000, {rung: 'restart'})).toThrow(/invalid rung/);
        expect(() => runEntry('bad-status', 2000, {status: 'looping'})).toThrow(/invalid status/);
        expect(() => runEntry('bad-attempt', 2000, {attempt: 0})).toThrow(/attempt/);
    });

    test('projects recovery run entries into deterministic graph proof nodes', () => {
        const entry = runEntry('recovery-run-1', 2000, {
            diagnosisEventOverrides: {
                diagnosisId   : 'diagnosis-2',
                targetIdentity: createRecoveryTargetIdentity({kind: 'compose-service', id: 'memory'})
            }
        });

        const nodes = createRecoveryRunGraphNodes(entry);

        expect(nodes.map(node => node.id)).toEqual([
            getRecoveryRunGraphNodeId('recovery-run-1'),
            getRecoveryRunStateGraphNodeId('recovery-run-1', 2000),
            getRecoveryDiagnosisGraphNodeId('diagnosis-2'),
            getRecoveryReobserveGraphNodeId('recovery-run-1', 2000)
        ]);

        const runNode = nodes.find(node => node.type === RECOVERY_RUN_GRAPH_NODE_TYPES.recoveryRun);
        expect(runNode).toMatchObject({
            state     : 'reobserve-requested',
            properties: {
                recordType        : 'recovery-run',
                targetIdentityId  : 'memory',
                targetIdentityKind: 'compose-service',
                latestStateNodeId : getRecoveryRunStateGraphNodeId('recovery-run-1', 2000)
            }
        });

        const stateNode = nodes.find(node => node.type === RECOVERY_RUN_GRAPH_NODE_TYPES.recoveryRunState);
        expect(stateNode).toMatchObject({
            properties: {
                recordType        : 'recovery-run-state',
                recoveryClass     : 'crash',
                recoveryRunId     : 'recovery-run-1',
                status            : 'reobserve-requested',
                targetIdentityId  : 'memory',
                targetIdentityKind: 'compose-service'
            }
        });

        const diagnosisNode = nodes.find(node => node.type === RECOVERY_RUN_GRAPH_NODE_TYPES.diagnosis);
        expect(diagnosisNode).toMatchObject({
            properties: {
                diagnosisId           : 'diagnosis-2',
                recordType            : 'recovery-diagnosis',
                recoveryRunStateNodeId: getRecoveryRunStateGraphNodeId('recovery-run-1', 2000)
            }
        });
    });

    test('publishes recovery graph nodes idempotently through GraphService upsertNode', async () => {
        const entry   = runEntry('recovery-run-1', 2000);
        const upserts = new Map();
        const calls   = [];

        const graphService = {
            async upsertNode(node) {
                calls.push(node.id);
                upserts.set(node.id, node);
            }
        };

        const first  = await publishRecoveryRunStateToGraph(entry, {graphService});
        const second = await publishRecoveryRunStateToGraph(entry, {graphService});

        expect(first).toEqual(second);
        expect(first.publishedCount).toBe(4);
        expect(upserts.size).toBe(4);
        expect(calls).toHaveLength(8);
    });

    test('selectRecoveryRunGraphRecords filters graph state records for inspect-deployment providers', () => {
        const records = [
            ...createRecoveryRunGraphNodes(runEntry('recovery-memory', 2000, {
                diagnosisEventOverrides: {
                    recoveryClass : 'crash',
                    targetIdentity: createRecoveryTargetIdentity({kind: 'compose-service', id: 'memory'})
                }
            })),
            ...createRecoveryRunGraphNodes(runEntry('recovery-model', 3000, {
                diagnosisEventOverrides: {
                    recoveryClass : 'contention',
                    targetIdentity: createRecoveryTargetIdentity({kind: 'compose-service', id: 'model'})
                }
            }))
        ];

        const proofRecords = selectRecoveryRunGraphRecords(records, {
            limit         : 1,
            recoveryClass : 'contention',
            status        : 'reobserve-requested',
            targetIdentity: {kind: 'compose-service', id: 'model'}
        });

        expect(proofRecords).toHaveLength(1);
        expect(proofRecords[0]).toMatchObject({
            recoveryRunId     : 'recovery-model',
            targetIdentityId  : 'model',
            targetIdentityKind: 'compose-service',
            updatedAt         : 3000
        });
    });

    test('appends and reads recent recovery run entries newest first', async () => {
        await appendRecoveryRunState(runEntry('recovery-old', 1000), {dir: tmpDir});
        await appendRecoveryRunState(runEntry('recovery-new', 2000), {dir: tmpDir});

        const recent = await readRecentRecoveryRunStates({dir: tmpDir, limit: 1});

        expect(recent.map(entry => entry.recoveryRunId)).toEqual(['recovery-new']);
    });

    test('appendRecoveryRunState publishes graph proof while preserving the JSONL return contract', async () => {
        const
            summary = {},
            nodes   = [];

        const filePath = await appendRecoveryRunState(runEntry('recovery-graph', 2000), {
            dir                    : tmpDir,
            graphPublicationSummary: summary,
            graphService           : {
                async upsertNode(node) {
                    nodes.push(node);
                }
            }
        });

        expect(path.basename(filePath)).toBe(getRecoveryRunStateFileName('recovery-graph'));
        expect(summary).toEqual({attempted: 1, published: 4});
        expect(nodes).toHaveLength(4);

        const recent = await readRecentRecoveryRunStates({dir: tmpDir, limit: 1});
        expect(recent[0].recoveryRunId).toBe('recovery-graph');
    });

    test('appendRecoveryRunState surfaces graph publication failure without losing the local ledger', async () => {
        const
            errors  = [],
            logs    = [],
            summary = {};

        const filePath = await appendRecoveryRunState(runEntry('recovery-local-first', 2000), {
            dir                    : tmpDir,
            graphPublicationSummary: summary,
            graphService           : {
                async upsertNode() {
                    throw new Error('graph unavailable');
                }
            },
            onGraphPublicationError(payload) {
                errors.push(payload);
            },
            writeLog(message) {
                logs.push(message);
            }
        });

        expect(path.basename(filePath)).toBe(getRecoveryRunStateFileName('recovery-local-first'));
        expect(summary).toEqual({
            attempted: 1,
            failed   : 1,
            errors   : [{recoveryRunId: 'recovery-local-first', message: 'graph unavailable'}]
        });
        expect(errors).toHaveLength(1);
        expect(logs[0]).toContain('Graph publication failed for recovery-local-first');

        const recent = await readRecentRecoveryRunStates({dir: tmpDir, limit: 1});
        expect(recent[0].recoveryRunId).toBe('recovery-local-first');
    });

    test('appendRecoveryRunState applies the write-side retention cap', async () => {
        for (let i = 0; i < 12; i++) {
            await appendRecoveryRunState(
                runEntry(`recovery-${String(i).padStart(2, '0')}`, 1000 + i),
                {dir: tmpDir, retentionLimit: 5}
            );
        }

        expect(await jsonlCount(tmpDir)).toBe(5);
    });

    test('retention removes the oldest artifacts without losing the recent window', async () => {
        for (let i = 0; i < 10; i++) {
            const recoveryRunId = `recovery-${String(i).padStart(2, '0')}`;
            await appendRecoveryRunState(runEntry(recoveryRunId, 1000 + i), {dir: tmpDir});
            const filePath = path.join(tmpDir, getRecoveryRunStateFileName(recoveryRunId));
            await utimes(filePath, new Date(1000 + i), new Date(1000 + i));
        }

        const removed = await pruneRecoveryRunStates({dir: tmpDir, retentionLimit: 3});
        expect(removed).toBe(7);

        const survivors = (await readdir(tmpDir)).filter(name => name.endsWith('.jsonl')).sort();
        expect(survivors).toEqual(['recovery-07', 'recovery-08', 'recovery-09'].map(getRecoveryRunStateFileName));

        const recent = await readRecentRecoveryRunStates({dir: tmpDir, limit: 3});
        expect(recent.map(entry => entry.recoveryRunId)).toEqual(['recovery-09', 'recovery-08', 'recovery-07']);
    });

    test('readRecentRecoveryRunStates tolerates corrupt diagnostic artifacts', async () => {
        await appendRecoveryRunState(runEntry('recovery-good', 1000), {dir: tmpDir});

        const corruptPath = path.join(tmpDir, getRecoveryRunStateFileName('recovery-corrupt'));
        await appendRecoveryRunState({...runEntry('recovery-corrupt', 2000), recoveryRunId: 'recovery-corrupt'}, {dir: tmpDir});
        await writeFile(corruptPath, '{"broken"\n', 'utf8');

        const recent = await readRecentRecoveryRunStates({dir: tmpDir, limit: 2});

        expect(recent.map(entry => entry.recoveryRunId)).toEqual(['recovery-good']);
    });
});
