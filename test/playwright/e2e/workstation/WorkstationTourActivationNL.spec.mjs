import {test, expect} from '../../fixtures.mjs';

const INTERACTIVE_SELECTOR = [
    'button',
    'a[href]',
    'input',
    'select',
    'textarea',
    '[role="button"]',
    '[role="switch"]',
    '[role="tab"]',
    '[role="combobox"]',
    '[role="menuitem"]'
].join(', ');

/**
 * @summary Expected semantic action descriptors across Workstation's two global header rows.
 *
 * A deliberate change to the global actions must update `apps/workstation/README.md` and this
 * contract together.
 * @param {Object} [options={}]
 * @param {String|null} [options.gatePrompt=null] Active viewer gate prompt, or `null` when hidden.
 * @param {String} [options.themeLabel='Light mode'] Visible theme toggle action label.
 * @returns {Object}
 */
function expectedGlobalHeaderActions({gatePrompt = null, themeLabel = 'Light mode'} = {}) {
    const row1 = [{
        action   : null,
        hasIcon  : true,
        owner    : 'tour-bar',
        reference: 'tour-play',
        text     : 'Start tour'
    }];

    if (gatePrompt) {
        row1.push({
            action   : null,
            hasIcon  : true,
            owner    : 'tour-bar',
            reference: 'tour-continue',
            text     : gatePrompt
        })
    }

    row1.push({
        action   : null,
        hasIcon  : true,
        owner    : 'arrangement-switch',
        reference: 'arrangement-operations',
        text     : 'Operations'
    }, {
        action   : null,
        hasIcon  : true,
        owner    : 'arrangement-switch',
        reference: 'arrangement-planning',
        text     : 'Planning'
    }, {
        action   : null,
        hasIcon  : true,
        owner    : 'tour-bar',
        reference: 'command-palette-trigger',
        text     : 'Commands'
    }, {
        action   : null,
        hasIcon  : true,
        owner    : 'tour-bar',
        reference: 'theme-toggle',
        text     : themeLabel
    });

    return {
        alternateTourLaunchers: [],
        headerContainers      : {
            controlsChildren: ['status-bar', 'topology-toolbar'],
            workspacePreDock: ['tour-bar', 'workstation-controls']
        },
        row1,
        row2: [{
            action   : null,
            hasIcon  : true,
            owner    : 'topology-toolbar',
            reference: null,
            text     : 'Reset to default'
        }, {
            action   : 'undo',
            hasIcon  : true,
            owner    : 'topology-toolbar',
            reference: null,
            text     : 'Undo'
        }, {
            action   : 'redo',
            hasIcon  : true,
            owner    : 'topology-toolbar',
            reference: null,
            text     : 'Redo'
        }]
    }
}

/**
 * @summary Reads rendered interactive controls across both global header rows and maps each to its Neo owner.
 *
 * Scopes by header container ownership (`TourToolbar`, `arrangement-switch`, `StatusComponent`,
 * `TopologyToolbar`) and semantic action fields so a new, renamed, or icon-only test button fails.
 * @param {Object} app Connected Neural Link application.
 * @param {import('@playwright/test').Page} page Playwright page.
 * @param {String} workspaceId Root Workspace instance id.
 * @returns {Promise<Object>}
 */
