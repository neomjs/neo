import {test, expect} from '../../fixtures.mjs';

test.use({serviceWorkers: 'block'});

/**
 * @summary Browser end-to-end verification of the two-thread VDOM pipeline (`useVdomWorker: false`).
 * Exercises real App Worker -> Main Thread message framing for `DeltaUpdates` `meta` forwarding during
 * `grid/bigData` scrolling and `createVnodeTree` `autoMount` `insertNode` dispatch in `component/helix`.
 */
test.describe('Two-thread VDOM pipeline browser parity (#20780)', () => {
    test('grid/bigData scroll forwards meta on every DeltaUpdates update without a VDom worker', async ({page, neuralLink}) => {
        await neuralLink.routeConfig(page, config => ({
            ...config,
            useDomApiRenderer: true,
            useServiceWorker : false,
            useVdomWorker    : false
        }));

        await page.goto('/examples/grid/bigData/index.html');
        await neuralLink.connectToApp('Neo.examples.grid.bigData');
        await expect(page.locator('.neo-grid-row').first()).toBeVisible({timeout: 30000});

        const workers = await page.evaluate(() => ({
            hasApp : Boolean(Neo.worker.Manager.getWorker('app')),
            hasVdom: Boolean(Neo.worker.Manager.getWorker('vdom'))
        }));

        expect(workers).toEqual({hasApp: true, hasVdom: false});

        await page.evaluate(() => {
            const counts   = {total: 0, withMeta: 0},
                  listener = data => {
                      counts.total++;
                      if (data?.meta && Object.keys(data.meta).length > 0) {
                          counts.withMeta++
                      }
                  };

            window.__twoThreadMetaProbe = {counts, listener};
            Neo.main.DeltaUpdates.on('update', listener)
        });

        try {
            await page.evaluate(() => new Promise(resolve => {
                const view   = document.querySelector('.neo-grid-view');
                let   frames = 0;

                const step = () => {
                    view.scrollTop += 160;
                    if (++frames < 12) {
                        requestAnimationFrame(step)
                    } else {
                        requestAnimationFrame(() => resolve(view.scrollTop))
                    }
                };

                requestAnimationFrame(step)
            }));

            await expect.poll(() => page.evaluate(() => window.__twoThreadMetaProbe.counts.total)).toBeGreaterThanOrEqual(3);

            const counts = await page.evaluate(() => window.__twoThreadMetaProbe.counts);

            expect(counts.total).toBeGreaterThan(0);
            expect(counts.withMeta, `${counts.withMeta} of ${counts.total} DeltaUpdates updates carried meta`).toBe(counts.total)
        } finally {
            await page.evaluate(() => {
                if (window.__twoThreadMetaProbe) {
                    Neo.main.DeltaUpdates.un('update', window.__twoThreadMetaProbe.listener);
                    delete window.__twoThreadMetaProbe
                }
            })
        }
    });

    test('component/helix Enter on a selected item mounts its expanded clone in the DOM without a VDom worker', async ({page, neuralLink}) => {
        await neuralLink.routeConfig(page, config => ({
            ...config,
            useDomApiRenderer: true,
            useServiceWorker : false,
            useVdomWorker    : false
        }));

        await page.goto('/examples/component/helix/index.html');
        const app = await neuralLink.connectToApp('Neo.examples.component.helix');
        await expect(page.locator('.neo-helix-item').first()).toBeVisible({timeout: 30000});

        const workers = await page.evaluate(() => ({
            hasApp : Boolean(Neo.worker.Manager.getWorker('app')),
            hasVdom: Boolean(Neo.worker.Manager.getWorker('vdom'))
        }));

        expect(workers).toEqual({hasApp: true, hasVdom: false});

        await page.locator('.neo-helix-item').first().focus();
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('.neo-helix-item.neo-selected')).toHaveCount(1);

        await page.keyboard.press('Enter');
        await expect(page.locator('.neo-helix-item[id$="__clone"]')).toHaveCount(1);
        await expect(page.locator('[id$="__clone"]')).toHaveCount(2);

        const [helix] = await app.queryComponent({ntype: 'helix'}, ['clonedItems']);
        expect(helix.properties.clonedItems).toHaveLength(1)
    })
});
