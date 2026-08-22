import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox witness for Demo B's third registered claim target (the row-6 arbitration
 * prerequisite): both popup workspaces stage through the SAME registration semantics as the
 * first — real windows, real projections, measurable claim geometry — so the matrix's row-6
 * cell is executable without any test-host simulation. The arbitration receipt itself is the
 * matrix lane's cell; this witness owns the staging composition it measures.
 *
 * Headed matrix run: npx playwright test agentos/DemoBThirdClaimantStageNL \
 *   -c test/playwright/playwright.config.matrix.mjs --workers=1
 */
test.describe('AgentOS Demo B — three registered claim targets', () => {
    test.setTimeout(120000);

    // Both physical viewports must fit on the headed screen; this is stage geometry, not a
    // fixed product layout assumption.
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 720, width: 760}
    });

    test('both popup workspaces stage through the same seams and expose measurable claim geometry', async ({page, neuralLink}) => {
        await page.goto('/examples/dashboard/crossWindow/index.html');
        await page.waitForSelector('.agentos-dockdemo-counter-pane', {timeout: 30000});

        const app        = await neuralLink.connectToApp('AgentOSDockDemo'),
              workspaces = await app.findInstances(
                  {className: 'Neo.examples.dashboard.crossWindow.DemoBWorkspace'},
                  ['id']
              ),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(wsId, 'the App Worker must own one DemoBWorkspace').toBeTruthy();

        // All three claim targets are registered through the same workspace-set semantics —
        // the third is a data fact in the same registry, never a bespoke host.
        for (const workspaceId of ['demo-b-main', 'demo-b-popup', 'demo-b-popup-2']) {
            const document = await app.callMethod(wsId, 'getWorkspaceDocument', [workspaceId]);

            expect(document?.nodes, `${workspaceId} must resolve a committed workspace document`).toBeTruthy()
        }

        const receipt1 = await app.callMethod(wsId, 'openCrossWindowStage', []),
              receipt2 = await app.callMethod(wsId, 'openCrossWindowStage', ['demo-b-popup-2']);

        expect(receipt1).toMatchObject({workspaceId: 'demo-b-popup'});
        expect(receipt2).toMatchObject({workspaceId: 'demo-b-popup-2'});
        expect(receipt2.windowId).not.toBe(receipt1.windowId);

        // Two REAL render targets connected, each carrying its own workspace identity.
        await expect.poll(() => page.context().pages().map(child => {
            try {
                return new URL(child.url()).searchParams.get('workspaceId')
            } catch {
                return null
            }
        }).filter(Boolean).sort(), {
            message  : 'both popup windows must connect with their own workspace identity',
            timeout  : 30000,
            intervals: [100, 250]
        }).toEqual(['demo-b-popup', 'demo-b-popup-2']);

        // Every claimant exposes measurable claim geometry — the row-6 cell's executable surface.
        for (const workspaceId of ['demo-b-main', 'demo-b-popup', 'demo-b-popup-2']) {
            const geometry = await app.callMethod(wsId, 'measureWorkspaceGeometry', [workspaceId]);

            expect(geometry?.zones?.length, `${workspaceId} must expose measurable claim zones`)
                .toBeGreaterThanOrEqual(1)
        }
    });
});
