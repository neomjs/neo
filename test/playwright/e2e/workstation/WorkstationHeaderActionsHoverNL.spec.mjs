import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness: `headerActionsShowOnHover` reveals a dock pane's focus-gated
 * header actions on pointer hover while keeping its tab overflow partition stable.
 *
 * Run with NEO_AGENTOS_RUNTIME_ROOT set to a Brain checkout:
 * NEO_NL_PORT=8191 NEO_AGENTOS_RUNTIME_ROOT=/path/to/neo-agent-brain npx playwright test workstation/WorkstationHeaderActionsHoverNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Workstation — header actions reveal on hover without overflow shift', () => {
    test.setTimeout(90000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 840, width: 1280}
    });

    test('turning headerActionsShowOnHover on reveals heavy-tabs actions on real pointer hover and preserves the tab partition', async ({page, neuralLink}) => {
        const pageErrors = [];

        page.on('pageerror', error => pageErrors.push(String(error.stack || error.message || error)));

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 60000});

        const app        = await neuralLink.connectToApp('Workstation'),
              workspaces = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(wsId, 'the Workstation Workspace must exist in the App Worker').toBeTruthy();

        const chrome = await app.callMethod(wsId, 'getTabChromeIdentity', ['heavy-tabs']);
        expect(chrome?.headerId, 'heavy-tabs header toolbar must be projected').toBeTruthy();

        const headerProps    = await app.getComponent(chrome.headerId, ['parentId']),
              tabContainerId = headerProps?.parentId;
        expect(tabContainerId, 'heavy-tabs tab.Container must be projected').toBeTruthy();

        // Park the pointer outside heavy-tabs and ensure heavy-tabs does not hold focus.
        await page.mouse.move(8, 8);
        await app.setProperties(tabContainerId, {containsFocus: false});

        const readHeaderState = () => page.evaluate(({headerId, tabContainerId}) => {
            const toolbar   = document.getElementById(headerId),
                  container = document.getElementById(tabContainerId),
                  rect      = container?.getBoundingClientRect(),
                  buttons   = toolbar ? [...toolbar.querySelectorAll('.neo-tab-header-button')].map(el => el.id) : [],
                  actions   = toolbar ? [...toolbar.querySelectorAll(':scope > .neo-toolbar-action')].map(el => ({
                      ariaLabel: el.getAttribute('aria-label'),
                      id       : el.id,
                      width    : Math.round(el.getBoundingClientRect().width)
                  })) : [];

            return {
                actions,
                buttons,
                rect: rect ? {
                    height: Math.round(rect.height),
                    left  : Math.round(rect.left),
                    top   : Math.round(rect.top),
                    width : Math.round(rect.width)
                } : null
            }
        }, {headerId: chrome.headerId, tabContainerId});

        // 1. Default off: hovering heavy-tabs does not reveal focus-gated actions.
        const initial = await readHeaderState();
        expect(initial.rect?.width).toBeGreaterThan(0);

        const hoverX = initial.rect.left + Math.floor(initial.rect.width / 2),
              hoverY = initial.rect.top  + Math.min(20, Math.floor(initial.rect.height / 2));

        await page.mouse.move(hoverX, hoverY);
        const defaultHoveredProps = await app.getComponent(chrome.headerId, ['contextualActionsVisible', 'showOnHover']);
        expect(defaultHoveredProps.showOnHover).toBe(false);
        expect(defaultHoveredProps.contextualActionsVisible).toBe(false);

        // Move pointer back outside before enabling `headerActionsShowOnHover`.
        await page.mouse.move(8, 8);

        // 2. Enable `headerActionsShowOnHover: true` on the Workspace and wait for overflow settle.
        await app.setProperties(wsId, {headerActionsShowOnHover: true});

        await expect.poll(async () => {
            const props = await app.getComponent(chrome.headerId, ['showOnHover', 'contextualActionsVisible']),
                  state = await readHeaderState();
            return props.showOnHover === true
                && props.contextualActionsVisible === false
                && state.actions.length === 2
                && state.buttons.length > 0
                && state.buttons.length < 12
        }, {timeout: 10000}).toBe(true);

        const beforeHover = await readHeaderState();

        // 3. Move real pointer into heavy-tabs: focus-gated actions reveal AND tab partition stays identical.
        await page.mouse.move(hoverX, hoverY);

        await expect.poll(async () => {
            const props = await app.getComponent(chrome.headerId, ['contextualActionsVisible']),
                  state = await readHeaderState();
            return props.contextualActionsVisible === true
                && state.actions.length > beforeHover.actions.length
                && state.actions.every(action => action.width > 0)
        }, {timeout: 10000}).toBe(true);

        const duringHover = await readHeaderState();
        expect(duringHover.buttons, 'tab overflow partition must not shift when hover reveals actions').toEqual(beforeHover.buttons);

        // 4. Move real pointer out of heavy-tabs: focus-gated actions withdraw AND tab partition stays identical.
        await page.mouse.move(8, 8);

        await expect.poll(async () => {
            const props = await app.getComponent(chrome.headerId, ['contextualActionsVisible']),
                  state = await readHeaderState();
            return props.contextualActionsVisible === false
                && state.actions.length === beforeHover.actions.length
        }, {timeout: 10000}).toBe(true);

        const afterHover = await readHeaderState();
        expect(afterHover.buttons, 'tab overflow partition must not shift when hover leaves').toEqual(beforeHover.buttons);

        expect(pageErrors).toEqual([])
    })
});
