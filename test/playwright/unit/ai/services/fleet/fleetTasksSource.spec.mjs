import {expect, test} from '@playwright/test';
import {
    createFleetTasksSource,
    extractDeploymentRows,
    extractIngestionRows,
    extractRemRows
} from '../../../../../../ai/services/fleet/fleetTasksSource.mjs';

const
    NOW    = '2026-08-22T12:30:00.000Z',
    NOW_MS = Date.parse(NOW);

/**
 * @summary A deployment-state payload in the live verb's shape (identity hashes only — the fixture
 * carries a tenant hash precisely so the leak witness can prove it never leaves the reducer).
 * @returns {Object}
 */
function deploymentPayload() {
    return {
        ok          : true,
        status      : 'available',
        ageMs       : 30000,
        staleAfterMs: 120000,
        snapshot    : {
            generatedAt   : Date.parse('2026-08-22T12:29:30.000Z'),
            tenantRepoSync: {
                status   : 'completed',
                enabled  : true,
                scheduler: {globalCadenceMs: 1800000, sweepCadenceMs: 60000, due: true},
                task     : {
                    running      : false,
                    pid          : null,
                    lastRunAt    : '2026-08-22T12:11:42.258Z',
                    lastSuccessAt: '2026-08-22T12:11:42.269Z',
                    lastReason   : 'periodic-sweep:60000',
                    lastCompletion: {status: 'completed', reason: 'periodic-sweep:60000', repoCount: 3, completedCount: 0, failedCount: 0, notDueCount: 3}
                },
                repos: [
                    {identityHash: 'cbff435fe549', tenantHash: 'cf744f16ee7f', disabled: false, status: 'not-due', due: true,  nextDueAt: '2026-08-22T12:34:23.859Z', lastIngestedRev: 'd8ae9ffa41ac', consecutiveFailures: 0, corpusOutstanding: {state: 'complete', observable: true, settled: 0,   remaining: 0,  outstanding: 0}},
                    {identityHash: 'ba41470c1d2e', tenantHash: 'cf744f16ee7f', disabled: false, status: 'not-due', due: false, nextDueAt: '2026-08-22T12:40:00.000Z', lastIngestedRev: '0123456789ab', consecutiveFailures: 2, corpusOutstanding: {state: 'pending',  observable: true, settled: 120, remaining: 30, outstanding: 30}},
                    {identityHash: 'd15ab1ed0000', disabled: true,  nextDueAt: '2026-08-22T12:50:00.000Z'},
                    {identityHash: 'n0due0000000', disabled: false, nextDueAt: null}
                ]
            },
            maintenance : {retry: {phase: 'exhausted', nextAttemptAtMs: Date.parse('2026-08-22T12:36:55.189Z'), retriesRemaining: 0}},
            recoveryRuns: {
                status : 'available',
                entries: [
                    {recoveryRunId: 'recovery-actuator:backup:record:2026-08-21T12:58:37.764Z', status: 'recorded',  targetIdentity: {kind: 'supervised-task', id: 'backup'},    startedAt: Date.parse('2026-08-21T12:58:37.764Z'), updatedAt: Date.parse('2026-08-21T12:58:37.774Z'), completedAt: Date.parse('2026-08-21T12:58:37.774Z'), details: {reasonCode: 'maintenance-task-failure'}},
                    {recoveryRunId: 'recovery-actuator:mc-server:restart:2026-08-22T12:20:00.000Z', status: 'in-flight', targetIdentity: {kind: 'service', id: 'mc-server'}, startedAt: Date.parse('2026-08-22T12:20:00.000Z'), updatedAt: Date.parse('2026-08-22T12:20:05.000Z'), completedAt: null, details: {reasonCode: 'crash-loop'}}
                ]
            },
            selfHeal: {status: 'available', summary: {total: 3, byStatus: {recorded: 3}, currentlyFrozen: ['turns']}}
        }
    }
}

/**
 * @summary The Knowledge Base ingestion verb's idle shape, tenant identifiers included so the
 * leak witness can prove they never render.
 * @returns {Object}
 */