async function inspectGlobalHeaderActions(app, page, workspaceId) {
    const [bar, arrangementSwitch, statusBar, topologyBar, dockHost, wsProps] = await Promise.all([
        app.callMethod(workspaceId, 'getReference', ['tour-bar']),
        app.callMethod(workspaceId, 'getReference', ['arrangement-switch']),
        app.callMethod(workspaceId, 'getReference', ['status-bar']),
        app.callMethod(workspaceId, 'getReference', ['topology-toolbar']),
        app.callMethod(workspaceId, 'getReference', ['dock-host']),
        app.getComponent(workspaceId, ['items'])
    ]);

    const topologyProps = await app.getComponent(topologyBar.id, ['parentId']),
          controlsId    = topologyProps.parentId,
          controlsProps = controlsId ? await app.getComponent(controlsId, ['items']) : {items: []};

    const ownerById = new Map([
        [bar.id,               'tour-bar'],
        [arrangementSwitch.id, 'arrangement-switch'],
        [statusBar.id,         'status-bar'],
        [topologyBar.id,       'topology-toolbar'],
        [controlsId,           'workstation-controls']
    ]);

    const wsItems   = wsProps?.items ?? [],
          dockIndex = wsItems.findIndex(child => (child?.id ?? child) === dockHost.id),
          preDock   = (dockIndex >= 0 ? wsItems.slice(0, dockIndex) : wsItems).map(child => {
              const id = child?.id ?? child;
              return ownerById.get(id) ?? (child?.className || String(id))
          }),
          controlsChildren = (controlsProps?.items ?? []).map(child => {
              const id = child?.id ?? child;
              return ownerById.get(id) ?? (child?.className || String(id))
          });

    const domSnapshot = await page.evaluate(selector => {
        const isVisible = el => {
            if (!el || el.hidden || el.closest('.neo-hidden')) return false;
            const style = getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0
        };

        const readRow = rootSelector => {
            const root = document.querySelector(rootSelector);
            if (!root) return [];

            return [...root.querySelectorAll(selector)]
                .filter(el => isVisible(el) && !el.parentElement?.closest(selector))
                .map(el => ({
                    ariaLabel: el.getAttribute('aria-label') || '',
                    hasIcon  : Boolean(el.querySelector('.neo-button-glyph, i, svg')),
                    id       : el.id || null,
                    text     : (el.querySelector('.neo-button-text')?.textContent ?? el.textContent ?? '').trim()
                }))
        };

        const alternateTourLaunchers = [...document.querySelectorAll(selector)]
            .filter(el => isVisible(el) && !el.closest('.workstation-tourbar') && !el.parentElement?.closest(selector))
            .map(el => (el.querySelector('.neo-button-text')?.textContent ?? el.getAttribute('aria-label') ?? el.textContent ?? '').trim())
            .filter(label => /\b(start|dense|film)?\s*tour\b/i.test(label));

        return {
            alternateTourLaunchers,
            row1: readRow('.workstation-tourbar'),
            row2: readRow('.workstation-controls')
        }
    }, INTERACTIVE_SELECTOR);

    const hydrate = async entries => Promise.all(entries.map(async entry => {
        if (!entry.id) {
            return {
                action   : null,
                hasIcon  : entry.hasIcon,
                owner    : 'unowned-dom',
                reference: null,
                text     : entry.text || entry.ariaLabel
            }
        }

        const comp = await app.getComponent(entry.id, ['action', 'iconCls', 'parentId', 'reference']).catch(() => null);

        if (!comp) {
            return {
                action   : null,
                hasIcon  : entry.hasIcon,
                owner    : 'unregistered-dom',
                reference: null,
                text     : entry.text || entry.ariaLabel
            }
        }

        return {
            action   : comp.action ?? null,
            hasIcon  : Boolean(comp.iconCls || entry.hasIcon),
            owner    : ownerById.get(comp.parentId) ?? `unexpected-parent:${comp.parentId}`,
            reference: comp.reference ?? null,
            text     : entry.text || entry.ariaLabel
        }
    }));

    return {
        alternateTourLaunchers: domSnapshot.alternateTourLaunchers,
        headerContainers      : {
            controlsChildren,
            workspacePreDock: preDock
        },
        row1: await hydrate(domSnapshot.row1),
        row2: await hydrate(domSnapshot.row2)
    }
}

test.use({viewport: {width: 1440, height: 900}});

/**
 * @summary Proves one keyboard-accessible Start tour, global header action ownership, and conditional Continue.
 */
