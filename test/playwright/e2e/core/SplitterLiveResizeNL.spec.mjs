import {test, expect} from '../../fixtures.mjs';

const asArray = value => Array.isArray(value) ? value : value ? [value] : [];
const valueOf = (record, key) => record?.properties?.[key] ?? record?.[key];

/**
 * @summary Whitebox proof for proxy-free live sibling resizing and the deferred compatibility path.
 *
 * The pointer gesture is real and time-spread. Mid-drag assertions are load-bearing: a final-only
 * test cannot distinguish live resizing from the legacy proxy path because both persist the same
 * final size after mouseup.
 *
 * @see https://github.com/neomjs/neo/issues/17819
 */
test.describe('Neo.component.Splitter live resizing', () => {
    test.setTimeout(90000);
    test.use({viewport: {height: 800, width: 1000}});

    const openExample = async (page, neuralLink) => {
        const pageErrors = [];

        page.on('pageerror', error => pageErrors.push(String(error?.message || error)));

        await page.goto('/examples/component/splitter/');
        await expect(page.locator('.neo-splitter')).toBeVisible({timeout: 30000});

        const app     = await neuralLink.connectToApp('Neo.examples.component.splitter'),
              records = asArray(await app.queryComponent(
                  {className: 'Neo.component.Splitter'},
                  ['id', 'direction', 'dragZone.id', 'dragZone.useProxy', 'liveResize', 'parentId', 'resizeTarget']
              ));

        expect(records, 'the example owns one semantic Splitter').toHaveLength(1);

        const splitterRecord = records[0],
              splitterId     = splitterRecord.id,
              parentId       = valueOf(splitterRecord, 'parentId'),
              tree           = await app.getComponentTree(parentId, 2, true),
              itemIds        = tree.tree.items.map(item => item.id),
              splitterIndex  = itemIds.indexOf(splitterId),
              previousId     = itemIds[splitterIndex - 1],
              nextId         = itemIds[splitterIndex + 1];

        const {windowId} = await app.manageNeoConfig('get');

        expect(splitterIndex, 'the Splitter sits between two sibling components').toBeGreaterThan(0);
        expect(nextId).toBeTruthy();
        expect(windowId, 'the page-owned App registry exposes its logical source window').toBeTruthy();

        return {app, nextId, pageErrors, parentId, previousId, splitterId, windowId}
    };

    const rects = async (app, ids) => {
        const values = await app.getDomRect(ids);

        return Object.fromEntries(ids.map((id, index) => [id, values[index]]))
    };

    const moveWhileHeld = async (page, splitterId, {x: deltaX=0, y: deltaY=0}) => {
        const box = await page.locator(`#${splitterId}`).boundingBox(),
              x   = box.x + box.width / 2,
              y   = box.y + box.height / 2;

        await page.mouse.move(x, y);
        await page.mouse.down();
        // The Mouse sensor has a deliberate pre-drag threshold. The real pointer remains held;
        // waiting here arms production drag:start instead of synthesizing worker events.
        await page.waitForTimeout(120);
        await page.mouse.move(x + deltaX, y + deltaY, {steps: 30});

        return {x, y}
    };

    test('live mode moves the real boundary during drag and Escape restores it exactly', async ({page, neuralLink}) => {
        const {app, nextId, pageErrors, parentId, previousId, splitterId} = await openExample(page, neuralLink),
              before                                                      = await rects(app, [previousId, splitterId, nextId]),
              durableBefore                                               = await app.getComponent(nextId, ['wrapperStyle']);

        const splitter = await app.getComponent(splitterId, ['dragZone.id', 'dragZone.useProxy', 'liveResize']);

        expect(splitter.liveResize).toBe(true);
        expect(splitter['dragZone.id']).toBeTruthy();
        expect(splitter['dragZone.useProxy']).toBe(false);

        await moveWhileHeld(page, splitterId, {x: 80});

        let held;

        await expect.poll(async () => {
            held = await rects(app, [previousId, splitterId, nextId]);
            return Math.round(held[splitterId].x - before[splitterId].x)
        }, {
            message  : 'the actual Splitter follows the live Flexbox boundary while held',
            intervals: [30, 50, 100],
            timeout  : 5000
        }).toBeGreaterThan(60);

        expect(held[nextId].width, 'the selected next sibling shrinks during the drag')
            .toBeLessThan(before[nextId].width - 60);
        expect(held[previousId].width, 'the flexible previous sibling consumes the released width')
            .toBeGreaterThan(before[previousId].width + 60);
        await expect(page.locator('.neo-dragproxy'), 'live mode has no proxy embodiment').toHaveCount(0);
        await expect(page.locator(`#${parentId}`), 'live mode does not fade/disable the whole subtree')
            .not.toHaveClass(/neo-disabled/);

        const heldTarget = await app.getComponent(nextId, ['wrapperStyle']),
              mainState  = await page.evaluate(() => {
                  const state = Neo.main.addon.DragDrop.dragResize.state;

                  return state && {
                      axis    : state.axis,
                      preview : state.preview,
                      targetId: state.targetId
                  }
              });

        expect(heldTarget.wrapperStyle, 'transient frames never become durable worker state')
            .toEqual(durableBefore.wrapperStyle);
        expect(mainState).toEqual({axis: 'width', preview: true, targetId: nextId});

        await page.keyboard.press('Escape');

        await expect.poll(async () => {
            const restored = await rects(app, [splitterId, nextId]);

            return Math.abs(restored[splitterId].x - before[splitterId].x) <= 2
                && Math.abs(restored[nextId].width - before[nextId].width) <= 2
        }, {
            message  : 'Escape restores the exact pre-drag boundary',
            intervals: [30, 50, 100],
            timeout  : 5000
        }).toBe(true);

        await expect(page.locator('.neo-dragproxy')).toHaveCount(0);
        await expect(page.locator(`#${splitterId}`)).not.toHaveClass(/neo-is-dragging/);
        expect(await page.evaluate(() => Neo.main.addon.DragDrop.dragResize.state)).toBeNull();
        await page.mouse.up();

        expect(pageErrors).toEqual([])
    });

    test('atomic live release persists, while deferred held mode keeps geometry on the proxy', async ({page, neuralLink}) => {
        const {app, nextId, pageErrors, parentId, splitterId, windowId} = await openExample(page, neuralLink),
              liveBefore                                                = await rects(app, [splitterId, nextId]);

        await expect.poll(() => page.evaluate(() => Boolean(Neo.main.addon.DragDrop.mouseSensor)), {
            message: 'the source Main realm retains its live Mouse sensor',
            timeout: 5000
        }).toBe(true);

        const priorThresholds = await page.evaluate(() => {
            const sensor = Neo.main.addon.DragDrop.mouseSensor;

            const prior = {delay: sensor.delay, minDistance: sensor.minDistance};

            sensor.set({delay: 180, minDistance: 11});

            return prior
        });

        let receipt;

        try {
            receipt = await app.driveDrag({
                source     : {targetId: splitterId, windowId},
                destination: {deltaX: 60, deltaY: 0},
                durationMs : 160,
                steps      : 8
            })
        } finally {
            await page.evaluate(prior => Neo.main.addon.DragDrop.mouseSensor?.set(prior), priorThresholds)
        }

        expect(receipt, JSON.stringify(receipt, null, 2)).toMatchObject({
            success : true,
            phase   : 'complete',
            released: true,
            sensor  : {delayMs: 180, minDistance: 11},
            observed: {started: true, ended: true}
        });
        expect(receipt.observed.moveCount).toBeGreaterThan(0);

        const liveAfter    = await rects(app, [splitterId, nextId]);
        const durableAfter = await app.getComponent(nextId, ['wrapperStyle']);

        expect(liveAfter[splitterId].x - liveBefore[splitterId].x).toBeGreaterThan(40);
        expect(liveAfter[nextId].width).toBeLessThan(liveBefore[nextId].width - 40);
        expect(parseFloat(durableAfter.wrapperStyle.width)).toBeLessThan(liveBefore[nextId].width - 40);

        await app.setProperties(splitterId, {liveResize: false});

        const deferredBefore = await rects(app, [splitterId, nextId]);

        await moveWhileHeld(page, splitterId, {x: -50});
        await expect(page.locator('.neo-dragproxy'), 'deferred mode retains the compatibility proxy').toHaveCount(1);

        const deferredHeld = await rects(app, [splitterId, nextId]);

        expect(Math.abs(deferredHeld[splitterId].x - deferredBefore[splitterId].x),
            'the source boundary stays committed while its proxy moves').toBeLessThanOrEqual(2);
        expect(Math.abs(deferredHeld[nextId].width - deferredBefore[nextId].width),
            'the sibling waits for drag:end in deferred mode').toBeLessThanOrEqual(2);
        await expect(page.locator(`#${parentId}`)).toHaveClass(/neo-disabled/);

        await page.mouse.up();
        await expect(page.locator('.neo-dragproxy')).toHaveCount(0);

        await expect.poll(async () => {
            const after = await rects(app, [splitterId]);
            return Math.abs(after[splitterId].x - deferredBefore[splitterId].x)
        }, {message: 'deferred mode commits the boundary on release', timeout: 5000}).toBeGreaterThan(30);

        expect(pageErrors).toEqual([])
    })

    for (const {direction, resizeTarget} of [
        {direction: 'vertical',   resizeTarget: 'next'},
        {direction: 'vertical',   resizeTarget: 'previous'},
        {direction: 'horizontal', resizeTarget: 'next'},
        {direction: 'horizontal', resizeTarget: 'previous'}
    ]) {
        test(`${direction} ${resizeTarget} resolves the intended outer sibling`, async ({page, neuralLink}) => {
            const {app, nextId, pageErrors, parentId, previousId, splitterId} = await openExample(page, neuralLink),
                  axis                                                        = direction === 'vertical' ? 'width' : 'height',
                  targetId                                                    = resizeTarget === 'next' ? nextId : previousId,
                  delta                                                       = resizeTarget === 'next' ? 45 : -45;

            await app.setProperties(parentId, {
                layout: {ntype: direction === 'vertical' ? 'hbox' : 'vbox', align: 'stretch'}
            });
            await app.setProperties(splitterId, {direction, resizeTarget});

            await expect.poll(async () => {
                const {[splitterId]: rect} = await rects(app, [splitterId]);

                return direction === 'vertical' ? rect.height > rect.width : rect.width > rect.height
            }, {message: `${direction}: layout and splitter axis converge`, timeout: 5000}).toBe(true);

            const before = await rects(app, [targetId]);

            await moveWhileHeld(page, splitterId, direction === 'vertical' ? {x: delta} : {y: delta});

            const mainState = await page.evaluate(() => {
                const state = Neo.main.addon.DragDrop.dragResize.state;

                return state && {axis: state.axis, targetId: state.targetId}
            });

            expect(mainState).toEqual({axis, targetId});
            await expect.poll(async () => {
                const held = await rects(app, [targetId]);

                return before[targetId][axis] - held[targetId][axis]
            }, {message: `${direction} ${resizeTarget}: selected sibling shrinks while held`, timeout: 5000})
                .toBeGreaterThan(30);

            await page.mouse.up();

            const durable = await app.getComponent(targetId, ['wrapperStyle']);

            expect(parseFloat(durable.wrapperStyle[axis])).toBeLessThan(before[targetId][axis] - 30);
            expect(pageErrors).toEqual([])
        })
    }
});
