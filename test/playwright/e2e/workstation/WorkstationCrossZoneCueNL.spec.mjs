import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness for the dense tour's audit cross-zone cue, invoked standalone.
 *
 * The tour runner fires surface cues without consuming their results, so a cue whose terminal
 * commit produces no document mutation still lets the tour report every cue as settled. This
 * spec invokes the exact tour cue directly on the Workspace and binds the executor's own
 * return contract — `applied`, empty `errors`, the two-dwell beat log, and the committed
 * document — so a silent commit no-op fails loudly with the executor's full forensic payload
 * in the assertion message.
 *
 * Run: NEO_E2E_PORT=8151 npx playwright test workstation/WorkstationCrossZoneCueNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Workstation — the audit cross-zone cue commits what it previews', () => {
    test.setTimeout(90000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 800, width: 1280}
    });

    test('the tour cue, invoked standalone, lands audit inside right-bottom-tabs', async ({page, neuralLink}) => {
        const pageErrors = [];

        page.on('pageerror', error => {
            let value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && pageErrors.push(value)
        });

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 60000});
        await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});
        await page.waitForFunction(() => {
            const host = document.querySelector('.workstation-dock-host');

            return host?.getBoundingClientRect().height > 300
        }, {timeout: 60000});
        await page.waitForTimeout(1200);

        const app        = await neuralLink.connectToApp('Workstation'),
              workspaces = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(wsId, 'the workstation Workspace must exist in the App Worker').toBeTruthy();

        const before = (await app.getDockTopology(wsId)).document;

        expect(
            before.nodes['right-top-tabs']?.items,
            'precondition: audit is held by its tour source node'
        ).toContain('audit');

        // The exact cue the dense tour fires (apps/workstation/tour/denseWorkstation.mjs),
        // invoked through the same entry the tour runner uses.
        const result = await app.callMethod(wsId, 'executeCue', [{
            type        : 'cross-zone-showcase',
            itemId      : 'audit',
            sourceNodeId: 'right-top-tabs',
            terminal    : 'commit',
            dwells      : [
                {targetNodeId: 'scale-tabs',        placementKind: 'edge-bottom'},
                {targetNodeId: 'right-bottom-tabs', placementKind: 'tab-into'}
            ],
            options: {dwellDelay: 700, moveDelay: 24, moveSteps: 18, showCursor: true}
        }]);

        const receipt = JSON.stringify(result);

        expect(result, `the cue must return its result contract: ${receipt}`).toBeTruthy();
        expect(result.errors ?? ['<no errors array>'], `cue errors must be empty: ${receipt}`).toEqual([]);
        expect(result.applied, `the terminal commit must apply the previewed operation: ${receipt}`).toBe(true);
        expect(
            (result.beatLog ?? []).map(beat => beat.placementKind),
            `both dwells must present their previews in order: ${receipt}`
        ).toEqual(['edge-bottom', 'tab-into']);

        const after = (await app.getDockTopology(wsId)).document;

        expect(
            after.nodes['right-bottom-tabs']?.items,
            `document truth: audit joins right-bottom-tabs — after=${JSON.stringify(after.nodes['right-bottom-tabs'])}`
        ).toContain('audit');
        expect(
            after.nodes['right-top-tabs']?.items ?? [],
            'document truth: audit left its source node'
        ).not.toContain('audit');

        // Chrome truth must follow the document: the pane component and its header button
        // re-home into the destination tab container, not merely the model.
        const targetChrome = await app.callMethod(wsId, 'getTabChromeIdentity', ['right-bottom-tabs']),
              sourceChrome = await app.callMethod(wsId, 'getTabChromeIdentity', ['right-top-tabs']);

        expect(
            targetChrome?.buttons?.audit,
            `chrome truth: audit's header button lives under right-bottom-tabs — target=${JSON.stringify(targetChrome)} source=${JSON.stringify(sourceChrome)}`
        ).toBeTruthy();
        expect(
            sourceChrome?.buttons?.audit ?? null,
            `chrome truth: audit's header button left right-top-tabs — source=${JSON.stringify(sourceChrome)}`
        ).toBeNull();

        expect(pageErrors, 'the gesture surfaces no page errors').toEqual([])
    });
});
