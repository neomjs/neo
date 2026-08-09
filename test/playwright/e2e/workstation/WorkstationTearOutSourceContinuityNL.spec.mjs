import {test, expect}      from '../../fixtures.mjs';
import {placeNativeWindow} from '../utils/filmStage.mjs';

/**
 * @summary Reads the browser, emulation, and app-root geometry as distinct film-stage surfaces.
 * @param {import('@playwright/test').Page} page Browser page.
 * @returns {Promise<Object>} Browser and root geometry.
 */
async function readBrowserSurface(page) {
    const
        emulatedViewport = page.viewportSize(),
        browser          = await page.evaluate(() => {
            const
                root     = document.querySelector('body > .neo-viewport'),
                rootRect = root?.getBoundingClientRect(),
                pickRect = rect => rect && ({
                    bottom: rect.bottom,
                    height: rect.height,
                    left  : rect.left,
                    right : rect.right,
                    top   : rect.top,
                    width : rect.width,
                    x     : rect.x,
                    y     : rect.y
                });

            return {
                devicePixelRatio: globalThis.devicePixelRatio,
                inner           : {
                    height: globalThis.innerHeight,
                    width : globalThis.innerWidth,
                    x     : globalThis.screenX,
                    y     : globalThis.screenY
                },
                outer: {
                    height: globalThis.outerHeight,
                    width : globalThis.outerWidth
                },
                root: pickRect(rootRect)
            }
        });

    return {...browser, emulatedViewport}
}

/**
 * @summary Pins the headed page through Take 18's own CDP staging and geometry publication path.
 * @param {import('@playwright/test').Page} page Browser page.
 * @returns {Promise<Object>} Verified native bounds and observed geometry.
 */
async function pinToCaptureDisplay(page) {
    const session    = await page.context().newCDPSession(page),
          {windowId} = await session.send('Browser.getWindowForTarget'),
          current    = (await session.send('Browser.getWindowBounds', {windowId})).bounds,
          before     = await readBrowserSurface(page),
          raw        = process.env.NEO_FILM_DISPLAY_BOUNDS,
          parsed     = raw?.split(',').map(Number),
          valid      = parsed?.length === 4 && parsed.every(Number.isFinite),
          target     = valid
              ? {left: parsed[0], top: parsed[1], width: parsed[2], height: parsed[3]}
              : {left: current.left, top: current.top, width: current.width, height: current.height},
          {bounds}   = await session.send('Browser.setWindowBounds', {
              bounds: {...target, windowState: 'normal'}, windowId
          }).then(() => session.send('Browser.getWindowBounds', {windowId}));

    expect(before.emulatedViewport).toBeNull();

    let after;

    await expect.poll(async () => {
        after = await readBrowserSurface(page);

        return {
            positioned: Math.max(
                Math.abs(after.inner.x - bounds.left),
                Math.abs(after.inner.y - bounds.top)
            ) <= 80,
            sized: Math.max(
                Math.abs(after.outer.width  - bounds.width),
                Math.abs(after.outer.height - bounds.height)
            ) <= 2
        }
    }, {
        timeout  : 5000,
        intervals: [25, 50, 100]
    }).toEqual({positioned: true, sized: true});

    await expect.poll(() => page.evaluate(() =>
        Boolean(globalThis.Neo?.main?.addon?.WindowPosition?.publishGeometry)
    ), {
        timeout  : 5000,
        intervals: [25, 50, 100]
    }).toBe(true);

    const neoWindowId = await page.evaluate(() => {
        globalThis.Neo.main.addon.WindowPosition.publishGeometry();

        return globalThis.Neo.worker.Manager.windowId
    });

    return {after, before, bounds, neoWindowId}
}

const filmPace = {
    birthAttempts: 240,
    curve        : 0.18,
    dwellDelay   : 700,
    moveDelay    : 33,
    moveSteps    : 24,
    showCursor   : true
}, plainPace = {
    birthAttempts: 180,
    curve        : 0,
    dwellDelay   : 600,
    moveDelay    : 16,
    moveSteps    : 4,
    showCursor   : false
};

const restoreTargets = Object.freeze([
    {header: 'Queues',                     key: 'queues',  paneClass: 'workstation-pane-queues'},
    {header: 'Priority Alert Observatory', key: 'alerts',  paneClass: 'workstation-pane-alerts'},
    {header: 'Audit',                      key: 'audit',   paneClass: 'workstation-pane-audit'},
    {header: 'Commits',                    key: 'commits', paneClass: 'workstation-pane-commits'}
]);

/**
 * @summary Reads an instance id from the lean Neural Link query shapes.
 * @param {Object|Object[]} result Query result.
 * @returns {String|null} Component id.
 */
