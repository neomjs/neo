import {test, expect}               from '../../fixtures.mjs';
import {NeuralLink_InstanceService} from '../../../../ai/services.mjs';

/**
 * @summary The FM cockpit ActivityStream, proven to hold its backpressure bounds LIVE in the App
 * Worker under real feed pressure — the whitebox-e2e counterpart to the unit suite, which proves
 * the pure ring / coalesce / window math in isolation; THIS possesses the mounted
 * stream over the wire and drives a burst past BOTH bounds, then asserts the mounted surface obeys
 * them:
 *   1. a 250-event burst holds the window (`maxVisible` 12) live, counts the ring drop
 *      (`bufferSize` 200 → 50 evicted), and folds the honest "N earlier events" total (never a
 *      silent drop, never a frozen frame — the DOM re-rendering under the burst IS the liveness);
 *   2. adapter loss degrades to the stale banner WITHOUT blanking/freezing the rendered feed, and
 *      un-freezes on reconnect;
 *   3. the reduced-motion path still renders the bounded feed.
 *
 * Possession mirrors the density-scale sibling: connect via the Neural Link fixture, drive the
 * component's own reactive `set` over the wire, and assert the mounted DOM. No Fleet bridge is
 * started — the stream is possessed directly, so `loadActivity`'s no-bridge path keeps the sample
 * seed until this test overrides it.
 *
 * @see apps/agentos/view/fleet/activity/Container.mjs
 * @see test/playwright/unit/apps/agentos/view/fleet/activity/container.spec.mjs
 * @see test/playwright/e2e/agentos/FleetGridScaleNL.spec.mjs (the density-scale possession pattern)
 */