function idleIngestion() {
    return {
        status        : 'idle',
        active        : false,
        phase         : 'idle',
        observedScope : 'this-process-only',
        crossProcessHint: 'Pull-mode tenant-repo ingestion runs in the orchestrator process and is NOT reflected here.',
        startedAt     : null,
        completedAt   : '2026-08-22T12:24:32.967Z',
        stalled       : false,
        totalChunks   : 0,
        embeddedChunks: 0,
        errorCount    : 1,
        lastRunSummary: {status: 'completed_with_errors', tenantId: 'tenant-alpha', repoSlug: 'org/secret-repo', completedAt: '2026-08-22T12:24:32.967Z', embeddedChunks: 0, errorCount: 1}
    }
}

const byId = rows => Object.fromEntries(rows.map(row => [row.id, row]));

test.describe('fleetTasksSource — extractDeploymentRows', () => {
    test('reduces the snapshot to provenance-labeled rows across all three sections', () => {
        const {rows, state, reason, observedAt} = extractDeploymentRows(deploymentPayload()),
              map = byId(rows);

        expect(state).toBe('wired');
        expect(reason).toBeNull();
        expect(observedAt).toBe('2026-08-22T12:29:30.000Z');

        // the sweep is idle → its last completion is a RECENT row carrying the repo counts
        expect(map['orchestrator:tenant-sync:last']).toEqual({
            id: 'orchestrator:tenant-sync:last', section: 'recent', name: 'Tenant repo sync', source: 'orchestrator',
            state: 'completed', at: '2026-08-22T12:11:42.269Z', progress: null, detail: '0 synced · 3 not due · 0 failed'
        });

        // one QUEUED row per enabled repo with a nextDueAt, labeled by identity hash only
        expect(map['orchestrator:tenant-sync:cbff435fe549']).toEqual({
            id: 'orchestrator:tenant-sync:cbff435fe549', section: 'queued', name: 'Repo sync · cbff435f', source: 'orchestrator',
            state: 'due', at: '2026-08-22T12:34:23.859Z', progress: null, detail: 'rev d8ae9ff'
        });
        expect(map['orchestrator:tenant-sync:ba41470c1d2e']).toEqual({
            id: 'orchestrator:tenant-sync:ba41470c1d2e', section: 'queued', name: 'Repo sync · ba41470c', source: 'orchestrator',
            state: 'scheduled', at: '2026-08-22T12:40:00.000Z', progress: {kind: 'backlog', done: 120, total: 150}, detail: 'rev 0123456 · 2 consecutive failures'
        });
        expect(map['orchestrator:tenant-sync:d15ab1ed0000'], 'a disabled repo is not scheduled').toBeUndefined();
        expect(map['orchestrator:tenant-sync:n0due0000000'], 'no nextDueAt → no queued claim').toBeUndefined();

        // the maintenance retry renders under its own phase word
        expect(map['orchestrator:maintenance:retry']).toEqual({
            id: 'orchestrator:maintenance:retry', section: 'queued', name: 'Maintenance retry', source: 'orchestrator',
            state: 'exhausted', at: '2026-08-22T12:36:55.189Z', progress: null, detail: '0 retries remaining'
        });

        // recovery runs: finished → recent, in flight → running
        expect(map['orchestrator:recovery:recovery-actuator:backup:record:2026-08-21T12:58:37.764Z']).toMatchObject({
            section: 'recent', name: 'Recovery · supervised-task backup', state: 'recorded', at: '2026-08-21T12:58:37.774Z', detail: 'maintenance-task-failure'
        });
        expect(map['orchestrator:recovery:recovery-actuator:mc-server:restart:2026-08-22T12:20:00.000Z']).toMatchObject({
            section: 'running', name: 'Recovery · service mc-server', state: 'in-flight', at: '2026-08-22T12:20:05.000Z', detail: 'crash-loop'
        });

        // a frozen collection is held-open work
        expect(map['orchestrator:self-heal:frozen:turns']).toMatchObject({section: 'running', name: 'Self-heal freeze · turns', state: 'frozen', at: null});

        expect(rows).toHaveLength(7)
    });

    test('a running sweep is a RUNNING row and suppresses the last-completion row', () => {
        const payload = deploymentPayload();

        payload.snapshot.tenantRepoSync.task.running = true;

        const map = byId(extractDeploymentRows(payload).rows);

        expect(map['orchestrator:tenant-sync:run']).toEqual({
            id: 'orchestrator:tenant-sync:run', section: 'running', name: 'Tenant repo sync', source: 'orchestrator',
            state: 'in progress', at: '2026-08-22T12:11:42.258Z', progress: null, detail: 'periodic-sweep:60000'
        });
        expect(map['orchestrator:tenant-sync:last']).toBeUndefined()
    });

    test('tenant identifiers never leave the reducer', () => {
        const text = JSON.stringify(extractDeploymentRows(deploymentPayload()).rows);

        expect(text).not.toContain('cf744f16ee7f');
        expect(text).not.toContain('tenantHash')
    });

    test('an unusable payload is the typed unavailable axis — with the producer reason when it gave one', () => {
        expect(extractDeploymentRows(null)).toEqual({rows: [], state: 'unavailable', reason: 'deployment-snapshot-unavailable', observedAt: null});
        expect(extractDeploymentRows({ok: false, reason: 'bridge-file-missing'})).toMatchObject({rows: [], state: 'unavailable', reason: 'bridge-file-missing'});
        expect(extractDeploymentRows({ok: true, status: 'available'}), 'ok without a snapshot is still nothing').toMatchObject({state: 'unavailable'})
    });

    test('a stale snapshot keeps its rows under the stale word', () => {
        const payload = deploymentPayload();

        payload.status = 'stale';

        const result = extractDeploymentRows(payload);

        expect(result.state).toBe('stale');
        expect(result.rows.length).toBeGreaterThan(0)
    });

    test('an empty-but-valid snapshot yields zero rows, not a failure', () => {
        expect(extractDeploymentRows({ok: true, status: 'available', snapshot: {generatedAt: NOW_MS}})).toEqual({rows: [], state: 'wired', reason: null, observedAt: NOW})
    })
});

