import {expect, test}              from '../../fixtures.mjs';
import * as RmaHelpers             from '../../util/RmaHelpers.mjs';
import {countPixelsUnlikeDominant} from '../utils/pngPixels.mjs';

const APP = '/apps/workstation/index.html';

/**
 * @summary Boots a full Workstation root and waits for its real dock to project.
 * @param {Object} page
 * @returns {Promise<void>}
 */
async function bootRoot(page) {
    await page.goto(APP);
    await expect(page.locator('.workstation-dock-host')).toBeVisible({timeout: 60000});
    await expect(page.locator('.neo-tab-header-button.neo-draggable').first()).toBeVisible({timeout: 60000});
}

/**
 * @summary Reads the runtime identities from the page that owns them, rather than from an app-name lookup.
 * @param {Object} page
 * @returns {Promise<Object>}
 */
function rootIdentity(page) {
    return page.evaluate(async () => {
        const reply = await Neo.worker.App.getWorkerId();

        return {
            appWorkerId: typeof reply === 'string' ? reply : reply?.data,
            canvasGroup: sessionStorage.getItem('neo-canvas-group'),
            topology   : JSON.parse(sessionStorage.getItem('neo-topology-identity') || 'null'),
            windowId   : Neo.worker.Manager.windowId
        }
    })
}

/**
 * @summary Records page errors and the exact HTTP failures, so a resource error is explained by its request.
 * @param {Object} page
 * @param {String} root
 * @param {Object[]} errors
 * @param {Object[]} resources
 * @returns {void}
 */
function watchRoot(page, root, errors, resources) {
    page.on('crash', () => errors.push({root, kind: 'renderer-crash'}));
    page.on('pageerror', error => errors.push({root, kind: 'javascript', text: error.message}));
    page.on('console', message => message.type() === 'error'
        && errors.push({root, kind: 'console', text: message.text(), location: message.location()}));
    page.on('response', response => response.status() >= 400
        && resources.push({root, status: response.status(), url: response.url()}));
}

/**
 * @summary Adds a static canvas witness to the actual root; its pixels can change only when that witness updates.
 * @param {Object} page
 * @param {String} id
 * @returns {Promise<Object>}
 */
async function paintWitness(page, id) {
    await RmaHelpers.registerRmaHelpers(page);

    const created = await RmaHelpers.createComponent(page, {
        className    : 'Neo.component.Sparkline',
        id,
        importPath   : '/src/component/Sparkline.mjs',
        parentId     : await page.locator('.neo-viewport').first().getAttribute('id'),
        style        : {background: '#fff', bottom: '8px', height: '48px', position: 'fixed', right: '8px', width: '160px', zIndex: 2147483000},
        usePulse     : false,
        useTransition: false,
        values       : [1, 6, 2, 8, 3, 9, 4]
    });

    expect(created.success, 'the root creates its static paint witness').toBe(true);
    await expect.poll(() => RmaHelpers.getComponentConfig(page, id, 'offscreenRegistered'),
        {message: 'the root\'s canvas worker acknowledges adoption', timeout: 20000}).toBe(true);

    const shot = () => page.locator(`#${id}`).screenshot();

    await expect.poll(async () => countPixelsUnlikeDominant(await shot()).unlike,
        {message: 'the adopted witness is painted', timeout: 20000}).toBeGreaterThanOrEqual(20);

    return {id, page, shot}
}

/**
 * @summary Requires a real repaint while a foreign root's static witness stays byte-identical.
 * @param {Object} local
 * @param {Object} foreign
 * @returns {Promise<void>}
 */
async function paintsAlone(local, foreign) {
    const before = await local.shot(), other = await foreign.shot();

    await RmaHelpers.setComponentConfig(local.page, local.id, {values: [9, 2, 8, 1, 7, 3, 6]});
    await expect.poll(async () => !(await local.shot()).equals(before),
        {message: 'this root still paints after the other root booted', timeout: 10000}).toBe(true);
    expect((await foreign.shot()).equals(other), 'the foreign root did not paint this update').toBe(true)
}

test.describe('Workstation independent roots: rendered drag ownership', () => {
    test.setTimeout(180000);
    test.use({viewport: {width: 1600, height: 900}});

    test('two full roots coexist on one App Worker and keep painting independently', async ({page, context, neuralLink}, testInfo) => {
        const errors = [], resources = [];
        watchRoot(page, 'A', errors, resources);
        await bootRoot(page);
        const app    = await neuralLink.connectToApp('Workstation');
        const second = await context.newPage();
        watchRoot(second, 'B', errors, resources);
        await bootRoot(second);

        const a = await rootIdentity(page), b = await rootIdentity(second);

        expect(b.appWorkerId, 'both roots share the exact App Worker').toBe(a.appWorkerId);
        expect(b.windowId).not.toBe(a.windowId);
        expect(a.canvasGroup).toBeTruthy();
        expect(b.canvasGroup).toBeTruthy();
        expect(b.canvasGroup).not.toBe(a.canvasGroup);
        expect(b.topology.groupId).not.toBe(a.topology.groupId);

        const workspaces = await app.findInstances({className: 'Workstation.view.Workspace'},
            ['id', 'windowId', 'topologyGroupId', 'participation.ownershipId']);
        const byWindow = new Map(workspaces.map(record => {
            const properties = record.properties ?? record;
            return [properties.windowId, properties]
        }));

        expect(byWindow.get(a.windowId)?.topologyGroupId).toBe(a.topology.groupId);
        expect(byWindow.get(b.windowId)?.topologyGroupId).toBe(b.topology.groupId);
        expect(byWindow.get(a.windowId)?.['participation.ownershipId']).toBe(a.topology.groupId);
        expect(byWindow.get(b.windowId)?.['participation.ownershipId']).toBe(b.topology.groupId);

        const witnessA = await paintWitness(page, 'two-roots-paint-a');
        const witnessB = await paintWitness(second, 'two-roots-paint-b');

        // wall-clock-under-test: the historical renderer kill followed the second root's first canvas paint.
        await page.waitForTimeout(8000);
        await paintsAlone(witnessA, witnessB);
        await paintsAlone(witnessB, witnessA);
        await expect(page.locator('.workstation-dock-host')).toBeVisible();
        await expect(second.locator('.workstation-dock-host')).toBeVisible();

        await testInfo.attach('two-roots-console-census', {
            body       : JSON.stringify({identities: {a, b}, errors, resources}, null, 2),
            contentType: 'application/json'
        });
        expect(errors.filter(error => error.kind !== 'console'), 'neither renderer crashed or threw').toEqual([]);
        expect(resources, 'every failed resource is named; none is silently allowed').toEqual([]);
        expect(errors.filter(error => error.kind === 'console'), 'both roots have a clean error census').toEqual([])
    });
});