test('Workstation activates one playback controller through Start tour, guards both global header rows, and advances conditional Continue', async ({page, neuralLink}, testInfo) => {
    test.setTimeout(120000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error)));

    await page.goto('/apps/workstation/index.html');
    await page.waitForSelector('.workstation-tour-play');
    await page.waitForSelector('.neo-tab-overflow-control');

    const app            = await neuralLink.connectToApp('Workstation'),
          workspaces     = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
          workspaceId    = workspaces[0].id,
          bar            = await app.callMethod(workspaceId, 'getReference', ['tour-bar']),
          topologyBar    = await app.callMethod(workspaceId, 'getReference', ['topology-toolbar']),
          provider       = await app.callMethod(workspaceId, 'getStateProvider'),
          paneIds        = await Promise.all(['scale', 'feed'].map(id => app.callMethod(workspaceId, 'getPaneIdentity', [id]))),
          readController = async () => (await app.getComponent(bar.id, ['controller'])).controller,
          namespaces     = ['Workstation.view.TourController', 'Workstation.tour.GestureDriver', 'Workstation.tour.NativeGestureDriver'],
          readRuntime    = () => Promise.all(namespaces.map(async name => (await app.checkNamespace(name)).exists));

    await expect.poll(() => page.locator('.workstation-arrangement-switch').isVisible()).toBe(true);
    await testInfo.attach('first-launch-1440x900', {body: await page.screenshot(), contentType: 'image/png'});

    // First-paint global header ownership across both rows.
    expect(await inspectGlobalHeaderActions(app, page, workspaceId))
        .toEqual(expectedGlobalHeaderActions({themeLabel: 'Light mode'}));

    // Demonstrate that the check catches an extra icon-only button in either global header row.
    for (const [targetBar, selector, ownerName] of [
        [bar,         '.workstation-tourbar',     'tour-bar'],
        [topologyBar, '.workstation-topologybar', 'topology-toolbar']
    ]) {
        const added = await app.callMethod(targetBar.id, 'add', [{
                  iconCls  : 'fa fa-flask',
                  ntype    : 'button',
                  reference: 'rogue-icon-only-probe'
              }]),
              rogueId = Array.isArray(added) ? added[0].id : added.id;

        await expect(page.locator(`${selector} #${rogueId}`)).toBeVisible();
        const withRogue = await inspectGlobalHeaderActions(app, page, workspaceId);

        expect(withRogue, `extra icon-only control in ${ownerName} must fail the header check`)
            .not.toEqual(expectedGlobalHeaderActions({themeLabel: 'Light mode'}));
        expect([...withRogue.row1, ...withRogue.row2]).toContainEqual({
            action   : null,
            hasIcon  : true,
            owner    : ownerName,
            reference: 'rogue-icon-only-probe',
            text     : ''
        });

        const targetItems = (await app.getComponent(targetBar.id, ['items'])).items ?? [],
              rogueIndex  = targetItems.findIndex(item => (item?.id ?? item) === rogueId);
        expect(rogueIndex).toBeGreaterThanOrEqual(0);
        await app.callMethod(targetBar.id, 'removeAt', [rogueIndex, true]);
        await expect(page.locator(`${selector} #${rogueId}`)).toHaveCount(0)
    }

    expect(await inspectGlobalHeaderActions(app, page, workspaceId))
        .toEqual(expectedGlobalHeaderActions({themeLabel: 'Light mode'}));

    expect(await readController()).toBeNull();
    expect(await readRuntime()).toEqual([false, false, false]);
    const resize = await app.executeDockOperation(workspaceId, {
        operation: 'resizeSplit', splitNodeId: 'split-main', sizes: [0.625, 0.375]
    });
    expect(resize.applied).toBe(true);
    expect((await app.getDockTopology(workspaceId)).document.nodes['split-main'].sizes).toEqual([0.625, 0.375]);
    expect(await readRuntime(), 'ordinary docking must not load playback').toEqual([false, false, false]);

    const initialTheme = (await app.getComponent(workspaceId, ['theme'])).theme;
    await page.locator('.workstation-theme-button').click();
    await expect(page.locator('.workstation-theme-button')).toHaveText('Dark mode');
    expect(await inspectGlobalHeaderActions(app, page, workspaceId))
        .toEqual(expectedGlobalHeaderActions({themeLabel: 'Dark mode'}));
    await page.locator('.workstation-theme-button').click();
    await expect(page.locator('.workstation-theme-button')).toHaveText('Light mode');
    await expect.poll(async () => (await app.getComponent(workspaceId, ['theme'])).theme).toBe(initialTheme);
    expect(await readController(), 'ordinary theme controls must not activate playback').toBeNull();
    expect(await readRuntime()).toEqual([false, false, false]);

    // Keyboard-accessible Start tour begins playback directly; inspect both rows while running.
    await page.locator('.workstation-tour-play').focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await readController())?.id).toBeTruthy();
    const controller = await readController();
    expect(controller.className).toBe('Workstation.view.TourController');

    await expect.poll(async () => (await app.callMethod(controller.id, 'getTourState')).running).toBe(true);
    const midTourHeaders   = await inspectGlobalHeaderActions(app, page, workspaceId),
          midTourThemeText = midTourHeaders.row1.find(item => item.reference === 'theme-toggle')?.text ?? 'Light mode';
    expect(['Light mode', 'Dark mode']).toContain(midTourThemeText);
    expect(midTourHeaders).toEqual(expectedGlobalHeaderActions({themeLabel: midTourThemeText}));

    let receipt;
    await expect.poll(async () => {
        receipt = await app.callMethod(controller.id, 'getTourReceipt');
        return Boolean(receipt)
    }, {timeout: 60000, intervals: [100, 250, 500]}).toBe(true);
    expect(receipt.errors, JSON.stringify(receipt)).toEqual([]);
    expect(receipt.completed).toBe(true);
    await expect(page.locator('.workstation-tour-caption')).toContainText('Tour complete');
    await expect(page.locator('.workstation-pip-done')).toHaveCount(receipt.log.length);
    await expect(page.locator('.workstation-tour-play')).toBeEnabled();
    expect((await readController()).id).toBe(controller.id);
    expect((await app.callMethod(workspaceId, 'getStateProvider')).id).toBe(provider.id);
    expect(await Promise.all(['scale', 'feed'].map(id => app.callMethod(workspaceId, 'getPaneIdentity', [id])))).toEqual(paneIds);
    expect(await readRuntime(), 'the same worker-side probe must see the activated runtime').toEqual([true, true, true]);

    // Conditional Continue appears only at a viewer gate and advances the running tour.
    const gatedScript = {
        id    : 'workstation-gate-check',
        schema: 'neo.tour.script.v1',
        title : 'Conditional Continue check',
        scenes: [{
            caption: 'Gate check',
            id     : 'gate-scene',
            title  : 'Gate check',
            steps  : [{
                caption: 'Waiting for Continue',
                cue    : {prompt: 'Continue tour check', type: 'gate'},
                ms     : 0,
                type   : 'pause'
            }]
        }]
    };
    const gatedRun = app.callMethod(controller.id, 'startTour', [gatedScript]).catch(error => ({rpcError: String(error)}));

    await expect.poll(() => app.callMethod(controller.id, 'getPendingGate')).toEqual({prompt: 'Continue tour check'});
    await expect(page.locator('.workstation-tour-continue')).toBeVisible();
    expect(await inspectGlobalHeaderActions(app, page, workspaceId))
        .toEqual(expectedGlobalHeaderActions({gatePrompt: 'Continue tour check', themeLabel: 'Light mode'}));

    await page.locator('.workstation-tour-continue').focus();
    await page.keyboard.press('Enter');
    await gatedRun;

    await expect(page.locator('.workstation-tour-continue')).toBeHidden();
    expect(await inspectGlobalHeaderActions(app, page, workspaceId))
        .toEqual(expectedGlobalHeaderActions({themeLabel: 'Light mode'}));
    expect(pageErrors).toEqual([]);
    await testInfo.attach('tour-complete', {body: await page.screenshot(), contentType: 'image/png'})
});
