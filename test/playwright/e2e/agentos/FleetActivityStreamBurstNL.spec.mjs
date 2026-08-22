import {test, expect} from '../../fixtures.mjs';

const
    LIST_CLASS     = 'Neo.list.Buffered',
    ROW_CLASS      = 'AgentOS.view.fleet.activity.RowContainer',
    STORE_MODEL    = 'AgentOS.model.FleetActivityEvent',
    STREAM_CLASS   = 'AgentOS.view.fleet.activity.Container',
    VIEWPORT_CLASS = 'AgentOS.view.Viewport',
    BASE_TIME      = Date.parse('2026-08-22T20:00:00.000Z');

/**
 * @summary Creates production-shaped, source-qualified activity facts with deterministic ordering.
 * @param {Number} count
 * @param {Number} [start=0]
 * @returns {Object[]}
 */
function createEvents(count, start=0) {
    return Array.from({length: count}, (_, offset) => {
        const index = start + offset;

        return {
            eventId   : `e2e:${index}`,
            type      : index % 2 === 0 ? 'a2a-activity' : 'pr',
            source    : index % 2 === 0 ? 'memory-core:mailbox' : 'github:pull-requests',
            agentId   : index % 2 === 0 ? '@neo-gpt-emmy' : '@neo-fable',
            confidence: 'observed',
            occurredAt: new Date(BASE_TIME + index * 1000).toISOString(),
            payload   : {
                text          : `event ${index}`,
                to            : index % 2 === 0 ? 'AGENT:*' : null,
                recipientClass: index % 2 === 0 ? 'broadcast' : null
            }
        }
    })
}

/** @param {Object} result @returns {String|null} */
function componentId(result) {
    return result?.id ?? result?.properties?.id ?? null
}

/**
 * @summary Finds one exact mounted component and returns its runtime id.
 * @param {Object} app
 * @param {String} className
 * @returns {Promise<String>}
 */
async function getOnlyComponentId(app, className) {
    const matches = await app.queryComponent({className}, ['id']);

    expect(matches, `one mounted ${className} should exist`).toHaveLength(1);

    return componentId(matches[0])
}

/**
 * @summary Reads the finite mounted-row envelope from App-Worker truth.
 * @param {Object} app
 * @param {String} listId
 * @returns {Promise<Object>}
 */
async function getListState(app, listId) {
    return app.getComponent(listId, [
        'anchorOffset',
        'anchorRecordId',
        'availableRows',
        'bufferRowRange',
        'itemHeight',
        'mountedRange',
        'scrollTop',
        'viewportHeight'
    ])
}

/**
 * @summary Possesses the mounted activity surface, its exact bound Store, list and viewport.
 * @param {Object} page
 * @param {Object} neuralLink
 * @returns {Promise<Object>}
 */
async function boot(page, neuralLink) {
    await page.goto('/apps/agentos/index.html');
    await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});
    await expect(page.locator('.fm-activity-stream')).toBeVisible({timeout: 30000});

    const
        app        = await neuralLink.connectToApp('AgentOS'),
        streamId   = await getOnlyComponentId(app, STREAM_CLASS),
        listId     = await getOnlyComponentId(app, LIST_CLASS),
        viewportId = await getOnlyComponentId(app, VIEWPORT_CLASS),
        provider   = await app.callMethod(streamId, 'getStateProvider'),
        stores     = await app.listStores(),
        store      = stores.stores.find(candidate => candidate.model === STORE_MODEL);

    expect(store, 'the provider-owned FleetActivityEvents Store should be registered').toBeTruthy();
    expect(provider?.id, 'the bound activity count authority should be addressable').toBeTruthy();

    await expect.poll(async () => (await app.inspectStore(store.id, 1)).count, {
        message: 'the initial activity admission should settle before the 500-event replacement'
    }).toBeGreaterThan(0);

    return {app, listId, providerId: provider.id, storeId: store.id, streamId, viewportId}
}

/**
 * @summary The Fleet activity history's real product contract at 500-record pressure.
 *
 * The Store remains complete while the DOM is finite; the first nested pooled row joins record,
 * VDOM, VNode and painted text; history reading survives a prepend without a jump; source counts
 * never borrow local retention; stale transport never blanks the retained feed; and both skins
 * render the same fixed-height row anatomy.
 *
 * @see apps/agentos/store/FleetActivityEvents.mjs
 * @see apps/agentos/view/fleet/activity/Container.mjs
 * @see src/list/Buffered.mjs
 */
