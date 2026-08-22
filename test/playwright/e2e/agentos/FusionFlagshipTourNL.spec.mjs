import {test, expect}     from '../../fixtures.mjs';
import DockZoneModel      from '../../../../src/dashboard/DockZoneModel.mjs';
import {fusionTourScript} from '../../../../apps/agentos/tour/fusionFlagship.mjs';

/**
 * @summary The fusion-flagship worker-truth leg, RE-HOMED to the demo host: the four-beat tour
 * (cockpit → docked panel → OS window → share) is played by the `MissionControlWorkspace` host on
 * the COMPOSED live Fleet cockpit, with every moat claim asserted through the Neural Link instead
 * of narrated. The tour ORCHESTRATION (runner, settled-cue receipts) is host-owned; the product
 * TRUTH it drives (the detail instance, the share artifact, the committed document) is the composed
 * cockpit's — the reads split accordingly.
 *
 * What this leg proves that no unit tier can:
 * - **Instance continuity across the OS-window hop** — the AgentDetail component keeps ITS id
 *   through detach → popup → reattach; only its `windowId` round-trips. Reparent, never recreate.
 * - **The settled-cue truth live** — after the run, the HOST's `cueErrors` is empty and one receipt
 *   per scripted cue exists (the settlement chain drained before the tour reported).
 * - **The share artifact** — the composed cockpit's `sharedPerspectiveArtifact` holds the exported
 *   perspective as parseable JSON (the v1 Neural-Link-readable transfer boundary), re-admitted by
 *   the import cue during the same run.
 * - **Deterministic REPLAY on the live stage** — a second take on the SAME mounted cockpit succeeds
 *   identically, opening a second real popup.
 *
 * Run: NEO_E2E_PORT=8119 npx playwright test agentos/FusionFlagshipTourNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('AgentOS fusion flagship — four-beat tour on the composed cockpit, from the demo host', () => {
    test.setTimeout(180000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 720, width: 1100}
    });

    test('two takes: instance-id continuity through the OS-window hop, settled cues, the share artifact, deterministic replay', async ({page, neuralLink}) => {
        const pageErrors = [];
        let   popupCount = 0;

        page.on('pageerror', error => {
            let value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && pageErrors.push(value)
        });
        page.on('popup', () => popupCount++);

        // the tour lives on the demo host, which composes the real cockpit; the fusion Play button
        // is the host's chrome, driving `playFusionTour` on the host against the composed cockpit
        await page.goto('/apps/agentos/childapps/missioncontrol/index.html');
        await expect(page.locator('.fm-fleet-cockpit'), 'the demo host composes the real cockpit').toBeVisible({timeout: 60000});
        await expect(page.locator('.agentos-dockdemo-tour-play')).toBeVisible({timeout: 30000});

        const app       = await neuralLink.connectToApp('AgentOSMissionControl'),
              hosts     = await app.findInstances({className: 'AgentOS.childapps.missioncontrol.view.MissionControlWorkspace'}, ['id']),
              hostId    = (Array.isArray(hosts) ? hosts[0] : hosts)?.id,
              cockpits  = await app.findInstances({className: 'AgentOS.view.fleet.cockpit.Container'}, ['id']),
              cockpitId = (Array.isArray(cockpits) ? cockpits[0] : cockpits)?.id;

        expect(hostId, 'the demo host must exist in the App Worker').toBeTruthy();
        expect(cockpitId, 'the composed FleetCockpit must exist in the App Worker').toBeTruthy();

        const scriptedCueCount = fusionTourScript.scenes.flatMap(scene => scene.steps).filter(step => step.cue).length;

        const readDetail = async () => {
            const details = await app.findInstances({className: 'AgentOS.view.fleet.detail.Container'}, ['id', 'windowId']);

            return (Array.isArray(details) ? details[0] : details)
        };

        const readStream = async () => {
            const streams = await app.findInstances({className: 'AgentOS.view.fleet.activity.Container'}, ['id']);

            return (Array.isArray(streams) ? streams[0] : streams)
        };

        const baselineStream = await readStream(),
              mainWindowId   = (await app.getComponent(cockpitId, ['windowId'])).windowId;

        expect(baselineStream?.id, 'the worker must own one ActivityStream before the tour').toBeTruthy();
        expect(mainWindowId, 'the cockpit knows its own window').toBeTruthy();

        // the detail is auto-hidden RAIL chrome: it does not exist as an instance until the tour's
        // beat 2 materializes it — the tour BIRTHS the pane it later moves across windows
        expect((await readDetail())?.id, 'no AgentDetail instance exists before the first take').toBeFalsy();

        for (let run = 0; run < 2; run++) {
            const popupsBefore = popupCount,
                  popupPromise = page.waitForEvent('popup', {timeout: 60000});

            await page.locator('.agentos-dockdemo-tour-play').click();

            // the popout beat births a REAL OS window hosting the live detail pane
            const popup = await popupPromise;

            await expect(popup.locator('.fm-agent-detail'), 'the real popup hosts the live agent detail')
                .toBeVisible({timeout: 20000});

            // worker truth mid-hop: the pane exists, and it lives in the POPUP window (the continuity
            // claim is PER TAKE — each take materializes the rail pane fresh, so the moat claim is the HOP)
            const inPopup = await readDetail();

            expect(inPopup?.id, 'the materialized detail pane is worker-owned').toBeTruthy();
            expect(inPopup.properties.windowId, 'the detached pane lives in the popup window').not.toBe(mainWindowId);

            const hopId = inPopup.id;

            // THE moat witness: the popup closes on the reattach cue, and in the pre-morph window the
            // SAME instance is home — the OS-window round trip reparented, never recreated
            await popup.waitForEvent('close', {timeout: 60000});
            await expect.poll(async () => {
                const home = await readDetail();

                return home?.id === hopId && home?.properties.windowId === mainWindowId
            }, {
                message  : 'the SAME instance must be home in the pre-morph window — reparent, never recreate',
                timeout  : 2500,
                intervals: [100]
            }).toBe(true);

            // the take is DONE when the HOST's runner is torn down (the host playTour's finally)
            await expect.poll(async () => (await app.getComponent(hostId, ['tourRunner']))?.tourRunner, {
                message  : 'the take must finish and tear its runner down',
                timeout  : 90000,
                intervals: [500]
            }).toBeFalsy();

            const afterDetail = await readDetail(),
                  afterStream = await readStream();

            // post-tour truth: the detail is a live, home-window pane; the activity stream never restarted
            expect(afterDetail?.id, 'a live detail pane exists after the tour').toBeTruthy();
            expect(afterDetail.properties.windowId, 'the pane is home again').toBe(mainWindowId);
            expect(afterStream.id, 'the activity stream never restarted').toBe(baselineStream.id);

            // settled-cue truth is HOST state (the tour orchestration); the share artifact + live
            // document are COCKPIT product state (the verbs the host drove)
            const hostState = await app.getComponent(hostId, ['cueErrors', 'cueReceipts']);

            expect(hostState.cueErrors, `take ${run + 1}: no cue may fold an error`).toEqual([]);
            expect(hostState.cueReceipts, `take ${run + 1}: one receipt per scripted cue`).toHaveLength(scriptedCueCount);

            const artifact = JSON.parse((await app.getComponent(cockpitId, ['sharedPerspectiveArtifact'])).sharedPerspectiveArtifact);

            expect(artifact.perspectiveName).toBe('Shared Session');
            expect(artifact.dockZone, 'the artifact carries the whole layout document').toBeTruthy();

            // AC-3's LIVE equality: the tour's final beat restored "Shared Session", so the COMMITTED
            // live document must re-fingerprint EQUAL to the exported artifact
            const liveDocument    = (await app.getComponent(cockpitId, ['dockModel'])).dockModel,
                  liveFingerprint = DockZoneModel.computeShapeFingerprint(liveDocument);

            expect(liveFingerprint.errors).toEqual([]);
            expect(liveFingerprint.fingerprint, `take ${run + 1}: the restored live topology is fingerprint-equal to the exported artifact`)
                .toEqual(artifact.windowFingerprint);

            expect(popupCount, `take ${run + 1} opened exactly one real popup`).toBe(popupsBefore + 1)
        }

        // THE TEAMMATE PROOF, mechanical: the artifact leaves + returns over the Neural Link on the
        // COMPOSED cockpit (its own product verb) — the v1 transfer boundary in both directions
        const outbound = (await app.getComponent(cockpitId, ['sharedPerspectiveArtifact'])).sharedPerspectiveArtifact;

        await app.setProperties(cockpitId, {sharedPerspectiveArtifact: outbound});

        const reimport = await app.callMethod(cockpitId, 'importPerspectiveArtifact');

        expect(reimport?.imported, 'the NL-transferred artifact is re-admitted through full validation').toBe(true);
        expect(reimport?.errors).toEqual([]);

        expect(pageErrors, 'the journey must be error-free in the main window').toEqual([])
    });
});