test.describe('AgentOS fleet cockpit ActivityStream — burst bound holds live (Neural Link)', () => {
    test.setTimeout(90000);

    const STREAM = 'AgentOS.view.fleet.activity.Container';

    /**
     * A burst of DISTINCT-actor events (so coalescing never collapses them) with monotonically
     * increasing timestamps. Longer than the ring (`bufferSize` 200): the ring keeps the newest
     * 200 (drop-oldest, counted), the window renders the newest 12, the rest folds.
     * @param {Number} n
     * @returns {Object[]}
     */
    const burst = n => Array.from({length: n}, (_, i) => ({
        type      : 'a2a-activity',
        source    : 'memory-core:mailbox',
        agentId   : `burst-agent-${i}`,
        occurredAt: new Date(Date.UTC(2026, 6, 5, 0, 0, 0) + i * 60000).toISOString(),
        payload   : {text: `burst event ${i}`}
    }));

    /**
     * @summary Possess the one mounted ActivityStream — resolve its id via NL, never a guessed id.
     * @param {Object} app The connected Neural Link app handle.
     * @returns {Promise<String>}
     */
    async function streamId(app) {
        const streams = await app.queryComponent({className: STREAM}, ['id']);
        expect(streams, 'exactly one mounted ActivityStream should be registered in the App Worker').toHaveLength(1);
        return streams[0].id
    }

    /**
     * @summary Drive one reactive config batch onto the possessed stream over the wire.
     * @param {Object} app
     * @param {String} id
     * @param {Object} config
     */
    async function setStream(app, id, config) {
        const result = await NeuralLink_InstanceService.callMethod({sessionId: app.sessionId, id, method: 'set', args: [config]});
        expect(result?.error, `set must succeed: ${JSON.stringify(result ?? null)}`).toBeFalsy()
    }

    test('a 250-event burst holds the window, counts the ring drop, and folds honestly', async ({page, neuralLink}) => {
        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-activity-stream')).toBeVisible({timeout: 30000});

        const app = await neuralLink.connectToApp('AgentOS'),
              id  = await streamId(app);

        await setStream(app, id, {adapterState: 'live', events: burst(250)});

        // Window bound holds live: exactly maxVisible (12) rows render under 250-event pressure.
        await expect(page.locator('.fm-activity-stream .fm-ev-row')).toHaveCount(12);
        // Honest fold: 250 − 12 = 238 events beyond the glass, counted (folded 188 + ring-dropped 50).
        await expect(page.locator('.fm-activity-stream .fm-stream-fold')).toHaveText('238 earlier events');
        // The header states the live feed — never a silent freeze.
        await expect(page.locator('.fm-activity-stream .fm-stream-head.is-live')).toBeVisible();

        // Engine truth — the ring EVICTED + COUNTED the oldest 50 (250 − bufferSize 200); this is
        // the whitebox proof the fold total alone cannot give (238 holds ring-drop OR window-fold).
        const [stream] = await app.queryComponent({className: STREAM}, ['droppedCount']);
        expect(stream.properties.droppedCount).toBe(50)
    });

    test('a multi-batch live feed holds the bound mid-stream and re-renders per batch (frame progress)', async ({page, neuralLink}) => {
        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.fm-activity-stream')).toBeVisible({timeout: 60000});

        const app  = await neuralLink.connectToApp('AgentOS'),
              id   = await streamId(app),
              rows = page.locator('.fm-activity-stream .fm-ev-row');

        // Three deterministic 250-event batches applied in sequence — event time advances via
        // occurredAt, no wall-clock sleep. After EACH batch the window bound holds AND the newest row
        // reflects THIS batch, so the DOM re-renders per feed application (frame progress, never a
        // frozen frame), and the ring counts each batch's overflow.
        for (const batchId of [1, 2, 3]) {
            const batch = Array.from({length: 250}, (_, i) => ({
                type      : 'a2a-activity',
                source    : 'memory-core:mailbox',
                agentId   : `b${batchId}-agent-${i}`,
                occurredAt: new Date(Date.UTC(2026, 6, 5 + batchId, 0, 0, 0) + i * 60000).toISOString(),
                payload   : {text: `batch${batchId} event ${i}`}
            }));

            await setStream(app, id, {adapterState: 'live', events: batch});

            // bound holds mid-stream after every batch
            await expect(rows).toHaveCount(12);
            // frame progress: the newest row is THIS batch's newest event (the frame advanced)
            await expect(rows.first().locator('.fm-ev-text')).toContainText(`batch${batchId} event 249`);
            // engine truth: the ring counted this batch's overflow (250 − bufferSize 200 = 50)
            const [s] = await app.queryComponent({className: STREAM}, ['droppedCount']);
            expect(s.properties.droppedCount).toBe(50)
        }
    });

    test('adapter loss shows the stale banner without freezing the feed, then un-freezes on reconnect', async ({page, neuralLink}) => {
        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.fm-activity-stream')).toBeVisible({timeout: 60000});

        const app = await neuralLink.connectToApp('AgentOS'),
              id  = await streamId(app);

        // A live burst first, so there is a rendered feed to (not) freeze.
        await setStream(app, id, {adapterState: 'live', events: burst(40)});
        await expect(page.locator('.fm-activity-stream .fm-ev-row')).toHaveCount(12);

        // Adapter loss: the header degrades to the honest stale banner and the rows KEEP rendering
        // (a stale feed is degraded, never blanked or frozen).
        await setStream(app, id, {adapterState: 'stale'});
        await expect(page.locator('.fm-activity-stream .fm-stream-head.is-stale')).toBeVisible();
        await expect(page.locator('.fm-activity-stream .fm-stream-state')).toHaveText('stale — reconnecting');
        await expect(page.locator('.fm-activity-stream .fm-ev-row')).toHaveCount(12);

        // Reconnect: the banner clears AND a NEW unique event flows through — proving the live feed
        // truly resumed, not just the header flipping. Newest-first: the latest occurredAt heads the
        // window, so the injected event must lead.
        const proof = 'reconnect-live-proof-42';
        await setStream(app, id, {adapterState: 'live', events: [...burst(40), {
            type      : 'a2a-activity',
            source    : 'memory-core:mailbox',
            agentId   : 'reconnect-probe',
            occurredAt: '2026-07-05T02:00:00.000Z',
            payload   : {text: proof}
        }]});
        await expect(page.locator('.fm-activity-stream .fm-stream-head.is-live')).toBeVisible();
        await expect(page.locator('.fm-activity-stream .fm-ev-row')).toHaveCount(12);
        // the injected event is the newest → it heads the window: the feed FLOWS post-reconnect
        await expect(page.locator('.fm-activity-stream .fm-ev-row').first().locator('.fm-ev-text')).toContainText(proof)
    });

    test('the reduced-motion path still renders the bounded feed', async ({page, neuralLink}) => {
        await page.emulateMedia({reducedMotion: 'reduce'});
        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.fm-activity-stream')).toBeVisible({timeout: 60000});

        const app = await neuralLink.connectToApp('AgentOS'),
              id  = await streamId(app);

        await setStream(app, id, {adapterState: 'live', events: burst(250)});

        // Under prefers-reduced-motion the pulse/transition tokens collapse — but the bounded feed
        // still renders correctly: window bound holds, fold is honest. (No pulse/transition assertion.)
        await expect(page.locator('.fm-activity-stream .fm-ev-row')).toHaveCount(12);
        await expect(page.locator('.fm-activity-stream .fm-stream-fold')).toHaveText('238 earlier events')
    })
});
