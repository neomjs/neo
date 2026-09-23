import {expect, test}              from '../../fixtures.mjs';
import * as RmaHelpers             from '../../util/RmaHelpers.mjs';
import {countPixelsUnlikeDominant} from '../utils/pngPixels.mjs';

/**
 * @summary Every root paints through its own window group's canvas worker, and only through it.
 *
 * A root that boots without a live opener gets a fresh canvas group, and so its own canvas SharedWorker; an opener
 * and its popups share one. Painted liveness is the discriminator, not the boot canvas count: each root carries a
 * static witness sparkline, an update in one root must change that root's pixels, and every other root's witness
 * must stay byte-identical. A witness counts as adopted only once the app worker saw the canvas worker acknowledge
 * the canvas main transferred to it (`offscreenRegistered`).
 */
const
    APP       = '/apps/portal/index.html',
    // A SharedWorker app that starts its canvas worker lazily, at its first canvas component: Portal creates it at
    // boot, where a worker that fails to load holds the whole root's boot before any group could fail
    APP_LAZY  = '/apps/colors/index.html',
    // Dedicated workers, the default: one app worker and one canvas worker per window
    APP_OWN   = '/examples/button/base/index.html',
    GROUP_KEY = 'neo-canvas-group',
    MIN_DRAWN = 20,
    VALUES    = [[1, 6, 2, 8, 3, 9, 4], [9, 2, 8, 1, 7, 3, 6], [5, 1, 9, 1, 9, 1, 5]];

/**
 * @summary Waits until a navigated root takes remote calls, and reads its canvas group.
 * @param {Object} page
 * @returns {Promise<String>}
 */
async function ready(page) {
    await page.locator('.neo-viewport').first().waitFor({state: 'attached', timeout: 60000});
    await page.waitForFunction(() => typeof globalThis.Neo?.worker?.App?.createNeoInstance === 'function', null, {timeout: 60000});
    await RmaHelpers.registerRmaHelpers(page);

    return page.evaluate(key => sessionStorage.getItem(key), GROUP_KEY)
}

/**
 * @param {Object} page
 * @param {String} [app=APP]
 * @returns {Promise<String>} the root's canvas group
 */
async function bootRoot(page, app=APP) {
    await page.goto(app);
    return ready(page)
}

/**
 * @param {Object} witness `{id, page}`
 * @returns {Promise<Buffer>}
 */
const shot = ({id, page}) => page.locator(`#${id}`).screenshot();

/**
 * @summary Adds an opaque, static sparkline to a root; its first canvas component also starts a lazy canvas worker.
 * @param {Object} page
 * @param {String} id
 * @returns {Promise<Object>} the witness, `{id, page}`
 */
async function createWitness(page, id) {
    const created = await RmaHelpers.createComponent(page, {
        className    : 'Neo.component.Sparkline',
        id,
        importPath   : '/src/component/Sparkline.mjs',
        parentId     : await page.locator('.neo-viewport').first().getAttribute('id'),
        style        : {background: '#fff', bottom: '8px', height: '48px', position: 'fixed', right: '8px', width: '160px', zIndex: 2147483000},
        usePulse     : false,
        useTransition: false,
        values       : VALUES[0]
    });

    expect(created.success, `${id} is created`).toBe(true);

    return {id, page}
}

/**
 * @summary Adds a witness and waits until its group's canvas worker adopted and drew it.
 * @param {Object} page
 * @param {String} id
 * @returns {Promise<Object>} the witness, `{id, page}`
 */
async function addWitness(page, id) {
    const witness = await createWitness(page, id);

    await expect.poll(() => RmaHelpers.getComponentConfig(page, id, 'offscreenRegistered'),
        {message: `${id}: main hands the canvas to its group's worker, which acknowledges it to the app`, timeout: 20000}).toBe(true);

    await expect.poll(async () => countPixelsUnlikeDominant(await shot(witness)).unlike,
        {message: `${id} is drawn`, timeout: 20000}).toBeGreaterThanOrEqual(MIN_DRAWN);

    return witness
}

/**
 * @summary Updates one witness and requires its pixels to change while every foreign witness stays byte-identical.
 * @param {Object}   witness
 * @param {Object[]} foreign
 * @param {Number[]} values
 */
async function paintsAlone(witness, foreign, values) {
    const before = await shot(witness),
          others = await Promise.all(foreign.map(shot));

    await RmaHelpers.setComponentConfig(witness.page, witness.id, {values});

    await expect.poll(async () => !(await shot(witness)).equals(before),
        {message: `an update in ${witness.id}'s root repaints it`, timeout: 10000}).toBe(true);

    for (const [i, other] of foreign.entries()) {
        expect((await shot(other)).equals(others[i]), `${other.id} is unchanged by ${witness.id}'s update`).toBe(true)
    }
}