function readId(result) {
    return result?.properties?.id ?? result?.id ?? (Array.isArray(result) ? readId(result[0]) : null)
}

/**
 * @summary Resolves the four bystander panes and proves config/vdom/vnode identity convergence.
 * @param {Object} app Connected Neural Link application fixture.
 * @returns {Promise<Object[]>} Stable identity records keyed to the resident panes.
 */
async function readResidentIdentities(app) {
    return Promise.all(restoreTargets.map(async target => {
        const
            queried = await app.queryComponent({'header.text': target.header}, ['id']),
            matches = Array.isArray(queried) ? queried : queried ? [queried] : [];

        expect(matches, `${target.key}: header query must resolve exactly one pane`).toHaveLength(1);

        const
            componentId = readId(matches[0]),
            properties  = await app.getComponent(componentId, [
                'id', 'mounted', 'vdom.id', 'vnode.id'
            ]);

        expect(componentId, `${target.key}: pane id must be observable`).toBeTruthy();
        expect(properties.mounted, `${target.key}: pane must be mounted`).toBe(true);
        expect(properties.id, `${target.key}: config identity must match the query`).toBe(componentId);
        expect(properties['vdom.id'], `${target.key}: vdom identity must match config`).toBe(componentId);
        expect(properties['vnode.id'], `${target.key}: vnode identity must match config`).toBe(componentId);

        return {
            ...target,
            componentId,
            vdomId : properties['vdom.id'],
            vnodeId: properties['vnode.id']
        }
    }))
}

/**
 * @summary Arms a per-rAF card oracle with live DOM identity, geometry, and declared presentation.
 * @param {import('@playwright/test').Page} page Browser page.
 * @param {Object[]} identities Stable identities from readResidentIdentities().
 * @returns {Promise<void>}
 */
async function armRestoreSampler(page, identities) {
    await page.evaluate(targets => {
        const
            partNames = ['kicker', 'icon', 'metric', 'title', 'footer', 'wave'],
            selectors = Object.fromEntries(partNames.map(name =>
                [name, `.workstation-resident-${name}`])),
            declaredTiers = new Map([
                ['kicker|icon|metric|title|footer|wave', 'full'],
                ['kicker|icon|metric|title|footer',      'no-wave'],
                ['kicker|icon|metric|title',             'no-trim'],
                ['kicker|metric|title',                  'no-icon'],
                ['kicker|metric',                        'compact-copy'],
                ['metric',                               'metric-only'],
                ['',                                     'shell']
            ]),
            baseline = Object.fromEntries(targets.map(target => {
                const
                    pane = document.getElementById(target.componentId),
                    card = pane?.querySelector('.workstation-resident-card');

                return [target.key, {card, pane}]
            })),
            state = globalThis.__emmy16756RestoreProbe = {
                capped : false,
                records: [],
                station: 'roomy-start',
                stopped: false
            };

        const rectOf = element => {
            if (!element) return null;

            const {bottom, height, left, right, top, width, x, y} = element.getBoundingClientRect();

            return {bottom, height, left, right, top, width, x, y}
        };

        const intersection = (a, b) => {
            const
                left   = Math.max(a.left, b.left),
                right  = Math.min(a.right, b.right),
                top    = Math.max(a.top, b.top),
                bottom = Math.min(a.bottom, b.bottom);

            return {
                bottom,
                height: Math.max(0, bottom - top),
                left,
                right,
                top,
                width : Math.max(0, right - left)
            }
        };

        const readElement = element => {
            if (!element) return {connected: false, exists: false, presented: false};

            const
                style = getComputedStyle(element),
                rect  = rectOf(element);
            let clipped = intersection(rect, {
                bottom: innerHeight,
                left  : 0,
                right : innerWidth,
                top   : 0
            });

            for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
                const ancestorStyle = getComputedStyle(ancestor);

                if (ancestorStyle.overflowX !== 'visible' || ancestorStyle.overflowY !== 'visible') {
                    clipped = intersection(clipped, rectOf(ancestor))
                }
            }

            const connected = element.isConnected;

            return {
                clipped,
                connected,
                display  : style.display,
                exists   : true,
                opacity  : style.opacity,
                presented: connected && clipped.width > 0.5 && clipped.height > 0.5
                    && style.display !== 'none'
                    && style.visibility !== 'hidden'
                    && Number.parseFloat(style.opacity || '1') > 0,
                rect,
                visibility: style.visibility
            }
        };

        const sample = timestamp => {
            if (state.stopped) return;

            state.records.push({
                cards: Object.fromEntries(targets.map(target => {
                    const
                        pane  = document.getElementById(target.componentId),
                        card  = pane?.querySelector('.workstation-resident-card'),
                        parts = Object.fromEntries(partNames.map(name =>
                            [name, readElement(card?.querySelector(selectors[name]))])),
                        declared = partNames.filter(name => parts[name].exists
                            && parts[name].display !== 'none'),
                        presented = partNames.filter(name => parts[name].presented),
                        base     = baseline[target.key];

                    return [target.key, {
                        card             : readElement(card),
                        cardSameNode     : card === base.card,
                        children         : parts,
                        declaredChildren : declared,
                        domId            : pane?.id ?? null,
                        pane             : readElement(pane),
                        paneClass        : target.paneClass,
                        paneSameNode     : pane === base.pane,
                        presentedChildren: presented,
                        tier             : declaredTiers.get(declared.join('|')) ?? null
                    }]
                })),
                frame   : state.records.length,
                station : state.station,
                timestamp,
                viewport: {
                    inner : {height: innerHeight, width: innerWidth},
                    outer : {height: outerHeight, width: outerWidth},
                    screen: {x: screenX, y: screenY}
                }
            });

            if (state.records.length < 2400) {
                state.raf = requestAnimationFrame(sample)
            } else {
                state.capped = true
            }
        };

        state.raf = requestAnimationFrame(sample)
    }, identities)
}

