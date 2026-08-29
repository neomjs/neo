import {test, expect}    from '../../fixtures.mjs';
import {isEngineProfile} from '../utils/gpuIntent.mjs';

const
    EDGES  = ['top', 'right', 'bottom', 'left'],
    THEMES = ['neo-theme-neo-dark', 'neo-theme-neo-light'];

/**
 * @summary Whitebox E2E contract for exact-target dock-preview symmetry.
 *
 * One stable `left-tabs` target is exercised through both landed routes:
 *
 * - in-window: a real Audit-tab pointer gesture drives `DockDragAffordances`;
 * - popup→main: a real Activity tear-out supplies the source window, then the registered
 *   `CrossWindowDragTarget` drives the main target's remote-preview callback.
 *
 * Each route runs in both Workstation themes. The retained matrix binds the semantic node id,
 * exact target/host/window rectangles, preview rectangle, DPR, zoom, and same-scale crop for
 * top/right/bottom/left. The test compares the four thicknesses directly; independent maxima
 * or source-code symmetry are deliberately insufficient.
 *
 * Run:
 * NEO_E2E_PORT=8096 npx playwright test WorkstationDockPreviewSymmetryNL \
 *   -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Workstation dock-preview four-axis symmetry (Neural Link)', () => {
    test.setTimeout(240000);

    /**
     * Normalizes Neural Link query/find result shapes.
     * @param {Object|null} result
     * @returns {Object|null}
     */
    function properties(result) {
        return result?.properties ?? result ?? null
    }

    /**
     * Reads an id from a direct, wrapped, or array Neural Link result.
     * @param {Object|Object[]|null} result
     * @returns {String|null}
     */
    function readId(result) {
        if (Array.isArray(result)) return readId(result[0]);

        return properties(result)?.id ?? null
    }

    /**
     * Boots one settled Workstation and resolves the exact target/render-owner ids.
     * @param {import('@playwright/test').Page} page
     * @param {Object} neuralLink
     * @returns {Promise<Object>}
     */
    async function boot(page, neuralLink) {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 60000});
        await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(() => {
            const
                host   = document.querySelector('.workstation-dock-host'),
                target = [...document.querySelectorAll('.neo-dashboard-dock-tabs')]
                    .find(element => element.id && element.getBoundingClientRect().width > 100);

            return host?.getBoundingClientRect().height > 300
                && target?.getBoundingClientRect().height > 100
        }, {timeout: 60000});

        const
            app        = await neuralLink.connectToApp('Workstation'),
            workspaces = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
            wsId       = readId(workspaces);

        expect(wsId, 'one live Workstation Workspace must exist').toBeTruthy();

        // Give the edge-owned target two ordinary visible residents. Tearing the staged Activity
        // tab out later then leaves Queues behind, so normalization cannot retire `left-tabs`
        // between the in-window and popup→main routes.
        const staged = await app.callMethod(wsId, 'commitLocalWorkspaceOperation', [
            'workstation-main',
            {operation: 'moveItem', itemId: 'activity', targetNodeId: 'left-tabs', index: 1}
        ]);

        expect(staged.errors).toEqual([]);
        await expect.poll(async () => {
            const {dockModel} = await app.getComponent(wsId, ['dockModel']);

            return dockModel.nodes['left-tabs']?.items?.includes('activity')
        }, {
            message: 'the stable target must retain the staged Activity tab',
            timeout: 15000
        }).toBe(true);
        await page.waitForTimeout(700);

        const
            hostId    = readId(await app.queryComponent({reference: 'dock-host'}, ['id'])),
            targetId  = readId(await app.queryComponent({dockNodeId: 'left-tabs'}, ['id'])),
            previewId = readId(await app.queryComponent({reference: 'dock-preview'}, ['id']));

        expect(hostId, 'the preview containing block must resolve by reference').toBeTruthy();
        expect(targetId, 'left-tabs must resolve to one exact component id').toBeTruthy();
        expect(previewId, 'the main preview renderer must resolve by reference').toBeTruthy();

        return {app, hostId, previewId, targetId, wsId}
    }

    /**
     * Applies and waits for one live Workstation theme.
     * @param {Object} app
     * @param {import('@playwright/test').Page} page
     * @param {String} wsId
     * @param {String} theme
     */
    async function setTheme(app, page, wsId, theme) {
        await app.callMethod(wsId, 'setWorkspaceTheme', [theme]);
        await expect.poll(async () => (await app.getComponent(wsId, ['theme'])).theme, {
            message: `worker theme must settle at ${theme}`,
            timeout: 15000
        }).toBe(theme);
        await expect(page.locator('body > .workstation-viewport')).toHaveClass(new RegExp(theme));
        await page.waitForTimeout(180)
    }

    /**
     * Reads one positive viewport-space rectangle.
     * @param {import('@playwright/test').Page} page
     * @param {String} id
     * @returns {Promise<Object>}
     */
    async function readTargetRect(page, id) {
        const rect = await page.evaluate(componentId => {
            const value = document.getElementById(componentId)?.getBoundingClientRect();

            return value && {
                bottom: value.bottom,
                height: value.height,
                left  : value.left,
                right : value.right,
                top   : value.top,
                width : value.width,
                x     : value.x,
                y     : value.y
            }
        }, id);

        expect(rect?.width, 'the target width must be measurable').toBeGreaterThan(0);
        expect(rect?.height, 'the target height must be measurable').toBeGreaterThan(0);

        return rect
    }

    /**
     * Picks four pointer positions within the producer's real edge bands. The top sample stays
     * below the tab-header carve-out while remaining inside the top edge band.
     * @param {Object} rect
     * @returns {Object}
     */
    function edgePoints(rect) {
        const
            band     = .24 * Math.min(rect.width, rect.height),
            topInset = Math.min(band - 2, Math.max(37, band * .8)),
            centerX  = rect.left + rect.width / 2,
            centerY  = rect.top + rect.height / 2;

        expect(band, 'the stable target must expose a top band below its header carve-out').toBeGreaterThan(38);

        return {
            top   : {x: centerX, y: rect.top + topInset},
            right : {x: rect.right - 2, y: centerY},
            bottom: {x: centerX, y: rect.bottom - 2},
            left  : {x: rect.left + 2, y: centerY}
        }
    }

    /**
     * Starts the existing physical in-window drag on Audit.
     * @param {import('@playwright/test').Page} page
     */
    async function beginAuditDrag(page) {
        const header = page.locator('.neo-tab-header-button', {hasText: 'Audit'}).first();

        await expect(header).toBeVisible();

        const rect = await header.boundingBox();

        await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
        await page.mouse.down();
        await page.mouse.move(rect.x + rect.width / 2 + 12, rect.y + rect.height / 2 + 12, {steps: 4});
        await expect(page.locator('.neo-tab-header-toolbar.neo-is-dragging')).toBeVisible()
    }

    /**
     * Ends the physical gesture without committing.
     * @param {import('@playwright/test').Page} page
     */
    async function cancelPhysicalDrag(page) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(120);
        await page.mouse.up();
        await page.waitForTimeout(260)
    }

    /**
     * Waits until the main renderer carries one exact semantic edge preview.
     * @param {Object} app
     * @param {String} previewId
     * @param {String} edge
     * @returns {Promise<Object>}
     */
    async function waitForMainPreview(app, previewId, edge) {
        let preview;

        await expect.poll(async () => {
            preview = (await app.getComponent(previewId, ['dockPreview'])).dockPreview;

            return preview
                ? `${preview.target?.nodeId}:${preview.placement?.kind}`
                : 'none'
        }, {
            message: `left-tabs must publish edge-${edge}`,
            timeout: 15000
        }).toBe(`left-tabs:edge-${edge}`);

        return preview
    }

    /**
     * Waits for the renderer's semantic edge plus geometry update, then captures their same-frame
     * browser receipt. This observes the two-stage reactive paint without timing sleeps.
     * @param {import('@playwright/test').Page} page
     * @param {Object} ids
     * @param {String} route
     * @param {String} theme
     * @param {String} edge
     * @param {Object} preview
     * @returns {Promise<Object>}
     */
    async function readFrame(page, ids, route, theme, edge, preview) {
        let frame;

        await expect.poll(async () => {
            frame = await page.evaluate(({edge, hostId, previewId, targetId}) => {
                const
                    host       = document.getElementById(hostId),
                    target     = document.getElementById(targetId),
                    affordance = document.getElementById(previewId)
                        ?.querySelector('.neo-dock-preview-affordance'),
                    pick       = element => {
                        const rect = element?.getBoundingClientRect();

                        return rect && {
                            bottom: rect.bottom,
                            height: rect.height,
                            left  : rect.left,
                            right : rect.right,
                            top   : rect.top,
                            width : rect.width,
                            x     : rect.x,
                            y     : rect.y
                        }
                    },
                    affordanceRect = pick(affordance),
                    targetRect     = pick(target),
                    near           = (first, second) => Math.abs(first - second) <= 1,
                    settled        = affordanceRect && targetRect &&
                        affordance.classList.contains(`neo-dock-preview-edge-${edge}`) &&
                        affordance.dataset.dockTarget === 'left-tabs' &&
                        (edge === 'top'
                            ? near(affordanceRect.left, targetRect.left) &&
                                near(affordanceRect.width, targetRect.width) &&
                                near(affordanceRect.top, targetRect.top)
                            : edge === 'right'
                                ? near(affordanceRect.top, targetRect.top) &&
                                    near(affordanceRect.height, targetRect.height) &&
                                    near(affordanceRect.right, targetRect.right)
                                : edge === 'bottom'
                                    ? near(affordanceRect.left, targetRect.left) &&
                                        near(affordanceRect.width, targetRect.width) &&
                                        near(affordanceRect.bottom, targetRect.bottom)
                                    : near(affordanceRect.top, targetRect.top) &&
                                        near(affordanceRect.height, targetRect.height) &&
                                        near(affordanceRect.left, targetRect.left));

                return {
                    affordanceClass  : affordance?.className ?? null,
                    affordanceRect,
                    devicePixelRatio : globalThis.devicePixelRatio,
                    hostRect         : pick(host),
                    settled,
                    targetComponentId: target?.id ?? null,
                    targetNodeId     : affordance?.dataset.dockTarget ?? null,
                    targetRect,
                    windowRect       : {
                        height: globalThis.innerHeight,
                        width : globalThis.innerWidth,
                        x     : globalThis.screenX,
                        y     : globalThis.screenY
                    },
                    zoom: globalThis.visualViewport?.scale ?? 1
                }
            }, {...ids, edge});

            return frame.settled
        }, {
            message: `${route}/${theme}/${edge} must settle its exact-target renderer geometry`,
            timeout: 15000
        }).toBe(true);

        expect(frame.affordanceRect, `${route}/${theme}/${edge} must paint an affordance`).toBeTruthy();
        expect(preview.target.nodeId).toBe('left-tabs');

        const {settled, ...receipt} = frame;

        return {
            ...receipt,
            edge,
            placement   : preview.placement.kind,
            previewId   : preview.previewId,
            route,
            targetNodeId: preview.target.nodeId,
            theme
        }
    }

    /**
     * Retains one same-scale target crop as a Playwright artifact.
     * @param {import('@playwright/test').Page} page
     * @param {import('@playwright/test').TestInfo} testInfo
     * @param {Object} frame
     */
    async function attachFrame(page, testInfo, frame) {
        // The explicit engine profile carries `--disable-frame-rate-limit`, which can starve
        // headed Retina screenshots while DOM/worker truth keeps advancing. The presenting
        // default retains the pixel artifact; engine runs still emit the JSON geometry matrix.
        if (isEngineProfile()) return;

        const
            viewport = page.viewportSize() ?? await page.evaluate(() => ({
                height: globalThis.innerHeight,
                width : globalThis.innerWidth
            })),
            margin = 10,
            left   = Math.max(0, Math.floor(frame.targetRect.left - margin)),
            top    = Math.max(0, Math.floor(frame.targetRect.top - margin)),
            right  = Math.min(viewport.width, Math.ceil(frame.targetRect.right + margin)),
            bottom = Math.min(viewport.height, Math.ceil(frame.targetRect.bottom + margin)),
            body   = await page.screenshot({
                animations: 'disabled',
                clip      : {x: left, y: top, width: right - left, height: bottom - top}
            });

        await testInfo.attach(
            `${frame.route}-${frame.theme.replace('neo-theme-neo-', '')}-${frame.edge}.png`,
            {body, contentType: 'image/png'}
        )
    }

    /**
     * Enforces exact target reuse, edge containment, and four-way CSS/physical thickness equality.
     * @param {Object[]} frames
     */
    function assertSymmetry(frames) {
        expect(frames.map(frame => frame.edge)).toEqual(EDGES);

        const
            reference         = frames[0].targetRect,
            tolerance         = 1,
            cssThickness      = {},
            physicalThickness = {};

        frames.forEach(frame => {
            const
                target     = frame.targetRect,
                affordance = frame.affordanceRect;

            for (const key of ['left', 'top', 'width', 'height']) {
                expect(Math.abs(target[key] - reference[key]),
                    `${frame.route}/${frame.theme} must reuse one settled target rect (${key})`)
                    .toBeLessThanOrEqual(tolerance)
            }

            if (frame.edge === 'top' || frame.edge === 'bottom') {
                cssThickness[frame.edge] = affordance.height;
                expect(Math.abs(affordance.left - target.left)).toBeLessThanOrEqual(tolerance);
                expect(Math.abs(affordance.width - target.width)).toBeLessThanOrEqual(tolerance)
            } else {
                cssThickness[frame.edge] = affordance.width;
                expect(Math.abs(affordance.top - target.top)).toBeLessThanOrEqual(tolerance);
                expect(Math.abs(affordance.height - target.height)).toBeLessThanOrEqual(tolerance)
            }

            if (frame.edge === 'top') {
                expect(Math.abs(affordance.top - target.top)).toBeLessThanOrEqual(tolerance)
            } else if (frame.edge === 'right') {
                expect(Math.abs(affordance.right - target.right)).toBeLessThanOrEqual(tolerance)
            } else if (frame.edge === 'bottom') {
                expect(Math.abs(affordance.bottom - target.bottom)).toBeLessThanOrEqual(tolerance)
            } else {
                expect(Math.abs(affordance.left - target.left)).toBeLessThanOrEqual(tolerance)
            }

            physicalThickness[frame.edge] = cssThickness[frame.edge] * frame.devicePixelRatio
        });

        const
            cssValues      = Object.values(cssThickness),
            physicalValues = Object.values(physicalThickness);

        expect(Math.max(...cssValues) - Math.min(...cssValues),
            `four-axis CSS thicknesses: ${JSON.stringify(cssThickness)}`).toBeLessThanOrEqual(1);
        expect(Math.max(...physicalValues) - Math.min(...physicalValues),
            `four-axis rendered thicknesses: ${JSON.stringify(physicalThickness)}`)
            .toBeLessThanOrEqual(frames[0].devicePixelRatio)
    }

    /**
     * Collects one theme's physical in-window four-axis matrix.
     * @param {Object} data
     * @returns {Promise<Object[]>}
     */
    async function collectInWindow({app, ids, page, testInfo, theme, wsId}) {
        await setTheme(app, page, wsId, theme);

        const
            targetRect = await readTargetRect(page, ids.targetId),
            points     = edgePoints(targetRect),
            frames     = [];

        await beginAuditDrag(page);

        try {
            for (const edge of EDGES) {
                const point = points[edge];

                await page.mouse.move(point.x, point.y, {steps: 14});
                await page.mouse.move(point.x + 1, point.y, {steps: 1});
                await page.mouse.move(point.x, point.y, {steps: 1});

                const preview = await waitForMainPreview(app, ids.previewId, edge);

                await expect(page.locator(`#${ids.previewId} .neo-dock-preview-affordance`)).toBeVisible();

                const frame = await readFrame(page, ids, 'in-window', theme, edge, preview);

                frames.push(frame);
                await attachFrame(page, testInfo, frame)
            }
        } finally {
            await cancelPhysicalDrag(page)
        }

        assertSymmetry(frames);

        return frames
    }

    /**
     * Resolves the registered main-workspace remote target.
     * @param {Object} app
     * @returns {Promise<String>}
     */
    async function resolveMainRemoteTargetId(app) {
        let
            prior    = null,
            targetId = null;

        await expect.poll(async () => {
            const targets = await app.findInstances(
                {className: 'Neo.dashboard.dock.window.DragTarget'},
                ['id', 'stableTargetId']
            );

            targetId = (targets || [])
                .map(properties)
                .find(target => target?.stableTargetId === 'workstation-main')?.id ?? null;

            const settled = targetId && targetId === prior ? targetId : null;

            prior = targetId;

            return settled
        }, {
            message: 'the main workspace must retain one registered CrossWindowDragTarget generation',
            timeout: 15000
        }).toBeTruthy();

        return targetId
    }

    /**
     * Collects one theme's popup→main four-axis matrix through the registered remote target.
     * @param {Object} data
     * @returns {Promise<Object[]>}
     */
    async function collectCrossWindow({
        app,
        ids,
        page,
        sourceMeta,
        testInfo,
        theme,
        wsId
    }) {
        await setTheme(app, page, wsId, theme);

        const
            remoteTargetId = await resolveMainRemoteTargetId(app),
            targetRect     = await readTargetRect(page, ids.targetId),
            points         = edgePoints(targetRect),
            frames         = [];

        try {
            for (const edge of EDGES) {
                const
                    point   = points[edge],
                    payload = {
                        draggedItem: {
                            dockItemId           : 'activity',
                            dockSourceWorkspaceId: 'workstation-vessel:activity'
                        },
                        localX      : point.x,
                        localY      : point.y,
                        sourceNodeId: 'workstation-vessel-tabs:activity'
                    };

                expect(await app.callMethod(remoteTargetId, 'acceptsRemoteDrag', [point.x, point.y]),
                    `${edge} must remain inside the manager.Window target`).toBe(true);

                let preview;

                await expect.poll(async () => {
                    preview = await app.callMethod(remoteTargetId, 'onRemoteDragMove', [payload]);

                    return preview
                        ? `${preview.target?.nodeId}:${preview.placement?.kind}`
                        : 'none'
                }, {
                    message: `popup→main must publish left-tabs:edge-${edge}`,
                    timeout: 15000
                }).toBe(`left-tabs:edge-${edge}`);

                await expect(page.locator(`#${ids.previewId} .neo-dock-preview-affordance`)).toBeVisible();

                const frame = {
                    ...await readFrame(page, ids, 'popup-to-main', theme, edge, preview),
                    sourceWindow: sourceMeta
                };

                frames.push(frame);
                await attachFrame(page, testInfo, frame)
            }
        } finally {
            await app.callMethod(remoteTargetId, 'onRemoteDragLeave')
        }

        assertSymmetry(frames);

        return frames
    }

    test('one exact target stays symmetric across four edges, two routes, and both themes', async ({
        page,
        neuralLink
    }, testInfo) => {
        const
            {app, hostId, previewId, targetId, wsId} = await boot(page, neuralLink),
            ids                                      = {hostId, previewId, targetId},
            matrix                                   = {inWindow: {}, popupToMain: {}};
        let popup = null;

        try {
            for (const theme of THEMES) {
                matrix.inWindow[theme] = await collectInWindow({
                    app,
                    ids,
                    page,
                    testInfo,
                    theme,
                    wsId
                })
            }

            await setTheme(app, page, wsId, THEMES[0]);

            const
                popupPromise  = page.waitForEvent('popup', {timeout: 90000}),
                tearOutResult = await app.callMethod(wsId, 'executeTearOutStep', [
                    {itemId: 'activity', sourceNodeId: 'left-tabs'},
                    {birthAttempts: 240, moveDelay: 16, moveSteps: 5}
                ]);

            popup = await popupPromise;
            await popup.waitForLoadState('domcontentloaded');

            expect(tearOutResult.errors).toEqual([]);
            expect(tearOutResult.applied, 'Activity must be owned by one real popup source').toBe(true);
            await expect(popup.locator('.workstation-viewport')).toBeVisible();
            await page.waitForTimeout(900);

            const
                sourceMeta = await popup.evaluate(() => ({
                    devicePixelRatio: globalThis.devicePixelRatio,
                    height          : globalThis.innerHeight,
                    width           : globalThis.innerWidth,
                    x               : globalThis.screenX,
                    y               : globalThis.screenY,
                    zoom            : globalThis.visualViewport?.scale ?? 1
                }));

            for (const theme of THEMES) {
                matrix.popupToMain[theme] = await collectCrossWindow({
                    app,
                    ids,
                    page,
                    sourceMeta,
                    testInfo,
                    theme,
                    wsId
                })
            }

            await testInfo.attach('dock-preview-symmetry-matrix.json', {
                body       : Buffer.from(JSON.stringify(matrix, null, 2)),
                contentType: 'application/json'
            })
        } finally {
            popup && !popup.isClosed() && await popup.close()
        }
    })
});