test.describe('fleetTasksSource — extractRemRows', () => {
    test('without a fresh cycle the digest backlog is a QUEUE fact under the backlog word', () => {
        expect(extractRemRows({undigested: 960, digested: 1040, sessionNodes: 4166, recentCycles: []}, NOW_MS)).toEqual({
            rows: [{
                id: 'mc:rem:digest', section: 'queued', name: 'REM digest', source: 'mc', state: 'backlog', at: null,
                progress: {kind: 'backlog', done: 1040, total: 2000}, detail: '960 undigested · 1040 digested'
            }],
            state : 'wired',
            reason: null
        })
    });

    test('a cycle younger than ten minutes makes it a RUNNING row at that cycle\'s instant', () => {
        const [row] = extractRemRows({undigested: 5, digested: 10, recentCycles: [{completedAt: '2026-08-22T12:28:00.000Z'}]}, NOW_MS).rows;

        expect(row).toMatchObject({section: 'running', state: 'in progress', at: '2026-08-22T12:28:00.000Z', progress: {kind: 'backlog', done: 10, total: 15}})
    });

    test('an old cycle is a queue fact again', () => {
        const [row] = extractRemRows({undigested: 5, digested: 10, recentCycles: [{completedAt: '2026-08-22T12:00:00.000Z'}]}, NOW_MS).rows;

        expect(row).toMatchObject({section: 'queued', state: 'backlog', at: '2026-08-22T12:00:00.000Z'})
    });

    test('a fully digested corpus renders no gauge (a zero total is not a fraction)', () => {
        const [row] = extractRemRows({undigested: 0, digested: 0, recentCycles: []}, NOW_MS).rows;

        expect(row.progress).toBeNull()
    });

    test('an unrecognized payload is the typed unavailable axis', () => {
        expect(extractRemRows({}, NOW_MS)).toEqual({rows: [], state: 'unavailable', reason: 'rem-payload-unrecognized'});
        expect(extractRemRows(null, NOW_MS).state).toBe('unavailable')
    })
});

