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
            'failure_stage',
            // Bounded and non-identifying by construction: a per-process-start UUID that names a
            // GENERATION, not a machine, a user, or a run's contents. Carried so live-demand reads
            // can exclude rows whose owning process is gone — see PROCESS_EPOCH.
            'process_epoch'
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
            nativeAdmissionCaps: {'memory-core::ollama': 1}
        });

        expect(nativeAdmission['memory-core::ollama'])
            .toEqual({service: 'memory-core', provider: 'ollama', cap: 1, executing: 1, waiting: 1});
        expect(waitingId, 'both rows exist').toBeTruthy()
    });

    /**
     * @summary A row whose owning process is GONE is not this process's live demand.
     *
     * Found by @neo-gpt: the projection read `completed_at IS NULL` as "executing" with no notion of
     * which process generation admitted the row. But the row is DURABLE while the limiter that
     * admitted it is per-process and in-memory, so a process that dies mid-flight leaves rows nothing
     * will ever complete — and the next process reads them as its own demand against a limiter
     * holding zero actual work. `{cap: 1, executing: 1}` immediately after a restart that admitted
     * nothing, and it never clears.
     *
     * This is the same failure the whole surface exists to prevent: a durable record outliving the
     * thing it describes, read as current. The epoch is the boundary.
     */
    test('#16880: rows from a DEAD process generation are not live demand after a restart', () => {
        // Simulate the pre-restart process: one admitted, one executing, neither completed.
        const strandedWaiting = beginProviderActivity(db, {
            service   : 'memory-core', provider: 'ollama', role: 'embedding',
            enqueuedAt: 1000, queueDisposition: 'neo-queued'
        });
        const strandedExecuting = beginProviderActivity(db, {
            service   : 'memory-core', provider: 'ollama', role: 'embedding',
            enqueuedAt: 1000, queueDisposition: 'neo-queued'
        });

        startProviderActivity(db, strandedExecuting, 1200);

        // The process dies. Its rows survive; nothing will ever complete them. Re-stamp them to a
        // FOREIGN epoch, which is exactly what the durable table looks like to the next process.
        db.prepare(`UPDATE provider_activity_log SET process_epoch = 'dead-generation'`).run();

        const {nativeAdmission} = getProviderActivityMetrics(db, {
            sinceTs            : 0, limit: 50, now: 2000,
            nativeAdmissionCaps: {'memory-core::ollama': 1}
        });

        // The declared cap is still reported — an idle queue must not vanish — but demand is ZERO.
        expect(nativeAdmission['memory-core::ollama'], 'a fresh limiter holds no work')
            .toEqual({service: 'memory-core', provider: 'ollama', cap: 1, executing: 0, waiting: 0});

        expect(strandedWaiting && strandedExecuting, 'the rows are RETAINED for history, only excluded from demand').toBeTruthy();
        expect(db.prepare(`SELECT COUNT(*) AS n FROM provider_activity_log`).get().n).toBe(2);
    });

    test('#16880: NON-VACUITY — this generation\'s rows still count', () => {
        // Without this, the epoch filter could exclude everything and the arm above would pass on a
        // projection that reports zero demand always.
        const executingId = beginProviderActivity(db, {
            service   : 'memory-core', provider: 'ollama', role: 'embedding',
            enqueuedAt: 1000, queueDisposition: 'neo-queued'
        });

        startProviderActivity(db, executingId, 1200);

        const {nativeAdmission} = getProviderActivityMetrics(db, {
            sinceTs            : 0, limit: 50, now: 2000,
            nativeAdmissionCaps: {'memory-core::ollama': 1}
        });

        expect(nativeAdmission['memory-core::ollama'].executing).toBe(1);
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

        expect(nativeAdmission['memory-core::ollama'].cap).toBeNull();
        expect(nativeAdmission['memory-core::ollama'].waiting,
            'demand is still counted without a cap').toBe(1)
    });

    test('#16880: a declared cap with ZERO demand is still reported', () => {
        // Omitting it makes a configured-but-idle queue indistinguishable from one that does not
        // exist — and "no rows at all" is what a wedged plane looks like from the wrong angle.
        const {nativeAdmission} = getProviderActivityMetrics(db, {
            sinceTs            : 0, limit: 50, now: 2000,
            nativeAdmissionCaps: {'memory-core::ollama': 4}
        });

        expect(nativeAdmission['memory-core::ollama'])
            .toEqual({service: 'memory-core', provider: 'ollama', cap: 4, executing: 0, waiting: 0})
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
            nativeAdmissionCaps: {'memory-core::ollama': 2}
        });

        expect(nativeAdmission['memory-core::ollama'])
            .toEqual({service: 'memory-core', provider: 'ollama', cap: 2, executing: 0, waiting: 0})
    });

    /**
     * @summary THE finding: two processes at their own caps must not project as one cap violation.
     *
     * @neo-gpt constructed this from the deployment topology rather than the row shape. The Knowledge
     * Base and Memory Core are separate OS processes sharing this table, each with its OWN static
     * limiter. Grouping by provider alone sums them, so two perfectly-behaved processes at cap 4
     * project as `{cap: 4, executing: 8}` — an alarm for a violation that never happened, which
     * sends an operator to fix a limiter that is working.
     *
     * My previous arms could not see it: every one used a single service, so the aggregation error
     * was unreachable. Same shape as the permissive double a review earlier — the fixture could not
     * express the condition it needed to falsify.
     */
    test('#16880: two SERVICES at their own caps never project as one shared violation', () => {
        for (const service of ['memory-core', 'knowledge-base']) {
            for (const n of [1, 2, 3, 4]) {
                const id = beginProviderActivity(db, {
                    service, provider: 'ollama', role: 'embedding',
                    enqueuedAt: 1000 + n, queueDisposition: 'neo-queued'
                });

                startProviderActivity(db, id, 1100 + n)
            }
        }

        const {nativeAdmission} = getProviderActivityMetrics(db, {
            sinceTs: 0, limit: 50, now: 2000,
            // The Memory Core reader declares a cap for ITS OWN service only. It has no authority
            // over the Knowledge Base's limiter, and borrowing this ceiling to label those rows
            // would be a guess presented as a measurement.
            nativeAdmissionCaps: {'memory-core::ollama': 4}
        });

        expect(nativeAdmission['memory-core::ollama'],
            'each process is measured against its own ceiling'
        ).toEqual({service: 'memory-core', provider: 'ollama', cap: 4, executing: 4, waiting: 0});

        expect(nativeAdmission['knowledge-base::ollama'],
            "another process's demand is visible, but its cap is unknown to this reader"
        ).toEqual({service: 'knowledge-base', provider: 'ollama', cap: null, executing: 4, waiting: 0})
    });
});
