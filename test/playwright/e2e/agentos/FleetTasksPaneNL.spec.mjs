import {test, expect} from '../../fixtures.mjs';
import {
    authenticatedFleetOptions,
    fleetE2EFailure,
    fleetE2ESuccess,
    wireAuthenticatedFleetBridge
} from './authenticatedFleetHarness.mjs';

/**
 * @summary One wired `fleetTasks` envelope in the exact source contract shape — a determinate
 * run, a due repo without a gauge, the REM backlog gauge, and one recent completion — served
 * through the REAL authenticated transport so the cockpit's own loader, the pane's Store
 * projection, and the native progress element are all witnessed in a real DOM.
 * @param {Object} [overrides]
 * @returns {Object}
 */
function tasksEnvelope(overrides = {}) {
    return {
        capability: {state: 'wired', capturedAt: '2026-08-22T12:30:00.000Z'},
        viewer    : '@e2e-operator',
        sources   : {
            deployment: {state: 'wired', reason: null, observedAt: '2026-08-22T12:29:30.000Z'},
            rem       : {state: 'wired', reason: null},
            ingestion : {state: 'unwired', reason: 'ingestion-verb-unreachable-from-this-process', scope: null}
        },
        running: [
            {id: 'kb:ingestion:run', section: 'running', name: 'KB ingestion', source: 'kb', state: 'embedding', at: '2026-08-22T12:25:00.000Z', progress: {kind: 'determinate', done: 100, total: 400}, detail: 'this-process-only'}
        ],
        queued: [
            {id: 'orchestrator:tenant-sync:cbff435fe549', section: 'queued', name: 'Repo sync · cbff435f', source: 'orchestrator', state: 'due', at: '2026-08-22T12:34:23.859Z', progress: null, detail: 'rev d8ae9ff'},
            {id: 'mc:rem:digest', section: 'queued', name: 'REM digest', source: 'mc', state: 'backlog', at: null, progress: {kind: 'backlog', done: 1040, total: 2000}, detail: '960 undigested · 1040 digested'}
        ],
        recent: [
            {id: 'orchestrator:tenant-sync:last', section: 'recent', name: 'Tenant repo sync', source: 'orchestrator', state: 'completed', at: '2026-08-22T12:11:42.269Z', progress: null, detail: '0 synced · 3 not due · 0 failed'}
        ],
        counts: {running: 1, queued: 2, recent: 1},
        ...overrides
    }
}

/**
 * @summary Start a recording loopback Fleet bridge whose `fleetTasks` answers the current
 * envelope (mutable between reads, so a re-read can prove replacement) and whose boot-time verbs
 * answer benignly; anything else fails by name, so the pane can never be fed by accident.
 * @returns {Promise<{close: Function, endpoint: String, requests: Object[], bearerToken: String, state: Object}>}
 */
async function startTasksFleetBridge() {
    const
        {startFleetBridgeServer} = await import('../../../../ai/services/fleet/fleetBridgeServer.mjs'),
        requests                 = [],
        state                    = {envelope: tasksEnvelope()};

    const options = authenticatedFleetOptions({
        dispatch: async request => {
            requests.push(request);

            switch (request.method) {
                case 'fleetTasks':
                    return fleetE2ESuccess(state.envelope);
                case 'fleetRoster':
                    return fleetE2ESuccess({rows: []});
                case 'fleetActivity':
                    return fleetE2ESuccess({capability: {source: 'fleet:test', state: 'wired', confidence: 'observed'}, events: []});
                case 'listAgents':
                case 'fleetStatus':
                case 'fleetRuntimeStatus':
                    return fleetE2ESuccess([]);
                default:
                    return fleetE2EFailure(`fleet: unexpected test method '${request.method}'`)
            }
        }
    });

    const server = await startFleetBridgeServer(options);

    return {
        requests,
        state,
        bearerToken: options.bearerToken,
        endpoint   : `http://127.0.0.1:${server.address().port}/fleet`,
        close      : () => new Promise(resolve => server.close(resolve))
    }
}

