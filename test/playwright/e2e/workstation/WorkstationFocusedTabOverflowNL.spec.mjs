import {test, expect} from '../../fixtures.mjs';

/**
 * @summary A focused non-active tab and its contextual actions survive a real overflow projection.
 *
 * The stage adds a third tab to a two-tab Workstation header through the dock model, then changes
 * the viewport width. This witnesses the browser focus and DOM action nodes that the pure partition
 * tests for #19285 cannot observe.
 *
 * Run with NEO_AGENTOS_RUNTIME_ROOT set to a Brain checkout:
 * npx playwright test workstation/WorkstationFocusedTabOverflowNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Workstation — focused tab survives overflow', () => {
    test.setTimeout(90000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 840, width: 1180}
    });

    test('a focused non-active tab keeps its node, focus and contextual actions', async ({page, neuralLink}) => {
        const pageErrors = [];

        page.on('pageerror', error => pageErrors.push(String(error.stack || error.message || error)));

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 60000});

        const app        = await neuralLink.connectToApp('Workstation'),
              workspaces = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(wsId, 'the Workstation Workspace must exist in the App Worker').toBeTruthy();

        const document = (await app.getDockTopology(wsId)).document,
              rejected = [];
        let stage;

        for (const [nodeId, node] of Object.entries(document.nodes)) {
            if (node.type !== 'tabs' || node.items?.length !== 2) continue;

            const chrome = await app.callMethod(wsId, 'getTabChromeIdentity', [nodeId]);

            if (!chrome?.headerId) {
                rejected.push({nodeId, reason: 'no projected header'});
                continue
            }

            const candidate = await page.evaluate(headerId => {
                const toolbar = document.getElementById(headerId);

                if (!toolbar) return {reason: 'no header DOM'};

                const rect = toolbar.getBoundingClientRect();

                return {
                    actionCount: toolbar.querySelectorAll(':scope > .neo-toolbar-action').length,
                    buttonCount: toolbar.querySelectorAll('.neo-tab-header-button').length,
                    reveal     : toolbar.classList.contains('neo-dashboard-dock-reveal-header'),
                    rightSide  : rect.left > innerWidth / 2,
                    width      : Math.round(rect.width)
                }
            }, chrome.headerId);

            if (candidate.width > 0 && candidate.rightSide && !candidate.reveal && candidate.buttonCount === 2) {
                stage = {nodeId, node, chrome, candidate};
                break
            }

            rejected.push({nodeId, ...candidate})
        }

        expect(stage,
            `no visible right-side two-tab header stages focus overflow; rejected=${JSON.stringify(rejected)}`
        ).toBeTruthy();

        const activeId  = stage.node.activeItemId,
              witnessId = 'focused-overflow-witness';

        expect(stage.node.items, 'the active item belongs to the selected two-tab header').toContain(activeId);

        await page.setViewportSize({height: 840, width: 1920});

        const expanded = await app.executeDockOperation(wsId, {
            edge      : 'right',
            edgeZoneId: 'root',
            extent    : 0.5,
            operation : 'resizeEdgeZone'
        });

        expect(expanded.errors).toEqual([]);
        expect(expanded.applied).toBe(true);

        const added = await app.executeDockOperation(wsId, {
            item     : {title: 'Focused overflow witness with a deliberately wide header'},
            itemId   : witnessId,
            operation: 'addItem',
            target   : {operation: 'addTab', tabsNodeId: stage.nodeId}
        });

        expect(added.errors).toEqual([]);
        expect(added.applied).toBe(true);

        const restored = await app.executeDockOperation(wsId, {
            itemId    : activeId,
            operation : 'setActiveItem',
            tabsNodeId: stage.nodeId
        });

        expect(restored.errors).toEqual([]);
        expect(restored.applied).toBe(true);

        await expect.poll(
            async () => (await app.callMethod(wsId, 'getTabChromeIdentity', [stage.nodeId]))?.buttons?.[witnessId],
            {message: 'the addItem commit projects its new tab button', timeout: 30000}
        ).toBeTruthy();

        const chrome         = await app.callMethod(wsId, 'getTabChromeIdentity', [stage.nodeId]),
              focusedId      = chrome?.buttons?.[witnessId],
              activeButtonId = chrome?.buttons?.[activeId];

        expect(focusedId, 'the dock addItem projected a third real tab button').toBeTruthy();
        expect(activeButtonId, 'the original active tab retained its chrome').toBeTruthy();

        await expect.poll(
            () => page.evaluate(headerId => {
                const toolbar = document.getElementById(headerId);
                return [...(toolbar?.querySelectorAll('.neo-tab-header-button') || [])]
                    .filter(button => button.getBoundingClientRect().width > 0).length
            }, chrome.headerId),
            {message: 'all three tab buttons must have real boxes before focus', timeout: 30000}
        ).toBe(3);

        await page.evaluate(id => document.getElementById(id)?.focus(), focusedId);

        await expect.poll(
            () => page.evaluate(id => document.activeElement?.id === id, focusedId),
            {message: 'the non-active witness tab must hold real DOM focus before narrowing'}
        ).toBe(true);
        await expect.poll(
            async () => (await app.getComponent(focusedId, ['containsFocus']))?.containsFocus,
            {message: 'the App Worker must observe the witness tab focus before projection'}
        ).toBe(true);

        const actionIds = () => page.evaluate(headerId => {
            const toolbar = document.getElementById(headerId);
            return [...(toolbar?.querySelectorAll(':scope > .neo-toolbar-action') || [])]
                .map(action => action.id).sort()
        }, chrome.headerId);

        await expect.poll(async () => (await actionIds()).length,
            {message: 'focus must reveal the contextual action nodes before the baseline'}
        ).toBeGreaterThan(1);

        let previous;
        await expect.poll(async () => {
            const current = await actionIds(),
                  stable  = current.length > 1 && previous?.join('|') === current.join('|');
            previous = current;
            return stable
        }, {message: 'contextual action IDs settle before narrowing'}).toBe(true);

        const beforeActions = await actionIds(),
              beforeWidth   = await page.evaluate(id => Math.round(document.getElementById(id)?.getBoundingClientRect().width || 0), chrome.headerId),
              currentWidth  = page.viewportSize().width,
              narrowWidth   = Math.max(760, Math.floor(currentWidth * 0.4));

        expect(beforeActions.length, 'the action-retention baseline must be nonempty').toBeGreaterThan(1);
        expect(await page.evaluate(({headerId, ids}) => {
            const toolbar = document.getElementById(headerId);
            return ids.every(id => {
                const button = document.getElementById(id);
                return button && toolbar.contains(button) && button.getBoundingClientRect().width > 0
            })
        }, {headerId: chrome.headerId, ids: Object.values(chrome.buttons)}),
        'all three tabs must still fit after focus reveals actions, before narrowing').toBe(true);

        expect(narrowWidth, 'the stage must narrow from its live viewport width').toBeLessThan(currentWidth);
        await page.setViewportSize({height: 840, width: narrowWidth});

        await expect.poll(
            () => page.evaluate(id => Math.round(document.getElementById(id)?.getBoundingClientRect().width || 0), chrome.headerId),
            {message: 'the selected toolbar width must actually change, scheduling an overflow projection'}
        ).toBeLessThan(beforeWidth);

        await expect.poll(
            () => page.evaluate(({focusedId, otherId}) => {
                const focused = document.getElementById(focusedId),
                      other   = document.getElementById(otherId);
                return !focused || focused.getBoundingClientRect().width === 0 ||
                    !other || other.getBoundingClientRect().width === 0
            }, {focusedId, otherId: chrome.buttons[stage.node.items.find(id => id !== activeId)]}),
            {message: `the narrowed ${stage.nodeId} header must withhold a non-active tab`, timeout: 30000}
        ).toBe(true);

        const readOutcome = () => page.evaluate(({activeButtonId, containerId, focusedId, headerId}) => {
            const focused = document.getElementById(focusedId),
                  active  = document.getElementById(activeButtonId),
                  holder  = document.getElementById(containerId),
                  toolbar = document.getElementById(headerId);

            return {
                actionIds    : [...(toolbar?.querySelectorAll(':scope > .neo-toolbar-action') || [])].map(action => action.id),
                activeWidth  : active?.getBoundingClientRect().width || 0,
                focusInside  : !!holder?.contains(document.activeElement),
                focusedExists: !!focused,
                focusedWidth : focused?.getBoundingClientRect().width || 0
            }
        }, {activeButtonId, containerId: chrome.containerId, focusedId, headerId: chrome.headerId});

        await expect.poll(async () => {
            const value = await readOutcome();
            return {
                actionsRetained: beforeActions.every(id => value.actionIds.includes(id)),
                activeVisible  : value.activeWidth > 0,
                focusedExists : value.focusedExists,
                focusedVisible: value.focusedWidth > 0,
                focusInside   : value.focusInside
            }
        }, {message: 'the settled projection must keep the focused node, DOM focus and contextual actions'})
            .toEqual({actionsRetained: true, activeVisible: true, focusedExists: true, focusedVisible: true, focusInside: true});

        const outcome = await readOutcome();

        expect(outcome.focusedExists, 'the focused tab node remains in the DOM').toBe(true);
        expect(outcome.focusedWidth, 'the focused tab keeps a paintable box').toBeGreaterThan(0);
        expect(outcome.activeWidth, 'the active tab remains visible too').toBeGreaterThan(0);
        expect(outcome.focusInside, 'focus remains inside the tab container').toBe(true);
        beforeActions.forEach(id => expect(outcome.actionIds, `pre-existing contextual action ${id} remains mounted`).toContain(id));

        const focusedState = await app.getComponent(focusedId, ['containsFocus', 'hidden']);

        expect(focusedState.containsFocus, 'the worker retains focus on the witness tab').toBe(true);
        expect(focusedState.hidden, 'the worker does not withhold the focused tab').toBe(false);
        expect(pageErrors, 'the journey raises no page errors').toEqual([])
    })
});
