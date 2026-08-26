import {test, expect, loadNeuralLinkModules} from '../../fixtures.mjs';
import {createFleetWireOffer}                from '../../../../apps/agentos/config/fleetWireMethods.mjs';
import {
    authenticatedFleetOptions,
    fleetE2EFailure,
    fleetE2ESuccess,
    reloadRoster,
    wireAuthenticatedFleetBridge
} from './authenticatedFleetHarness.mjs';

const {NeuralLink_DataService} = await loadNeuralLinkModules();

const KEYBOARD_SOURCES = {
    roster    : {source: 'fleet:listAgents',    state: 'wired', confidence: 'observed'},
    repoStatus: {source: 'fleet:fleetStatus',   state: 'wired', confidence: 'observed'},
    runtime   : {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'observed'}
};

/**
 * @summary Build one production-shaped Fleet roster DTO row for the mounted-list witness.
 * @param {Object} row Stable identity/display fields plus an optional lifecycle fact.
 * @returns {Object}
 */
function createKeyboardRosterRow(row) {
    return {
        ...row,
        avatarUrl     : '',
        githubUsername: row.githubUsername ?? row.id,
        lifecycle     : row.lifecycle ?? {source: KEYBOARD_SOURCES.runtime.source, state: 'running', confidence: 'observed'},
        sources       : KEYBOARD_SOURCES
    }
}

const KEYBOARD_ROSTER_ROWS = [
    {id: 'a11y-b', displayName: 'Bravo',   engineTag: 'fixture', family: 'claude'},
    {id: 'a11y-c', displayName: 'Charlie', engineTag: 'fixture', family: 'claude'},
    {
        id         : 'a11y-d',
        displayName: 'Delta',
        engineTag  : 'fixture',
        family     : 'claude',
        lifecycle  : {source: KEYBOARD_SOURCES.runtime.source, state: 'stopped', confidence: 'observed'}
    }
].map(createKeyboardRosterRow);

/**
 * @summary Start a test-owned Fleet bridge which serves three wired residents, records lifecycle
 * requests, and rejects Stop. The app still exercises its production `installFleetBridge` /
 * `createFleetRegistryBridge` client. A deterministic rejection keeps the card-local status visible
 * without a success-driven roster refresh, making lifecycle isolation observable without inferring
 * from transient UI.
 * @returns {Promise<{close: Function, requests: Object[], setRosterRows: Function}>}
 */
async function startRejectingFleetBridge() {
    const
        {startFleetBridgeServer} = await loadAgentOsModule('ai/services/fleet/fleetBridgeServer.mjs'),
        requests                 = [];

    let rosterRows = KEYBOARD_ROSTER_ROWS;

    const options = authenticatedFleetOptions({
        dispatch: async request => {
            requests.push(request);

            if (request.method === 'stopAgent') {
                return fleetE2EFailure('fleet: stop rejected by keyboard witness')
            }

            if (request.method === 'fleetRoster') {
                return fleetE2ESuccess({rows: rosterRows})
            }

            if (request.method === 'fleetActivity') {
                return fleetE2ESuccess({
                    capability: {source: 'fleet:test', state: 'wired', confidence: 'observed'},
                    events    : []
                })
            }

            return fleetE2EFailure(`fleet: unexpected keyboard-witness method '${request.method}'`)
        }
    });

    const server = await startFleetBridgeServer(options);

    return {
        requests,
        bearerToken  : options.bearerToken,
        endpoint     : `http://127.0.0.1:${server.address().port}/fleet`,
        close        : () => new Promise(resolve => server.close(resolve)),
        setRosterRows: rows => rosterRows = rows
    }
}

/**
 * @summary The FM roster's mounted semantic-list contract, after retirement of the card-name drill
 * and rebuild compensation machinery. A real `ul > li` owns selection and Navigator focus; Enter
 * selects the focused item, Tab enters the native lifecycle controls, and a control activation never
 * changes cockpit selection. Store reconciliation moves the same AgentCard instance instead of
 * rebuilding it. The consumer skin keeps every li paint-free in both themes while the AgentCard owns
 * selected elevation and keyboard-only focus; reduced motion collapses list and card transitions.
 *
 * @see apps/agentos/view/fleet/roster/List.mjs
 * @see apps/agentos/view/fleet/roster/SelectionModel.mjs
 * @see apps/agentos/view/fleet/roster/card/Container.mjs
 * @see test/playwright/unit/apps/agentos/view/fleet/roster/container.spec.mjs
 */