test.describe('fleetTasksSource — extractIngestionRows', () => {
    test('an active run is a RUNNING row with a determinate fraction and its scope as detail', () => {
        const {rows, state, scope} = extractIngestionRows({
            status: 'running', active: true, phase: 'embedding', observedScope: 'this-process-only', stalled: false,
            startedAt: '2026-08-22T12:25:00.000Z', totalChunks: 400, embeddedChunks: 100
        });

        expect(state).toBe('wired');
        expect(scope).toBe('this-process-only');
        expect(rows).toEqual([{
            id: 'kb:ingestion:run', section: 'running', name: 'KB ingestion', source: 'kb', state: 'embedding',
            at: '2026-08-22T12:25:00.000Z', progress: {kind: 'determinate', done: 100, total: 400}, detail: 'this-process-only'
        }])
    });

    test('a stalled run earns the wedged WORD, not a hue', () => {
        const [row] = extractIngestionRows({status: 'running', active: true, phase: 'embedding', stalled: true, totalChunks: 10, embeddedChunks: 3}).rows;

        expect(row.state).toBe('stalled')
    });

    test('an idle process contributes its last run as a RECENT row — and never its tenant identifiers', () => {
        const result = extractIngestionRows(idleIngestion());

        expect(result.rows).toEqual([{
            id: 'kb:ingestion:last', section: 'recent', name: 'KB ingestion', source: 'kb', state: 'completed_with_errors',
            at: '2026-08-22T12:24:32.967Z', progress: null, detail: '0 chunks · 1 errors · this-process-only'
        }]);

        const text = JSON.stringify(result);

        expect(text).not.toContain('tenant-alpha');
        expect(text).not.toContain('secret-repo')
    });

    test('an unrecognized payload is the typed unavailable axis', () => {
        expect(extractIngestionRows({})).toEqual({rows: [], state: 'unavailable', reason: 'ingestion-payload-unrecognized', scope: null})
    })
});

