import {test, expect} from '../../fixtures.mjs';

const harnessId = 'dock-authoring-harness',
      overlay   = page => page.locator('.neo-dashboard-dock-reveal-overlay:not(.neo-dashboard-dock-reveal-overlay-hidden)'),
      railTab   = (page, text) => page.locator('.neo-dashboard-dock-rail-tab', {hasText: text}),
      header    = (page, text) => page.locator('.neo-tab-header-button').filter({hasText: new RegExp(`^${text}$`)});

let sequence = 0;

/**
 * @summary Sends one command to the independent harness and waits for the real host projection.
 * @param {Object} page
 * @param {Object} command
 * @returns {Promise<Object>}
 */
const drive = async (page, command={action: 'snapshot'}) => {
    const current = ++sequence;
    await page.evaluate(data => Neo.worker.App.setConfigs(data), {
        id         : harnessId,
        commandJson: JSON.stringify({...command, sequence: current})
    });

    let result;
    await expect.poll(async () => {
        const reply = await page.evaluate(data => Neo.worker.App.getConfigs(data), {id: harnessId, keys: ['commandResult']});
        [result] = reply?.data ?? reply;
        return result?.sequence
    }).toBe(current);
    expect(result.failure).toBeUndefined();
    return result
};

/** @summary Commits an operation through Workspace's existing reducer and presentation boundary. */
const operate = (page, descriptor) => drive(page, {action: 'operation', descriptor});

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-authoring/index.html');
    await expect(page.locator('#dock-authoring-workspace')).toBeAttached();
    await expect(railTab(page, 'Lazy rail')).toBeVisible();
    await expect(page.locator('.dock-authoring-pane').filter({hasText: 'Alpha initial'})).toBeVisible()
});

