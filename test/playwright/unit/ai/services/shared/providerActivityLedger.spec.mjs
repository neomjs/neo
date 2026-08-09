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
});