/**
 * @summary Labels subsequent sampler frames with the place-cycle phase that owns them.
 * @param {import('@playwright/test').Page} page Browser page.
 * @param {String} station Phase label.
 * @returns {Promise<void>}
 */
async function setRestoreStation(page, station) {
    await page.evaluate(value => {
        globalThis.__emmy16756RestoreProbe.station = value
    }, station)
}

/**
 * @summary Waits a bounded number of presented frames without encoding wall-clock animation speed.
 * @param {import('@playwright/test').Page} page Browser page.
 * @param {Number} count Presented-frame count.
 * @returns {Promise<void>}
 */
async function waitPresentedFrames(page, count = 8) {
    await page.evaluate(frameCount => new Promise(resolve => {
        let remaining = frameCount;

        const next = () => --remaining > 0 ? requestAnimationFrame(next) : resolve();

        requestAnimationFrame(next)
    }), count)
}

/**
 * @summary Keeps the per-rAF sampler live across a presented-time evidence band.
 * @param {import('@playwright/test').Page} page Browser page.
 * @param {Number} durationMs Minimum performance-timeline duration.
 * @returns {Promise<void>}
 */
async function waitPresentedDuration(page, durationMs) {
    await page.evaluate(duration => new Promise(resolve => {
        const startedAt = performance.now();

        const next = timestamp => timestamp - startedAt >= duration
            ? resolve()
            : requestAnimationFrame(next);

        requestAnimationFrame(next)
    }), durationMs)
}

/**
 * @summary Stops the restore sampler after the final presented-frame boundary.
 * @param {import('@playwright/test').Page} page Browser page.
 * @returns {Promise<Object>} Every recorded rAF plus the sampler-cap fact.
 */
async function stopRestoreSampler(page) {
    await waitPresentedFrames(page, 3);

    return page.evaluate(() => {
        const state = globalThis.__emmy16756RestoreProbe;

        state.stopped = true;
        cancelAnimationFrame(state.raf);

        return {capped: state.capped, records: state.records}
    })
}

test.use({video: 'on', viewport: null});