test.describe('AgentOS fleet roster — semantic list selection + stable animated cards (Neural Link, #17553)', () => {
    test.setTimeout(90000);

    let fleet;

    test.beforeEach(async () => {
        fleet = await startRejectingFleetBridge()
    });

    test.afterEach(async () => {
        await fleet?.close()
    });

    test('ul/li topology + click/Enter selection + lifecycle isolation + stable reorder + both-theme skin', async ({page, neuralLink}) => {
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-fleet-grid')).toBeVisible({timeout: 30000});

        // Fail-closed boot → bearer through the worker-realm product injector → sanctioned re-poll;
        // only then can the roster claim replace the sample seed.
        const app = await neuralLink.connectToApp('AgentOS');

        await wireAuthenticatedFleetBridge({app, fleetUrl: fleet.endpoint, bearerToken: fleet.bearerToken});
        await reloadRoster(app);
        await expect(page.locator('.fm-fleet-title')).toHaveText('Fleet · 3 agents', {timeout: 30000});

        const
            sessionId  = app.sessionId,
            [grid]     = await app.queryComponent({className: 'AgentOS.view.fleet.roster.Container'}, ['id']),
            [list]     = await app.queryComponent({className: 'AgentOS.view.fleet.roster.List'}, ['id', 'focusIndex']),
            [cockpit]  = await app.queryComponent({className: 'AgentOS.view.fleet.cockpit.Container'}, ['id']),
            [viewport] = await app.queryComponent({className: 'AgentOS.view.Viewport'}, ['id', 'theme']);

        expect(grid, 'the mounted FleetGrid should be possessable').toBeTruthy();
        expect(list, 'the mounted semantic roster List should be possessable').toBeTruthy();
        expect(cockpit, 'the mounted FleetCockpit should own selection reconciliation').toBeTruthy();
        expect(viewport, 'the mounted Viewport should own live theme changes').toBeTruthy();

        const
            cockpitId      = cockpit.properties.id,
            gridState      = await app.getComponent(grid.properties.id, ['store.id']),
            rosterId       = gridState['store.id'],
            viewportState  = await app.getComponent(viewport.properties.id, ['controller']),
            controllerId   = viewportState.controller.id,
            selectionState = async () => (await app.callMethod(cockpitId, 'getStateProvider')).data;

        expect(rosterId, 'the mounted FleetGrid should expose its exact bound FleetRoster store').toBeTruthy();

        const seeded = await NeuralLink_DataService.inspectStore({sessionId, storeId: rosterId, limit: 10});
        expect(seeded.count, 'the grid-bound roster should hold the three loopback residents').toBe(3);

        const
            listDom     = page.locator('.fm-fleet-cards'),
            items       = page.locator('.fm-fleet-cards > .neo-list-item'),
            cards       = page.locator('.fm-fleet-cards > .neo-list-item > .fm-agent-card'),
            itemFor     = name => items.filter({has: page.locator('.fm-card-name', {hasText: name})}),
            cardFor     = name => itemFor(name).locator(':scope > .fm-agent-card'),
            transparent = 'rgba(0, 0, 0, 0)';

        await expect(items).toHaveCount(3);
        await expect(cards).toHaveCount(3);
        expect(await listDom.evaluate(element => element.tagName)).toBe('UL');
        expect(await items.first().evaluate(element => element.tagName)).toBe('LI');
        expect(await listDom.getAttribute('role')).toBeNull();
        expect(await cards.first().getAttribute('role')).toBeNull();

        const
            bravoItem = itemFor('Bravo'),
            bravoCard = cardFor('Bravo');

        // POINTER SELECTION: the whole list item is the target; provider, detail and Memories read
        // one truth. The old card-name drill Button no longer exists.
        await expect(bravoCard.locator('.fm-card-drill')).toHaveCount(0);
        await bravoItem.click();
        await expect(bravoItem).toHaveAttribute('aria-selected', 'true');
        await expect.poll(async () => {
            const {selectedAgentId, selectedAgentIdentity} = await selectionState();
            return {selectedAgentId, selectedAgentIdentity}
        }).toEqual({selectedAgentId: 'a11y-b', selectedAgentIdentity: '@a11y-b'});
        await expect(page.locator('.fm-agent-detail')).toContainText('Bravo', {timeout: 10000});
        await expect.poll(async () => {
            const panes = await app.queryComponent({className: 'AgentOS.view.fleet.memories.Container'}, ['activeAgent']);
            return panes[0]?.properties.activeAgent
        }).toBe('@a11y-b');

        // BOTH THEMES: base list chrome stays fully neutral; item and card rectangles coincide;
        // the selected treatment belongs to the card, while pointer selection has no focus outline.
        for (const theme of ['neo-theme-neo-dark', 'neo-theme-neo-light']) {
            await app.callMethod(controllerId, 'setTheme', [theme, false]);
            await expect.poll(async () => (await app.getComponent(viewport.properties.id, ['theme'])).theme, {
                message: `the viewport re-themes to ${theme}`, timeout: 15000, intervals: [250]
            }).toBe(theme);

            await itemFor('Charlie').hover();

            const skin = await page.evaluate(() => {
                const
                    list                = document.querySelector('.fm-fleet-cards'),
                    selected            = list.querySelector(':scope > .neo-list-item[aria-selected="true"]'),
                    unselected          = [...list.querySelectorAll(':scope > .neo-list-item')].find(item => item !== selected),
                    selectedCard        = selected.querySelector(':scope > .fm-agent-card'),
                    unselectedCard      = unselected.querySelector(':scope > .fm-agent-card'),
                    listStyle           = getComputedStyle(list),
                    selectedStyle       = getComputedStyle(selected),
                    unselectedStyle     = getComputedStyle(unselected),
                    selectedCardStyle   = getComputedStyle(selectedCard),
                    unselectedCardStyle = getComputedStyle(unselectedCard),
                    itemRect            = unselected.getBoundingClientRect(),
                    cardRect            = unselectedCard.getBoundingClientRect();

                return {
                    list: {
                        display            : listStyle.display,
                        gap                : listStyle.gap,
                        gridTemplateColumns: listStyle.gridTemplateColumns,
                        tokens             : {
                            active  : listStyle.getPropertyValue('--list-item-background-color-active').trim(),
                            base    : listStyle.getPropertyValue('--list-item-background-color').trim(),
                            focus   : listStyle.getPropertyValue('--list-item-focus-outline').trim(),
                            hover   : listStyle.getPropertyValue('--list-item-background-color-hover').trim(),
                            padding : listStyle.getPropertyValue('--list-item-padding').trim(),
                            selected: listStyle.getPropertyValue('--list-item-background-color-selected').trim()
                        }
                    },
                    selected: {
                        cardBackground: selectedCardStyle.backgroundColor,
                        cardOutline   : selectedCardStyle.outlineStyle,
                        cardShadow    : selectedCardStyle.boxShadow,
                        itemBackground: selectedStyle.backgroundColor,
                        itemPadding   : selectedStyle.padding
                    },
                    unselected: {
                        cardBackground: unselectedCardStyle.backgroundColor,
                        itemBackground: unselectedStyle.backgroundColor,
                        itemPadding   : unselectedStyle.padding,
                        rectDelta     : {
                            height: Math.abs(itemRect.height - cardRect.height),
                            width : Math.abs(itemRect.width  - cardRect.width)
                        }
                    }
                }
            });

            expect(skin.list.display, `${theme}: the retired CSS grid cannot survive the list migration`).not.toBe('grid');
            expect(skin.list.gridTemplateColumns, `${theme}: no stale grid tracks`).toBe('none');
            expect(skin.list.gap, `${theme}: plugin geometry owns spacing`).toBe('normal');
            expect(skin.list.tokens).toEqual({
                active: 'transparent', base: 'transparent', focus: 'none', hover: 'transparent', padding: '0', selected: 'transparent'
            });
            expect(skin.unselected.itemBackground, `${theme}: hover does not resurrect list paint`).toBe(transparent);
            expect(skin.unselected.itemPadding, `${theme}: the geometry carrier has zero padding`).toBe('0px');
            expect(skin.unselected.rectDelta.width, `${theme}: card fills the li width`).toBeLessThanOrEqual(1);
            expect(skin.unselected.rectDelta.height, `${theme}: card fills the li height`).toBeLessThanOrEqual(1);
            expect(skin.selected.itemBackground, `${theme}: selection does not paint the li`).toBe(transparent);
            expect(skin.selected.itemPadding, `${theme}: selection cannot change geometry`).toBe('0px');
            expect(skin.selected.cardBackground, `${theme}: the selected card owns a tonal surface`).not.toBe(skin.unselected.cardBackground);
            expect(skin.selected.cardShadow, `${theme}: the selected card owns shallow elevation`).not.toBe('none');
            expect(skin.selected.cardOutline, `${theme}: pointer selection is not keyboard focus`).toBe('none')
        }

        await app.callMethod(controllerId, 'setTheme', ['neo-theme-neo-dark', false]);
        await expect.poll(async () => (await app.getComponent(viewport.properties.id, ['theme'])).theme).toBe('neo-theme-neo-dark');

        // KEYBOARD: Navigator moves focus without changing selection; the focus ring paints the card,
        // never the li. Enter then selects the focused resident and re-targets both panes.
        const charlieItem = itemFor('Charlie');
        await charlieItem.focus();
        const focusBefore = await page.evaluate(() => document.activeElement?.closest('.neo-list-item')?.id ?? null);
        await page.keyboard.press('ArrowDown');
        await expect.poll(async () => page.evaluate(() => document.activeElement?.closest('.neo-list-item')?.id ?? null), {
            message: 'ArrowDown moves native list-item focus'
        }).not.toBe(focusBefore);

        const
            focusedItemId = await page.evaluate(() => document.activeElement?.closest('.neo-list-item')?.id ?? null),
            focusedItem   = page.locator(`#${focusedItemId}`),
            focusedCardId = await focusedItem.locator(':scope > .fm-agent-card').getAttribute('id'),
            focusedRecord = (await app.getComponent(focusedCardId, ['record'])).record,
            focusPaint    = await focusedItem.evaluate(item => {
                const card = item.querySelector(':scope > .fm-agent-card');
                return {cardOutline: getComputedStyle(card).outlineStyle, itemOutline: getComputedStyle(item).outlineStyle}
            });

        expect(focusPaint.itemOutline, 'keyboard focus never paints the geometry carrier').toBe('none');
        expect(focusPaint.cardOutline, 'keyboard focus paints the AgentCard').toBe('solid');
        expect((await selectionState()).selectedAgentId, 'arrows move focus without selecting').toBe('a11y-b');

        await page.keyboard.press('Enter');
        await expect.poll(async () => (await selectionState()).selectedAgentId).toBe(focusedRecord.agentId);
        await expect(page.locator('.fm-agent-detail')).toContainText(focusedRecord.displayName);
        await expect.poll(async () => {
            const panes = await app.queryComponent({className: 'AgentOS.view.fleet.memories.Container'}, ['activeAgent']);
            return panes[0]?.properties.activeAgent
        }).toBe(`@${focusedRecord.githubUsername}`);

        // Tab reaches the in-card lifecycle verbs from the list item. A lifecycle activation is a
        // disjoint seam: it emits one Stop request but cannot re-target selection/detail.
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.fm-card-control-verbs'))),
            'Tab from the list item reaches a native lifecycle control').toBe(true);

        const
            selectedBeforeControl = (await selectionState()).selectedAgentId,
            selectedDisplay       = focusedRecord.displayName,
            bravoToggle           = bravoCard.locator('.fm-card-control-verbs button').first();

        // ── LIFECYCLE ISOLATION: activating a control Button fires its lifecycle intent WITHOUT drilling ──
        // Bravo is 'ok' → its toggle is the STOP verb. The test-owned bridge records exactly one
        // minimal stop request and rejects it with a named reason; the detail must stay on the
        // record selected before the control ran (no drill leakage), while Bravo renders the honest
        // terminal rejection.
        //
        // Minimal is about the PAYLOAD: one agent id, no drill-shaped extras. The browser-mode
        // envelope carries this realm's versioned protocol offer, asserted through the exported
        // builder, so exact equality keeps rejecting stray keys without freezing a contract literal.
        await bravoToggle.focus();
        await page.keyboard.press('Enter');
        await expect.poll(
            () => fleet.requests.filter(request => ['startAgent', 'stopAgent', 'restartAgent'].includes(request.method)),
            {message: 'the lifecycle Button emits exactly one minimal Stop request'}
        ).toEqual([{method: 'stopAgent', params: 'a11y-b', protocol: createFleetWireOffer()}]);
        expect((await selectionState()).selectedAgentId, 'control activation cannot change selection').toBe(selectedBeforeControl);
        await expect(page.locator('.fm-agent-detail')).toContainText(selectedDisplay);
        await expect(bravoCard.locator('.fm-card-control-status')).toContainText(
            '⚠ rejected: fleet: stop rejected by keyboard witness',
            {timeout: 10000}
        );

        // REORDER: focus Charlie's toggle, add Alpha (which sorts ahead), and reconcile through the
        // real cockpit. The same AgentCard and exact native Button move; no focus-restoration code exists.
        await charlieItem.click();
        await expect.poll(async () => (await selectionState()).selectedAgentId).toBe('a11y-c');

        const
            charlieCard       = cardFor('Charlie'),
            charlieToggle     = charlieCard.locator('.fm-card-control-verbs button').first(),
            charlieCardBefore = await charlieCard.getAttribute('id'),
            charlieItemBefore = await charlieItem.getAttribute('id'),
            alpha             = createKeyboardRosterRow({id: 'a11y-a', displayName: 'Alpha', engineTag: 'fixture', family: 'claude'});

        await charlieToggle.focus();
        await page.waitForTimeout(500);
        fleet.setRosterRows([...KEYBOARD_ROSTER_ROWS, alpha]);
        await app.callMethod(cockpitId, 'loadRoster');
        await expect(cards).toHaveCount(4);
        expect(await charlieCard.getAttribute('id'), 'sort moves the same AgentCard instance').toBe(charlieCardBefore);
        expect(await charlieItem.getAttribute('id'), 'sort moves the same li node').toBe(charlieItemBefore);
        await expect(charlieToggle, 'the exact focused native Button moves with its card').toBeFocused();
        await expect(charlieItem).toHaveAttribute('aria-selected', 'true');
        expect((await selectionState()).selectedAgentId, 'selection survives the index shift').toBe('a11y-c');

        // FILTER: Delta is authoritative-offline. The filter owns a fade-capable transition and
        // removes/re-adds it without touching Charlie's selection.
        const
            deltaItem      = itemFor('Delta'),
            itemTransition = await deltaItem.evaluate(item => getComputedStyle(item).transitionProperty),
            offlineToggle  = page.getByRole('button', {name: 'Hide offline'});

        expect(itemTransition, 'animated list items carry opacity in their transition set').toMatch(/opacity/);
        await offlineToggle.click();
        await expect(cards).toHaveCount(3, {timeout: 10000});
        await expect(offlineToggle).toHaveClass(/neo-pressed/);
        expect((await selectionState()).selectedAgentId).toBe('a11y-c');

        await offlineToggle.click();
        await expect(cards).toHaveCount(4, {timeout: 10000});
        await expect(offlineToggle).not.toHaveClass(/neo-pressed/);

        // Reduced motion collapses both plugin and selected-card transitions. The default path
        // above proved both are non-zero before this preference flip.
        const selectedCardTransition = await charlieCard.evaluate(card => getComputedStyle(card).transitionDuration);
        expect(selectedCardTransition).toMatch(/0\.12s/);

        await page.emulateMedia({reducedMotion: 'reduce'});
        const reducedMotion = await page.evaluate(() => {
            const
                item = document.querySelector('.fm-fleet-cards > .neo-list-item'),
                card = document.querySelector('.fm-fleet-cards > .neo-list-item[aria-selected="true"] > .fm-agent-card');
            return {
                cardDuration: getComputedStyle(card).transitionDuration,
                itemDuration: getComputedStyle(item).transitionDuration
            }
        });

        expect(reducedMotion.itemDuration).toBe('0s');
        expect(reducedMotion.cardDuration).toBe('0s');
        await page.emulateMedia({reducedMotion: null});

        expect(pageErrors, 'no uncaught page errors during the semantic-list journey').toEqual([])
    })
});