test.describe('declarative Workspace renders and owns ordinary panes', () => {
    test('a declared pane answers the engine lookup by its key, and reaches the DOM as data-ref', async ({page}) => {
        // The pane key is the lookup identity, so the engine's own vocabulary reaches into a dock:
        // component.Base#afterSetReference lands it on the vdom root, which is the only observable
        // that distinguishes "the projection stamped a reference" from "it set a config nobody reads".
        await expect(page.locator('.dock-authoring-pane[data-ref="alpha"]')).toBeVisible();
        await expect(page.locator('[data-ref="beta"]')).toBeAttached();

        // The negative half: `summary` is declared with an ntype rather than a module, so this fails
        // if the stamp only reaches module-declared panes.
        await expect(page.locator('[data-ref="summary"]')).toBeAttached();

        // And nothing is stamped for a key that does not exist — the attribute tracks the catalog,
        // not every projected node.
        await expect(page.locator('[data-ref="ghost"]')).toHaveCount(0)
    });

    test('config-only consumer renders tabs, split and rail with independent same-class bindings', async ({page}) => {
        const first         = await drive(page),
              {alpha, beta} = first.panes;

        expect(first.shellCount).toBe(1);
        await expect(page.locator('.neo-dashboard-dock-tabs')).toHaveCount(3);
        await expect(page.locator('.neo-dashboard-dock-split')).toBeVisible();
        await expect(page.locator('.neo-dashboard-dock-splitter').first()).toBeVisible();
        await expect(page.locator(`#${alpha.id}`)).toHaveText('Alpha initial');
        await expect(page.locator(`#${beta.id}`)).toHaveText('Beta initial');
        expect(alpha.className).toBe(beta.className);
        expect(alpha.id).not.toBe(beta.id);
        expect(alpha.instanceWitness).not.toBe(beta.instanceWitness);
        expect(first.lazyLoaded).toBe(false);
        expect(first.lazyInstances).toBe(0);
        expect(first.panes.lazyTab).toBeNull();
        expect(first.panes.lazyRail).toBeNull();

        await drive(page, {action: 'state', key: 'alphaText', value: 'Alpha changed'});
        await expect(page.locator(`#${alpha.id}`)).toHaveText('Alpha changed');
        await expect(page.locator(`#${beta.id}`)).toHaveText('Beta initial')
    });

    test('two keys load the same lazy module on their own tab and rail activation', async ({page}, testInfo) => {
        await header(page, 'Lazy tab').click();
        await expect(page.locator('.dock-authoring-lazy-pane').filter({hasText: 'Lazy tab initial'})).toBeVisible();
        const tab = await drive(page);

        expect(tab.lazyLoaded).toBe(true);
        expect(tab.lazyInstances).toBe(1);
        expect(tab.panes.lazyRail).toBeNull();

        await railTab(page, 'Lazy rail').click();
        await expect(overlay(page).locator('.dock-authoring-lazy-pane')).toHaveText('Lazy rail initial');
        const both = await drive(page);

        expect(both.lazyInstances).toBe(2);
        expect(both.panes.lazyTab.className).toBe(both.panes.lazyRail.className);
        expect(both.panes.lazyTab.id).not.toBe(both.panes.lazyRail.id);
        expect(both.panes.lazyTab.instanceWitness).not.toBe(both.panes.lazyRail.instanceWitness);
        expect(both.panes.lazyTab.text).toBe('Lazy tab initial');
        expect(both.panes.lazyRail.text).toBe('Lazy rail initial');

        const screenshot = testInfo.outputPath('declarative-workspace-reveal.png');
        await page.screenshot({path: screenshot, animations: 'disabled'});
        await testInfo.attach('declarative-workspace-reveal', {path: screenshot, contentType: 'image/png'})
    });

    test('Reload recreates an activated lazy pane while preserving its document and tab chrome', async ({page}) => {
        await header(page, 'Lazy tab').click();
        await expect(page.locator('.dock-authoring-lazy-pane')).toHaveText('Lazy tab initial');
        const first         = await drive(page, {action: 'captureDocument'}),
              oldPane       = first.panes.lazyTab,
              tabs          = page.locator('.neo-dashboard-dock-tabs', {has: header(page, 'Lazy tab')}),
              toolbar       = tabs.locator('.neo-tab-header-toolbar'),
              reload        = toolbar.locator('.neo-button:has([class*="fa-rotate-right"])'),
              retainedNodes = await Promise.all([tabs, toolbar, header(page, 'Lazy tab')].map(locator => locator.elementHandle()));

        expect(first.lazyRequests).toBe(1);
        expect(first.lazyInstances).toBe(1);
        await drive(page, {action: 'mark', itemId: 'lazyTab', value: 'discard on reload', text: 'Edited before reload'});
        await expect(page.locator(`#${oldPane.id}`)).toHaveText('Edited before reload');
        await expect(reload).toHaveCount(1);
        await reload.click();
        await expect(page.locator(`#${oldPane.id}`)).toHaveCount(0);
        await expect(tabs.locator('.dock-authoring-lazy-pane')).toHaveText('Lazy tab initial');

        const fresh       = await drive(page),
              replacement = fresh.panes.lazyTab;
        expect(replacement.id).not.toBe(oldPane.id);
        expect(replacement.instanceWitness).not.toBe(oldPane.instanceWitness);
        expect(replacement.transientNote).toBeNull();
        expect(fresh.lazyRequests, 'the loaded class serves synchronous recreation').toBe(1);
        expect(fresh.lazyInstances).toBe(2);
        expect(fresh.sameCapturedDocument).toBe(true);
        expect(fresh.nodes).toEqual(first.nodes);
        for (const node of retainedNodes) expect(await node.evaluate(element => element.isConnected)).toBe(true);
        await expect(tabs).toHaveCount(1);
        await expect(toolbar).toHaveCount(1);
        await expect(header(page, 'Lazy tab')).toHaveCount(1);

        const moved = await operate(page, {operation: 'moveItem', itemId: 'lazyTab', targetNodeId: 'summary-tabs', index: 0});
        expect(moved.errors).toEqual([]);
        expect(moved.panes.lazyTab.instanceWitness).toBe(replacement.instanceWitness);
        expect(moved.panes.lazyTab.id).toBe(replacement.id);
        expect(moved.lazyInstances).toBe(2);
        await expect(page.locator(`#${replacement.id}`)).toHaveText('Lazy tab initial');
        await expect(page.locator(`#${replacement.id}`)).toHaveCount(1)
    });

    test('ordinary moves and eager tab-to-rail transitions preserve live state', async ({page}) => {
        const first = await drive(page);
        await drive(page, {action: 'mark', itemId: 'alpha', value: 'alpha instance state'});
        await drive(page, {action: 'mark', itemId: 'beta', value: 'beta instance state'});
        await drive(page, {action: 'state', key: 'betaText', value: 'Beta edited'});

        const moved = await operate(page, {operation: 'moveItem', itemId: 'alpha', targetNodeId: 'summary-tabs', index: 0});
        expect(moved.errors).toEqual([]);
        expect(moved.panes.alpha.instanceWitness).toBe(first.panes.alpha.instanceWitness);
        expect(moved.panes.alpha.transientNote).toBe('alpha instance state');
        await expect(page.locator(`#${first.panes.alpha.id}`)).toBeVisible();
        await expect(page.locator(`#${first.panes.alpha.id}`)).toHaveCount(1);

        expect((await operate(page, {operation: 'setItemAutoHidden', itemId: 'beta', autoHidden: true})).errors).toEqual([]);
        await railTab(page, 'Beta').click();
        await expect(overlay(page).locator(`#${first.panes.beta.id}`)).toHaveText('Beta edited');
        await page.keyboard.press('Escape');
        await expect(overlay(page)).toHaveCount(0);
        const parked = await drive(page);
        expect(parked.panes.beta.instanceWitness).toBe(first.panes.beta.instanceWitness);
        expect(parked.panes.beta.transientNote).toBe('beta instance state');

        await railTab(page, 'Beta').click();
        await overlay(page).locator('.neo-dashboard-dock-reveal-pin').click();
        await expect(railTab(page, 'Beta')).toHaveCount(0);
        await expect(page.locator('.neo-dashboard-dock-tabs').locator(`#${first.panes.beta.id}`)).toHaveText('Beta edited');
        const pinned = await drive(page);
        expect(pinned.panes.beta.instanceWitness).toBe(first.panes.beta.instanceWitness);
        expect(pinned.panes.beta.transientNote).toBe('beta instance state');
        await drive(page, {action: 'state', key: 'betaText', value: 'Beta after pin'});
        await expect(page.locator(`#${first.panes.beta.id}`)).toHaveText('Beta after pin')
    });

    test('a first-reveal lazy instance survives dismissal, pinning and a second rail transition', async ({page}) => {
        await railTab(page, 'Lazy rail').click();
        await expect(overlay(page).locator('.dock-authoring-lazy-pane')).toBeVisible();
        const first = await drive(page);
        await drive(page, {action: 'mark', itemId: 'lazyRail', value: 'retained lazy state', text: 'Edited lazy rail'});

        await page.keyboard.press('Escape');
        await expect(overlay(page)).toHaveCount(0);
        await railTab(page, 'Lazy rail').click();
        await expect(overlay(page).locator(`#${first.panes.lazyRail.id}`)).toHaveText('Edited lazy rail');
        await overlay(page).locator('.neo-dashboard-dock-reveal-pin').click();
        await expect(railTab(page, 'Lazy rail')).toHaveCount(0);
        await expect(page.locator('.neo-dashboard-dock-tabs').locator(`#${first.panes.lazyRail.id}`)).toHaveText('Edited lazy rail');

        let current = await drive(page);
        expect(current.panes.lazyRail.instanceWitness).toBe(first.panes.lazyRail.instanceWitness);
        expect(current.panes.lazyRail.transientNote).toBe('retained lazy state');
        expect(current.lazyInstances).toBe(1);
        expect(current.panes.lazyTab).toBeNull();

        expect((await operate(page, {operation: 'setItemPinned', itemId: 'lazyRail', pinned: false})).errors).toEqual([]);
        expect((await operate(page, {operation: 'setItemAutoHidden', itemId: 'lazyRail', autoHidden: true})).errors).toEqual([]);
        await railTab(page, 'Lazy rail').click();
        await expect(overlay(page).locator(`#${first.panes.lazyRail.id}`)).toHaveText('Edited lazy rail');
        current = await drive(page);
        expect(current.panes.lazyRail.instanceWitness).toBe(first.panes.lazyRail.instanceWitness);
        expect(current.lazyInstances).toBe(1)
    });

    test('later assignments do not replace declarations; close and public reopen use the consumed pane', async ({page}) => {
        const first = await drive(page);
        expect((await operate(page, {operation: 'moveItem', itemId: 'alpha', targetNodeId: 'summary-tabs', index: 0})).errors).toEqual([]);
        const later = await drive(page, {action: 'laterAssignment'});
        expect(later.documentIdentityUnchanged).toBe(true);
        expect(later.refreshIdentityUnchanged).toBe(true);
        expect(later.nodes['summary-tabs'].items).toContain('alpha');
        expect(later.panes.alpha.instanceWitness).toBe(first.panes.alpha.instanceWitness);

        const closed = await operate(page, {operation: 'closeItem', itemId: 'alpha'});
        expect(closed.errors).toEqual([]);
        expect(closed.catalog).not.toContain('alpha');
        expect(closed.panes.alpha).toBeNull();
        await expect(page.locator(`#${first.panes.alpha.id}`)).toHaveCount(0);

        const target = {operation: 'addTab', tabsNodeId: 'main-tabs'},
              opened = await drive(page, {action: 'open', itemId: 'alpha', target});
        expect(opened.errors).toEqual([]);
        expect(opened.catalog.filter(itemId => itemId === 'alpha')).toHaveLength(1);
        expect(opened.nodes['main-tabs'].items.filter(itemId => itemId === 'alpha')).toHaveLength(1);
        expect(opened.panes.alpha.className).toBe(first.panes.alpha.className);
        expect(opened.panes.alpha.instanceWitness).not.toBe(first.panes.alpha.instanceWitness);
        await expect(page.locator(`#${opened.panes.alpha.id}`)).toHaveText('Alpha initial');
        await expect(page.locator(`#${opened.panes.alpha.id}`)).toHaveCount(1);

        for (const itemId of ['alpha', 'unknown']) {
            const refused = await drive(page, {action: 'open', itemId, target});
            expect(refused.errors.length).toBeGreaterThan(0);
            expect(refused.documentIdentityUnchanged).toBe(true);
            expect(refused.refreshIdentityUnchanged).toBe(true)
        }
    })
});
