import {expect}              from '../../fixtures.mjs';
import {readNativeLifecycle} from './dockNativeLifecycle.mjs';

/**
 * @module e2e/utils/workstationPopOut
 * @summary The shared choreography for popping a Workstation pane into a real OS window.
 *
 * Five ordering constraints, each learned from a failure: click the tab button; poll until the
 * `pop-out` action is user-reachable; race `waitForEvent('popup')` against the click that opens it;
 * wait for the popup's `.workstation-viewport`; poll `readNativeLifecycle` until the item reaches
 * vessel adoption. Then the handover assertions, which are what "popped out" actually means — the
 * main window releases the live pane, the popup adopts that exact pane, and the stand-in retires.
 *
 * ## Why this is a module rather than a copy per spec
 *
 * It existed twice and the copies had already diverged, silently, in a way no CI run could catch:
 * both callers are excluded from the e2e selection when `NEO_AGENTOS_RUNTIME_ROOT` is unset and both
 * need a real display, so a divergence surfaces only when a maintainer runs one by hand.
 *
 * The divergence was not cosmetic. One copy resolved participations by `ntype`, the other by
 * `className` — and a host may compose its own Participation subclass, which keeps the engine's ntype
 * and not its className, so the `className` form returns nothing on exactly the topology this suite
 * exists to drive. It failed as a missing settle rather than as a wrong query, and was deleted rather
 * than understood. That is the shape of drift this module exists to stop.
 *
 * **No CI job runs any caller of this file.** A green pipeline is not evidence about anything here;
 * the only receipt is a headed run with a real display.
 */

/**
 * @param {*} value
 * @returns {Array}
 */
const asArray = value => Array.isArray(value) ? value : value ? [value] : [];

/**
 * @summary Every live cross-window participation.
 *
 * By `ntype`, never `className`: a host may compose its own Participation subclass, which keeps the
 * engine's ntype but not its className.
 * @param {Object} app
 * @returns {Promise<Object[]>}
 */
export async function participations(app) {
    return asArray(await app.findInstances({ntype: 'dock-crosswindow-participation'}, ['id', 'workspaceId']))
        .map(entry => ({id: entry.id, workspaceId: entry.properties?.workspaceId}))
}

/**
 * @summary The main workspace participation's instance id — a projection refresh recreates it.
 * @param {Object} app
 * @returns {Promise<String|null>}
 */
export async function mainParticipationId(app) {
    return (await participations(app)).find(entry => entry.workspaceId === 'workstation-main')?.id ?? null
}

/**
 * @summary Pops one pane out through the real header action and waits for adoption.
 *
 * Always the real action, never `Main.windowOpen`: calling the platform entry point directly asserts
 * that it works while skipping the path that has to reach it.
 *
 * @param {Object}  data
 * @param {Object}  data.app                     Neural Link app handle.
 * @param {Object}  data.page                    The main window's page.
 * @param {String}  data.workspaceId
 * @param {String}  data.itemId
 * @param {Boolean} [data.settleForClaim=false]  Wait for the detach projection to re-register the main
 *     participation before returning. Required ONLY by a caller that goes on to make a native claim:
 *     a claim raised against a stale zone dies, and the zone is recreated by that refresh. A caller
 *     that merely reads state does not need it and should not pay for it — it is a real wait. This is
 *     a parameter rather than an unconditional step so that omitting it stays a decision.
 * @returns {Promise<{popup: Object, windowId: String}>}
 */
export async function popOut({app, page, workspaceId, itemId, settleForClaim=false}) {
    const
        {dockModel} = await app.getComponent(workspaceId, ['dockModel']),
        nodeId      = Object.entries(dockModel.nodes)
            .find(([, node]) => node.type === 'tabs' && node.items?.includes(itemId))?.[0],
        paneId      = await app.callMethod(workspaceId, 'getPaneIdentity', [itemId]),
        mainBefore  = settleForClaim ? await mainParticipationId(app) : null;

    expect(nodeId, `${itemId} sits in a tabs node`).toBeTruthy();
    expect(paneId, `${itemId} owns a live pane`).toBeTruthy();

    let chrome;

    await expect.poll(async () => {
        chrome = await app.callMethod(workspaceId, 'getTabChromeIdentity', [nodeId]);

        return chrome?.buttons?.[itemId] ?? null
    }, {
        message  : `${nodeId} projects ${itemId} into live tab chrome`,
        timeout  : 10000,
        intervals: [25, 50, 100]
    }).toBeTruthy();

    await page.locator(`#${chrome.buttons[itemId]}`).click();

    let action;

    await expect.poll(async () => {
        chrome = await app.callMethod(workspaceId, 'getTabChromeIdentity', [nodeId]);
        action = chrome?.containerId && await app.callMethod(chrome.containerId, 'getAction', ['pop-out']);

        return Boolean(action?.id && await page.locator(`#${action.id}`).isVisible())
    }, {message: `pop-out is user-reachable for ${itemId}`, timeout: 10000}).toBe(true);

    const popupPromise = page.waitForEvent('popup', {timeout: 30000});

    await page.locator(`#${action.id}`).click();

    const popup = await popupPromise;

    await popup.waitForSelector('.workstation-viewport', {timeout: 30000});

    let windowId;

    await expect.poll(async () => {
        const lifecycle = await readNativeLifecycle(app, workspaceId);

        windowId = lifecycle.owners[itemId]?.windowId ?? null;

        return windowId
    }, {
        message  : `${itemId} reaches vessel adoption`,
        timeout  : 30000,
        intervals: [50, 100, 250]
    }).toBeTruthy();

    // What "popped out" means, asserted rather than assumed: the pane is MOVED, not duplicated.
    await expect(page.locator(`#${paneId}`), `the main window releases ${itemId}'s live pane`).toHaveCount(0);
    await expect(popup.locator(`#${paneId}`), `the popup adopts ${itemId}'s exact live pane`).toBeVisible();
    await expect(page.locator('.neo-dashboard-dock-vessel-placeholder'), `the main window retires ${itemId}'s stand-in`)
        .toHaveCount(0, {timeout: 15000});

    if (settleForClaim) {
        await expect.poll(() => mainParticipationId(app), {
            message  : `the detach projection refresh re-registers the main target after ${itemId}`,
            timeout  : 15000,
            intervals: [50, 100, 250]
        }).not.toBe(mainBefore)
    }

    return {popup, windowId}
}