test.describe('AgentOS Tasks pane — the WHAT surface through the authenticated bridge (Neural Link)', () => {
    test.setTimeout(120000);

    test.use({viewport: {width: 1280, height: 720}});

    test('three live sections, one row grammar, a native progress bar, and the refresh intent round-trips the wire', async ({page, neuralLink}) => {
        const fleet = await startTasksFleetBridge();

        try {
            await page.goto('/apps/agentos/index.html');
            await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});
            await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});

            // fail-closed boot → bearer through the worker-realm product injector → the cockpit's
            // own sanctioned read path (the same method its boot and liveness tick drive)
            const app = await neuralLink.connectToApp('AgentOS');
            await wireAuthenticatedFleetBridge({app, fleetUrl: fleet.endpoint, bearerToken: fleet.bearerToken});

            const [cockpit] = await app.queryComponent({className: 'AgentOS.view.fleet.cockpit.Container'}, ['id']);
            await app.callMethod(cockpit.properties.id, 'loadTasks', [{}]);

            // the Tasks tab sits directly beside Activity in the south strip — a real click activates it
            const tasksTab = page.locator('.neo-dashboard-dock-tabs .neo-tab-header-button', {hasText: /tasks/i});
            await expect(tasksTab).toBeVisible({timeout: 30000});
            await tasksTab.click();

            const pane = page.locator('.fm-tasks-pane');
            await expect(pane).toBeVisible({timeout: 30000});

            // the meta line names every source axis by its own state word
            await expect(pane.locator('.fm-tasks-meta')).toContainText('orchestrator live · memory core live · knowledge base not reachable');

            const sections = pane.locator('.fm-tasks-section');
            await expect(sections).toHaveCount(3);
            await expect(sections.nth(0).locator('.fm-tasks-section-label')).toHaveText('Running');
            await expect(sections.nth(1).locator('.fm-tasks-section-label')).toHaveText('Queued · next');
            await expect(sections.nth(2).locator('.fm-tasks-section-label')).toHaveText('Recent');
            await expect(pane.locator('.fm-tasks-section-head .fm-freshness')).toHaveText(['live', 'live', 'live']);

            // running: the determinate idiom in REAL DOM — a native progress element carrying the
            // fraction as data, plus the percentage as text beside it
            const run = sections.nth(0).locator('.fm-task-row');
            await expect(run).toHaveCount(1);
            await expect(run.locator('.fm-task-name')).toHaveText('KB ingestion');
            await expect(run.locator('.fm-task-state')).toHaveText('embedding');
            await expect(run.locator('progress.fm-task-bar')).toHaveAttribute('value', '100');
            await expect(run.locator('progress.fm-task-bar')).toHaveAttribute('max', '400');
            await expect(run.locator('.fm-task-progress-text')).toHaveText('25%');
            await expect(run.locator('.fm-freshness')).toHaveText('knowledge base');

            // queued: the due repo carries no bar; the backlog gauge keeps its word and renders done / total
            const queued = sections.nth(1).locator('.fm-task-row');
            await expect(queued).toHaveCount(2);
            await expect(queued.nth(0).locator('.fm-task-name')).toHaveText('Repo sync · cbff435f');
            await expect(queued.nth(0).locator('.fm-task-state')).toHaveText('due');
            await expect(queued.nth(0).locator('progress')).toHaveCount(0);
            await expect(queued.nth(1).locator('.fm-task-state')).toHaveText('backlog');
            await expect(queued.nth(1).locator('progress.fm-task-bar')).toHaveAttribute('max', '2000');
            await expect(queued.nth(1).locator('.fm-task-progress-text')).toHaveText('1040 / 2000');
            await expect(queued.nth(1).locator('.fm-task-time')).toHaveText('—');

            // recent
            await expect(sections.nth(2).locator('.fm-task-row .fm-task-name')).toHaveText(['Tenant repo sync']);

            // the refresh affordance is an INTENT that crosses the real wire: the bridge records a
            // second fleetTasks request, and the replacement envelope REPLACES the rows — no accumulation
            const before = fleet.requests.filter(request => request.method === 'fleetTasks').length;

            fleet.state.envelope = tasksEnvelope({
                running: [],
                queued : [],
                recent : [{id: 'orchestrator:tenant-sync:last', section: 'recent', name: 'Tenant repo sync', source: 'orchestrator', state: 'completed', at: '2026-08-22T12:41:00.000Z', progress: null, detail: null}],
                counts : {running: 0, queued: 0, recent: 1}
            });

            await pane.locator('.fm-tasks-actions .neo-button', {hasText: 'Refresh'}).click();

            await expect(sections.nth(0).locator('.fm-tasks-empty')).toHaveText('Nothing in flight.', {timeout: 30000});
            await expect(sections.nth(1).locator('.fm-tasks-empty')).toHaveText('Nothing scheduled.');
            await expect(sections.nth(0).locator('.fm-task-row')).toHaveCount(0);
            await expect(sections.nth(2).locator('.fm-task-row')).toHaveCount(1);

            expect(fleet.requests.filter(request => request.method === 'fleetTasks').length).toBeGreaterThan(before);
        } finally {
            await fleet.close()
        }
    })
});
