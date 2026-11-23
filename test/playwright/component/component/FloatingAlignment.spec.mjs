import {test, expect} from '@playwright/test';

/**
 * @summary A mounted component that stops floating gives back the positioning it took.
 *
 * `floating: true` aligns the component on the main thread: `DomAccess#align` writes `top`/`left` and a
 * `transform`, adds a `neo-aligned-*` zone class, and registers the subject so later geometry changes keep
 * it aligned. Nothing about a subject that simply stays in the document ends that registration, so turning
 * `floating` off has to — otherwise the component re-enters the flow but is still painted at its floating
 * position, and the next resize aligns it again.
 *
 * Every read is a real measurement in a real window, taken through the App Worker config path.
 */

const CONTAINER_ID = 'floating-alignment-host',
      PROBE_ID     = 'floating-alignment-probe',
      SIBLING_ID   = 'floating-alignment-sibling',
      TARGET       = {x: 250, y: 180, width: 100, height: 60};

/**
 * @param {Object} page
 * @returns {Promise<Object>} What the probe and its sibling look like right now
 */
const readState = page => page.evaluate(({probeId, siblingId}) => {
    const probe   = document.getElementById(probeId),
          sibling = document.getElementById(siblingId),
          rect    = probe.getBoundingClientRect();

    return {
        activeElementId: document.activeElement?.id || null,
        alignedCls     : [...probe.classList].filter(cls => cls.startsWith('neo-aligned')),
        parentId       : probe.parentElement?.id,
        position       : getComputedStyle(probe).position,
        registered     : Neo.main.DomAccess._aligns?.has(probeId) ?? false,
        siblingTop     : Math.round(sibling.getBoundingClientRect().top),
        transform      : probe.style.transform,
        x              : Math.round(rect.left),
        y              : Math.round(rect.top)
    }
}, {probeId: PROBE_ID, siblingId: SIBLING_ID});

/**
 * @param {Object} page
 * @param {Object} configs
 */
const setConfigs = async (page, configs) => {
    const result = await page.evaluate(configs => Neo.worker.App.setConfigs(configs), {id: PROBE_ID, ...configs});

    expect(result?.success ?? true, `setConfigs ${JSON.stringify(configs)}`).toBe(true)
};

test.describe('Neo.component.Base floating round trip', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        const result = await page.evaluate(({containerId, probeId, siblingId}) => Neo.worker.App.createNeoInstance({
            id        : containerId,
            importPath: '../container/Base.mjs',
            items     : [
                {height: 30, html: 'probe',   id: probeId,   ntype: 'component', width: 100},
                {height: 30, html: 'sibling', id: siblingId, ntype: 'component'}
            ],
            layout  : {ntype: 'vbox', align: 'start'},
            ntype   : 'container',
            parentId: 'component-test-viewport',
            style   : {padding: '40px'}
        }), {containerId: CONTAINER_ID, probeId: PROBE_ID, siblingId: SIBLING_ID});

        if (!result.success) {
            throw new Error(`Container creation failed: ${result.error.message}`)
        }

        await page.waitForSelector(`#${SIBLING_ID}`)
    });

    test.afterEach(async ({page}) => {
        await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), CONTAINER_ID)
    });

    test('turning floating off returns the component to its painted flow position and ends its alignment', async ({page}) => {
        const before = await readState(page);

        expect(before.position, 'precondition: the probe starts in the flow').toBe('static');

        await setConfigs(page, {align: {edgeAlign: 't0-b0', target: TARGET}});
        await setConfigs(page, {floating: true});

        await expect.poll(() => readState(page), {message: 'floating aligns the probe to the rectangle', timeout: 5000})
            .toMatchObject({position: 'fixed', registered: true, x: TARGET.x, y: TARGET.y + TARGET.height});

        await setConfigs(page, {floating: false});

        await expect.poll(async () => {
            const {alignedCls, position, registered, transform, x, y} = await readState(page);
            return {alignedCls, position, registered, transform, x, y}
        }, {message: 'the probe is painted back where the flow puts it, with no alignment left behind', timeout: 5000})
            .toEqual({alignedCls: [], position: 'static', registered: false, transform: '', x: before.x, y: before.y});

        const after = await readState(page);

        expect(after.parentId, 'DOM ownership never moved').toBe(before.parentId);
        expect(after.siblingTop, 'the sibling is back below the probe').toBe(before.siblingTop);
        expect(after.activeElementId, 'neither transition moved focus').toBe(before.activeElementId);

        // A released subject must not be picked up again by the next geometry change.
        await page.setViewportSize({width: 1100, height: 700});
        await page.waitForTimeout(300);

        const resized = await readState(page);

        expect(resized.transform, 'a resize after release does not realign it').toBe('');
        expect(resized.registered).toBe(false)
    })
});