/**
 * @param {Object} page
 * @returns {Function} whether the renderer died
 */
const watchCrash = page => {
    let crashed = false;
    page.on('crash', () => {crashed = true});
    return () => crashed
};

/**
 * @param {Object} context
 * @param {Object} opener
 * @returns {Promise<Object>} the popup, opened through `window.open`
 */
async function openPopup(context, opener) {
    const opened = context.waitForEvent('page');

    await opener.evaluate(app => window.open(app, '_blank'), APP);

    return opened
}

test.describe('canvas groups: every root paints through its own group\'s canvas worker', () => {
    test.setTimeout(180000);

    test('two unrelated roots each paint after the other boots, in both directions', async ({context, page}) => {
        const aDied  = watchCrash(page),
              groupA = await bootRoot(page),
              a      = await addWitness(page, 'witness-a'),
              rootB  = await context.newPage(),
              bDied  = watchCrash(rootB),
              groupB = await bootRoot(rootB),
              b      = await addWitness(rootB, 'witness-b');

        expect(groupB, 'a root without an opener gets its own group').not.toBe(groupA);

        await paintsAlone(a, [b], VALUES[1]);
        await paintsAlone(b, [a], VALUES[1]);
        await paintsAlone(a, [b], VALUES[2]);

        expect(aDied() || bDied(), 'neither renderer dies').toBe(false)
    });

    test('an opener and its popup share a group, and each still paints', async ({context, page}) => {
        const groupA = await bootRoot(page),
              a      = await addWitness(page, 'witness-opener'),
              popup  = await openPopup(context, page),
              groupP = await ready(popup),
              p      = await addWitness(popup, 'witness-popup');

        expect(groupP, 'a popup joins its opener\'s group').toBe(groupA);

        await paintsAlone(p, [a], VALUES[1]);
        await paintsAlone(a, [p], VALUES[1])
    });

    test('a manual return while a popup survives gets a fresh group, and both paint', async ({context, page}) => {
        const group  = await bootRoot(page),
              popup  = await openPopup(context, page),
              groupP = await ready(popup),
              p      = await addWitness(popup, 'witness-survivor');

        expect(groupP).toBe(group);

        await page.close();

        const returned = await context.newPage(),
              groupR   = await bootRoot(returned),
              r        = await addWitness(returned, 'witness-returned');

        expect(groupR, 'the returning root is isolated, not rejoined').not.toBe(group);

        await paintsAlone(r, [p], VALUES[1]);
        await paintsAlone(p, [r], VALUES[1])
    });

    test('a root on dedicated workers paints through the canvas worker its first canvas starts', async ({page}) => {
        expect(await bootRoot(page, APP_OWN), 'a dedicated-worker root resolves a group too').toBeTruthy();
        expect(await page.evaluate(() => Neo.config.useSharedWorkers), 'the subject runs on dedicated workers').toBe(false);

        await paintsAlone(await addWitness(page, 'witness-dedicated'), [], VALUES[1])
    });

    test('a group whose canvas worker fails to load fails alone, and a healthy group keeps painting', async ({context, page, workerErrors}) => {
        workerErrors.expect(/canvas worker unavailable/);

        await bootRoot(page, APP_LAZY);

        const a       = await addWitness(page, 'witness-healthy'),
              rootB   = await context.newPage(),
              bErrors = [];

        rootB.on('console', message => message.type() === 'error' && bErrors.push(message.text()));

        // Only this root's canvas worker points at a missing script: a real load failure, surfaced by the browser
        await rootB.addInitScript(() => {
            const Native = globalThis.SharedWorker;

            globalThis.SharedWorker = class extends Native {
                constructor(url, options) {
                    super(options?.name?.startsWith('neomjs-canvas-worker-') ? '/missing-canvas-worker.mjs' : url, options)
                }
            }
        });

        await bootRoot(rootB, APP_LAZY);

        const b = await createWitness(rootB, 'witness-failed');

        await expect.poll(() => [...bErrors, ...workerErrors.lines].some(line => /canvas worker unavailable/.test(line)),
            {message: 'the failed group\'s canvas component reports its worker as unavailable', timeout: 20000}).toBe(true);

        expect(await RmaHelpers.getComponentConfig(rootB, b.id, 'offscreenRegistered'), 'no worker adopted the failed group\'s canvas').toBe(false);

        await paintsAlone(a, [], VALUES[1])
    })
});
