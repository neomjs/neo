import {test, expect} from '../fixtures.mjs';

/**
 * @summary Regression proof: `neuralLink.connectToApp` works for a childapp on a shared SharedWorker.
 *
 * A childapp that joins an existing SharedWorker resolves `getWorkerId()` to a remote-reply ENVELOPE
 * (`{action:'reply', data:<id>, ...}`) rather than a string, which used to leave `targetId` non-string and
 * make `connectToApp` throw `target.toLowerCase is not a function` in `ConnectionService.waitForSession`.
 * The fixture now treats a non-string worker id as absent and falls back to the appName (which
 * `waitForSession` matches on `meta.appName`). This boots the ColorsWidget childapp, connects, and reads
 * back the live viewport — proving the fixture resolves a childapp end to end.
 *
 * @see test/playwright/fixtures.mjs (connectToApp targetId resolution)
 * @see test/playwright/e2e/NeuralLinkCreateGrid.spec.mjs (the top-level-app counterpart)
 */
test.describe('Neural Link — childapp connect (SharedWorker topology)', () => {
    test.setTimeout(90000);
    test.use({viewport: {width: 1280, height: 720}});

    test('connectToApp resolves a childapp + reads a live component', async ({page, neuralLink}) => {
        await page.goto('/apps/colors/childapps/widget/index.html');
        // The childapp-connect proof is topology, not visual layout: an empty viewport may be
        // attached but hidden, while still being a valid Neural Link readback target.
        await page.waitForSelector('#colors-widget-viewport', {state: 'attached', timeout: 30000});

        // a childapp joins the parent SharedWorker session; `ColorsWidget` is a WINDOW within it,
        // so the session is reached via the worker appName.
        const app = await neuralLink.connectToApp('colors');
        expect(app.sessionId, 'connectToApp must resolve the childapp worker session').toBeTruthy();

        // read back the live viewport through the connection — proves it works end to end
        const viewport = await app.getComponent('colors-widget-viewport', ['className', 'ntype']);
        expect(viewport.className).toBe('ColorsWidget.view.Viewport');
        expect(viewport.ntype).toBe('viewport')
    });
});
