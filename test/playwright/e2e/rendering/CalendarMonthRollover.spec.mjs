import {test, expect} from '../../fixtures.mjs';

test.describe('Neo.calendar.view.month.Component downward wheel rollover compensation', () => {
    test.setTimeout(90000);

    test('consecutive physical downward rollovers retain anchor across tall weeks', async ({page, neuralLink}, info) => {
        await page.setViewportSize({width: 1280, height: 720});
        await neuralLink.routeConfig(page, config => ({...config, useAiClient: true}));

        await page.goto('/examples/calendar/basic/index.html');
        const app = await neuralLink.connectToApp('Neo.examples.calendar.basic');

        await page.getByRole('button', {name: 'Month', exact: true}).click();

        let component;
        await expect.poll(async () => {
            component = [].concat(
                await app.queryComponent({className: 'Neo.calendar.view.month.Component'}, ['id', 'mounted', 'headerHeight']) ?? []
            )[0];
            return component?.properties?.mounted && component.properties.headerHeight > 0;
        }).toBeTruthy();

        const scroller = page.locator('.neo-c-m-scrollcontainer');

        async function snapshot() {
            return scroller.evaluate(el => {
                const top = el.getBoundingClientRect().top;

                return {
                    scrollTop     : el.scrollTop,
                    clientHeight  : el.clientHeight,
                    overflowAnchor: getComputedStyle(el).overflowAnchor,
                    rows          : [...el.querySelectorAll(':scope > .neo-week')].map(row => ({
                        id    : row.id,
                        top   : row.getBoundingClientRect().top - top,
                        height: row.getBoundingClientRect().height
                    }))
                };
            });
        }

        const initial = await snapshot(),
              header  = component.properties.headerHeight,
              seat    = 2 * (initial.clientHeight - header) - 20,
              results = [];

        for (let step = 0; step < 3; step++) {
            await scroller.evaluate((el, y) => { el.scrollTop = y; }, seat);

            const before = await snapshot(),
                  anchor = before.rows.find(row => row.top >= 0),
                  box    = await scroller.boundingBox();

            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.wheel(0, 1);

            await expect.poll(async () => (await snapshot()).rows[0].id).not.toBe(before.rows[0].id);
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

            const after   = await snapshot(),
                  current = after.rows.find(row => row.id === anchor.id),
                  record  = {
                      browser       : info.project.name,
                      step,
                      header,
                      seat,
                      firstBefore   : before.rows[0].id,
                      firstAfter    : after.rows[0].id,
                      removedHeight : before.rows.slice(0, 6).reduce((sum, row) => sum + row.height, 0),
                      assumedHeight : before.clientHeight - header,
                      anchorId      : anchor.id,
                      beforeTop     : anchor.top,
                      afterTop      : current?.top,
                      anchorDelta   : current?.top - anchor.top,
                      scrollBefore  : before.scrollTop,
                      scrollAfter   : after.scrollTop,
                      overflowAnchor: after.overflowAnchor
                  };

            results.push(record);
            console.log('RECEIPT', JSON.stringify(record));
        }

        await info.attach('rollovers', {
            body       : JSON.stringify(results, null, 2),
            contentType: 'application/json'
        });

        expect(results[1].removedHeight).toBeGreaterThan(results[1].assumedHeight + 10);
        expect(results.every(row => Math.abs(row.anchorDelta) < 5)).toBeTruthy();
    });
});
