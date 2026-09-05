import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness: header truth resolves identically from the opener and from a
 * popped-out window.
 *
 * Header truth lives on the dock workspace's own state provider under `dock`, and a pane reads it
 * through the ordinary provider hierarchy — `getStateProvider()` walks the component tree. A real
 * Workstation pop-out moves the live pane instance into a vessel the popup window renders, so the
 * pane's tree changes while its item's truth does not. This arm reads, from the App Worker, which
 * provider the pane resolves and what that provider answers for the item, once from the opener and
 * once from the popup, and requires the same provider and the same answer; the workspace's own read
 * is the control both are compared against.
 *
 * Why the same provider: `component.Abstract#getStateProvider` resolves the closest provider once
 * and keeps it (`closestProvider`), so a pane stays with the workspace whose truth it presents
 * whatever window renders it — the popup's own viewport carries no provider. A hop that reset that
 * resolution would turn this arm red, which is the point of pinning it here.
 *
 * Runs in Playwright's default headless mode of the local Chrome channel the e2e config selects. The
 * popup is a real second window either way.
 *
 * Run: NEO_AGENTOS_RUNTIME_ROOT=<abs path to neo-agent-brain> NEO_E2E_PORT=8153 \
 *      npx playwright test workstation/WorkstationHeaderStatePopOutNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 *
 * The runtime root is not optional: `playwright.config.e2e.mjs` ignores every neuralLink-fixture
 * spec without it, so the command selects ZERO tests and reports success.
 */
const
    ITEM    = 'commits', // a leaf pane of the Workstation's boot document
    TRUTH   = `dock.items.${ITEM}`,
    asArray = value => Array.isArray(value) ? value : (value?.instances ?? value?.items ?? []),
    flatten = entries => asArray(entries).map(entry => ({id: entry.id, ...(entry.properties ?? entry)}));

test.describe('Workstation pop-out — header truth resolves identically from both windows (Neural Link)', () => {
    test.setTimeout(120000);
    test.use({viewport: {width: 1600, height: 900}});

    test('the popped-out pane resolves the workspace provider and reads the same header truth from the popup', async ({page, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host',              {timeout: 60000});
        await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});

        const
            app         = await neuralLink.connectToApp('Workstation'),
            workspaceId = flatten(await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']))[0]?.id;

        expect(workspaceId, 'the Workstation workspace is live').toBeTruthy();

        const
            providerId = (await app.getComponent(workspaceId, ['stateProvider.id']))['stateProvider.id'],
            dockModel  = (await app.getComponent(workspaceId, ['dockModel'])).dockModel,
            nodeId     = Object.entries(dockModel.nodes || {}).find(([, node]) => node.type === 'tabs' && node.items?.includes(ITEM))?.[0],
            paneId     = await app.callMethod(workspaceId, 'getPaneIdentity', [ITEM]);

        expect(providerId, 'the workspace owns the provider header truth lives on').toBeTruthy();
        expect(nodeId,     `${ITEM} sits in a tabs node`).toBeTruthy();
        expect(paneId,     `${ITEM} owns a live pane before the pop-out`).toBeTruthy();

        // Activate the tab so the pane owns DOM in the opener.
        const chrome = await app.callMethod(workspaceId, 'getTabChromeIdentity', [nodeId]);

        expect(chrome?.buttons?.[ITEM], `${ITEM} projects into live tab chrome`).toBeTruthy();
        await page.locator(`#${chrome.buttons[ITEM]}`).click();
        await expect(page.locator(`#${paneId}`)).toBeVisible({timeout: 10000});

        /**
         * What the pane resolves from where it stands: the provider `getStateProvider()` walks to, and
         * the item's header truth read through it (`getState` = `getStateProvider().getData`).
         */
        const readFromPane = async () => ({
            providerId: (await app.callMethod(paneId, 'getStateProvider'))?.id ?? null,
            truth     : await app.callMethod(paneId, 'getState', [TRUTH]).catch(() => null)
        });

        // The control: the workspace's own provider, read directly.
        const readFromWorkspace = () => app.callMethod(workspaceId, 'stateProvider.getData', [TRUTH]);

        const
            control = await readFromWorkspace(),
            before  = await readFromPane();

        expect(typeof control?.locked, 'the workspace publishes the item\'s header truth').toBe('boolean');
        expect(before.providerId, 'from the opener the pane resolves the workspace\'s provider').toBe(providerId);
        expect(before.truth,      'and reads the published truth through it').toEqual(control);

        const
            action = await app.callMethod(chrome.containerId, 'getAction', ['pop-out']),
            popOut = page.locator(`#${action?.id}`);

        expect(action?.id, 'pop-out resolves on the live tab owner').toBeTruthy();
        await expect(popOut).toBeVisible({timeout: 10000});

        // Subscribed before the click: the vessel can open faster than the next await.
        const popupPromise = page.waitForEvent('popup', {timeout: 30000});

        await popOut.click();

        const popup = await popupPromise;

        await popup.waitForSelector('.workstation-viewport', {timeout: 30000});
        await expect(popup.locator(`#${paneId}`), 'the popup renders the exact live pane').toBeVisible({timeout: 15000});

        const popupWindowId = await popup.evaluate(() => Neo.worker.Manager.windowId);

        expect(popupWindowId, 'the vessel is its own window').toBeTruthy();

        await expect.poll(async () => (await app.getComponent(paneId, ['windowId'])).windowId,
            {message: 'the live pane belongs to the popup window', timeout: 15000}).toBe(popupWindowId);

        const
            props = await app.getComponent(paneId, ['id', 'mounted', 'parentId', 'parentComponent.id']),
            after = await readFromPane();

        expect(props.id, 'the same instance made the hop').toBe(paneId);
        expect(props.mounted).toBe(true);

        // The witness: the tree changed, the truth's owner did not. From the popup the pane resolves
        // the same provider it resolved from the opener and reads what the workspace publishes now.
        // The tear-out is itself a commit — `detachItem` takes the item out of its tabs node — so the
        // one field derived from topology, the owning `edge`, is null while the item is out; every
        // other field of the item's truth is unchanged.
        expect(after.providerId, 'from the popup the pane resolves the workspace\'s provider').toBe(providerId);
        expect(after.truth,      'and reads the item\'s truth, the owning edge released by the detach').toEqual({...before.truth, edge: null});
        expect(await readFromWorkspace(), 'which is what the workspace publishes').toEqual(after.truth);

        const receipt = {control, before, after, popupWindowId, pane: props, providerId};

        // One line in any run log, beside the attachment: the ids the assertions compared.
        console.log(`HEADER_TRUTH_ACROSS_THE_HOP ${JSON.stringify(receipt)}`);
        await test.info().attach('header-truth-across-the-hop', {body: JSON.stringify(receipt, null, 2), contentType: 'application/json'});

        // Return the pane home through the workspace's own vessel retirement.
        expect(await app.callMethod(workspaceId, 'closeTearOutVessel', [{itemId: ITEM, windowName: `tearout-${ITEM}`}])).toBe(true);
        await expect.poll(() => popup.isClosed(), {timeout: 10000}).toBe(true)
    })
});
