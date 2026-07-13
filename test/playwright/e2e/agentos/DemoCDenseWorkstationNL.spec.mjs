import {test, expect}    from '../../fixtures.mjs';
import {demoCTourScript} from '../../../../apps/agentos/tour/demoCDenseWorkstation.mjs';

/**
 * @summary Mounted L3 proof for Demo C's dense, living-data workstation.
 *
 * The unit floor owns the document/script contract. This journey drives the REAL tour button
 * and owns what only the App Worker + DOM + Canvas Worker composition can prove: one Provider,
 * two stable Store<Model> identities, an exact 100k renderer-rich grid, a sustained capped
 * feed, one owner-exact overflow surface, two real rails, frame-sampled midpoint continuity,
 * Canvas-worker pixel change, DevIndex-sized chart geometry, honest progress paints, both
 * themes, replacement-chrome motion containment, and identity preservation.
 *
 * Run: NEO_E2E_PORT=8124 npx playwright test agentos/DemoCDenseWorkstationNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */

const heavyTitles = [
    'Priority Alert Observatory',
    'Resident Activity Timeline',
    'Workspace Topology Inspector',
    'Runtime Health Envelope',
    'Distributed Trace Explorer',
    'Structured Log Console',
    'Command and Control Console',
    'Build Pipeline Monitor',
    'Deployment Flight Deck',
    'Security Signal Center',
    'Memory Core Telemetry',
    'Workspace Files'
];

const asArray = value => Array.isArray(value) ? value : value ? [value] : [];

/**
 * @param {Object} app Neural Link fixture app handle.
 * @param {String} workspaceId Demo C workspace id.
 * @returns {Promise<Object>} Identity-only snapshot (counts deliberately excluded).
 */
const readIdentity = async (app, workspaceId) => {
    const [providers, scalePanes, feedPanes, listedStores, workspace, securityPaneId] = await Promise.all([
        app.findInstances({className: 'Neo.state.Provider'}, ['id']),
        app.findInstances({className: 'AgentOS.childapps.dockdemo.view.DemoCScalePane'}, ['id', 'store.id']),
        app.findInstances({className: 'AgentOS.childapps.dockdemo.view.DemoCFeedPane'}, ['id', 'store.id']),
        app.listStores(),
        app.getComponent(workspaceId, ['stateProvider.id']),
        app.callMethod(workspaceId, 'getPaneIdentity', ['security'])
    ]),
        providerList = asArray(providers),
        scaleList    = asArray(scalePanes),
        feedList     = asArray(feedPanes),
        stores       = asArray(listedStores?.stores ?? listedStores),
        scaleStore   = stores.find(store => store.id?.endsWith('__scale')),
        feedStore    = stores.find(store => store.id?.endsWith('__feed'));

    return {
        feedPaneId         : feedList[0]?.id,
        feedStoreId        : feedStore?.id ?? feedList[0]?.properties?.['store.id'],
        providerCount      : providerList.length,
        providerId         : providerList[0]?.id,
        scalePaneId        : scaleList[0]?.id,
        scaleStoreId       : scaleStore?.id ?? scaleList[0]?.properties?.['store.id'],
        securityPaneId,
        workspaceProviderId: workspace['stateProvider.id']
    }
};

/**
 * Returns only mounted Sparkline components owned by the scale pane.
 * @param {Object} app Neural Link fixture app handle.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object[]>}
 */
const readScaleSparklines = async (app, page) => {
    const instances = asArray(await app.findInstances(
        {className: 'Neo.component.Sparkline'},
        ['id', 'mounted', 'offscreenRegistered', 'parentId', 'record.id', 'values']
    )),
        scaleIds = await page.evaluate(ids => ids.filter(id => {
            const element = document.getElementById(id),
                  rect    = element?.getBoundingClientRect();

            return Boolean(element?.closest('.agentos-dockdemo-scale-pane')
                && rect?.width > 0
                && rect?.height > 0)
        }), instances.map(instance => instance.id));

    return instances.filter(instance => scaleIds.includes(instance.id))
};

/**
 * Reads the first visible Sparkline's cell/content geometry from one data pane.
 * @param {import('@playwright/test').Page} page
 * @param {String} paneSelector
 * @returns {Promise<Object>}
 */