test.describe('AgentOS Fleet activity — buffered history possession (Neural Link)', () => {
    test.setTimeout(90000);
    test.use({locale: 'en-US', timezoneId: 'America/New_York'});

    test('500 records stay scrollable and bounded; prepend preserves the reader on both themes', async ({page, neuralLink}, testInfo) => {
        const pageErrors = [];

        page.on('pageerror', error => pageErrors.push(error.message));

        const
            {app, listId, providerId, storeId, streamId, viewportId} = await boot(page, neuralLink),
            events                                                   = createEvents(500),
            admission                                                = await app.callMethod(storeId, 'ingestSnapshot', [events, {replace: true}]);

        expect(admission).toMatchObject({added: 500, dropped: 0, retained: 500});

        await app.setProperties(streamId, {adapterState: 'live'});
        await app.modifyStateProvider(providerId, {
            activityCounts: [{
                source    : 'memory-core:mailbox',
                scope     : 'last24h',
                value     : 36,
                complete  : true,
                capturedAt: '2026-08-22T20:10:00.000Z'
            }, {
                source    : 'memory-core:mailbox',
                scope     : 'total',
                value     : 412,
                complete  : true,
                capturedAt: '2026-08-22T20:10:00.000Z'
            }, {
                source    : 'memory-core:mailbox',
                scope     : 'total',
                value     : 999,
                complete  : false,
                capturedAt: '2026-08-22T20:11:00.000Z'
            }]
        });

        const
            list        = page.locator('.fm-activity-list'),
            rows        = page.locator('.fm-activity-row'),
            firstObject = rows.first().locator('.fm-ev-object'),
            firstTime   = rows.first().locator('.fm-ev-time');

        await expect.poll(() => getListState(app, listId), {
            message: 'the real ResizeObserver delivery should size the bounded pool'
        }).toMatchObject({
            anchorRecordId: 'e2e:499',
            availableRows : expect.any(Number),
            scrollTop     : 0
        });

        const
            stateAtTop   = await getListState(app, listId),
            expectedPool = Math.min(500, stateAtTop.availableRows + 2 * stateAtTop.bufferRowRange);

        expect(stateAtTop.viewportHeight).toBeGreaterThan(0);
        expect(stateAtTop.availableRows).toBeGreaterThan(0);
        expect(stateAtTop.mountedRange).toEqual([0, expectedPool]);
        expect(expectedPool).toBeLessThan(500);

        const storeAtTop = await app.inspectStore(storeId, 3);

        expect(storeAtTop.count).toBe(500);
        expect(storeAtTop.items[0].eventId).toBe('e2e:499');
        await expect(rows).toHaveCount(expectedPool);
        await expect(page.locator('.fm-stream-fold')).toHaveCount(0);

        const scrollMetrics = await list.evaluate(element => ({
            clientHeight: element.clientHeight,
            overflowY   : getComputedStyle(element).overflowY,
            scrollHeight: element.scrollHeight
        }));

        expect(scrollMetrics.overflowY).toBe('auto');
        expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);

        await expect(firstObject).toHaveText('event 499');
        await expect(firstTime).toHaveText('04:08 PM');
        await expect(firstTime).toHaveAttribute('title', '2026-08-22T20:08:19.000Z');

        const
            rowComponents = await app.queryComponent({className: ROW_CLASS}, ['id', 'record']),
            firstRow      = rowComponents.find(row => row.properties.record.eventId === 'e2e:499'),
            firstRowId    = componentId(firstRow),
            [objectCell]  = await app.queryComponent({parentId: firstRowId, reference: 'object'}, ['id', 'text', 'vdom', 'vnode']);

        expect(objectCell.properties.text).toBe('event 499');
        expect(objectCell.properties.vdom.text).toBe('event 499');
        expect(objectCell.properties.vnode.textContent).toBe('event 499');
        await expect(rows.first().locator(':scope > *')).toHaveCount(5);

        await expect(page.locator('.fm-stream-counts')).toHaveText('mailbox · 36 / 24h · 412 total');
        await expect(page.locator('.fm-stream-retention')).toHaveText('500 retained');
        await expect(page.locator('.fm-stream-head.is-live')).toBeVisible();
        await expect(page.locator('.fm-stream-state')).toHaveText('● streaming');
        await expect(page.locator('.fm-activity-stream')).toHaveAttribute('role', 'log');
        await expect(list).toHaveAttribute('aria-live', 'off');
        await expect(page.locator('.fm-stream-announcer')).toHaveAttribute('role', 'status');

        const listBox = await list.boundingBox();

        expect(listBox, 'the activity scroll seat should have physical geometry').toBeTruthy();
        await page.mouse.move(listBox.x + listBox.width / 2, listBox.y + listBox.height / 2);
        await page.mouse.wheel(0, 620);

        await expect.poll(async () => (await getListState(app, listId)).scrollTop, {
            message: 'a user wheel should move the App-Worker list into retained history'
        }).toBeGreaterThan(0);

        const beforePrepend = await getListState(app, listId);

        expect(beforePrepend.anchorRecordId).toEqual(expect.any(String));
        expect(beforePrepend.mountedRange[0]).toBeGreaterThan(0);

        const
            poolIdsBefore = (await app.queryComponent({className: ROW_CLASS}, ['id'])).map(componentId).sort(),
            joiners       = createEvents(2, 500),
            prependResult = await app.callMethod(storeId, 'ingestSnapshot', [joiners]);

        expect(prependResult).toMatchObject({added: 2, dropped: 0, retained: 502});

        await expect(page.locator('.fm-stream-new-events')).toHaveText('2 new events ↑');
        await expect(page.locator('.fm-stream-new-events')).toBeVisible();
        await expect(page.locator('.fm-stream-announcer')).toContainText('2 new fleet activity events');

        await expect.poll(() => getListState(app, listId), {
            message: 'prepend should restore the same logical record and within-row pixel offset'
        }).toMatchObject({
            anchorOffset  : beforePrepend.anchorOffset,
            anchorRecordId: beforePrepend.anchorRecordId
        });

        const afterPrepend = await getListState(app, listId);

        expect(afterPrepend.scrollTop).toBe(beforePrepend.scrollTop + 2 * beforePrepend.itemHeight);
        expect(await list.evaluate(element => element.scrollTop)).toBe(afterPrepend.scrollTop);
        expect((await app.queryComponent({className: ROW_CLASS}, ['id'])).map(componentId).sort()).toEqual(poolIdsBefore);
        await expect(rows).toHaveCount(expectedPool);

        await app.setProperties(streamId, {adapterState: 'stale'});
        await expect(page.locator('.fm-stream-head.is-stale')).toBeVisible();
        await expect(page.locator('.fm-stream-state')).toHaveText('stale — reconnecting');
        await expect(rows).toHaveCount(expectedPool);

        await page.locator('.fm-stream-new-events').click();
        await expect.poll(async () => (await getListState(app, listId)).scrollTop).toBe(0);
        await expect(page.locator('.fm-stream-new-events')).toBeHidden();
        await expect(firstObject).toHaveText('event 501');

        const
            viewportState = await app.getComponent(viewportId, ['controller']),
            controllerId  = viewportState.controller.id,
            viewport      = page.locator('.agent-os-viewport').first();

        for (const theme of ['neo-theme-neo-light', 'neo-theme-neo-dark']) {
            await app.callMethod(controllerId, 'setTheme', [theme, false]);
            await expect(viewport).toHaveClass(new RegExp(`(?:^|\\s)${theme}(?:\\s|$)`));
            await page.evaluate(() => document.fonts.ready);

            const paint = await rows.first().evaluate(element => {
                const
                    streamStyle = getComputedStyle(element.closest('.fm-activity-stream')),
                    rowStyle    = getComputedStyle(element);

                return {
                    borderColor     : rowStyle.borderBottomColor,
                    height          : element.getBoundingClientRect().height,
                    streamBackground: streamStyle.backgroundColor
                }
            });

            expect(paint.height).toBeCloseTo(52, 0);
            expect(paint.borderColor).not.toBe('rgba(0, 0, 0, 0)');
            expect(paint.streamBackground).not.toBe('rgba(0, 0, 0, 0)');
            await expect(firstObject).toHaveText('event 501');
            await page.screenshot({path: testInfo.outputPath(`activity-${theme}.png`)})
        }

        expect(pageErrors, 'no uncaught page errors during the activity-history journey').toEqual([])
    })
});