test.describe('fleetTasksSource — createFleetTasksSource', () => {
    function harness({
        viewer     = '@neo-fable-clio',
        deployment = () => deploymentPayload(),
        rem        = () => ({undigested: 960, digested: 1040, recentCycles: []}),
        ingestion  = undefined
    } = {}) {
        const calls = [];

        const wrap = (label, fn) => async args => {
            calls.push([label, args]);

            const value = fn();

            if (value instanceof Error) throw value;

            return value
        };

        const source = createFleetTasksSource({
            getDeploymentStateSnapshot: wrap('deployment', deployment),
            getRemPipelineState       : wrap('rem', rem),
            ...(ingestion ? {getIngestionProgress: wrap('ingestion', ingestion)} : {}),
            resolveViewerIdentity     : () => viewer,
            now                       : () => new Date(NOW)
        });

        return {calls, source}
    }

    test('requires its operations and the viewer resolver', () => {
        expect(() => createFleetTasksSource({})).toThrow(/getDeploymentStateSnapshot, getRemPipelineState, resolveViewerIdentity, and now are required/);
        expect(() => createFleetTasksSource({
            getDeploymentStateSnapshot: async () => ({}), getRemPipelineState: async () => ({}), resolveViewerIdentity: () => '@a', getIngestionProgress: 'nope'
        })).toThrow(/getIngestionProgress must be a function/)
    });

    test('every axis answered → a wired envelope, ordered and capped sections, the viewer stamped', async () => {
        const {calls, source} = harness({ingestion: () => idleIngestion()}),
              envelope        = await source.readTasks();

        expect(envelope.capability).toEqual({state: 'wired', capturedAt: NOW});
        expect(envelope.viewer).toBe('@neo-fable-clio');
        expect(envelope.sources).toEqual({
            deployment: {state: 'wired', reason: null, observedAt: '2026-08-22T12:29:30.000Z'},
            rem       : {state: 'wired', reason: null},
            ingestion : {state: 'wired', reason: null, scope: 'this-process-only'}
        });

        // queued soonest-first: the due repo, the maintenance retry, the later repo, then the
        // instant-less backlog gauge sinks to the end
        expect(envelope.queued.map(row => row.id)).toEqual([
            'orchestrator:tenant-sync:cbff435fe549',
            'orchestrator:maintenance:retry',
            'orchestrator:tenant-sync:ba41470c1d2e',
            'mc:rem:digest'
        ]);
        // running newest-first, the instant-less freeze last
        expect(envelope.running.map(row => row.id)).toEqual([
            'orchestrator:recovery:recovery-actuator:mc-server:restart:2026-08-22T12:20:00.000Z',
            'orchestrator:self-heal:frozen:turns'
        ]);
        // recent newest-first
        expect(envelope.recent.map(row => row.id)).toEqual([
            'kb:ingestion:last',
            'orchestrator:tenant-sync:last',
            'orchestrator:recovery:recovery-actuator:backup:record:2026-08-21T12:58:37.764Z'
        ]);
        expect(envelope.counts).toEqual({running: 2, queued: 4, recent: 3});

        // the operations receive no viewer claim — an empty argument object each
        expect(calls).toEqual([['deployment', {}], ['rem', {}], ['ingestion', {}]])
    });

    test('an absent ingestion operation is the typed unwired axis and does NOT degrade the envelope', async () => {
        const {source}  = harness(),
              envelope  = await source.readTasks();

        expect(envelope.capability.state).toBe('wired');
        expect(envelope.sources.ingestion).toEqual({state: 'unwired', reason: 'ingestion-verb-unreachable-from-this-process', scope: null});
        expect(envelope.recent.map(row => row.id)).not.toContain('kb:ingestion:last')
    });

    test('a throwing axis is partial — its reason and a redacted detail ride the envelope, its rows are absent', async () => {
        const {source}  = harness({rem: () => new Error('plane get_rem_pipeline_state failed: Authorization: Bearer sk-live-AAAABBBB1234 rejected')}),
              envelope  = await source.readTasks();

        expect(envelope.capability.state).toBe('partial');
        expect(envelope.sources.rem.state).toBe('unavailable');
        expect(envelope.sources.rem.reason).toBe('rem-read-failed');
        expect(envelope.sources.rem.detail).toContain('[redacted]');
        expect(envelope.sources.rem.detail).not.toContain('sk-live-AAAABBBB1234');
        expect(envelope.queued.map(row => row.id)).not.toContain('mc:rem:digest');
        expect(envelope.sources.deployment.state).toBe('wired')
    });

    test('no axis answered → unavailable with its own reason, every section empty', async () => {
        const {source}  = harness({deployment: () => new Error('boom'), rem: () => new Error('boom')}),
              envelope  = await source.readTasks();

        expect(envelope.capability).toEqual({state: 'unavailable', capturedAt: NOW, reason: 'no-task-source-answered'});
        expect(envelope.running).toEqual([]);
        expect(envelope.queued).toEqual([]);
        expect(envelope.recent).toEqual([]);
        expect(envelope.counts).toEqual({running: 0, queued: 0, recent: 0})
    });

    test('a section is capped at twelve rows — a glance, not a dump', async () => {
        const payload = deploymentPayload();

        payload.snapshot.recoveryRuns.entries = Array.from({length: 15}, (_, index) => ({
            recoveryRunId: `run-${index}`, status: 'recorded', targetIdentity: {kind: 'service', id: `svc-${index}`},
            completedAt: Date.parse('2026-08-22T12:00:00.000Z') + index * 1000
        }));

        const {source}  = harness({deployment: () => payload}),
              envelope  = await source.readTasks();

        // 15 recoveries + the sweep's last completion = 16 candidates, capped to 12, newest first:
        // the 12:11 sweep completion outranks the 12:00:14 newest recovery
        expect(envelope.recent).toHaveLength(12);
        expect(envelope.recent[0].id, 'newest first').toBe('orchestrator:tenant-sync:last');
        expect(envelope.recent[1].id).toBe('orchestrator:recovery:run-14');
        expect(envelope.recent.at(-1).id, 'the oldest survivors are cut').toBe('orchestrator:recovery:run-4')
    });

    test('an ingress that bound no canonical viewer is refused, never defaulted', async () => {
        const {source} = harness({viewer: 'operator'});

        await expect(source.readTasks()).rejects.toThrow(/did not bind a canonical viewer identity/)
    })
});
