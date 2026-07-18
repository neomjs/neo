import {test, expect}             from '../../fixtures.mjs';
import {missionControlTourScript} from '../../../../apps/agentos/tour/missionControlWalkthrough.mjs';

/**
 * @summary The mission-control walkthrough's trinity proof: the SAME screenplay that narrates
 * the public demo runs here as the e2e — two consecutive live takes with identical beat
 * sequences (the ticket's determinism AC), driven over the Neural Link on the real cockpit.
 *
 * Per-take worker truth: every scripted cue settles into a receipt with zero folded errors
 * (burst injection through the stream's seam, the NAME-addressed drill through the production
 * selection path, the real OS-window round trip), the popup terminally closes on reattach,
 * and the committed dock document survives byte-identical (the screenplay is pure narration —
 * the projection follows cues, never script-owned ops).
 *
 * Recording note (the trinity's third face): a screen capture of `playWalkthroughTour()` in
 * demo mode IS the video — the runner refuses record mode unless reduced-motion is probed
 * false by the hosting surface, so a capture can never record a motion-reduced lie.
 *
 * Run: NEO_E2E_PORT=8119 npx playwright test agentos/MissionControlWalkthroughNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('AgentOS mission control — the walkthrough trinity (demo = e2e = recording)', () => {
    test.setTimeout(180000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 720, width: 1100}
    });

    test('two live takes: identical beat logs, settled cue receipts, the real vessel round trip, a byte-identical stage', async ({page, neuralLink}) => {
        const pageErrors = [];

        page.on('pageerror', error => {
            const value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && pageErrors.push(value)
        });

        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-agent-card').first()).toBeVisible({timeout: 30000});

        const app       = await neuralLink.connectToApp('AgentOS'),
              cockpits  = await app.findInstances({className: 'AgentOS.view.fleet.FleetCockpit'}, ['id']),
              cockpitId = (Array.isArray(cockpits) ? cockpits[0] : cockpits)?.id;

        expect(cockpitId, 'the FleetCockpit must exist in the App Worker').toBeTruthy();

        const scriptedCueCount = missionControlTourScript.scenes.flatMap(scene => scene.steps).filter(step => step.cue).length;
        const logs             = [];

        // the owner-held stream state BEFORE any take — the burst's reversibility baseline
        const readStream = async () => {
            const streams = await app.findInstances({className: 'AgentOS.view.fleet.ActivityStream'}, ['adapterState', 'events']),
                  stream  = Array.isArray(streams) ? streams[0] : streams;

            return {adapterState: stream?.properties?.adapterState, eventCount: stream?.properties?.events?.length ?? 0}
        };

        const streamBaseline = await readStream();

        for (let run = 0; run < 2; run++) {
            const popupPromise = page.waitForEvent('popup', {timeout: 90000});

            // the walkthrough is NL-driven by design: FIRE the take without awaiting the
            // transport (a full demo-paced take outlives the request window — the cockpit's
            // documented contract is `lastTourReport` after teardown), and swallow the
            // transport's own timeout if it fires
            app.callMethod(cockpitId, 'playWalkthroughTour').catch(() => {});

            // the popout beat births the real vessel window mid-take…
            const popup = await popupPromise;

            await expect(popup.locator('.fm-agent-detail'), 'the vessel hosts the live detail').toBeVisible({timeout: 30000});

            // …and the reattach beat terminally closes it — observed, never inferred
            await popup.waitForEvent('close', {timeout: 60000});

            // the take is DONE when the runner tears down; the settled report is worker truth
            await expect.poll(async () => (await app.getComponent(cockpitId, ['tourRunner']))?.tourRunner, {
                message  : 'the take must finish and tear its runner down',
                timeout  : 60000,
                intervals: [500]
            }).toBeFalsy();

            const result = (await app.getComponent(cockpitId, ['lastTourReport'])).lastTourReport;

            expect(result.completed, `take ${run + 1} completes with cue truth folded in`).toBe(true);
            expect(result.cueErrors, `take ${run + 1}: no cue folded an error`).toEqual([]);
            expect(result.cueReceipts, `take ${run + 1}: one receipt per scripted cue`).toBe(scriptedCueCount);

            logs.push(result.log);

            // the drill beat seated the NAME-addressed resident through the production seam
            const details = await app.queryComponent({className: 'AgentOS.view.fleet.AgentDetail'}, ['record']),
                  detail  = (Array.isArray(details) ? details : [details]).filter(Boolean)[0];

            expect(detail?.properties?.record?.agentId, 'the drill seated the deterministic resident').toBe('neo-fable');

            // the burst is REVERSIBLE: the owner-held stream state is back exactly at the terminal
            expect(await readStream(), `take ${run + 1}: the displaced stream state restored`).toEqual(streamBaseline)
        }

        // the determinism AC: two consecutive runs, identical beat sequence
        expect(logs[1], 'two takes replay the identical beat log').toEqual(logs[0]);

        expect(pageErrors, 'the journey must be error-free in the main window').toEqual([])
    });
});