const readSparklineGeometry = (page, paneSelector) => page.evaluate(selector => {
    const
        wrapper = [...document.querySelectorAll(`${selector} .neo-sparkline-wrapper`)]
            .find(element => element.getClientRects().length > 0),
        canvas  = wrapper?.querySelector('.neo-sparkline-canvas'),
        cell    = wrapper?.closest('.neo-grid-cell'),
        row     = wrapper?.closest('.neo-grid-row');

    if (!wrapper || !canvas || !cell || !row) return null;

    const
        canvasRect  = canvas.getBoundingClientRect(),
        cellRect    = cell.getBoundingClientRect(),
        rowRect     = row.getBoundingClientRect(),
        style       = getComputedStyle(cell),
        wrapperRect = wrapper.getBoundingClientRect(),
        number      = property => Number.parseFloat(style[property]) || 0,
        contentBox  = {
            bottom: cellRect.bottom - number('borderBottomWidth') - number('paddingBottom'),
            height: cellRect.height
                - number('borderTopWidth') - number('borderBottomWidth')
                - number('paddingTop') - number('paddingBottom'),
            left : cellRect.left + number('borderLeftWidth') + number('paddingLeft'),
            top  : cellRect.top + number('borderTopWidth') + number('paddingTop'),
            width: cellRect.width
                - number('borderLeftWidth') - number('borderRightWidth')
                - number('paddingLeft') - number('paddingRight')
        };

    return {
        canvas : {bottom: canvasRect.bottom, height: canvasRect.height, left: canvasRect.left, top: canvasRect.top, width: canvasRect.width},
        cell   : {height: cellRect.height, width: cellRect.width},
        content: contentBox,
        row    : {height: rowRect.height},
        wrapper: {bottom: wrapperRect.bottom, height: wrapperRect.height, left: wrapperRect.left, top: wrapperRect.top, width: wrapperRect.width}
    }
}, paneSelector);

/**
 * @param {Object} geometry
 */
const expectDevIndexSparklineFit = geometry => {
    expect(geometry).toBeTruthy();
    expect(Math.abs(geometry.cell.width - 160), 'Sparkline keeps the DevIndex-sized column').toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.row.height - 50), 'Sparkline keeps the DevIndex row height').toBeLessThanOrEqual(1);
    expect(
        Math.abs(geometry.wrapper.width - geometry.content.width),
        `Sparkline wrapper fills the cell content box: ${JSON.stringify(geometry)}`
    ).toBeLessThanOrEqual(1);
    expect(
        Math.abs(geometry.wrapper.height - geometry.content.height),
        `Sparkline wrapper fills the row content box: ${JSON.stringify(geometry)}`
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.canvas.width - geometry.wrapper.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.canvas.height - geometry.wrapper.height)).toBeLessThanOrEqual(1);
    expect(geometry.canvas.left).toBeGreaterThanOrEqual(geometry.content.left - 1);
    expect(geometry.canvas.top).toBeGreaterThanOrEqual(geometry.content.top - 1);
    expect(geometry.canvas.bottom).toBeLessThanOrEqual(geometry.content.bottom + 1)
};