test.describe('A button menu fits its window', () => {
    const triggerId = 'alignment-menu-button';

    async function openCommands(page, count) {
        await page.setViewportSize({width: 480, height: 360});
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await expect(page.locator('#component-test-viewport')).toBeVisible();

        const result = await page.evaluate(({id, count}) => Neo.worker.App.createNeoInstance({
            id, ntype: 'button', importPath: '../button/Base.mjs', parentId: 'component-test-viewport',
            text: 'Commands', style: {position: 'fixed', bottom: '4px', right: '8px'},
            menu: Array.from({length: count}, (_,i) => ({text: `Command ${i + 1}`, route: `/command-${i + 1}`}))
        }), {id: triggerId, count});

        expect(result.success).toBe(true);
        await page.locator(`#${triggerId}`).click();

        const menu = page.locator('.neo-menu-list.neo-floating');
        await expect(menu.locator('.neo-list-item')).toHaveCount(count);
        return menu
    }

    // The geometry must describe a single resolved side, including after the same mounted menu realigns.
    const geometry = menu => menu.evaluate(el => {
        const rect = el.getBoundingClientRect(),
              cls  = [...el.classList].filter(name => name.startsWith('neo-aligned-'));

        return {
            contained : rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
            directions: cls,
            scrolls   : el.scrollHeight > el.clientHeight + 1
        }
    });

    test('an oversized menu scrolls to a working command, reopens and regains its natural size', async ({page}) => {
        const menu = await openCommands(page, 27);
        await expect.poll(() => geometry(menu)).toMatchObject({contained: true, scrolls: true, directions: [expect.any(String)]});

        const last = menu.getByText('Command 27', {exact: true});
        await menu.hover();
        await page.mouse.wheel(0, 3000);
        await expect(last).toBeInViewport({ratio: 1});
        await last.click();
        await expect(page).toHaveURL(/#\/command-27$/);
        await expect(menu).toHaveCount(0);

        const trigger = page.locator(`#${triggerId}`);
        await trigger.click();
        await expect.poll(() => geometry(menu)).toMatchObject({contained: true, scrolls: true, directions: [expect.any(String)]});
        const [originalSide] = (await geometry(menu)).directions;

        // The resized window puts the trigger in the opposite corner in the same layout pass.
        await page.addStyleTag({content: `@media (min-height: 800px) {
            #${triggerId} { top: 8px; left: 8px; bottom: auto !important; right: auto !important; }
        }`});
        await page.setViewportSize({width: 1100, height: 1200});
        await expect.poll(async () => (await trigger.boundingBox()).y).toBeLessThan(32);
        await expect.poll(() => geometry(menu)).toMatchObject({contained: true, scrolls: false, directions: [expect.any(String)]});
        await expect.poll(async () => (await geometry(menu)).directions).not.toContain(originalSide);
        await expect(last).toBeInViewport({ratio: 1})
    });

    test('a short menu keeps its content height', async ({page}) => {
        const menu = await openCommands(page, 1),
              row  = menu.locator('.neo-list-item');

        await expect.poll(() => geometry(menu)).toMatchObject({contained: true, scrolls: false, directions: [expect.any(String)]});
        const contentHeight = await menu.evaluate(el => {
            const style = getComputedStyle(el);
            return el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
        });
        expect(Math.abs(contentHeight - await row.evaluate(el => el.offsetHeight))).toBeLessThanOrEqual(1)
    })
});
