import {test, expect} from '../../fixtures.mjs';

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

    test('real pointer tear-out preserves source presentation and tab geometry at plain pace',
        ({page, neuralLink}, testInfo) => runContinuityWitness(
            {page, neuralLink}, testInfo, {name: 'plain', pace: plainPace}
        ));

    test('real pointer tear-out preserves source presentation and tab geometry at film pace',
        ({page, neuralLink}, testInfo) => runContinuityWitness(
            {page, neuralLink}, testInfo, {name: 'film', pace: filmPace}
        ))
});