test.describe('AgentOS Demo C — dense workstation composition', () => {
    test.setTimeout(150000);
    test.use({viewport: {height: 1440, width: 2560}});

    test('the real tour keeps density, data, Canvas output, themes, rails, and identities live', async ({page, neuralLink}) => {
        const pageErrors    = [],
              runtimeErrors = [];

        await page.context().exposeFunction('__recordDemoCRuntimeError', payload => runtimeErrors.push(payload));
        await page.context().addInitScript(() => {
            globalThis.addEventListener('error', event => {
                globalThis.__recordDemoCRuntimeError({
                    column : event.colno,
                    line   : event.lineno,
                    message: event.message,
                    source : event.filename,
                    type   : 'error'
                })
            });
            globalThis.addEventListener('unhandledrejection', event => {
                globalThis.__recordDemoCRuntimeError({
                    reason: String(event.reason?.stack || event.reason?.message || event.reason),
                    type  : 'unhandledrejection'
                })
            })
        });

        page.on('pageerror', error => {
            const value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && pageErrors.push(value)
        });

        await page.goto('/apps/agentos/childapps/dockdemo/index.html?demo=c');
        await page.waitForSelector('.agentos-dockdemo-tour-play', {timeout: 30000});
        await page.waitForSelector('.neo-tab-overflow-control', {timeout: 30000});

        const app        = await neuralLink.connectToApp('AgentOSDockDemo'),
              workspaces = asArray(await app.findInstances(
                  {className: 'AgentOS.childapps.dockdemo.view.DemoCWorkspace'},
                  ['id']
              )),
              workspaceId = workspaces[0]?.id;

        expect(workspaces, 'the page owns exactly one Demo C workspace').toHaveLength(1);
        expect(workspaceId).toBeTruthy();

        const beforeIdentity = await readIdentity(app, workspaceId);

        expect(beforeIdentity.providerCount, 'Demo C owns one root StateProvider').toBe(1);
        expect(beforeIdentity.workspaceProviderId, 'the workspace references that one Provider')
            .toBe(beforeIdentity.providerId);
        expect(beforeIdentity.scaleStoreId).toBeTruthy();
        expect(beforeIdentity.feedStoreId).toBeTruthy();
        expect(beforeIdentity.securityPaneId, 'the transformed heavy resident has a stable pane identity').toBeTruthy();
        expect(beforeIdentity.scaleStoreId, 'scale and feed are distinct Store<Model> identities')
            .not.toBe(beforeIdentity.feedStoreId);

        const scaleSnapshot = await app.inspectStore(beforeIdentity.scaleStoreId, 2, 0),
              feedBaseline  = await app.inspectStore(beforeIdentity.feedStoreId, 2, 0);

        expect(scaleSnapshot.count, 'the composed scale store is exactly 100,000 rows').toBe(100000);
        expect(scaleSnapshot.model?.className ?? scaleSnapshot.model)
            .toBe('AgentOS.childapps.dockdemo.model.DemoCRecord');
        expect(feedBaseline.model?.className ?? feedBaseline.model)
            .toBe('AgentOS.childapps.dockdemo.model.DemoCRecord');

        const
            root        = page.locator('.agentos-dockdemo-workspace-c'),
            tourButton  = page.locator('.agentos-dockdemo-tour-play'),
            themeToggle = page.locator('.agentos-dockdemo-theme-button');

        await expect(tourButton).toHaveText('Start dense tour');
        await expect(themeToggle, 'one action-labelled theme toggle replaces two mode buttons').toHaveCount(1);
        await expect(themeToggle).toHaveText('Light mode');

        const headerGeometry = await page.evaluate(() => {
            const
                playElement     = document.querySelector('.agentos-dockdemo-tour-play'),
                captionElement  = document.querySelector('.agentos-dockdemo-tour-caption'),
                progressElement = document.querySelector('.agentos-dockdemo-tour-pips'),
                themeElement    = document.querySelector('.agentos-dockdemo-theme-button'),
                play            = playElement?.getBoundingClientRect(),
                caption         = captionElement?.getBoundingClientRect(),
                progress        = progressElement?.getBoundingClientRect(),
                theme           = themeElement?.getBoundingClientRect();

            return {
                captionLeft         : caption?.left,
                captionPaddingLeft  : parseFloat(getComputedStyle(captionElement).paddingLeft),
                playRight           : play?.right,
                progressPaddingRight: parseFloat(getComputedStyle(progressElement).paddingRight),
                progressRight       : progress?.right,
                themeLeft           : theme?.left
            }
        });

        expect(headerGeometry.captionLeft - headerGeometry.playRight, 'tour action and story boxes never overlap')
            .toBeGreaterThanOrEqual(0);
        expect(headerGeometry.captionPaddingLeft, 'tour action and visible story copy have a deliberate gap')
            .toBeGreaterThanOrEqual(10);
        expect(headerGeometry.themeLeft - headerGeometry.progressRight, 'story/progress and theme action boxes never overlap')
            .toBeGreaterThanOrEqual(0);
        expect(headerGeometry.progressPaddingRight, 'visible progress and theme action form separate zones')
            .toBeGreaterThanOrEqual(10);

        const initialTourBackground = await tourButton.evaluate(element => getComputedStyle(element).backgroundColor);

        await tourButton.hover();
        const hoverTourBackground = await tourButton.evaluate(element => getComputedStyle(element).backgroundColor);

        expect(initialTourBackground).not.toBe('rgb(67, 93, 177)');
        expect(hoverTourBackground, 'hover remains in the AgentOS signal palette').not.toBe('rgb(67, 93, 177)');

        await themeToggle.click();
        await expect(root).toHaveClass(/neo-theme-neo-light/);
        await expect(themeToggle).toHaveText('Dark mode');

        const lightChrome = await page.evaluate(() => {
            const
                gridHeader  = document.querySelector('.agentos-dockdemo-scale-pane .neo-grid-header-button'),
                overflow    = document.querySelector('.neo-tab-overflow-control'),
                rowAction   = document.querySelector('.agentos-dockdemo-row-action'),
                rippleToken = element => getComputedStyle(element)
                    .getPropertyValue('--button-ripple-background-color').trim().toLowerCase();

            return {
                gridBackground : getComputedStyle(gridHeader).backgroundColor,
                gridColor      : getComputedStyle(gridHeader).color,
                overflow       : getComputedStyle(overflow).backgroundColor,
                overflowRipple : rippleToken(overflow),
                rowAction      : getComputedStyle(rowAction).backgroundColor,
                rowActionBorder: getComputedStyle(rowAction).borderColor,
                rowActionRipple: rippleToken(rowAction),
                themeRipple    : rippleToken(document.querySelector('.agentos-dockdemo-theme-button'))
            }
        });

        expect(lightChrome.gridBackground, 'light mode does not leak the standalone grid blue')
            .not.toBe('rgb(93, 131, 167)');
        expect(lightChrome.gridColor, 'light header copy is not forced to generic white').not.toBe('rgb(255, 255, 255)');
        expect(lightChrome.overflow, 'overflow control belongs to the AgentOS palette').not.toBe('rgb(67, 93, 177)');
        expect(lightChrome.overflowRipple).not.toBe('#8ba6ff');
        expect(lightChrome.rowAction, 'row actions do not use the default primary button').not.toBe('rgb(67, 93, 177)');
        expect(lightChrome.rowActionBorder).not.toBe('rgba(0, 0, 0, 0)');
        expect(lightChrome.rowActionRipple).not.toBe('#8ba6ff');
        expect(lightChrome.themeRipple, 'theme-toggle feedback stays in the AgentOS palette')
            .not.toBe('#8ba6ff');

        await themeToggle.click();
        await expect(root).toHaveClass(/neo-theme-neo-dark/);
        await expect(themeToggle).toHaveText('Light mode');

        expectDevIndexSparklineFit(await readSparklineGeometry(page, '.agentos-dockdemo-scale-pane'));
        expectDevIndexSparklineFit(await readSparklineGeometry(page, '.agentos-dockdemo-feed-pane'));

        const gridLayout = await page.evaluate(() => {
            const
                rect = element => {
                    const value = element?.getBoundingClientRect();

                    return value && {
                        bottom: value.bottom,
                        left  : value.left,
                        right : value.right,
                        top   : value.top,
                        width : value.width
                    }
                },
                readHeaders = selector => [...document.querySelectorAll(`${selector} .neo-grid-header-button`)]
                    .map(element => {
                        const
                            glyph      = element.querySelector('.neo-button-glyph'),
                            label      = element.querySelector('.neo-button-text'),
                            glyphStyle = getComputedStyle(glyph),
                            style      = getComputedStyle(element);

                        return {
                            button: rect(element),
                            glyph : rect(glyph),
                            label : rect(label),
                            style : {
                                flexDirection : style.flexDirection,
                                glyphPosition : glyphStyle.position,
                                justifyContent: style.justifyContent,
                                paddingLeft   : style.paddingLeft
                            },
                            text: label?.textContent?.trim()
                        }
                    }),
                scaleHeaders = readHeaders('.agentos-dockdemo-scale-pane'),
                feedHeaders  = readHeaders('.agentos-dockdemo-feed-pane'),
                heavyHeader  = [...document.querySelectorAll('.neo-tab-header-toolbar')]
                    .find(element => element.textContent?.includes('Priority Alert Observatory')),
                scaleToolbar = document.querySelector('.agentos-dockdemo-scale-pane .neo-grid-header-toolbar');

            return {
                feedHeaders,
                heavyWidth        : rect(heavyHeader?.closest('.neo-tab-container'))?.width,
                leftBandWidth     : rect(document.querySelector('.neo-dashboard-dock-edge-band-left'))?.width,
                rightBandWidth    : rect(document.querySelector('.neo-dashboard-dock-edge-band-right'))?.width,
                scaleHeaders,
                scaleTrailingSpace: rect(scaleToolbar)?.right - scaleHeaders.at(-1)?.button.right
            }
        });

        for (const header of [...gridLayout.scaleHeaders, ...gridLayout.feedHeaders]) {
            expect(header.label.left - header.button.left,
                `${header.text} header label is physically left-aligned: ${JSON.stringify(header)}`)
                .toBeLessThanOrEqual(16)
        }

        const feedWidths = Object.fromEntries(gridLayout.feedHeaders.map(header => [header.text, header.button.width]));

        expect(gridLayout.scaleTrailingSpace,
            'the scale grid keeps breathing room without wasting a second panel width').toBeGreaterThanOrEqual(0);
        expect(gridLayout.scaleTrailingSpace).toBeLessThanOrEqual(140);
        expect(gridLayout.heavyWidth, 'the dense heavy-tab panel is no longer cramped by the scale grid')
            .toBeGreaterThanOrEqual(700);
        expect(gridLayout.leftBandWidth).toBeCloseTo(260, 0);
        expect(gridLayout.rightBandWidth, 'the stacked evidence cards get more room than the queue card')
            .toBeCloseTo(320, 0);
        expect(feedWidths.Event / feedWidths.State,
            'Event remains the narrative column without consuming nearly the whole feed').toBeLessThanOrEqual(2.1);
        expect(feedWidths.Event / feedWidths.Value).toBeLessThanOrEqual(2.1);

        // Two source-owned rails are visible and legible at workstation geometry.
        const railTabs = page.locator('.neo-dashboard-dock-rail-tab');

        await expect(railTabs).toHaveCount(2);
        expect((await railTabs.allTextContents()).map(value => value.trim()).sort())
            .toEqual(['Native Edge Graph', 'Selection Inspector'].sort());

        // One REAL generic overflow control, outside the draggable header collection.
        const control = page.locator('.neo-tab-overflow-control');

        await expect(control).toHaveCount(1);
        expect(await page.evaluate(() =>
            document.querySelector('.neo-tab-overflow-control')?.parentElement === document.body
        ), 'the overflow control is a floating direct body child').toBe(true);

        const heavyToolbar = page.locator('.neo-tab-header-toolbar').filter({hasText: 'Priority Alert Observatory'});

        await expect(heavyToolbar, 'one header owns the intentionally dense twelve-tab group').toHaveCount(1);

        const controlBox = await control.boundingBox(),
              toolbarBox = await heavyToolbar.boundingBox();

        expect(Math.abs((controlBox.x + controlBox.width) - (toolbarBox.x + toolbarBox.width)),
            'overflow control right edge tracks the exact heavy toolbar').toBeLessThanOrEqual(2);
        expect(Math.abs(controlBox.y - toolbarBox.y),
            'overflow control top tracks the exact heavy toolbar').toBeLessThanOrEqual(2);

        await control.click();

        const menuItems      = page.locator('.neo-menu-list:visible .neo-list-item').filter({hasText: /\S/}),
              visibleHeaders = heavyToolbar.locator('.neo-tab-header-button:visible');

        await expect(menuItems.first(), 'the floating overflow menu becomes visible').toBeVisible({timeout: 10000});

        const hiddenCount  = await menuItems.count(),
              visibleCount = await visibleHeaders.count();

        expect(hiddenCount, 'the heavy group has a real hidden partition at 2560x1440').toBeGreaterThan(0);
        expect(visibleCount, 'the heavy group keeps at least one direct tab').toBeGreaterThan(0);
        expect(hiddenCount + visibleCount, 'visible + hidden counts cover the twelve-tab owner').toBe(12);

        const normalize = values => values.map(value => value.trim()).filter(Boolean),
              partition = [
                  ...normalize(await visibleHeaders.allTextContents()),
                  ...normalize(await menuItems.allTextContents())
              ];

        expect(partition.sort(), 'visible + hidden is the exact heavy resident set')
            .toEqual([...heavyTitles].sort());

        const memoryItem = menuItems.filter({hasText: 'Memory Core Telemetry'});

        await expect(memoryItem).toHaveCount(1);
        await memoryItem.click();
        await expect(page.locator('.neo-tab-header-button.pressed:visible')
            .filter({hasText: 'Memory Core Telemetry'}),
        'ordinary activeIndex surfaces the selected hidden resident').toHaveCount(1);

        // Owner-scoped Canvas proof: disable autonomous animation, then require this exact
        // scale Sparkline's Canvas-worker pixels and values to change after a record mutation.
        await expect.poll(async () => (await readScaleSparklines(app, page))
            .filter(entry => entry.properties?.offscreenRegistered).length, {
            message  : 'the visible scale pool registers into the Canvas Worker',
            timeout  : 10000,
            intervals: [100, 250]
        }).toBeGreaterThan(0);

        const scaleSparklinesBefore = await readScaleSparklines(app, page),
              pulseTarget           = scaleSparklinesBefore.find(entry => entry.properties?.offscreenRegistered),
              domIdentityIds        = {
                  canvas   : pulseTarget.id,
                  feedPane : beforeIdentity.feedPaneId,
                  scalePane: beforeIdentity.scalePaneId
              };

        expect(await page.evaluate(ids => {
            const entries = Object.entries(ids);

            globalThis.__demoCDomIdentity = Object.fromEntries(
                entries.map(([key, id]) => [key, document.getElementById(id)])
            );
            globalThis.__demoCDomIdentity.scaleBody = document.querySelector(
                '.agentos-dockdemo-scale-pane .neo-grid-body'
            );

            return Object.values(globalThis.__demoCDomIdentity).every(Boolean)
        }, domIdentityIds), 'all permanence targets start as mounted DOM nodes').toBe(true);

        for (const sparkline of scaleSparklinesBefore) {
            await app.setProperties(sparkline.id, {usePulse: false, useTransition: false})
        }

        await page.waitForTimeout(150);

        const targetCanvas = page.locator(`[id="${pulseTarget.id}"]`),
              beforePixels = (await targetCanvas.screenshot()).toString('base64'),
              beforeValues = pulseTarget.properties.values,
              pulseReceipt = await app.callMethod(workspaceId, 'pulseScaleSparkline', [pulseTarget.id]);

        expect(pulseReceipt.componentId).toBe(pulseTarget.id);
        expect(pulseReceipt.recordId).toBeTruthy();
        await expect.poll(async () => (await targetCanvas.screenshot()).toString('base64'), {
            message  : 'the exact scale canvas changes after its worker receives new data',
            timeout  : 10000,
            intervals: [100, 250]
        }).not.toBe(beforePixels);

        const pulseTargetAfter = (await readScaleSparklines(app, page))
            .find(entry => entry.id === pulseTarget.id);

        expect(pulseTargetAfter.properties.values).not.toEqual(beforeValues);

        // Frame-sample the ACTUAL screenplay path. A missing scale body is itself a blank
        // frame; when mounted, every visible row must stay populated.
        await page.evaluate(identity => {
            const
                root             = document.querySelector('.agentos-dockdemo-workspace-c'),
                initialPipCount  = root?.querySelectorAll('.agentos-dockdemo-pip-done').length || 0,
                initialHeaderIds = [...root?.querySelectorAll('.neo-tab-header-toolbar') || []]
                    .map(element => element.id);

            const state = globalThis.__demoCMonitor = {
                activeTabEmptyMaxMs           : 0,
                activeTabEmptySamples         : [],
                blankSamples                  : [],
                blankFrames                   : 0,
                chromeAnimationLeakFrames     : 0,
                done                          : false,
                flipSamples                   : 0,
                initialHeaderIds,
                midpointSeen                  : false,
                missingBodyFrames             : 0,
                overflowControlCounts         : {},
                overflowControlDuplicateFrames: 0,
                palettes                      : [],
                pipCounts                     : [initialPipCount],
                pipRegressionFrames           : 0,
                railMismatchFrames            : 0,
                replacementHeaderBirth        : {},
                replacementHeaderSamples      : 0,
                sampledFrames                 : 0,
                securityCaptured              : false,
                securityMissingFrames         : 0,
                securityReplacementFrames     : 0
            };
            const activeTabEmptySpans = {};
            let   securityNode        = null;

            const tick = () => {
                const isVisible = node => {
                    const style = getComputedStyle(node);

                    return node.getClientRects().length > 0
                        && style.display !== 'none'
                        && style.opacity !== '0'
                        && style.visibility !== 'hidden'
                };

                const root         = document.querySelector('.agentos-dockdemo-workspace-c'),
                      body         = document.querySelector('.agentos-dockdemo-scale-pane .neo-grid-body'),
                      railTabCount = [...document.querySelectorAll('.neo-dashboard-dock-rail-tab')]
                          .filter(isVisible).length,
                      overflowControlCount = [...document.querySelectorAll('.neo-tab-overflow-control')]
                          .filter(isVisible).length,
                      currentSecurityNode = document.getElementById(identity.securityPaneId);

                if (root) {
                    const
                        activeTabEmptyIds = new Set(),
                        pipCount          = root.querySelectorAll('.agentos-dockdemo-pip-done').length,
                        previous          = state.pipCounts.at(-1);

                    if (pipCount !== previous) {
                        pipCount < previous && state.pipRegressionFrames++;
                        state.pipCounts.push(pipCount)
                    }

                    [...root.querySelectorAll('.neo-tab-header-toolbar')].filter(isVisible).forEach(toolbar => {
                        if (!state.initialHeaderIds.includes(toolbar.id)) {
                            state.replacementHeaderBirth[toolbar.id] ??= performance.now();

                            if (performance.now() - state.replacementHeaderBirth[toolbar.id] <= 320) {
                                state.replacementHeaderSamples++;

                                const hasRunningEntryEffect = toolbar.getAnimations({subtree: true}).some(animation =>
                                    animation.playState === 'running'
                                    && Number(animation.effect?.getTiming().duration) > 0
                                );

                                hasRunningEntryEffect && state.chromeAnimationLeakFrames++
                            }
                        }
                    });

                    [...root.querySelectorAll('.neo-tab-container')].filter(isVisible).forEach(container => {
                        const
                            activeHeader = [...container.querySelectorAll('.neo-tab-header-button.pressed')]
                                .find(isVisible),
                            body         = container.querySelector('.neo-tab-body-container'),
                            activeCard   = body && [...body.children].find(isVisible);

                        if (activeHeader && isVisible(body) && !activeCard) {
                            let sample = activeTabEmptySpans[container.id];

                            activeTabEmptyIds.add(container.id);

                            if (!sample) {
                                sample = activeTabEmptySpans[container.id] = {
                                    bodyId     : body.id,
                                    containerId: container.id,
                                    duration   : 0,
                                    start      : performance.now(),
                                    title      : activeHeader.textContent?.trim() || ''
                                };
                                state.activeTabEmptySamples.length < 20 && state.activeTabEmptySamples.push(sample)
                            }

                            sample.duration = Math.round((performance.now() - sample.start) * 10) / 10;
                            state.activeTabEmptyMaxMs = Math.max(state.activeTabEmptyMaxMs, sample.duration)
                        }
                    });

                    Object.keys(activeTabEmptySpans).forEach(containerId => {
                        activeTabEmptyIds.has(containerId) || delete activeTabEmptySpans[containerId]
                    })
                }

                railTabCount === 2 || state.railMismatchFrames++;
                state.overflowControlCounts[overflowControlCount]
                    = (state.overflowControlCounts[overflowControlCount] || 0) + 1;
                overflowControlCount > 1 && state.overflowControlDuplicateFrames++;

                if (currentSecurityNode) {
                    if (!securityNode) {
                        securityNode = currentSecurityNode;
                        state.securityCaptured = true
                    } else if (currentSecurityNode !== securityNode) {
                        state.securityReplacementFrames++
                    }
                } else if (state.securityCaptured) {
                    state.securityMissingFrames++
                }

                if (root) {
                    const palette = getComputedStyle(root).backgroundColor;

                    state.palettes.includes(palette) || state.palettes.push(palette);

                    if ([...root.querySelectorAll('[class*="agentos-dockdemo-pane-"]')]
                        .some(element => getComputedStyle(element).transform !== 'none')) {
                        state.flipSamples++
                    }
                }

                if (root && !body) {
                    state.missingBodyFrames++
                } else if (body) {
                    const
                        wrapper     = body.closest('.neo-grid-view'),
                        wrapperRect = wrapper?.getBoundingClientRect(),
                        rows        = [...body.querySelectorAll('.neo-grid-row')].filter(element => {
                            const rect = element.getBoundingClientRect();

                            return rect.height > 0 && rect.width > 0
                        });

                    if (wrapperRect?.height > 0 && wrapperRect.width > 0) {
                        const
                            rowRects    = rows.map(element => element.getBoundingClientRect()),
                            rowsTop     = rowRects.length ? Math.min(...rowRects.map(rect => rect.top)) : 0,
                            rowsBottom  = rowRects.length ? Math.max(...rowRects.map(rect => rect.bottom)) : 0,
                            visibleRows = rows.filter((element, index) => {
                                const rect = rowRects[index];

                                return rect.bottom > wrapperRect.top && rect.top < wrapperRect.bottom
                            }),
                            texts      = visibleRows.map(element => element.textContent?.trim() || ''),
                            isBlank    = rows.length === 0
                                || rowsBottom < wrapperRect.top
                                || rowsTop > wrapperRect.bottom
                                || rowsTop - wrapperRect.top > 100
                                || wrapperRect.bottom - rowsBottom > 100
                                || texts.some(text => !text);

                        state.sampledFrames++;
                        state.midpointSeen ||= texts.some(text => /^500\d{2}/.test(text));

                        if (isBlank) {
                            state.blankFrames++;
                            state.blankSamples.length < 20 && state.blankSamples.push({
                                bottomGap    : Math.round(wrapperRect.bottom - rowsBottom),
                                rowCount     : rows.length,
                                rowsBottom,
                                rowsTop,
                                time         : Math.round(performance.now()),
                                topGap       : Math.round(rowsTop - wrapperRect.top),
                                visibleRows  : visibleRows.length,
                                wrapperBottom: Math.round(wrapperRect.bottom),
                                wrapperTop   : Math.round(wrapperRect.top)
                            })
                        }
                    }
                }

                state.done || requestAnimationFrame(tick)
            };

            requestAnimationFrame(tick)
        }, beforeIdentity);

        await page.click('.agentos-dockdemo-tour-play');
        await expect.poll(async () => Boolean(await app.callMethod(workspaceId, 'getTourReceipt')), {
            message  : 'the native tour button settles document and surface tiers',
            timeout  : 30000,
            intervals: [100, 250]
        }).toBe(true);

        const tourReceipt        = await app.callMethod(workspaceId, 'getTourReceipt'),
              canvasFailureState = tourReceipt.completed ? [] : await readScaleSparklines(app, page),
              monitor            = await page.evaluate(async () => {
                  globalThis.__demoCMonitor.done = true;
                  await new Promise(resolve => requestAnimationFrame(resolve));
                  return globalThis.__demoCMonitor
              });

        expect(tourReceipt.completed,
            `tour errors: ${JSON.stringify(tourReceipt.errors)}; visible Canvas state: ${JSON.stringify(canvasFailureState)}`)
            .toBe(true);
        expect(tourReceipt.errors).toEqual([]);
        expect(tourReceipt.cueReceipts.map(entry => entry.cue.type))
            .toEqual(['overflow', 'scroll', 'canvas-update', 'theme', 'theme']);
        expect(tourReceipt.cueReceipts.find(entry => entry.cue.type === 'overflow').receipt)
            .toMatchObject({activatedItemId: 'security'});
        expect(tourReceipt.cueReceipts.find(entry => entry.cue.type === 'overflow').receipt.menuItemCount)
            .toBeGreaterThan(0);
        expect(tourReceipt.cueReceipts.find(entry => entry.cue.type === 'canvas-update').receipt.componentId)
            .toBeTruthy();
        expect(tourReceipt.cueReceipts.filter(entry => entry.cue.type === 'theme').map(entry => entry.receipt))
            .toEqual(['neo-theme-neo-light', 'neo-theme-neo-dark']);
        expect(tourReceipt.feed.configuredRate, 'the declared producer cadence is 10 records/sec').toBe(10);
        expect(tourReceipt.feed.batches, 'many coalesced batches land across the real tour').toBeGreaterThanOrEqual(10);
        expect(tourReceipt.feed.produced, 'every observed batch produces exactly five records')
            .toBe(tourReceipt.feed.batches * 5);
        expect(tourReceipt.feed.endCount, 'visible feed growth is exact until the declared cap')
            .toBe(Math.min(
                tourReceipt.feed.maxRecords,
                tourReceipt.feed.startCount + tourReceipt.feed.produced
            ));
        expect(tourReceipt.feed.growth, 'the receipt reports the cap-aware visible delta')
            .toBe(tourReceipt.feed.endCount - tourReceipt.feed.startCount);
        expect(tourReceipt.document.nodes['heavy-tabs'].activeItemId).toBe('security');
        expect(tourReceipt.document.nodes['heavy-tabs'].items).toEqual([
            'alerts', 'activity', 'topology', 'runtime', 'traces', 'logs',
            'console', 'builds', 'deploys', 'memory', 'files', 'security'
        ]);

        expect(monitor.sampledFrames).toBeGreaterThan(10);
        expect(monitor.midpointSeen, 'rAF sampling observes the live midpoint scroll').toBe(true);
        expect(monitor.pipCounts, 'every settled beat paints once, in order')
            .toEqual(Array.from({length: demoCTourScript.scenes.flatMap(scene => scene.steps).length + 1}, (_, index) => index));
        expect(monitor.pipRegressionFrames, 'progress never fills early and jumps backward').toBe(0);
        expect(monitor.replacementHeaderSamples, 'the journey sampled replacement tab chrome').toBeGreaterThan(0);
        expect(monitor.chromeAnimationLeakFrames,
            'fresh replacement chrome does not replay shared entry animations').toBe(0);
        expect(monitor.activeTabEmptyMaxMs,
            `no visible active tab exposes a sustained empty paint: ${JSON.stringify(monitor.activeTabEmptySamples)}`)
            .toBeLessThan(17);
        expect(monitor.missingBodyFrames, 'the preserved scale body never leaves the DOM between projections').toBe(0);
        expect(monitor.blankFrames,
            `no mounted visible scale row goes blank during choreography: ${JSON.stringify(monitor.blankSamples)}`)
            .toBe(0);
        expect(monitor.railMismatchFrames, 'both real rails remain present through every sampled frame').toBe(0);
        expect(monitor.overflowControlDuplicateFrames,
            `the projection never leaks duplicate overflow controls: ${JSON.stringify(monitor.overflowControlCounts)}`)
            .toBe(0);
        expect(monitor.overflowControlCounts['1'], 'the real overflow state is observed').toBeGreaterThan(0);
        expect(monitor.securityCaptured, 'the overflow cue mounts Security before its structural move').toBe(true);
        expect(monitor.securityMissingFrames, 'the active Security pane never leaves the DOM after capture').toBe(0);
        expect(monitor.securityReplacementFrames, 'Security keeps the same DOM node across split and return').toBe(0);
        expect(monitor.palettes.length, 'the actual tour materially renders both theme palettes').toBeGreaterThanOrEqual(2);
        expect(monitor.flipSamples, 'committed transformations emit visible FLIP motion').toBeGreaterThan(0);
        await expect(page.locator('.agentos-dockdemo-workspace-c'))
            .not.toHaveClass(/neo-dashboard-dock-animating/);
        await expect(page.locator('.neo-tab-overflow-control:visible'),
            'the returned twelve-tab group restores its one real overflow control').toHaveCount(1);

        // Two fresh document-tier spec runs remain byte-identical; the real-button receipt above
        // is the separate authority for asynchronous surface cues.
        const run1 = await app.callMethod(workspaceId, 'runTourSpec', []),
              run2 = await app.callMethod(workspaceId, 'runTourSpec', []);

        expect(run1.completed, `run 1 errors: ${JSON.stringify(run1.errors)}`).toBe(true);
        expect(run1.errors).toEqual([]);
        expect(run1.log).toHaveLength(demoCTourScript.scenes.flatMap(scene => scene.steps).length);
        expect(run2.completed, `run 2 errors: ${JSON.stringify(run2.errors)}`).toBe(true);
        expect(run2.errors).toEqual([]);
        expect(run2.log, 'both timestamp-free document runs are deterministic').toEqual(run1.log);

        const stableScaleComponentIds = [
            pulseTarget.id,
            tourReceipt.cueReceipts.find(entry => entry.cue.type === 'canvas-update').receipt.componentId
        ];

        await expect.poll(async () => {
            const current    = await readScaleSparklines(app, page),
                  currentIds = current.map(entry => entry.id);

            return current.length > 0
                && stableScaleComponentIds.every(id => currentIds.includes(id))
                && current.every(entry => entry.properties?.offscreenRegistered)
        }, {
            message  : 'stable Canvas identities survive while the viewport-sized pool remains registered',
            timeout  : 5000,
            intervals: [50, 100]
        }).toBe(true);

        const afterIdentity        = await readIdentity(app, workspaceId),
              scaleSparklinesAfter = await readScaleSparklines(app, page);

        expect(afterIdentity, 'workspace, heavy pane, data panes, Provider, and stores survive all transformations')
            .toEqual(beforeIdentity);
        expect(scaleSparklinesAfter.length, 'the viewport-bounded scale component pool remains live')
            .toBeGreaterThan(0);
        expect(stableScaleComponentIds.every(id => scaleSparklinesAfter.some(entry => entry.id === id)),
            'the exact components exercised before and during transformation preserve identity').toBe(true);
        const domIdentityState = await page.evaluate(ids => ({
            ...Object.fromEntries(Object.entries(ids).map(([key, id]) => [
                key,
                globalThis.__demoCDomIdentity?.[key] === document.getElementById(id)
            ])),
            scaleBody: globalThis.__demoCDomIdentity?.scaleBody
                === document.querySelector('.agentos-dockdemo-scale-pane .neo-grid-body')
        }), domIdentityIds);

        expect(domIdentityState, 'the exact always-mounted pane, body, and Canvas DOM nodes survive every projection')
            .toEqual({canvas: true, feedPane: true, scaleBody: true, scalePane: true});
        expect(scaleSparklinesAfter.every(entry => entry.properties?.offscreenRegistered),
            'the preserved scale Canvas pool is registered after the final projection').toBe(true);
        expectDevIndexSparklineFit(await readSparklineGeometry(page, '.agentos-dockdemo-scale-pane'));
        expectDevIndexSparklineFit(await readSparklineGeometry(page, '.agentos-dockdemo-feed-pane'));
        expect(runtimeErrors, 'no global error or unhandled rejection across the journey').toEqual([]);
        expect(pageErrors, 'no Playwright pageerror across the journey').toEqual([])
    })
});