test.describe('#16498 tear-out source continuity', () => {
    test.setTimeout(180000);

    /**
     * @summary Samples the Audit pane's raw resident-card descendants once per presented frame.
     * @param {import('@playwright/test').Page} page Browser page.
     * @returns {Promise<void>}
     */
    async function armAuditSampler(page) {
        await page.evaluate(() => {
            const
                sourceTab     = document.querySelector('.workstation-pane-metrics')?.closest('.neo-tab-container'),
                sourceBody    = sourceTab?.querySelector('.neo-tab-body-container'),
                sourceToolbar = sourceTab?.querySelector('.neo-tab-header-toolbar'),
                state         = globalThis.__emmy16498Probe = {
                    records: [],
                    stopped: false
                };

            const rectOf = element => {
                if (!element) return null;

                const {bottom, height, left, right, top, width, x, y} = element.getBoundingClientRect();

                return {bottom, height, left, right, top, width, x, y}
            };

            const intersection = (a, b) => {
                const
                    left   = Math.max(a.left, b.left),
                    right  = Math.min(a.right, b.right),
                    top    = Math.max(a.top, b.top),
                    bottom = Math.min(a.bottom, b.bottom);

                return {
                    bottom,
                    height: Math.max(0, bottom - top),
                    left,
                    right,
                    top,
                    width : Math.max(0, right - left)
                }
            };

            const readElement = element => {
                if (!element) return {exists: false};

                const
                    style = getComputedStyle(element),
                    rect  = rectOf(element);
                let clipped = intersection(rect, {
                    bottom: innerHeight,
                    left  : 0,
                    right : innerWidth,
                    top   : 0
                });

                for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
                    const ancestorStyle = getComputedStyle(ancestor);

                    if (ancestorStyle.overflowX !== 'visible' || ancestorStyle.overflowY !== 'visible') {
                        clipped = intersection(clipped, rectOf(ancestor))
                    }
                }

                const
                    presented = clipped.width > 0.5 && clipped.height > 0.5
                        && style.display !== 'none'
                        && style.visibility !== 'hidden'
                        && Number.parseFloat(style.opacity || '1') > 0,
                    point = presented ? {
                        x: Math.min(innerWidth - 1, Math.max(0, clipped.left + clipped.width / 2)),
                        y: Math.min(innerHeight - 1, Math.max(0, clipped.top + clipped.height / 2))
                    } : null,
                    stack = point ? document.elementsFromPoint(point.x, point.y) : [],
                    hit   = Boolean(point && stack.some(candidate =>
                        candidate === element || element.contains(candidate)
                    ));

                return {
                    clipped,
                    display  : style.display,
                    exists   : true,
                    hit,
                    opacity  : style.opacity,
                    overflowX: style.overflowX,
                    overflowY: style.overflowY,
                    presented,
                    rect,
                    role     : element.getAttribute('role'),
                    stack    : stack.slice(0, 5).map(candidate => ({
                        cls: candidate.className || null,
                        id : candidate.id || null,
                        tag: candidate.tagName
                    })),
                    text      : element.textContent?.trim() || '',
                    visibility: style.visibility
                }
            };

            const sample = timestamp => {
                if (state.stopped) return;

                const
                    pane        = document.querySelector('.workstation-pane-audit'),
                    card        = pane?.querySelector('.workstation-resident-card'),
                    metricsPane = document.querySelector('.workstation-pane-metrics'),
                    metricsCard = metricsPane?.querySelector('.workstation-resident-card'),
                    tab         = pane?.closest('.neo-tab-container'),
                    auditButton = [...(sourceToolbar?.querySelectorAll('.neo-tab-header-button') || [])]
                        .find(button => button.textContent?.includes('Audit')),
                    placeholder = sourceBody?.querySelector('.neo-dashboard-dock-vessel-placeholder'),
                    resident    = sourceBody?.querySelector('.workstation-resident-card'),
                    auditRect   = auditButton && rectOf(auditButton),
                    toolbarRect = sourceToolbar && rectOf(sourceToolbar),
                    toolbarTolerance = 1.5,
                    overlap     = auditRect && metricsCard?.isConnected
                        ? intersection(auditRect, rectOf(metricsCard))
                        : null,
                    residentPresentation    = readElement(resident),
                    placeholderPresentation = readElement(placeholder),
                    presentationCount       = Number(Boolean(residentPresentation.presented)) + Number(Boolean(
                        placeholderPresentation.presented
                        && placeholderPresentation.role === 'status'
                        && placeholderPresentation.text.includes('Moving pane to another window…')
                    ));

                state.records.push({
                    audit: {
                        card  : readElement(card),
                        footer: readElement(card?.querySelector('.workstation-resident-footer')),
                        icon  : readElement(card?.querySelector('.workstation-resident-icon')),
                        kicker: readElement(card?.querySelector('.workstation-resident-kicker')),
                        metric: readElement(card?.querySelector('.workstation-resident-metric')),
                        pane  : readElement(pane),
                        title : readElement(card?.querySelector('.workstation-resident-title')),
                        wave  : readElement(card?.querySelector('.workstation-resident-wave'))
                    },
                    metrics: {
                        card: readElement(metricsCard),
                        pane: readElement(metricsPane)
                    },
                    source: {
                        auditButton       : readElement(auditButton),
                        auditInsideToolbar: Boolean(
                            auditRect && toolbarRect &&
                            auditRect.left >= toolbarRect.left - toolbarTolerance &&
                            auditRect.right <= toolbarRect.right + toolbarTolerance &&
                            auditRect.top >= toolbarRect.top - toolbarTolerance &&
                            auditRect.bottom <= toolbarRect.bottom + toolbarTolerance
                        ),
                        auditMetricsOverlapArea: overlap ? overlap.width * overlap.height : 0,
                        body                   : readElement(sourceBody),
                        connected              : Boolean(sourceTab?.isConnected),
                        placeholder            : placeholderPresentation,
                        presentationCount,
                        resident               : residentPresentation,
                        toolbar                : readElement(sourceToolbar)
                    },
                    tab     : readElement(tab),
                    timestamp,
                    viewport: {height: innerHeight, width: innerWidth}
                });

                state.records.length < 1800 && requestAnimationFrame(sample)
            };

            requestAnimationFrame(sample)
        })
    }

    /**
     * @summary Runs one real-pointer source-continuity witness at the supplied gesture pace.
     * @param {Object} fixtures Playwright fixtures.
     * @param {import('@playwright/test').Page} fixtures.page Browser page.
     * @param {Object} fixtures.neuralLink Neural Link fixture.
     * @param {import('@playwright/test').TestInfo} testInfo Playwright test metadata.
     * @param {Object} profile Witness profile.
     * @param {Object} profile.pace App-owned gesture pacing.
     * @param {String} profile.name Attachment-safe profile name.
     * @returns {Promise<void>}
     */
    async function runContinuityWitness({page, neuralLink}, testInfo, {name, pace}) {
        const pageErrors = [];

        page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-tour-play',    {timeout: 30000});
        await page.waitForSelector('.neo-tab-overflow-control', {timeout: 30000});
        await page.bringToFront();

        const stageReceipt = await pinToCaptureDisplay(page),
              app          = await neuralLink.connectToApp('Workstation'),
              found        = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
              workspaces   = Array.isArray(found) ? found : found ? [found] : [],
              wsId         = workspaces[0]?.id;

        expect(stageReceipt.after.inner.width).toBeGreaterThan(0);
        expect(stageReceipt.after.inner.height).toBeGreaterThan(0);
        expect(workspaces).toHaveLength(1);
        expect(wsId).toBeTruthy();

        await armAuditSampler(page);

        const popupPromise = page.waitForEvent('popup', {timeout: 90000}),
              ownerResult  = await app.callMethod(wsId, 'executeTearOutStep', [
                  {itemId: 'metrics', sourceNodeId: 'right-top-tabs'},
                  pace
              ]);

        await popupPromise;
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

        const records = await page.evaluate(() => {
            globalThis.__emmy16498Probe.stopped = true;

            return globalThis.__emmy16498Probe.records
        });

        const
            partialFrames = records.filter(record =>
                record.audit.kicker.presented
                && (!record.audit.metric.presented || !record.audit.title.presented)
            ),
            occludedFrames = records.filter(record =>
                record.audit.kicker.presented
                && (!record.audit.metric.hit || !record.audit.title.hit)
            ),
            sourceVoidFrames = records.filter(record =>
                record.source.connected && record.source.body.presented && record.source.presentationCount === 0
            ),
            misplacedTabFrames = records.filter(record =>
                record.source.auditButton.presented && !record.source.auditInsideToolbar
            ),
            compact = record => ({
                audit: Object.fromEntries(Object.entries(record.audit).map(([key, value]) => [key, {
                    clipped  : value.clipped,
                    exists   : value.exists,
                    hit      : value.hit,
                    presented: value.presented,
                    rect     : value.rect,
                    stack    : value.stack
                }])),
                metrics  : record.metrics,
                source   : record.source,
                tab      : record.tab,
                timestamp: record.timestamp,
                viewport : record.viewport
            }),
            receipt = {
                firstOccluded         : occludedFrames[0] ? compact(occludedFrames[0]) : null,
                firstPartial          : partialFrames[0] ? compact(partialFrames[0]) : null,
                firstMisplacedTab     : misplacedTabFrames[0] ? compact(misplacedTabFrames[0]) : null,
                firstSourceVoid       : sourceVoidFrames[0] ? compact(sourceVoidFrames[0]) : null,
                maxAuditPaneHeight    : Math.max(...records.map(record => record.audit.pane.rect?.height ?? 0)),
                minAuditPaneHeight    : Math.min(...records.map(record => record.audit.pane.rect?.height ?? Infinity)),
                misplacedTabFrameCount: misplacedTabFrames.length,
                occludedFrameCount    : occludedFrames.length,
                operation             : ownerResult,
                pageErrors,
                partialFrameCount     : partialFrames.length,
                profile               : name,
                recordCount           : records.length,
                sourceVoidFrameCount  : sourceVoidFrames.length,
                stageReceipt,
                viewportSet           : [...new Set(records.map(record =>
                    `${record.viewport.width}x${record.viewport.height}`
                ))]
            };

        console.log('[#16498-probe]', JSON.stringify(receipt));
        await testInfo.attach(`16498-${name}-frame-probe.json`, {
            body       : Buffer.from(JSON.stringify({receipt, records}, null, 2)),
            contentType: 'application/json'
        });

        expect(ownerResult.errors).toEqual([]);
        expect(ownerResult.applied).toBe(true);
        expect(pageErrors).toEqual([]);
        expect(misplacedTabFrames, 'the Audit tab must remain inside its source toolbar on every presented frame')
            .toEqual([]);
        expect(sourceVoidFrames, 'the source body must retain resident content or an explicit transition state')
            .toEqual([])
    }

    test('#16756 no-drag native place-cycle preserves resident-card composition and identity',
        async ({page, neuralLink}, testInfo) => {
            const pageErrors = [];

            page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));
            await page.goto('/apps/workstation/index.html');
            await page.waitForSelector('.workstation-tour-play', {timeout: 30000});
            await page.waitForSelector('.workstation-resident-card', {timeout: 30000});
            await page.bringToFront();

            const
                seed   = await pinToCaptureDisplay(page),
                screen = await page.evaluate(() => ({
                    availHeight: globalThis.screen.availHeight,
                    availWidth : globalThis.screen.availWidth
                })),
                roomyBounds = {
                    height: 1040,
                    left  : seed.bounds.left,
                    top   : seed.bounds.top,
                    width : 1200
                },
                compactBounds = {...roomyBounds, height: 760, width: 1000};

            // This is an exact native-window witness, not a viewport-emulation approximation. A
            // smaller virtual display cannot answer the question and must fail at the precondition.
            expect(screen.availWidth, 'the #16756 stage requires a 1200px-wide native display')
                .toBeGreaterThanOrEqual(roomyBounds.width);
            expect(screen.availHeight, 'the #16756 stage requires a 1040px-tall native display')
                .toBeGreaterThanOrEqual(roomyBounds.height);

            const roomyStart = await placeNativeWindow(page, roomyBounds);

            expect(roomyStart.bounds.width, 'the first station must be exact 1200x1040 outer geometry')
                .toBe(roomyBounds.width);
            expect(roomyStart.bounds.height).toBe(roomyBounds.height);

            const auditButton = page.locator('.neo-tab-header-button').filter({hasText: 'Audit'}).first();

            await auditButton.click();
            await expect(page.locator('.workstation-pane-audit .workstation-resident-card'),
                'Audit must be the fourth visible bystander before the no-drag cycle').toBeVisible();
            await waitPresentedFrames(page, 6);

            const app = await neuralLink.connectToApp('Workstation');

            for (const target of restoreTargets) {
                await expect(page.locator(`.${target.paneClass} .workstation-resident-card`),
                    `${target.key}: target card must be visible at the roomy station`).toBeVisible()
            }

            const identitiesBefore = await readResidentIdentities(app);

            await armRestoreSampler(page, identitiesBefore);
            await waitPresentedFrames(page, 4);

            await setRestoreStation(page, 'contracting');
            const compact = await placeNativeWindow(page, compactBounds);

            expect(compact.bounds.width, 'the compact station must be exact 1000x760 outer geometry')
                .toBe(compactBounds.width);
            expect(compact.bounds.height).toBe(compactBounds.height);
            await setRestoreStation(page, 'compact-settle');
            await waitPresentedFrames(page, 10);

            const identitiesCompact = await readResidentIdentities(app);

            await setRestoreStation(page, 'restoring');
            const roomyRestored = await placeNativeWindow(page, roomyBounds);

            expect(roomyRestored.bounds.width, 'the restored station must return to exact 1200x1040 outer geometry')
                .toBe(roomyBounds.width);
            expect(roomyRestored.bounds.height).toBe(roomyBounds.height);
            await setRestoreStation(page, 'roomy-restored');
            const identitiesRestored = await readResidentIdentities(app);

            await waitPresentedDuration(page, 6200);

            const identitiesAfterBand = await readResidentIdentities(app);

            const
                sampler       = await stopRestoreSampler(page),
                records       = sampler.records,
                identityByKey = Object.fromEntries(identitiesBefore.map(identity =>
                    [identity.key, identity])),
                compositionDrift   = [],
                domIdentityDrift   = [],
                impossibleTiers    = [],
                roomyTierDrift     = [],
                settledContainment = [],
                undeclaredTiers    = [];

            for (const record of records) {
                for (const target of restoreTargets) {
                    const card = record.cards[target.key];

                    if (card.children.kicker.presented && !card.children.metric.presented) {
                        impossibleTiers.push({
                            declared : card.declaredChildren,
                            frame    : record.frame,
                            key      : target.key,
                            presented: card.presentedChildren,
                            station  : record.station,
                            viewport : record.viewport
                        })
                    }

                    if (card.tier === null) {
                        undeclaredTiers.push({
                            declared: card.declaredChildren,
                            frame   : record.frame,
                            key     : target.key,
                            station : record.station,
                            viewport: record.viewport
                        })
                    }

                    const
                        expectedPaneId  = identityByKey[target.key].componentId,
                        missingDeclared = card.declaredChildren
                            .filter(name => !card.presentedChildren.includes(name)),
                        missingDomChildren = Object.entries(card.children)
                            .filter(([, child]) => !child.exists || !child.connected)
                            .map(([name]) => name),
                        identityStable = card.card.exists
                            && card.card.connected
                            && card.cardSameNode
                            && card.domId === expectedPaneId
                            && card.pane.exists
                            && card.pane.connected
                            && card.paneSameNode
                            && missingDomChildren.length === 0;

                    if (!card.card.presented || missingDeclared.length) {
                        compositionDrift.push({
                            cardPresented: card.card.presented,
                            declared     : card.declaredChildren,
                            frame        : record.frame,
                            key          : target.key,
                            missingDeclared,
                            presented    : card.presentedChildren,
                            station      : record.station,
                            viewport     : record.viewport
                        })
                    }

                    if (!identityStable) {
                        domIdentityDrift.push({
                            cardSameNode: card.cardSameNode,
                            domId       : card.domId,
                            expectedPaneId,
                            frame       : record.frame,
                            key         : target.key,
                            missingDomChildren,
                            paneSameNode: card.paneSameNode,
                            station     : record.station
                        })
                    }
                }
            }

            const
                countByStation = Object.fromEntries([...new Set(records.map(record => record.station))]
                    .map(station => [station, records.filter(record => record.station === station).length])),
                stationNames = ['roomy-start', 'compact-settle', 'roomy-restored'],
                stationFrames = Object.fromEntries(stationNames.map(station => {
                    const matches = records.filter(record => record.station === station);

                    return [station, matches.at(-1) ?? null]
                })),
                restoredFrames = records.filter(record => record.station === 'roomy-restored'),
                restoredBandMs = restoredFrames.length > 1
                    ? restoredFrames.at(-1).timestamp - restoredFrames[0].timestamp
                    : 0;

            if (stationFrames['roomy-start']) {
                const baseline = stationFrames['roomy-start'];

                for (const record of restoredFrames) {
                    for (const target of restoreTargets) {
                        const
                            baselineCard     = baseline.cards[target.key],
                            restoredCard     = record.cards[target.key],
                            baselineHeight   = baselineCard.pane.rect?.height,
                            restoredHeight   = restoredCard.pane.rect?.height,
                            geometryRestored = Number.isFinite(baselineHeight)
                                && Number.isFinite(restoredHeight)
                                && Math.abs(restoredHeight - baselineHeight) <= 1;

                        if (geometryRestored
                            && restoredCard.declaredChildren.join('|')
                                !== baselineCard.declaredChildren.join('|')) {
                            roomyTierDrift.push({
                                baselineDeclared: baselineCard.declaredChildren,
                                declared        : restoredCard.declaredChildren,
                                frame           : record.frame,
                                key             : target.key,
                                paneHeight      : restoredHeight,
                                station         : record.station
                            })
                        }
                    }
                }
            }

            for (const [station, record] of Object.entries(stationFrames)) {
                if (!record) continue;

                for (const target of restoreTargets) {
                    const
                        card     = record.cards[target.key],
                        cardRect = card.card.rect,
                        paneRect = card.pane.rect,
                        reasons  = [];

                    if (!cardRect || !paneRect
                        || cardRect.top < paneRect.top - 0.5
                        || cardRect.bottom > paneRect.bottom + 0.5) {
                        reasons.push('card-outside-pane')
                    }

                    for (const name of card.declaredChildren) {
                        const child = card.children[name];

                        if (!child.rect || child.rect.height <= 0.5) {
                            reasons.push(`${name}-collapsed`)
                        } else if (!cardRect
                            || child.rect.top < cardRect.top - 0.5
                            || child.rect.bottom > cardRect.bottom + 0.5) {
                            reasons.push(`${name}-outside-card`)
                        }
                    }

                    if (reasons.length) {
                        settledContainment.push({
                            cardRect,
                            key: target.key,
                            paneRect,
                            reasons,
                            station
                        })
                    }
                }
            }

            const
                stationGeometry = Object.fromEntries(Object.entries(stationFrames).map(([station, record]) => [
                    station,
                    record && {
                        outer: record.viewport.outer,
                        panes: Object.fromEntries(restoreTargets.map(target => [target.key, {
                            cardHeight: record.cards[target.key].card.rect?.height ?? null,
                            paneHeight: record.cards[target.key].pane.rect?.height ?? null
                        }]))
                    }
                ])),
                identityCheckpoints = {
                    afterBand: identitiesAfterBand,
                    before   : identitiesBefore,
                    compact  : identitiesCompact,
                    restored : identitiesRestored
                },
                receipt = {
                    compositionDriftCount  : compositionDrift.length,
                    countByStation,
                    domIdentityDriftCount  : domIdentityDrift.length,
                    firstCompositionDrift  : compositionDrift[0] ?? null,
                    firstDomIdentityDrift  : domIdentityDrift[0] ?? null,
                    firstImpossibleTier    : impossibleTiers[0] ?? null,
                    firstRoomyTierDrift    : roomyTierDrift[0] ?? null,
                    firstSettledContainment: settledContainment[0] ?? null,
                    firstUndeclaredTier    : undeclaredTiers[0] ?? null,
                    identityCheckpoints,
                    impossibleTierCount    : impossibleTiers.length,
                    pageErrors,
                    placements             : {
                        compact      : compact.bounds,
                        roomyRestored: roomyRestored.bounds,
                        roomyStart   : roomyStart.bounds
                    },
                    recordCount            : records.length,
                    restoredBandMs,
                    roomyTierDriftCount    : roomyTierDrift.length,
                    samplerCapped          : sampler.capped,
                    scope                  : 'exact-current-head-place-cycle',
                    settledContainmentCount: settledContainment.length,
                    stationGeometry,
                    undeclaredTierCount    : undeclaredTiers.length
                };

            console.log('[#16756-restore-cycle]', JSON.stringify(receipt));
            await testInfo.attach('16756-restore-cycle-current-head.json', {
                body       : Buffer.from(JSON.stringify({receipt, records}, null, 2)),
                contentType: 'application/json'
            });

            expect(records.length, 'the place-cycle sampler must capture presented frames').toBeGreaterThan(0);
            expect(sampler.capped, 'the post-restore evidence band must not hit the silent rAF cap').toBe(false);
            expect(restoredBandMs, 'the post-restore sampler must stay live for at least six seconds')
                .toBeGreaterThanOrEqual(6000);
            expect(stationFrames['roomy-start'], 'the sampler must capture the initial 1200x1040 station')
                .toBeTruthy();
            expect(stationFrames['compact-settle'], 'the sampler must capture the settled 1000x760 station')
                .toBeTruthy();
            expect(stationFrames['roomy-restored'], 'the sampler must capture the restored 1200x1040 station')
                .toBeTruthy();

            expect(stationGeometry['roomy-start'].outer).toMatchObject({height: 1040, width: 1200});
            expect(stationGeometry['compact-settle'].outer).toMatchObject({height: 760, width: 1000});
            expect(stationGeometry['roomy-restored'].outer).toMatchObject({height: 1040, width: 1200});

            for (const target of restoreTargets) {
                const
                    roomyHeight    = stationGeometry['roomy-start'].panes[target.key].paneHeight,
                    compactHeight  = stationGeometry['compact-settle'].panes[target.key].paneHeight,
                    restoredHeight = stationGeometry['roomy-restored'].panes[target.key].paneHeight;

                expect(compactHeight, `${target.key}: compact pane geometry must contract`)
                    .toBeLessThan(roomyHeight);
                expect(Math.abs(restoredHeight - roomyHeight),
                    `${target.key}: restored pane geometry must return to baseline`).toBeLessThanOrEqual(1)
            }

            expect(identitiesCompact, 'config/vdom/vnode identity must survive the compact station')
                .toEqual(identitiesBefore);
            expect(identitiesRestored, 'config/vdom/vnode identity must survive native restoration')
                .toEqual(identitiesBefore);
            expect(identitiesAfterBand, 'config/vdom/vnode identity must survive the six-second recovery band')
                .toEqual(identitiesBefore);
            expect(pageErrors).toEqual([]);
            expect(settledContainment.slice(0, 5),
                'settled cards and declared children must stay inside their owning geometry')
                .toEqual([]);
            expect(domIdentityDrift.slice(0, 5),
                'live pane/card DOM identity and every resident child must survive each sampled frame')
                .toEqual([]);
            expect(undeclaredTiers.slice(0, 5), 'computed display must declare one known disclosure tier')
                .toEqual([]);
            expect(roomyTierDrift.slice(0, 5),
                'restored roomy geometry must declare the same resident children as baseline')
                .toEqual([]);
            expect(impossibleTiers.slice(0, 5), 'kicker-visible + metric-hidden is never a declared tier')
                .toEqual([]);
            expect(compositionDrift.slice(0, 5),
                'every declared child must remain presented through the place-cycle and recovery band')
                .toEqual([])
        });

    test('real pointer tear-out preserves source presentation and tab geometry at plain pace',
        ({page, neuralLink}, testInfo) => runContinuityWitness(
            {page, neuralLink}, testInfo, {name: 'plain', pace: plainPace}
        ));

    test('real pointer tear-out preserves source presentation and tab geometry at film pace',
        ({page, neuralLink}, testInfo) => runContinuityWitness(
            {page, neuralLink}, testInfo, {name: 'film', pace: filmPace}
        ))
});
