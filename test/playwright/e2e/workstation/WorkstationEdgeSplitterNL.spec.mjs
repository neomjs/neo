import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E for committed edge-zone resizing and active-tab persistence.
 *
 * Playwright owns the real pointer gesture and rendered-band geometry. Neural Link owns the
 * committed-document and live TabContainer assertions. The pair proves the boundary that unit tests
 * cannot: move frames resize only main-thread pixels, release commits one normalized edge extent,
 * projection lands on the same final geometry, and Escape restores the prior presentation without a
 * document write. A non-first tab remains selected through both axes and the cancelled gesture.
 *
 * Run: NEO_AGENTOS_RUNTIME_ROOT=/path/to/neo-agent-brain npx playwright test
 * test/playwright/e2e/workstation/WorkstationEdgeSplitterNL.spec.mjs
 * -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Workstation edge splitters — runtime pixels commit once as document extent', () => {
    test.setTimeout(120000);
    test.use({viewport: {height: 900, width: 1440}});

    const asArray = value => Array.isArray(value) ? value : value ? [value] : [];
    const values  = record => record?.properties || record || {};

    test('both axes preserve the active tab; Escape restores without committing', async ({page, neuralLink}) => {
        const pageErrors = [];

        page.on('pageerror', error => {
            const value = String(error?.stack || error?.message || error || '');

            value && value !== 'undefined' && pageErrors.push(value)
        });

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 30000});

        const app           = await neuralLink.connectToApp('Workstation'),
              workspaces    = asArray(await app.findInstances({className: 'Workstation.view.Workspace'}, ['id'])),
              workspaceId   = workspaces[0]?.id,
              workspaceRoot = page.locator('.workstation-workspace');

        expect(workspaceId, 'the Workstation workspace exists in the App Worker').toBeTruthy();

        const readDocument = async () => {
            const result = await app.getDockTopology(workspaceId);

            return result?.document ?? result
        };

        const readActiveTabs = async () => {
            const result = await app.queryComponent({dockNodeId: 'right-top-tabs'}, ['id', 'activeIndex']);

            return values(Array.isArray(result) ? result[0] : result)
        };

        const findEdgeSplitterId = async edge => {
            const records = asArray(await app.findInstances(
                {className: 'Neo.dashboard.dock.interaction.DockSplitter'},
                ['id', 'edge', 'edgeZoneId', 'data.operation']
            )),
                candidates = records
                    .filter(record => values(record).edge === edge)
                    .map(record => record.id);

            return page.evaluate(ids => ids.find(id => {
                const element = document.getElementById(id),
                      rect    = element?.getBoundingClientRect();

                return Boolean(rect?.width && rect.height)
            }) || null, candidates)
        };

        const readResizeRatio = config => page.evaluate(({axis, parentId, targetId}) => {
            const parent = document.getElementById(parentId),
                  target = document.getElementById(targetId);

            if (!parent || !target) return null;

            const parentRect = parent.getBoundingClientRect(),
                  targetRect = target.getBoundingClientRect();

            return axis === 'height' ? targetRect.height / parentRect.height : targetRect.width / parentRect.width
        }, config);

        const auditChrome   = await app.callMethod(workspaceId, 'getTabChromeIdentity', ['right-top-tabs']),
              auditHeaderId = auditChrome?.buttons?.audit;

        expect(auditHeaderId, 'the non-first Audit tab has a live header button').toBeTruthy();
        await page.locator(`#${auditHeaderId}`).click({timeout: 10000});

        await expect.poll(async () => (await readDocument()).nodes['right-top-tabs'].activeItemId, {
            message  : 'the real tab click commits audit into document truth',
            timeout  : 10000,
            intervals: [50, 100]
        }).toBe('audit');
        await expect.poll(async () => (await readActiveTabs()).activeIndex, {
            message  : 'the live TabContainer converges on the committed second item',
            timeout  : 10000,
            intervals: [50, 100]
        }).toBe(1);
        await expect(page.locator('.workstation-pane-audit'), 'the selected pane is rendered').toBeVisible();

        for (const edge of ['left', 'right', 'bottom']) {
            const splitterId = await findEdgeSplitterId(edge);

            expect(splitterId, `${edge}: the initial workspace projects an edge splitter`).toBeTruthy();
            await expect(page.locator(`#${splitterId}`), `${edge}: the initial edge splitter is visible`).toBeVisible()
        }

        const dragEdge = async ({edge, dx=0, dy=0, cancel=false}) => {
            await expect(workspaceRoot, `${edge}: prior projection motion has released`)
                .not.toHaveClass(/neo-dashboard-dock-animating/, {timeout: 10000});
            await expect(page.locator('.neo-dock-flip-fixed-stage'), `${edge}: no fixed-stage residue remains`)
                .toHaveCount(0, {timeout: 10000});

            const splitterId = await findEdgeSplitterId(edge);

            expect(splitterId, `${edge}: a semantic edge splitter is projected`).toBeTruthy();

            const resizeConfig = await app.callMethod(splitterId, 'getResizeConfig', []);

            expect(resizeConfig, `${edge}: the generic main-thread resize descriptor is registered`).toMatchObject({
                preview: true
            });

            const splitterLocator = page.locator(`#${splitterId}`);

            await expect(splitterLocator, `${edge}: the projected splitter is visible and pointer-reachable`).toBeVisible();

            const rect        = await splitterLocator.boundingBox(),
                  startX      = rect.x + rect.width / 2,
                  startY      = rect.y + rect.height / 2,
                  before      = await readDocument(),
                  beforeRaw   = JSON.stringify(before),
                  beforeRatio = await readResizeRatio(resizeConfig);

            expect(beforeRatio, `${edge}: the target band has measurable geometry`).toBeGreaterThan(0);

            const hitPath = await page.evaluate(({x, y}) => {
                const ids = [];

                for (let current = document.elementFromPoint(x, y); current; current = current.parentElement) {
                    current.id && ids.push(current.id)
                }

                return ids
            }, {x: startX, y: startY});

            expect(hitPath, `${edge}: the physical hit path contains the semantic splitter`)
                .toContain(splitterId);

            await page.mouse.move(startX, startY);
            await page.mouse.down();
            // fixed-sleep-justification: the real mouse sensor has a deliberate press-duration
            // threshold; this arms the gesture and is never used as a settlement wait.
            await page.waitForTimeout(150);
            await page.mouse.move(startX + Math.sign(dx || 1) * 12, startY + Math.sign(dy || 1) * 12, {steps: 4});
            await page.mouse.move(startX + dx, startY + dy, {steps: 16});

            await expect.poll(async () => Math.abs((await readResizeRatio(resizeConfig)) - beforeRatio), {
                message  : `${edge}: main-thread preview changes the real band before release`,
                timeout  : 10000,
                intervals: [25, 50]
            }).toBeGreaterThan(0.02);

            expect(JSON.stringify(await readDocument()), `${edge}: move frames do not mutate document bytes`)
                .toBe(beforeRaw);

            if (cancel) {
                await page.keyboard.press('Escape');
                await page.mouse.up();

                await expect.poll(() => readResizeRatio(resizeConfig), {
                    message  : `${edge}: Escape restores the pre-gesture band`,
                    timeout  : 10000,
                    intervals: [25, 50]
                }).toBeCloseTo(beforeRatio, 2);
                expect(JSON.stringify(await readDocument()), `${edge}: Escape commits zero operations`)
                    .toBe(beforeRaw);
                expect(
                    (await app.getComponent(splitterId, ['dragStartState'])).dragStartState,
                    `${edge}: Escape retires the worker-side geometry snapshot without a later drag:end`
                ).toBeNull();

                return before
            }

            await page.mouse.up();

            await expect.poll(async () => {
                const document = await readDocument();

                return Math.abs(document.nodes.root.zones[edge].extent - before.nodes.root.zones[edge].extent)
            }, {
                message  : `${edge}: release commits a changed normalized edge extent`,
                timeout  : 10000,
                intervals: [50, 100]
            }).toBeGreaterThan(0.02);

            const after = await readDocument();

            const settledSplitterId = await findEdgeSplitterId(edge),
                  settledConfig     = await app.callMethod(settledSplitterId, 'getResizeConfig', []);

            await expect.poll(async () => Math.abs(
                (await readResizeRatio(settledConfig)) - after.nodes.root.zones[edge].extent
            ), {
                message  : `${edge}: re-projection lands on the exact bounded terminal extent`,
                timeout  : 10000,
                intervals: [50, 100]
            }).toBeLessThan(0.015);

            return after
        };

        await dragEdge({edge: 'left', dx: 90});
        expect((await readDocument()).nodes['right-top-tabs'].activeItemId).toBe('audit');
        expect((await readActiveTabs()).activeIndex).toBe(1);

        await dragEdge({edge: 'bottom', dy: -70});
        expect((await readDocument()).nodes['right-top-tabs'].activeItemId).toBe('audit');
        expect((await readActiveTabs()).activeIndex).toBe(1);

        await dragEdge({edge: 'left', dx: 70, cancel: true});
        expect((await readDocument()).nodes['right-top-tabs'].activeItemId).toBe('audit');
        expect((await readActiveTabs()).activeIndex).toBe(1);
        await expect(page.locator('.workstation-pane-audit'), 'cancel leaves the same selected pane rendered').toBeVisible();

        expect(pageErrors, 'the two-axis resize and cancellation surface no page errors').toEqual([])
    })
});
