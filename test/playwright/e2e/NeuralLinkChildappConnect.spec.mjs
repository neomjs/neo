import {test, expect} from '../fixtures.mjs';

/**
 * @summary Regression proof: `neuralLink.connectToApp` works for a childapp on a shared SharedWorker.
 *
 * A childapp that joins an existing SharedWorker resolves `getWorkerId()` to a remote-reply ENVELOPE
 * (`{action:'reply', data:<id>, ...}`) rather than a string, which used to leave `targetId` non-string and
 * make `connectToApp` throw `target.toLowerCase is not a function` in `ConnectionService.waitForSession`.
 * The fixture now treats a non-string worker id as absent and falls back to the appName (which
 * `waitForSession` matches on `meta.appName`). This boots the AgentOSWidget childapp, connects, and reads
 * back the live bootstrap grid — proving the fixture resolves a childapp end to end.
 *
 * @see test/playwright/fixtures.mjs (connectToApp targetId resolution)
 * @see test/playwright/e2e/NeuralLinkCreateGrid.spec.mjs (the top-level-app counterpart)
 */
test.describe('Neural Link — childapp connect (SharedWorker topology)', () => {
    test.setTimeout(90000);
    test.use({viewport: {width: 1280, height: 720}});

    test('connectToApp resolves a childapp + reads a live component', async ({page, neuralLink}) => {
        await page.goto('/apps/agentos/childapps/widget/index.html');
        // the in-app bootstrap grid mounts — the app is live before we connect
        await page.waitForSelector('.agent-os-first-widget-grid', {state: 'visible', timeout: 30000});

        // a childapp joins the parent SharedWorker session (registered under the worker appName `agentos`);
        // `AgentOSWidget` is a WINDOW within it, so the session is reached via the worker appName.
        const app = await neuralLink.connectToApp('agentos');
        expect(app.sessionId, 'connectToApp must resolve the childapp worker session').toBeTruthy();

        // read back the live bootstrap grid through the connection — proves it works end to end
        const grid = await app.getComponent('first-widget-grid', ['ntype', 'store.count']);
        expect(grid.ntype).toBe('grid-container');
        expect(grid['store.count']).toBe(3)
    });
});
