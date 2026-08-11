import {setup} from '../../../../setup.mjs';

const appName = 'ProviderActivityLedgerTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Database       from 'better-sqlite3';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {
    beginProviderActivity,
    completeProviderActivity,
    createProviderActivityLifecycle,
    ensureProviderActivitySchema,
    getProviderActivityMetrics,
    refineProviderActivity,
    startProviderActivity
} from '../../../../../../ai/services/shared/providerActivityLedger.mjs';

test.describe('providerActivityLedger', () => {
    let db;

    test.beforeEach(() => {
        db = new Database(':memory:');
        ensureProviderActivitySchema(db);
    });

    test.afterEach(() => {
        db.close();
    });

    test('persists only bounded structural fields and separates queue wait from execution', () => {
        const localId = beginProviderActivity(db, {
            activityId      : 'caller-controlled-id-must-not-persist',
            service         : 'knowledge-base',
            operationStage  : 'kb-ask-synthesis',
            role            : 'chat',
            provider        : 'openAiCompatible',
            model           : 'google/gemma-4-26b-a4b',
            priority        : 'interactive',
            enqueuedAt      : 100,
            queueDisposition: 'neo-queued',
            prompt          : 'secret prompt',
            operationLabel  : 'session-123 asset-456',
            tenantId        : 'private-tenant',
            userId          : 'private-user',
            endpoint        : 'https://token@example.invalid'
        });

        startProviderActivity(db, localId, 125);
        refineProviderActivity(db, localId, {model: 'dispatch-model'});
        completeProviderActivity(db, localId, {completedAt: 175, success: true});

        const remoteId = beginProviderActivity(db, {
            activityId      : 'remote-caller-id',
            service         : 'memory-core',
            operationStage  : 'mc-session-summary',
            role            : 'chat',
            provider        : 'gemini',
            model           : 'gemini-2.5-flash',
            priority        : 'batch',
            enqueuedAt      : 200,
            startedAt       : 200,
            queueDisposition: 'not-applicable'
        });

        completeProviderActivity(db, remoteId, {completedAt: 250, success: false, failureStage: 'provider'});

        const unknownId = beginProviderActivity(db, {
            activityId      : 'unknown-caller-id',
            service         : 'not-a-service',
            operationStage  : 'session-identity/private',
            role            : 'embedding',
            provider        : 'ollama',
            model           : 'https://credential@example.invalid/model',
            priority        : 'interactive',
            enqueuedAt      : 300,
            queueDisposition: 'not-applicable'
        });

        const rejectedModelIds = [
            'user:secret@host/model',
            'localhost:11434',
            'sk-private-token',
            '/Users/private/model'
        ].map((model, index) => beginProviderActivity(db, {
            service         : 'memory-core',
            operationStage  : 'unknown',
            role            : 'chat',
            provider        : 'ollama',
            model,
            priority        : 'batch',
            enqueuedAt      : 301 + index,
            queueDisposition: 'not-applicable'
        }));

        const columns = db.prepare('PRAGMA table_info(provider_activity_log)').all().map(column => column.name);
        const rows    = db.prepare('SELECT * FROM provider_activity_log ORDER BY activity_id').all();
        const metrics = getProviderActivityMetrics(db, {sinceTs: 0, limit: 10, now: 350});

        expect(columns).toEqual([
            'activity_id',
            'service',
            'operation_stage',
            'role',
            'provider',
            'model',
            'priority',
            'enqueued_at',
            'started_at',
            'completed_at',
            'queue_disposition',
            'queue_wait_ms',
            'execution_ms',
            'success',
            'failure_stage'
        ]);
        expect(JSON.stringify(rows)).not.toContain('secret prompt');
        expect(JSON.stringify(rows)).not.toContain('session-123');
        expect(JSON.stringify(rows)).not.toContain('private-tenant');
        expect(JSON.stringify(rows)).not.toContain('private-user');
        expect(JSON.stringify(rows)).not.toContain('example.invalid');
        expect(JSON.stringify(rows)).not.toContain('caller-controlled-id');
        expect(JSON.stringify(rows)).not.toContain('user:secret@host/model');
        expect(JSON.stringify(rows)).not.toContain('localhost:11434');
        expect(JSON.stringify(rows)).not.toContain('sk-private-token');
        expect(JSON.stringify(rows)).not.toContain('/Users/private/model');
        expect(rows.find(row => row.activity_id === localId)).toMatchObject({
            model        : 'dispatch-model',
            queue_wait_ms: 25,
            execution_ms : 50,
            success      : 1
        });
        expect(rows.find(row => row.activity_id === remoteId)).toMatchObject({
            queue_disposition: 'not-applicable',
            queue_wait_ms    : null,
            execution_ms     : 50,
            success          : 0,
            failure_stage    : 'provider'
        });
        expect(rows.find(row => row.activity_id === unknownId)).toMatchObject({
            service        : 'unknown',
            operation_stage: 'unknown',
            model          : 'unknown'
        });
        expect(rows.filter(row => rejectedModelIds.includes(row.activity_id)).every(row => {
            return row.model === 'unknown';
        })).toBe(true);
        expect(metrics).toMatchObject({
            status         : 'ok',
            totalActivities: 7,
            totalInFlight  : 5
        });
        expect(metrics.recentCompletions.find(row => row.activityId === remoteId)).toMatchObject({
            queueDisposition: 'not-applicable',
            queueWaitMs     : null,
            executionMs     : 50,
            success         : false,
            failureStage    : 'provider'
        });
        expect(metrics.inFlight[0]).toMatchObject({
            activityId    : unknownId,
            operationStage: 'unknown',
            elapsedMs     : 50
        });
        expect(metrics.inFlight.filter(row => rejectedModelIds.includes(row.activityId)).every(row => {
            return row.model === 'unknown';
        })).toBe(true);
    });

    test('swallows recorder failures so lifecycle observation stays behavior-neutral', () => {
        const lifecycle = createProviderActivityLifecycle({
            recorder: {
                beginProviderActivity()    { throw new Error('begin failed') },
                startProviderActivity()    { throw new Error('start failed') },
                refineProviderActivity()   { throw new Error('refine failed') },
                completeProviderActivity() { throw new Error('complete failed') }
            },
            activity: {
                operationStage: 'unknown'
            }
        });

        expect(() => lifecycle.onEnqueued({enqueuedAt: 10})).not.toThrow();
        expect(() => lifecycle.onStarted({startedAt: 20})).not.toThrow();
        expect(() => lifecycle.onDispatch({model: 'safe-model'})).not.toThrow();
        expect(() => lifecycle.onSettled({completedAt: 30, success: true})).not.toThrow();
    });

    test('retains unresolved provider work outside the recent-completion lookback', () => {
        const oldInFlightId = beginProviderActivity(db, {
            service         : 'knowledge-base',
            operationStage  : 'kb-tenant-ingestion-embedding',
            role            : 'embedding',
            provider        : 'ollama',
            model           : 'qwen3-embedding:latest',
            priority        : 'batch',
            enqueuedAt      : 100,
            startedAt       : 100,
            queueDisposition: 'not-applicable'
        });

        const metrics = getProviderActivityMetrics(db, {
            sinceTs: 10_000,
            limit  : 10,
            now    : 20_000
        });

        expect(metrics.totalActivities).toBe(0);
        expect(metrics.totalInFlight).toBe(1);
        expect(metrics.inFlightTruncated).toBe(false);
        expect(metrics.totalRecentCompletions).toBe(0);
        expect(metrics.recentCompletionsTruncated).toBe(false);
        expect(metrics.inFlight).toEqual([expect.objectContaining({
            activityId: oldInFlightId,
            provider  : 'ollama',
            role      : 'embedding',
            elapsedMs : 19_900
        })]);
    });

    test('deduplicates retry attribution and degrades a multi-model activity to unknown', () => {
        const refinements = [];
        const lifecycle   = createProviderActivityLifecycle({
            recorder: {
                beginProviderActivity() { return 'retry-activity' },
                refineProviderActivity(id, activity) { refinements.push({id, activity}) }
            },
            activity: {
                model: 'unknown'
            }
        });

        lifecycle.onEnqueued({enqueuedAt: 10});
        lifecycle.onDispatch({model: 'model-a'});
        lifecycle.onDispatch({model: 'model-a'});
        lifecycle.onDispatch({model: 'model-b'});
        lifecycle.onDispatch({model: 'model-b'});

        expect(refinements).toEqual([
            {id: 'retry-activity', activity: {model: 'model-a'}},
            {id: 'retry-activity', activity: {model: 'unknown'}}
        ]);
    });
    /**
     * @summary Live admission demand is DERIVED from the rows, not stored a second time.
     *
     * Once a producer opens its row before admission and starts it only after acquiring a slot, the
     * queue's live state is already in this table: no `started_at` means waiting, started without a
     * completion means executing. The alternative — a process-local getter on the producing service —
     * cannot answer at all, because the observer runs in a different OS process.
     *
     * Driven through the REAL ledger against a real database. The producer-side arms for this feature
     * used injected recorder doubles, and a permissive double is exactly what let an unsupported
     * `failureStage` persist as `unknown` while the suite stayed green.
     */
    test('#16880: waiting and executing are derived from the row boundaries', () => {
        const waitingId = beginProviderActivity(db, {
            service   : 'memory-core', provider: 'ollama', role: 'embedding',
            enqueuedAt: 1000, queueDisposition: 'neo-queued'
        });
        const executingId = beginProviderActivity(db, {
            service   : 'memory-core', provider: 'ollama', role: 'embedding',
            enqueuedAt: 1000, queueDisposition: 'neo-queued'
        });

        startProviderActivity(db, executingId, 1200);

        const {nativeAdmission} = getProviderActivityMetrics(db, {
            sinceTs            : 0, limit: 50, now: 2000,
            nativeAdmissionCaps: {ollama: 1}
        });

        expect(nativeAdmission.ollama).toEqual({cap: 1, executing: 1, waiting: 1});
        expect(waitingId, 'both rows exist').toBeTruthy()
    });

    test('#16880: an ABSENT cap is null, never a fabricated zero', () => {
        // `0` is the most alarming possible value — it reads as "admission is closed". Reporting it
        // when the truth is only "provenance unavailable" would send an operator to fix a queue that
        // is not shut. Unknown must look unknown.
        beginProviderActivity(db, {
            service   : 'memory-core', provider: 'ollama', role: 'embedding',
            enqueuedAt: 1000, queueDisposition: 'neo-queued'
        });

        const {nativeAdmission} = getProviderActivityMetrics(db, {sinceTs: 0, limit: 50, now: 2000});

        expect(nativeAdmission.ollama.cap).toBeNull();
        expect(nativeAdmission.ollama.waiting, 'demand is still counted without a cap').toBe(1)
    });

    test('#16880: a declared cap with ZERO demand is still reported', () => {
        // Omitting it makes a configured-but-idle queue indistinguishable from one that does not
        // exist — and "no rows at all" is what a wedged plane looks like from the wrong angle.
        const {nativeAdmission} = getProviderActivityMetrics(db, {
            sinceTs            : 0, limit: 50, now: 2000,
            nativeAdmissionCaps: {ollama: 4}
        });

        expect(nativeAdmission.ollama).toEqual({cap: 4, executing: 0, waiting: 0})
    });

    test('#16880 NON-VACUITY: a COMPLETED row is neither waiting nor executing', () => {
        // Without this the counts pass against an implementation that never subtracts, which would
        // report a permanently growing phantom backlog — the exact instrument failure this feature
        // exists to prevent.
        const id = beginProviderActivity(db, {
            service   : 'memory-core', provider: 'ollama', role: 'embedding',
            enqueuedAt: 1000, queueDisposition: 'neo-queued'
        });

        startProviderActivity(db, id, 1100);
        completeProviderActivity(db, id, {completedAt: 1500, success: true});

        const {nativeAdmission} = getProviderActivityMetrics(db, {
            sinceTs            : 0, limit: 50, now: 2000,
            nativeAdmissionCaps: {ollama: 2}
        });

        expect(nativeAdmission.ollama).toEqual({cap: 2, executing: 0, waiting: 0})
    });
});
