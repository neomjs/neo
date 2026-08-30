import {test, expect}                                from '../../fixtures.mjs';
import {workstationTourScript}                       from '../../../../apps/workstation/tour/denseWorkstation.mjs';
import {placeNativeWindow, resolveFilmDisplayBounds} from '../utils/filmStage.mjs';
import {isEngineProfile, isFilmTake}                 from '../utils/gpuIntent.mjs';

/**
 * @summary Mounted L3 proof for Workstation's dense, living-data workstation.
 *
 * The unit floor owns the document/script contract. This journey drives the REAL tour button
 * and owns what only the App Worker + DOM + Canvas Worker composition can prove: one root Provider,
 * two stable Store<Model> identities, an exact 100k renderer-rich grid, a sustained capped
 * feed, one owner-exact overflow surface, two real rails, frame-sampled midpoint continuity,
 * Canvas-worker value change (plus pixel change under the presenting profile), exact 160x50 chart
 * geometry, honest progress paints, both themes, host-relative edge bands, visible real splitters,
 * user-driven semantic resize, pane-owned chrome, replacement-chrome motion containment,
 * sequential clip-safe fixed staging, and identity preservation.
 *
 * Run: NEO_E2E_PORT=8124 npx playwright test workstation/WorkstationNL -c test/playwright/playwright.config.e2e.mjs --workers=1
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
    'Memory Pressure Telemetry',
    'Workspace Files'
];

const initialTabNodeIds = [
    'scale-tabs', 'heavy-tabs', 'left-tabs',
    'right-top-tabs', 'right-bottom-tabs', 'bottom-tabs'
];

const asArray           = value => Array.isArray(value) ? value : value ? [value] : [],
      presentingBrowser = !isEngineProfile();

/**
 * @summary Captures the exact Canvas pixels when the browser profile presents frames on glass.
 *
 * @param {import('@playwright/test').Locator} canvas
 * @returns {Promise<String>} Base64-encoded PNG for the current Canvas pixels.
 */
const readCanvasPixels = async canvas => (await canvas.screenshot()).toString('base64');

/**
 * @param {Object} app Neural Link fixture app handle.
 * @param {String} workspaceId Workstation workspace id.
 * @returns {Promise<Object>} Root-provider and stable pane / Store identity snapshot.
 */
const readIdentity = async (app, workspaceId) => {
    const [providers, scalePanes, feedPanes, listedStores, workspace, securityPaneId] = await Promise.all([
        app.findInstances({className: 'Neo.state.Provider'}, ['id', 'parent.id']),
        app.findInstances({className: 'Workstation.view.ScalePane'}, ['id', 'store.id']),
        app.findInstances({className: 'Workstation.view.FeedPane'}, ['id', 'store.id']),
        app.listStores(),
        app.getComponent(workspaceId, ['stateProvider.id']),
        app.callMethod(workspaceId, 'getPaneIdentity', ['security'])
    ]),
        providerList  = asArray(providers),
        rootProviders = providerList.filter(provider => !provider.properties?.['parent.id']),
        scaleList     = asArray(scalePanes),
        feedList      = asArray(feedPanes),
        stores        = asArray(listedStores?.stores ?? listedStores),
        scaleStore    = stores.find(store => store.id?.endsWith('__scale')),
        feedStore     = stores.find(store => store.id?.endsWith('__feed'));

    return {
        feedPaneId         : feedList[0]?.id,
        feedStoreId        : feedStore?.id ?? feedList[0]?.properties?.['store.id'],
        rootProviderCount  : rootProviders.length,
        rootProviderId     : rootProviders[0]?.id,
        scalePaneId        : scaleList[0]?.id,
        scaleStoreId       : scaleStore?.id ?? scaleList[0]?.properties?.['store.id'],
        securityPaneId,
        workspaceProviderId: workspace['stateProvider.id']
    }
};

/**
 * @summary Reads the component identity receipt for every opening-document tab surface.
 * @param {Object} app Neural Link fixture app handle.
 * @param {String} workspaceId Workstation workspace id.
 * @returns {Promise<Object>}
 */
const readTabChromeIdentity = async (app, workspaceId) => Object.fromEntries(await Promise.all(
    initialTabNodeIds.map(async nodeId => [
        nodeId,
        await app.callMethod(workspaceId, 'getTabChromeIdentity', [nodeId])
    ])
));

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

            return Boolean(element?.closest('.workstation-scale-pane')
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
const expectSparklineCellFit = geometry => {
    expect(geometry).toBeTruthy();
    expect(Math.abs(geometry.cell.width - 160), 'Sparkline keeps the 160px column width').toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.row.height - 50), 'Sparkline keeps the 50px row height').toBeLessThanOrEqual(1);
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

/**
 * @summary Reads the rendered Workstation splitter and pane-boundary style contract.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
const readDockChrome = page => page.evaluate(() => {
    const
        horizontal = document.querySelector(
            '.neo-dashboard-dock-split-horizontal > .neo-dashboard-dock-splitter-horizontal'
        ),
        vertical = document.querySelector(
            '.neo-dashboard-dock-split-vertical > .neo-dashboard-dock-splitter-vertical'
        ),
        scalePane  = document.querySelector('.workstation-scale-pane'),
        tabBody    = scalePane?.closest('.neo-tab-body-container'),
        readStyle  = element => {
            const
                style  = getComputedStyle(element),
                handle = getComputedStyle(element, '::after');

            return {
                active          : element.matches(':active'),
                background      : style.backgroundColor,
                borderRadius    : style.borderRadius,
                boxShadow       : style.boxShadow,
                cursor          : style.cursor,
                handleBackground: handle.backgroundColor,
                handleHeight    : handle.height,
                handleWidth     : handle.width,
                opacity         : style.opacity
            }
        },
        bodyStyle = getComputedStyle(tabBody),
        paneStyle = getComputedStyle(scalePane);

    return {
        horizontal: readStyle(horizontal),
        pane      : {
            borderColor : paneStyle.borderColor,
            borderRadius: paneStyle.borderRadius
        },
        splitterCount: document.querySelectorAll('.neo-dashboard-dock-splitter').length,
        tabBody      : {
            background  : bodyStyle.backgroundColor,
            borderBottom: bodyStyle.borderBottomWidth,
            borderLeft  : bodyStyle.borderLeftWidth,
            borderRight : bodyStyle.borderRightWidth,
            borderTop   : bodyStyle.borderTopWidth
        },
        vertical: readStyle(vertical)
    }
});

/**
 * @summary Reads the visible floating overflow menu's theme identity and computed Workstation skin.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object|null>}
 */
const readOverflowMenuSkin = page => page.evaluate(() => {
    const
        control = document.querySelector('.neo-tab-overflow-control'),
        menu    = [...document.querySelectorAll('.neo-tab-overflow-menu')]
            .find(element => element.getClientRects().length > 0),
        item    = menu?.querySelector('.neo-list-item');

    if (!control || !menu || !item) return null;

    const
        itemStyle = getComputedStyle(item),
        icon      = menu.querySelector('.neo-menu-icon'),
        iconStyle = icon && getComputedStyle(icon),
        menuStyle = getComputedStyle(menu),
        themes    = element => [...element.classList].filter(value => value.startsWith('neo-theme-')),
        luminance = value => {
            const channels = (value.startsWith('#')
                ? [value.slice(1, 3), value.slice(3, 5), value.slice(5, 7)].map(channel => parseInt(channel, 16))
                : value.match(/[\d.]+/g).slice(0, 3).map(Number)
            ).map(channel => {
                channel = Number(channel) / 255;
                return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
            });

            return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
        },
        contrast = (foreground, background) => {
            const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);

            return (values[0] + .05) / (values[1] + .05)
        },
        iconToken = menuStyle.getPropertyValue('--menu-list-item-icon-color').trim();

    return {
        controlThemeClasses: themes(control),
        item               : {
            background  : itemStyle.backgroundColor,
            color       : itemStyle.color,
            fontFamily  : itemStyle.fontFamily,
            fontSize    : itemStyle.fontSize,
            fontWeight  : itemStyle.fontWeight,
            height      : itemStyle.height,
            lineHeight  : itemStyle.lineHeight,
            outlineColor: itemStyle.outlineColor,
            outlineStyle: itemStyle.outlineStyle,
            outlineWidth: itemStyle.outlineWidth,
            paddingLeft : itemStyle.paddingLeft,
            paddingRight: itemStyle.paddingRight
        },
        iconColor: iconStyle?.color || null,
        menu     : {
            background : menuStyle.backgroundColor,
            borderColor: menuStyle.borderColor,
            borderStyle: menuStyle.borderStyle,
            borderWidth: menuStyle.borderWidth,
            boxShadow  : menuStyle.boxShadow,
            fontFamily : menuStyle.fontFamily,
            fontSize   : menuStyle.fontSize
        },
        menuThemeClasses: themes(menu),
        parentIsBody    : menu.parentElement === document.body,
        contrast        : {
            icon: contrast(iconStyle?.color || iconToken, menuStyle.backgroundColor),
            text: contrast(itemStyle.color, menuStyle.backgroundColor)
        },
        tokens           : {
            background: menuStyle.getPropertyValue('--menu-list-background-color').trim(),
            hover     : menuStyle.getPropertyValue('--menu-list-item-background-color-hover').trim(),
            icon      : iconToken,
            ink       : menuStyle.getPropertyValue('--menu-list-item-color').trim()
        }
    }
});

/**
 * @summary Reads the two live child extents around Workstation's horizontal split boundary.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
const readHorizontalSplitGeometry = page => page.evaluate(() => {
    const
        splitter = document.querySelector(
            '.neo-dashboard-dock-split-horizontal > .neo-dashboard-dock-splitter-horizontal'
        ),
        children = splitter && [...splitter.parentElement.children]
            .filter(element => !element.classList.contains('neo-dashboard-dock-splitter'));

    if (!splitter || children.length < 2) return null;

    const
        first    = children[0].getBoundingClientRect(),
        second   = children[1].getBoundingClientRect(),
        boundary = splitter.getBoundingClientRect();

    return {
        boundaryWidth: boundary.width,
        firstWidth   : first.width,
        secondWidth  : second.width
    }
});

/**
 * Reads Workstation's app-owned responsive dock projection from the browser CSSOM.
 * @summary Pins host-relative edge-band geometry without treating the persisted dock document as layout state.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
const readResponsiveDockGeometry = page => page.evaluate(() => {
    const
        root      = document.querySelector('.workstation-workspace'),
        dockHost  = document.querySelector('.workstation-dock-host'),
        row       = document.querySelector('.neo-dashboard-dock-edge-row'),
        left      = document.querySelector('.neo-dashboard-dock-edge-band-left'),
        center    = row?.querySelector(':scope > .neo-dashboard-dock-split-horizontal'),
        right     = document.querySelector('.neo-dashboard-dock-edge-band-right'),
        bottom    = document.querySelector('.neo-dashboard-dock-edge-band-bottom'),
        scale     = document.querySelector('.workstation-scale-pane'),
        isVisible = element => {
            const style = getComputedStyle(element);

            return element.getClientRects().length > 0
                && style.display !== 'none'
                && style.visibility !== 'hidden'
        },
        readRect = element => {
            const value = element?.getBoundingClientRect();

            return value && {
                bottom: value.bottom,
                height: value.height,
                left  : value.left,
                right : value.right,
                top   : value.top,
                width : value.width
            }
        },
        nearestQueryContainerId = (element, axis) => {
            for (let candidate = element?.parentElement; candidate; candidate = candidate.parentElement) {
                const containerType = getComputedStyle(candidate).containerType;

                if (containerType === 'size' || (axis === 'inline' && containerType === 'inline-size')) {
                    return candidate.id
                }
            }

            return null
        },
        readBand = (element, property, axis) => {
            const style = getComputedStyle(element);

            return {
                ...readRect(element),
                computedExtent         : Number.parseFloat(style[property]),
                logicalProperty        : property,
                nearestQueryContainerId: nearestQueryContainerId(element, axis)
            }
        },
        readHost = element => {
            const
                rect   = readRect(element),
                style  = getComputedStyle(element),
                number = property => Number.parseFloat(style[property]) || 0;

            return {
                ...rect,
                boxSizing       : style.boxSizing,
                containerName   : style.containerName,
                containerType   : style.containerType,
                contentBlockSize: rect.height
                    - number('borderTopWidth') - number('borderBottomWidth')
                    - number('paddingTop') - number('paddingBottom'),
                contentInlineSize: rect.width
                    - number('borderLeftWidth') - number('borderRightWidth')
                    - number('paddingLeft') - number('paddingRight'),
                id: element.id
            }
        };

    return {
        bottomBand      : readBand(bottom, 'blockSize', 'block'),
        center          : readRect(center),
        dockHost        : readHost(dockHost),
        leftBand        : readBand(left, 'inlineSize', 'inline'),
        overflowControls: [...document.querySelectorAll('.neo-tab-overflow-control')]
            .filter(isVisible).length,
        railTabs: [...document.querySelectorAll('.neo-dashboard-dock-rail-tab')]
            .filter(isVisible).length,
        rightBand   : readBand(right, 'inlineSize', 'inline'),
        root        : readRect(root),
        rootFontSize: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
        row         : readRect(row),
        scale       : readRect(scale),
        splitters   : document.querySelectorAll('.neo-dashboard-dock-splitter').length,
        viewport    : {height: innerHeight, width: innerWidth}
    }
});

/**
 * Applies an exact content-box extent through the mounted dock host's production border-box model.
 * @summary Separates child-workspace responsiveness from outer viewport responsiveness without reloading Neo.
 * @param {import('@playwright/test').Page} page
 * @param {{height:Number,width:Number}} size
 * @returns {Promise<void>}
 */
const setDockHostContentSize = (page, size) => page.evaluate(({height, width}) => {
    const
        host        = document.querySelector('.workstation-dock-host'),
        style       = getComputedStyle(host),
        number      = property => Number.parseFloat(style[property]) || 0,
        blockExtras = number('borderTopWidth') + number('borderBottomWidth')
            + number('paddingTop') + number('paddingBottom'),
        inlineExtras = number('borderLeftWidth') + number('borderRightWidth')
            + number('paddingLeft') + number('paddingRight');

    host.style.setProperty('block-size', `${height + blockExtras}px`, 'important');
    host.style.setProperty('box-sizing', 'border-box', 'important');
    host.style.setProperty('flex', 'none', 'important');
    host.style.setProperty('inline-size', `${width + inlineExtras}px`, 'important')
}, size);

/**
 * Restores the host's engine-projected inline style after the nested-host probe.
 * @summary Keeps the remainder of the whitebox journey aligned with the component VDOM.
 * @param {import('@playwright/test').Page} page
 * @param {String|null} value
 * @returns {Promise<void>}
 */
const restoreDockHostStyle = (page, value) => page.evaluate(style => {
    const host = document.querySelector('.workstation-dock-host');

    if (style === null) {
        host.removeAttribute('style')
    } else {
        host.setAttribute('style', style)
    }
}, value);

test.describe('Workstation — dense living-data composition', () => {
    test.setTimeout(150000);
    test.use({
        reducedMotion: 'no-preference',
        viewport     : {height: 1440, width: 2560}
    });

    test('the real tour keeps density, data, Canvas output, themes, rails, and identities live', async ({page, neuralLink}) => {
        const pageErrors    = [],
              runtimeErrors = [];

        await page.context().exposeFunction('__recordWorkstationRuntimeError', payload => runtimeErrors.push(payload));
        await page.context().addInitScript(() => {
            globalThis.addEventListener('error', event => {
                globalThis.__recordWorkstationRuntimeError({
                    column : event.colno,
                    line   : event.lineno,
                    message: event.message,
                    source : event.filename,
                    type   : 'error'
                })
            });
            globalThis.addEventListener('unhandledrejection', event => {
                globalThis.__recordWorkstationRuntimeError({
                    reason: String(event.reason?.stack || event.reason?.message || event.reason),
                    type  : 'unhandledrejection'
                })
            })
        });

        page.on('pageerror', error => {
            const value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && pageErrors.push(value)
        });

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-tour-play', {timeout: 30000});
        await page.waitForSelector('.neo-tab-overflow-control', {timeout: 30000});

        // A film take records the physical display: front the window and place it on the capture
        // display via the shared film-stage contract (`NEO_FILM_DISPLAY_BOUNDS` = the take-night
        // rule). The dense tour is a SINGLE-window journey, so — unlike the five-beat multi-window
        // stage — Playwright's emulated viewport stays on: content renders 1:1 once the operator's
        // declared bounds match the emulated size, and the responsive segment keeps resizing the
        // emulated page mid-take. Ordinary runs never enter this branch.
        if (isFilmTake()) {
            await page.bringToFront();

            const filmBounds = resolveFilmDisplayBounds();

            if (filmBounds) {
                const placement = await placeNativeWindow(page, filmBounds);

                console.log(`[film-stage] dense-tour window placed: ${JSON.stringify(placement.bounds)}` +
                    ` (explicit NEO_FILM_DISPLAY_BOUNDS target; emulated viewport retained)`)
            } else {
                console.log('[film-stage] dense-tour window on natural landing (no NEO_FILM_DISPLAY_BOUNDS)')
            }
        }

        const app        = await neuralLink.connectToApp('Workstation'),
              workspaces = asArray(await app.findInstances(
                  {className: 'Workstation.view.Workspace'},
                  ['id']
              )),
              workspaceId = workspaces[0]?.id;

        expect(workspaces, 'the page owns exactly one Workstation workspace').toHaveLength(1);
        expect(workspaceId).toBeTruthy();

        const
            beforeIdentity = await readIdentity(app, workspaceId),
            beforeChrome   = await readTabChromeIdentity(app, workspaceId);

        expect(beforeIdentity.rootProviderCount, 'Workstation owns one root StateProvider').toBe(1);
        expect(beforeIdentity.workspaceProviderId, 'the workspace references that one Provider')
            .toBe(beforeIdentity.rootProviderId);
        expect(beforeIdentity.scaleStoreId).toBeTruthy();
        expect(beforeIdentity.feedStoreId).toBeTruthy();
        expect(beforeIdentity.securityPaneId, 'the transformed heavy resident has a stable pane identity').toBeTruthy();
        expect(beforeIdentity.scaleStoreId, 'scale and feed are distinct Store<Model> identities')
            .not.toBe(beforeIdentity.feedStoreId);
        expect(Object.values(beforeChrome).every(Boolean), 'all opening tab surfaces expose identity receipts')
            .toBe(true);
        expect(beforeChrome['heavy-tabs'].overflowPluginId, 'the heavy surface owns one Overflow plugin').toBeTruthy();
        expect(beforeChrome['heavy-tabs'].overflowControlId, 'the heavy surface owns one floating control').toBeTruthy();

        const scaleSnapshot = await app.inspectStore(beforeIdentity.scaleStoreId, 2, 0),
              feedBaseline  = await app.inspectStore(beforeIdentity.feedStoreId, 2, 0);

        expect(scaleSnapshot.count, 'the composed scale store is exactly 100,000 rows').toBe(100000);
        expect(scaleSnapshot.model?.className ?? scaleSnapshot.model)
            .toBe('Workstation.model.Record');
        expect(feedBaseline.model?.className ?? feedBaseline.model)
            .toBe('Workstation.model.Record');

        const
            root        = page.locator('.workstation-workspace'),
            tourButton  = page.locator('.workstation-tour-play'),
            themeToggle = page.locator('.workstation-theme-button');

        const
            {dockModel: responsiveDockModelBefore} = await app.getComponent(workspaceId, ['dockModel']),
            {feedSequence: feedSequenceBefore}     = await app.getComponent(workspaceId, ['feedSequence']);

        await page.evaluate(() => {
            globalThis.__workstationResponsiveDocument = document;
            globalThis.__workstationResponsiveScalePane = document.querySelector('.workstation-scale-pane')
        });

        /**
         * @summary Resizes this loaded page and waits for the responsive dock projection to settle.
         * @param {{height:Number,width:Number}} viewport
         * @returns {Promise<Object>}
         */
        const readAtViewport = async viewport => {
            await page.setViewportSize(viewport);
            await expect.poll(async () => {
                const geometry = await readResponsiveDockGeometry(page);

                return {
                    height   : Math.round(geometry.root.height),
                    railTabs : geometry.railTabs,
                    splitters: geometry.splitters,
                    viewport : geometry.viewport,
                    width    : Math.round(geometry.root.width)
                }
            }, {
                message  : `Workstation settles at ${viewport.width}x${viewport.height}`,
                timeout  : 10000,
                intervals: [25, 50, 100]
            }).toEqual({
                height   : viewport.height,
                railTabs : 2,
                // 2 split-node boundaries + 3 resizable edge affordances (left/right/bottom
                // bands each project their own splitter since edge zones became resizable)
                splitters: 5,
                viewport,
                width    : viewport.width
            });

            return readResponsiveDockGeometry(page)
        };

        /**
         * @summary Resizes only the mounted dock host and waits for its two-axis query projection.
         * @param {{height:Number,width:Number}} size
         * @returns {Promise<Object>}
         */
        const readAtHost = async size => {
            await setDockHostContentSize(page, size);
            await expect.poll(async () => {
                const {dockHost} = await readResponsiveDockGeometry(page);

                return {
                    blockSize    : Math.round(dockHost.contentBlockSize),
                    boxSizing    : dockHost.boxSizing,
                    containerName: dockHost.containerName,
                    containerType: dockHost.containerType,
                    inlineSize   : Math.round(dockHost.contentInlineSize)
                }
            }, {
                message  : `Dock host settles at ${size.width}x${size.height}`,
                timeout  : 10000,
                intervals: [25, 50, 100]
            }).toEqual({
                blockSize    : size.height,
                boxSizing    : 'border-box',
                containerName: 'neo-dashboard-dock',
                containerType: 'size',
                inlineSize   : size.width
            });

            return readResponsiveDockGeometry(page)
        };

        const
            wideGeometry   = await readAtViewport({height: 900, width: 1280}),
            narrowGeometry = await readAtViewport({height: 900, width: 900}),
            shortGeometry  = await readAtViewport({height: 600, width: 900});

        /**
         * @summary Asserts each band renders its COMMITTED document extent against the measured
         * dock host, inside the theme floors and the engine's per-edge 50% cap.
         *
         * The band's size authority is the dock document (`extent` → the projection's inline
         * percentage), no longer a preferred-width clamp: the theme keeps rem floors on the drag
         * axis and the engine default caps each edge individually at 50% of its container.
         * @param {Object} geometry
         * @returns {void}
         */
        const assertHostRelativeBandGeometry = geometry => {
            const
                clamp                    = (floor, value, cap) => Math.min(cap, Math.max(floor, value)),
                {dockHost, rootFontSize} = geometry;

            expect(rootFontSize).toBeGreaterThan(0);
            expect(dockHost.id).toBeTruthy();
            expect(dockHost.boxSizing).toBe('border-box');
            expect(dockHost.containerType).toBe('size');
            expect(dockHost.containerName).toBe('neo-dashboard-dock');
            expect(geometry.leftBand.nearestQueryContainerId).toBe(dockHost.id);
            expect(geometry.rightBand.nearestQueryContainerId).toBe(dockHost.id);
            expect(geometry.bottomBand.nearestQueryContainerId).toBe(dockHost.id);
            expect(geometry.leftBand.computedExtent).toBeCloseTo(clamp(
                rootFontSize * 11.25,
                dockHost.contentInlineSize * 0.11,
                dockHost.contentInlineSize * 0.5
            ), 1);
            expect(geometry.rightBand.computedExtent).toBeCloseTo(clamp(
                rootFontSize * 13.75,
                dockHost.contentInlineSize * 0.14,
                dockHost.contentInlineSize * 0.5
            ), 1);
            expect(geometry.bottomBand.computedExtent).toBeCloseTo(clamp(
                rootFontSize * 8.75,
                dockHost.contentBlockSize * 0.17,
                dockHost.contentBlockSize * 0.5
            ), 1)
        };

        expect(wideGeometry.leftBand.logicalProperty).toBe('inlineSize');
        expect(wideGeometry.bottomBand.logicalProperty).toBe('blockSize');
        assertHostRelativeBandGeometry(wideGeometry);
        assertHostRelativeBandGeometry(narrowGeometry);
        assertHostRelativeBandGeometry(shortGeometry);
        // The film-stage extents deliberately leave ordinary desktop sizes on the existing
        // usability floors; shrinking the viewport must preserve those floors, not squeeze the
        // side surfaces below them. The center absorbs the responsive delta.
        expect(narrowGeometry.leftBand.width).toBeCloseTo(wideGeometry.leftBand.width, 1);
        expect(narrowGeometry.rightBand.width).toBeCloseTo(wideGeometry.rightBand.width, 1);
        expect(narrowGeometry.center.width, 'the primary center keeps its desktop working floor')
            .toBeGreaterThanOrEqual(400);
        expect(narrowGeometry.scale.width, 'the 100k-row primary grid remains usable')
            .toBeGreaterThanOrEqual(230);
        expect(narrowGeometry.row.left).toBeGreaterThanOrEqual(narrowGeometry.dockHost.left - 1);
        expect(narrowGeometry.row.right).toBeLessThanOrEqual(narrowGeometry.dockHost.right + 1);
        expect(narrowGeometry.center.left).toBeGreaterThanOrEqual(narrowGeometry.row.left - 1);
        expect(narrowGeometry.center.right).toBeLessThanOrEqual(narrowGeometry.row.right + 1);
        expect(narrowGeometry.scale.left).toBeGreaterThanOrEqual(narrowGeometry.center.left - 1);
        expect(narrowGeometry.scale.right).toBeLessThanOrEqual(narrowGeometry.center.right + 1);
        expect(narrowGeometry.overflowControls, 'tab overflow remains owner-exact at the narrow desktop floor')
            .toBe(1);
        expect(shortGeometry.bottomBand.height).toBeCloseTo(wideGeometry.bottomBand.height, 1);
        expect(shortGeometry.center.width).toBeCloseTo(narrowGeometry.center.width, 1);
        expect(shortGeometry.scale.width).toBeCloseTo(narrowGeometry.scale.width, 1);
        expect(shortGeometry.scale.height, 'the short desktop keeps a usable primary grid height')
            .toBeGreaterThanOrEqual(230);
        expect(shortGeometry.bottomBand.bottom).toBeLessThanOrEqual(shortGeometry.dockHost.bottom + 1);
        expect(shortGeometry.overflowControls).toBe(1);

        const dockHostStyleBefore = await page.locator('.workstation-dock-host').getAttribute('style');

        await readAtViewport({height: 900, width: 1400});

        const largeHostGeometry = await readAtHost({height: 900, width: 1600});

        assertHostRelativeBandGeometry(largeHostGeometry);
        // unclamped mid-range spot check: both bands render their COMMITTED document extents
        // (right 0.14, bottom 0.17 of the host axis), not a preferred-size fraction
        expect(largeHostGeometry.rightBand.computedExtent)
            .toBeCloseTo(largeHostGeometry.dockHost.contentInlineSize * 0.14, 1);
        expect(largeHostGeometry.bottomBand.computedExtent)
            .toBeCloseTo(largeHostGeometry.dockHost.contentBlockSize * 0.17, 1);

        await page.setViewportSize({height: 850, width: 1300});

        const fixedHostGeometry = await readResponsiveDockGeometry(page);

        expect(fixedHostGeometry.viewport).toEqual({height: 850, width: 1300});
        expect(fixedHostGeometry.dockHost.contentInlineSize).toBeCloseTo(1600, 1);
        expect(fixedHostGeometry.dockHost.contentBlockSize).toBeCloseTo(900, 1);
        assertHostRelativeBandGeometry(fixedHostGeometry);
        expect(fixedHostGeometry.leftBand.computedExtent)
            .toBeCloseTo(largeHostGeometry.leftBand.computedExtent, 2);
        expect(fixedHostGeometry.rightBand.computedExtent)
            .toBeCloseTo(largeHostGeometry.rightBand.computedExtent, 2);
        expect(fixedHostGeometry.bottomBand.computedExtent)
            .toBeCloseTo(largeHostGeometry.bottomBand.computedExtent, 2);

        await page.setViewportSize({height: 900, width: 1400});

        const smallHostGeometry = await readAtHost({height: 450, width: 700});

        assertHostRelativeBandGeometry(smallHostGeometry);
        expect(smallHostGeometry.rightBand.computedExtent)
            .toBeCloseTo(smallHostGeometry.rootFontSize * 13.75, 1);
        expect(smallHostGeometry.bottomBand.computedExtent)
            .toBeCloseTo(smallHostGeometry.rootFontSize * 8.75, 1);
        expect(smallHostGeometry.rightBand.computedExtent)
            .toBeLessThan(largeHostGeometry.rightBand.computedExtent);
        expect(smallHostGeometry.bottomBand.computedExtent)
            .toBeLessThan(largeHostGeometry.bottomBand.computedExtent);

        await restoreDockHostStyle(page, dockHostStyleBefore);

        const
            responsiveIdentityAfter               = await readIdentity(app, workspaceId),
            {dockModel: responsiveDockModelAfter} = await app.getComponent(workspaceId, ['dockModel']);

        expect(responsiveDockModelAfter, 'viewport projection never rewrites dockZone.v1')
            .toEqual(responsiveDockModelBefore);
        expect(responsiveDockModelAfter.nodes['split-main'].sizes).toEqual([0.6, 0.4]);
        expect(responsiveDockModelAfter.nodes['split-right'].sizes).toEqual([0.5, 0.5]);
        expect(responsiveIdentityAfter, 'viewport resizing preserves panes, Provider, and Store<Model> identities')
            .toEqual(beforeIdentity);
        expect(
            await page.evaluate(() => globalThis.__workstationResponsiveDocument === document
                && globalThis.__workstationResponsiveScalePane === document.querySelector('.workstation-scale-pane')),
            'the same document and primary pane survive every viewport'
        ).toBe(true);
        await expect.poll(async () => (await app.getComponent(workspaceId, ['feedSequence'])).feedSequence, {
            message  : 'the live feed keeps advancing through viewport-only projection changes',
            timeout  : 3000,
            intervals: [100, 250]
        }).toBeGreaterThan(feedSequenceBefore);

        const restoredGeometry = await readAtViewport({height: 1440, width: 2560});

        expect(restoredGeometry.leftBand.computedExtent)
            .toBeCloseTo(restoredGeometry.dockHost.contentInlineSize * 0.11, 1);
        expect(restoredGeometry.rightBand.computedExtent)
            .toBeCloseTo(restoredGeometry.dockHost.contentInlineSize * 0.14, 1);
        expect(restoredGeometry.bottomBand.computedExtent)
            .toBeCloseTo(restoredGeometry.dockHost.contentBlockSize * 0.17, 1);
        expect(restoredGeometry.overflowControls).toBe(1);

        await expect(tourButton).toHaveText('Start dense tour');
        await expect(themeToggle, 'one action-labelled theme toggle replaces two mode buttons').toHaveCount(1);
        await expect(themeToggle).toHaveText('Light mode');

        const headerGeometry = await page.evaluate(() => {
            const
                playElement     = document.querySelector('.workstation-tour-play'),
                captionElement  = document.querySelector('.workstation-tour-caption'),
                progressElement = document.querySelector('.workstation-tour-pips'),
                storyElement    = document.querySelector('.workstation-tour-story'),
                themeElement    = document.querySelector('.workstation-theme-button'),
                play            = playElement?.getBoundingClientRect(),
                caption         = captionElement?.getBoundingClientRect(),
                progress        = progressElement?.getBoundingClientRect(),
                story           = storyElement?.getBoundingClientRect(),
                theme           = themeElement?.getBoundingClientRect();

            return {
                captionLeft         : caption?.left,
                captionPaddingLeft  : parseFloat(getComputedStyle(captionElement).paddingLeft),
                playHeight          : play?.height,
                playRight           : play?.right,
                progressPaddingRight: parseFloat(getComputedStyle(progressElement).paddingRight),
                progressRight       : progress?.right,
                storyBackground     : getComputedStyle(storyElement).backgroundColor,
                storyHeight         : story?.height,
                storyMiddle         : story && story.top + story.height / 2,
                themeHeight         : theme?.height,
                themeMiddle         : theme && theme.top + theme.height / 2,
                themeLeft           : theme?.left
            }
        });

        expect(headerGeometry.playHeight, 'tour action uses the compact Workstation control height').toBe(34);
        expect(headerGeometry.themeHeight, 'theme action uses the compact Workstation control height').toBe(34);
        expect(headerGeometry.playHeight - headerGeometry.storyHeight, 'controls stay close to the story hierarchy')
            .toBeLessThanOrEqual(8);
        expect(Math.abs(headerGeometry.themeMiddle - headerGeometry.storyMiddle), 'controls and story remain centered')
            .toBeLessThanOrEqual(1);
        expect(headerGeometry.storyBackground, 'the story does not inherit a generic container fill')
            .toBe('rgba(0, 0, 0, 0)');
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
        expect(hoverTourBackground, 'hover remains in the Workstation signal palette').not.toBe('rgb(67, 93, 177)');

        const
            horizontalSplitter = page.locator(
                '.neo-dashboard-dock-split-horizontal > .neo-dashboard-dock-splitter-horizontal'
            ),
            verticalSplitter = page.locator(
                '.neo-dashboard-dock-split-vertical > .neo-dashboard-dock-splitter-vertical'
            ),
            darkDockRest       = await readDockChrome(page);

        await expect(horizontalSplitter, 'the horizontal document boundary projects one real splitter').toHaveCount(1);
        await expect(verticalSplitter, 'the vertical document boundary projects one real splitter').toHaveCount(1);
        expect(darkDockRest.splitterCount).toBe(5);
        expect(darkDockRest.horizontal.cursor).toBe('ew-resize');
        expect(darkDockRest.vertical.cursor).toBe('ns-resize');
        expect(darkDockRest.horizontal.background, 'the horizontal splitter is visible at rest')
            .not.toBe('rgba(0, 0, 0, 0)');
        expect(darkDockRest.vertical.background, 'the vertical splitter is visible at rest')
            .not.toBe('rgba(0, 0, 0, 0)');
        expect(darkDockRest.horizontal.handleWidth).toBe('2px');
        expect(darkDockRest.horizontal.handleHeight).toBe('36px');
        expect(darkDockRest.vertical.handleWidth).toBe('36px');
        expect(darkDockRest.vertical.handleHeight).toBe('2px');
        expect(darkDockRest.tabBody).toEqual({
            background  : 'rgba(0, 0, 0, 0)',
            borderBottom: '0px',
            borderLeft  : '0px',
            borderRight : '0px',
            borderTop   : '0px'
        });
        expect(darkDockRest.pane.borderRadius).toBe('8px');

        await horizontalSplitter.hover();
        const darkDockHover = await readDockChrome(page);

        expect(darkDockHover.horizontal.background, 'dark splitter hover strengthens the real boundary')
            .not.toBe(darkDockRest.horizontal.background);

        await themeToggle.click();
        await expect(root).toHaveClass(/neo-theme-neo-light/);
        await expect(themeToggle).toHaveText('Dark mode');

        const lightChrome = await page.evaluate(() => {
            const
                gridHeader  = document.querySelector('.workstation-scale-pane .neo-grid-header-button'),
                overflow    = document.querySelector('.neo-tab-overflow-control'),
                rowAction   = document.querySelector('.workstation-row-action'),
                story       = document.querySelector('.workstation-tour-story'),
                tourButton  = document.querySelector('.workstation-tour-play'),
                themeButton = document.querySelector('.workstation-theme-button'),
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
                storyBackground: getComputedStyle(story).backgroundColor,
                themeHeight    : themeButton.getBoundingClientRect().height,
                tourHeight     : tourButton.getBoundingClientRect().height,
                themeRipple    : rippleToken(document.querySelector('.workstation-theme-button'))
            }
        });

        expect(lightChrome.gridBackground, 'light mode does not leak the standalone grid blue')
            .not.toBe('rgb(93, 131, 167)');
        expect(lightChrome.gridColor, 'light header copy is not forced to generic white').not.toBe('rgb(255, 255, 255)');
        expect(lightChrome.overflow, 'overflow control belongs to the Workstation palette').not.toBe('rgb(67, 93, 177)');
        expect(lightChrome.overflowRipple).not.toBe('#8ba6ff');
        expect(lightChrome.rowAction, 'row actions do not use the default primary button').not.toBe('rgb(67, 93, 177)');
        expect(lightChrome.rowActionBorder).not.toBe('rgba(0, 0, 0, 0)');
        expect(lightChrome.rowActionRipple).not.toBe('#8ba6ff');
        expect(lightChrome.storyBackground, 'light mode keeps the center story transparent')
            .toBe('rgba(0, 0, 0, 0)');
        expect(lightChrome.tourHeight).toBe(34);
        expect(lightChrome.themeHeight).toBe(34);
        expect(lightChrome.themeRipple, 'theme-toggle feedback stays in the Workstation palette')
            .not.toBe('#8ba6ff');

        const lightDockRest = await readDockChrome(page);

        expect(lightDockRest.splitterCount).toBe(5);
        expect(lightDockRest.horizontal.background, 'light mode retains a visible resting splitter')
            .not.toBe('rgba(0, 0, 0, 0)');
        expect(lightDockRest.tabBody.background, 'light mode keeps the tab body out of pane chrome')
            .toBe('rgba(0, 0, 0, 0)');
        expect(lightDockRest.tabBody.borderTop).toBe('0px');
        expect(lightDockRest.pane.borderRadius).toBe('8px');

        // Neo's delegated drag listeners register after the draggable cls renders. Existing
        // dock-pointer journeys hold this known engine-tier readiness floor until the main-thread
        // registration round-trip gains an explicit completion signal.
        await page.waitForTimeout(1200);
        await horizontalSplitter.hover();
        const lightDockHover = await readDockChrome(page);

        expect(lightDockHover.horizontal.background, 'light splitter hover strengthens the real boundary')
            .not.toBe(lightDockRest.horizontal.background);

        const lightSplitterBox = await horizontalSplitter.boundingBox();

        await page.mouse.move(
            lightSplitterBox.x + lightSplitterBox.width / 2,
            lightSplitterBox.y + lightSplitterBox.height / 2
        );
        await page.mouse.down();

        const lightDockActive = await readDockChrome(page);

        expect(lightDockActive.horizontal.active, 'the real light-mode splitter owns the active pointer target')
            .toBe(true);
        expect(lightDockActive.horizontal.background, 'light splitter active feedback is distinct from hover')
            .not.toBe(lightDockHover.horizontal.background);
        expect(lightDockActive.horizontal.opacity, 'the active handle remains legible during DockSplitter drag')
            .toBe('1');
        await page.mouse.up();

        await themeToggle.click();
        await expect(root).toHaveClass(/neo-theme-neo-dark/);
        await expect(themeToggle).toHaveText('Light mode');

        expectSparklineCellFit(await readSparklineGeometry(page,'.workstation-scale-pane'));
        expectSparklineCellFit(await readSparklineGeometry(page,'.workstation-feed-pane'));

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
                scaleHeaders = readHeaders('.workstation-scale-pane'),
                feedHeaders  = readHeaders('.workstation-feed-pane'),
                heavyHeader  = [...document.querySelectorAll('.neo-tab-header-toolbar')]
                    .find(element => element.textContent?.includes('Priority Alert Observatory')),
                scaleToolbar = document.querySelector('.workstation-scale-pane .neo-grid-header-toolbar');

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
        expect(gridLayout.leftBandWidth).toBeCloseTo(restoredGeometry.leftBand.computedExtent, 1);
        expect(gridLayout.rightBandWidth, 'the stacked evidence cards get more room than the queue card')
            .toBeCloseTo(restoredGeometry.rightBand.computedExtent, 1);
        expect(feedWidths.Event / feedWidths.State,
            'Event remains the narrative column without consuming nearly the whole feed').toBeLessThanOrEqual(2.1);
        expect(feedWidths.Event / feedWidths.Value).toBeLessThanOrEqual(2.1);

        const
            {dockModel: dragModelBefore} = await app.getComponent(workspaceId, ['dockModel']),
            boundaryCount                = Object.values(dragModelBefore.nodes)
                .filter(node => node.type === 'split')
                .reduce((count, node) => count + node.children.length - 1, 0),
            edgeSplitterCount              = Object.values(dragModelBefore.nodes)
                .filter(node => node.type === 'edge-zone')
                .reduce((count, node) => count + Object.values(node.zones || {})
                    .filter(zone => zone?.resizable === true).length, 0),
            dragGeometryBefore = await readHorizontalSplitGeometry(page),
            dragIdentityBefore = await readIdentity(app, workspaceId),
            dragSplitterBox    = await horizontalSplitter.boundingBox();

        expect(boundaryCount, 'each opening-document split contributes one boundary').toBe(2);
        expect(await page.locator('.neo-dashboard-dock-split > .neo-dashboard-dock-splitter').count(),
            'the DOM owns exactly one split child per model boundary').toBe(boundaryCount);
        expect(await page.locator('.neo-dashboard-dock-splitter').count(),
            'the DOM additionally owns one splitter per resizable edge descriptor')
            .toBe(boundaryCount + edgeSplitterCount);
        expect(dragGeometryBefore.boundaryWidth).toBe(6);

        await page.evaluate(() => {
            const root = document.querySelector('.workstation-workspace');

            globalThis.__workstationPreResizeScalePane = document.querySelector('.workstation-scale-pane');
            globalThis.__workstationSplitterMotion = {
                observer: new MutationObserver(() => {
                    root.classList.contains('neo-dashboard-dock-animating')
                        && (globalThis.__workstationSplitterMotion.seen = true)
                }),
                seen: root.classList.contains('neo-dashboard-dock-animating')
            };
            globalThis.__workstationSplitterMotion.observer.observe(root, {
                attributeFilter: ['class'],
                attributes     : true
            })
        });
        await page.mouse.move(
            dragSplitterBox.x + dragSplitterBox.width / 2,
            dragSplitterBox.y + dragSplitterBox.height / 2
        );
        await page.mouse.down();

        const darkDockActive = await readDockChrome(page);

        expect(darkDockActive.horizontal.active, 'the real dark-mode splitter owns the active pointer target')
            .toBe(true);
        expect(darkDockActive.horizontal.background, 'dark splitter active feedback is distinct from hover')
            .not.toBe(darkDockHover.horizontal.background);
        await page.mouse.move(
            dragSplitterBox.x + dragSplitterBox.width / 2 + 12,
            dragSplitterBox.y + dragSplitterBox.height / 2,
            {steps: 4}
        );
        await page.mouse.move(
            dragSplitterBox.x + dragSplitterBox.width / 2 + 120,
            dragSplitterBox.y + dragSplitterBox.height / 2,
            {steps: 15}
        );
        await page.waitForTimeout(400);
        await page.mouse.up();

        await expect.poll(async () => {
            const {dockModel} = await app.getComponent(workspaceId, ['dockModel']);

            return dockModel.nodes['split-main'].sizes[0] - dragModelBefore.nodes['split-main'].sizes[0]
        }, {
            message  : 'the user drag commits a semantic resizeSplit document change',
            timeout  : 10000,
            intervals: [50, 100]
        }).toBeGreaterThan(0.02);
        await expect.poll(async () => {
            const geometry = await readHorizontalSplitGeometry(page);

            return geometry ? geometry.firstWidth - dragGeometryBefore.firstWidth : -Infinity
        }, {
            message  : 'the deferred projection applies the committed split to live DOM extents',
            timeout  : 10000,
            intervals: [50, 100]
        }).toBeGreaterThan(80);
        await expect.poll(() => page.evaluate(() => globalThis.__workstationSplitterMotion.seen), {
            message  : 'the committed splitter resize enters the shared dock-motion lifecycle',
            timeout  : 10000,
            intervals: [25, 50]
        }).toBe(true);
        await expect(root, 'splitter re-projection settles its real FLIP motion before geometry evidence')
            .not.toHaveClass(/neo-dashboard-dock-animating/);
        await expect(page.locator('.neo-dock-flip-fixed-stage'),
            'splitter motion leaves no fixed-stage presentation residue').toHaveCount(0);
        await page.evaluate(() => {
            globalThis.__workstationSplitterMotion.observer.disconnect();
            delete globalThis.__workstationSplitterMotion
        });

        const
            {dockModel: dragModelAfter} = await app.getComponent(workspaceId, ['dockModel']),
            dragGeometryAfter           = await readHorizontalSplitGeometry(page),
            dragIdentityAfter           = await readIdentity(app, workspaceId),
            dragChromeAfter             = await readTabChromeIdentity(app, workspaceId),
            scalePanePreserved          = await page.evaluate(() => globalThis.__workstationPreResizeScalePane
                === document.querySelector('.workstation-scale-pane'));

        expect(dragModelAfter.nodes['split-main'].sizes[0]).toBeGreaterThan(dragModelBefore.nodes['split-main'].sizes[0]);
        expect(dragModelAfter.nodes['split-main'].sizes[1]).toBeLessThan(dragModelBefore.nodes['split-main'].sizes[1]);
        expect(dragGeometryAfter.firstWidth - dragGeometryBefore.firstWidth).toBeGreaterThan(80);
        expect(dragGeometryBefore.secondWidth - dragGeometryAfter.secondWidth).toBeGreaterThan(80);
        expect(dragIdentityAfter, 'the user resize preserves pane, Provider, and Store<Model> identities')
            .toEqual(dragIdentityBefore);
        expect(dragChromeAfter, 'a resize preserves every opening tab surface and paired button identity')
            .toEqual(beforeChrome);
        expect(scalePanePreserved, 'the exact scale pane DOM node survives splitter re-projection').toBe(true);
        expect(await page.locator('.neo-dashboard-dock-splitter').count())
            .toBe(boundaryCount + edgeSplitterCount);
        expectSparklineCellFit(await readSparklineGeometry(page,'.workstation-scale-pane'));
        expectSparklineCellFit(await readSparklineGeometry(page,'.workstation-feed-pane'));

        // Two source-owned rails are visible and legible at workstation geometry.
        const railTabs = page.locator('.neo-dashboard-dock-rail-tab');

        await expect(railTabs).toHaveCount(2);
        expect((await railTabs.allTextContents()).map(value => value.trim()).sort())
            .toEqual(['Dependency Graph Explorer', 'Selection Inspector'].sort());

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

        const memoryItem = menuItems.filter({hasText: 'Memory Pressure Telemetry'});

        await expect(memoryItem).toHaveCount(1);
        await memoryItem.click();
        await expect(page.locator('.neo-tab-header-button.pressed:visible')
            .filter({hasText: 'Memory Pressure Telemetry'}),
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

            globalThis.__workstationDomIdentity = Object.fromEntries(
                entries.map(([key, id]) => [key, document.getElementById(id)])
            );
            globalThis.__workstationDomIdentity.scaleBody = document.querySelector(
                '.workstation-scale-pane .neo-grid-body'
            );

            return Object.values(globalThis.__workstationDomIdentity).every(Boolean)
        }, domIdentityIds), 'all permanence targets start as mounted DOM nodes').toBe(true);

        // Header buttons are deliberately excluded from this persistent DOM sample. tab.plugin.Overflow
        // removes overflowed buttons from the DOM while retaining their components, so button DOM identity
        // is not stable across an intentional overflow transition. The component matrix still covers them.
        const capturedChromeDomNodes = await page.evaluate(receipts => {
            const captured = globalThis.__workstationChromeDomIdentity = {};

            Object.entries(receipts).forEach(([nodeId, receipt]) => {
                ['containerId', 'headerId', 'bodyId', 'stripId', 'overflowControlId'].forEach(key => {
                    const id      = receipt[key],
                          element = id && document.getElementById(id);

                    element && (captured[`${nodeId}:${key}`] = element)
                });
            });

            return Object.keys(captured).length
        }, beforeChrome);

        expect(capturedChromeDomNodes, 'mounted tab chrome has a persistent structural DOM identity sample')
            .toBeGreaterThanOrEqual(initialTabNodeIds.length * 4 + 1);

        for (const sparkline of scaleSparklinesBefore) {
            await app.setProperties(sparkline.id, {usePulse: false, useTransition: false})
        }

        await page.waitForTimeout(150);

        // The explicit engine profile retains --disable-frame-rate-limit: its worker truth stays
        // live, but it exposes no presented frame to screenshots on affected headed Retina hosts.
        // The default presenting profile therefore owns the independent on-glass pixel receipt.
        const targetCanvas = page.locator(`[id="${pulseTarget.id}"]`),
              beforePixels = presentingBrowser ? await readCanvasPixels(targetCanvas) : null,
              beforeValues = pulseTarget.properties.values,
              pulseReceipt = await app.callMethod(workspaceId, 'pulseScaleSparkline', [pulseTarget.id]);

        expect(pulseReceipt.componentId).toBe(pulseTarget.id);
        expect(pulseReceipt.recordId).toBeTruthy();

        if (presentingBrowser) {
            await expect.poll(() => readCanvasPixels(targetCanvas), {
                message  : 'the exact scale Canvas changes after its worker receives new data',
                timeout  : 10000,
                intervals: [100, 250]
            }).not.toBe(beforePixels)
        }

        const pulseTargetAfter = (await readScaleSparklines(app, page))
            .find(entry => entry.id === pulseTarget.id);

        expect(pulseTargetAfter.properties.values).not.toEqual(beforeValues);

        // Frame-sample the ACTUAL screenplay path. A missing scale body is itself a blank
        // frame; when mounted, every visible row must stay populated.
        await page.evaluate(identity => {
            const
                root                = document.querySelector('.workstation-workspace'),
                initialPipCount     = root?.querySelectorAll('.workstation-pip-done').length || 0,
                initialContainerIds = [...root?.querySelectorAll('.neo-tab-container') || []]
                    .map(element => element.id),
                initialHeaderIds    = [...root?.querySelectorAll('.neo-tab-header-toolbar') || []]
                    .map(element => element.id);

            const state = globalThis.__workstationMonitor = {
                activeTabEmptyMaxMs            : 0,
                activeTabEmptySamples          : [],
                blankSamples                   : [],
                blankFrames                    : 0,
                chromeAnimationLeakFrames      : 0,
                chromeAnimationMaxTargets      : 0,
                done                           : false,
                flipSamples                    : 0,
                initialContainerIds,
                initialContainerMissingFrames  : 0,
                initialHeaderIds,
                initialHeaderMissingFrames     : 0,
                midpointSeen                   : false,
                missingBodyFrames              : 0,
                novelContainerIds              : [],
                novelHeaderIds                 : [],
                overflowControlCounts          : {},
                overflowControlDuplicateFrames : 0,
                overflowControlDuplicateSamples: [],
                palettes                       : [],
                pipCounts                      : [initialPipCount],
                pipRegressionFrames            : 0,
                railMismatchFrames             : 0,
                sampledFrames                  : 0,
                securityCaptured               : false,
                securityActiveHeaderMissFrames : 0,
                securityEnterMotionFrames      : 0,
                securityBodyMissingFrames      : 0,
                securityFullyClippedFrames     : 0,
                securityFullyClippedSamples    : [],
                securityMissingFrames          : 0,
                securityPresenceTransitions    : [],
                securityOverflowMutationFrames : 0,
                securityReplacementFrames      : 0,
                securityStageFramesByBurst     : []
            };
            const activeTabEmptySpans = {};
            let   securityNode        = null,
                  securityWasStaged   = false;

            state.securityStageBursts = 0;
            state.securityStageFrames = 0;

            const tick = () => {
                const isVisible = node => {
                    const style = getComputedStyle(node);

                    return node.getClientRects().length > 0
                        && style.display !== 'none'
                        && style.opacity !== '0'
                        && style.visibility !== 'hidden'
                };

                const root         = document.querySelector('.workstation-workspace'),
                      body         = document.querySelector('.workstation-scale-pane .neo-grid-body'),
                      railTabCount = [...document.querySelectorAll('.neo-dashboard-dock-rail-tab')]
                          .filter(isVisible).length,
                      overflowControls = [...document.querySelectorAll('.neo-tab-overflow-control')]
                          .filter(isVisible),
                      overflowControlCount = overflowControls.length,
                      currentSecurityNode = document.getElementById(identity.securityPaneId);

                if (Boolean(currentSecurityNode) !== Boolean(state.securityPresent)) {
                    state.securityPresent = Boolean(currentSecurityNode);
                    state.securityPresenceTransitions.length < 20 && state.securityPresenceTransitions.push({
                        activeHeaders: [...document.querySelectorAll('.neo-tab-header-button.pressed')]
                            .filter(isVisible)
                            .map(element => element.textContent?.trim() || ''),
                        caption : document.querySelector('.workstation-tour-caption')?.textContent?.trim() || '',
                        pipCount: root?.querySelectorAll('.workstation-pip-done').length || 0,
                        present : state.securityPresent,
                        time    : Math.round(performance.now())
                    })
                }

                if (root) {
                    const
                        activeTabEmptyIds = new Set(),
                        pipCount          = root.querySelectorAll('.workstation-pip-done').length,
                        previous          = state.pipCounts.at(-1);

                    if (pipCount !== previous) {
                        pipCount < previous && state.pipRegressionFrames++;
                        state.pipCounts.push(pipCount)
                    }

                    state.initialContainerIds.some(id => !document.getElementById(id))
                        && state.initialContainerMissingFrames++;
                    state.initialHeaderIds.some(id => !document.getElementById(id))
                        && state.initialHeaderMissingFrames++;

                    [...root.querySelectorAll('.neo-tab-container')].filter(isVisible).forEach(container => {
                        if (!state.initialContainerIds.includes(container.id)
                            && !state.novelContainerIds.includes(container.id)) {
                            state.novelContainerIds.push(container.id)
                        }
                    });

                    const visibleToolbars = [...root.querySelectorAll('.neo-tab-header-toolbar')].filter(isVisible);

                    visibleToolbars.forEach(toolbar => {
                        if (!state.initialHeaderIds.includes(toolbar.id)) {
                            state.novelHeaderIds.includes(toolbar.id) || state.novelHeaderIds.push(toolbar.id);
                        }
                    });

                    const runningChromeTargets = visibleToolbars.filter(toolbar =>
                        toolbar.getAnimations({subtree: true}).some(animation =>
                            ['delaybgcolor', 'neo-dock-tab-enter'].includes(animation.animationName)
                            && animation.playState === 'running'
                            && Number(animation.effect?.getTiming().duration) > 0
                        )
                    ).length;

                    state.chromeAnimationMaxTargets = Math.max(
                        state.chromeAnimationMaxTargets,
                        runningChromeTargets
                    );
                    runningChromeTargets > 1 && state.chromeAnimationLeakFrames++;

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

                if (overflowControlCount > 1) {
                    state.overflowControlDuplicateFrames++;

                    const sample = {
                        caption: document.querySelector('.workstation-tour-caption')?.textContent?.trim() || '',
                        owners : overflowControls.map(control => {
                            const
                                controlRect = control.getBoundingClientRect(),
                                toolbar     = [...document.querySelectorAll('.neo-tab-header-toolbar')]
                                    .filter(isVisible)
                                    .map(element => {
                                        const rect = element.getBoundingClientRect();

                                        return {
                                            distance: Math.hypot(
                                                controlRect.right - rect.right,
                                                controlRect.top + controlRect.height / 2 - (rect.top + rect.height / 2)
                                            ),
                                            element
                                        }
                                    })
                                    .sort((a, b) => a.distance - b.distance)[0]?.element,
                                container   = toolbar?.closest('.neo-tab-container');

                            return {
                                containerId: container?.id || null,
                                controlId  : control.id || null,
                                tabs       : [...toolbar?.querySelectorAll('.neo-tab-header-button') || []]
                                    .filter(isVisible)
                                    .map(element => element.textContent?.trim() || ''),
                                toolbarId: toolbar?.id || null
                            }
                        }),
                        pipCount: root?.querySelectorAll('.workstation-pip-done').length || 0
                    };

                    JSON.stringify(state.overflowControlDuplicateSamples.at(-1)) === JSON.stringify(sample)
                        || state.overflowControlDuplicateSamples.length >= 20
                        || state.overflowControlDuplicateSamples.push(sample)
                }

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

                if (currentSecurityNode) {
                    const
                        securityBody = currentSecurityNode.closest('.neo-tab-body-container'),
                        staged       = currentSecurityNode.classList.contains('neo-dock-flip-fixed-stage'),
                        activeHeader = securityBody?.closest('.neo-tab-container')
                            ?.querySelector('.neo-tab-header-button.pressed');

                    if (staged) {
                        const
                            bodyStyle = securityBody && getComputedStyle(securityBody),
                            rect      = currentSecurityNode.getBoundingClientRect(),
                            insetX    = Math.min(8, rect.width / 4),
                            insetY    = Math.min(8, rect.height / 4),
                            points    = [
                                [rect.left + rect.width / 2, rect.top + rect.height / 2],
                                [rect.left + insetX, rect.top + insetY],
                                [rect.right - insetX, rect.top + insetY],
                                [rect.left + insetX, rect.bottom - insetY],
                                [rect.right - insetX, rect.bottom - insetY]
                            ].filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight),
                            painted = points.some(([x, y]) => {
                                const hit = document.elementFromPoint(x, y);

                                return hit === currentSecurityNode || currentSecurityNode.contains(hit)
                            });

                        if (!securityWasStaged) {
                            state.securityStageBursts++;
                            state.securityStageFramesByBurst.push(0)
                        }

                        state.securityStageFrames++;
                        state.securityStageFramesByBurst[state.securityStageFramesByBurst.length - 1]++;

                        if (!securityBody) state.securityBodyMissingFrames++;
                        if (!activeHeader || !isVisible(activeHeader)) state.securityActiveHeaderMissFrames++;
                        if (bodyStyle?.overflowX !== 'hidden' || bodyStyle?.overflowY !== 'hidden') {
                            state.securityOverflowMutationFrames++
                        }

                        if (!painted) {
                            const
                                nodeStyle  = getComputedStyle(currentSecurityNode),
                                parentRect = currentSecurityNode.parentElement?.getBoundingClientRect();

                            state.securityFullyClippedFrames++;
                            state.securityFullyClippedSamples.length < 20
                                && state.securityFullyClippedSamples.push({
                                    bottom           : Math.round(rect.bottom),
                                    burst            : state.securityStageBursts,
                                    caption          : document.querySelector('.workstation-tour-caption')?.textContent?.trim() || '',
                                    computedTransform: nodeStyle.transform,
                                    connected        : currentSecurityNode.isConnected,
                                    display          : nodeStyle.display,
                                    frameInBurst     : state.securityStageFramesByBurst.at(-1),
                                    height           : Math.round(rect.height),
                                    inlineTransform  : currentSecurityNode.style.transform,
                                    left             : Math.round(rect.left),
                                    parentRect       : parentRect && {
                                        height: Math.round(parentRect.height),
                                        left  : Math.round(parentRect.left),
                                        top   : Math.round(parentRect.top),
                                        width : Math.round(parentRect.width)
                                    },
                                    position : nodeStyle.position,
                                    right    : Math.round(rect.right),
                                    stagePins: {
                                        height: currentSecurityNode.style.height,
                                        left  : currentSecurityNode.style.left,
                                        top   : currentSecurityNode.style.top,
                                        width : currentSecurityNode.style.width
                                    },
                                    top  : Math.round(rect.top),
                                    width: Math.round(rect.width)
                                })
                        }
                    }

                    if (!staged && getComputedStyle(currentSecurityNode).transform !== 'none') {
                        state.securityEnterMotionFrames++
                    }

                    securityWasStaged = staged
                } else {
                    securityWasStaged = false
                }

                if (root) {
                    const palette = getComputedStyle(root).backgroundColor;

                    state.palettes.includes(palette) || state.palettes.push(palette);

                    if ([...root.querySelectorAll('[class*="workstation-pane-"]')]
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

        await page.click('.workstation-tour-play');
        await expect.poll(async () => Boolean(await app.callMethod(workspaceId, 'getTourReceipt')), {
            message  : 'the native tour button settles document and surface tiers',
            timeout  : 30000,
            intervals: [100, 250]
        }).toBe(true);

        const tourReceipt        = await app.callMethod(workspaceId, 'getTourReceipt'),
              canvasFailureState = tourReceipt.completed ? [] : await readScaleSparklines(app, page),
              monitor            = await page.evaluate(async () => {
                  globalThis.__workstationMonitor.done = true;
                  await new Promise(resolve => requestAnimationFrame(resolve));
                  return globalThis.__workstationMonitor
              });

        expect(tourReceipt.completed,
            `tour errors: ${JSON.stringify(tourReceipt.errors)}; visible Canvas state: ${JSON.stringify(canvasFailureState)}`)
            .toBe(true);
        expect(tourReceipt.errors).toEqual([]);
        expect(tourReceipt.cueReceipts.map(entry => entry.cue.type))
            .toEqual([
                'overflow',
                'scroll',
                'cross-zone-showcase',
                'canvas-update',
                'theme',
                'theme'
            ]);
        expect(tourReceipt.cueReceipts.find(entry => entry.cue.type === 'overflow').receipt)
            .toMatchObject({activatedItemId: 'security'});
        expect(tourReceipt.cueReceipts.find(entry => entry.cue.type === 'overflow').receipt.menuItemCount)
            .toBeGreaterThan(0);
        const crossZoneReceipt = tourReceipt.cueReceipts
            .find(entry => entry.cue.type === 'cross-zone-showcase').receipt;

        expect(crossZoneReceipt.errors).toEqual([]);
        expect(crossZoneReceipt.applied, 'the visible tour commits the final live candidate').toBe(true);
        expect(crossZoneReceipt.beatLog.map(({placementKind, targetNodeId}) => ({placementKind, targetNodeId})))
            .toEqual([
                {placementKind: 'edge-bottom', targetNodeId: 'scale-tabs'},
                {placementKind: 'tab-into',    targetNodeId: 'right-bottom-tabs'}
            ]);
        expect(crossZoneReceipt.proof.descriptor).toEqual({
            operation : 'addTab',
            itemId    : 'audit',
            tabsNodeId: 'right-bottom-tabs',
            index     : null
        });
        expect(crossZoneReceipt.proof.documentMatchesPreview,
            'the visible drop equals the captured preview operation').toBe(true);
        expect(crossZoneReceipt.proof.overlaysRetired,
            'the drop leaves no indicator, preview, or geometry residue').toBe(true);
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
        expect(tourReceipt.document.nodes['right-top-tabs'].items).toEqual(['metrics']);
        expect(tourReceipt.document.nodes['right-bottom-tabs'].items).toEqual(['commits', 'audit']);
        expect(tourReceipt.document.nodes['split-main'].sizes, 'the visible tour demonstrates resizeSplit')
            .toEqual([0.52, 0.48]);

        expect(monitor.sampledFrames).toBeGreaterThan(10);
        expect(monitor.midpointSeen, 'rAF sampling observes the live midpoint scroll').toBe(true);
        expect(monitor.pipCounts, 'every settled beat paints once, in order')
            .toEqual(Array.from({length: workstationTourScript.scenes.flatMap(scene => scene.steps).length + 1}, (_, index) => index));
        expect(monitor.pipRegressionFrames, 'progress never fills early and jumps backward').toBe(0);
        expect(monitor.initialContainerIds).toHaveLength(initialTabNodeIds.length);
        expect(monitor.initialHeaderIds).toHaveLength(initialTabNodeIds.length);
        expect(monitor.initialContainerMissingFrames,
            'every surviving tab.Container remains in the DOM through all projections').toBe(0);
        expect(monitor.initialHeaderMissingFrames,
            'every surviving header toolbar remains in the DOM through all projections').toBe(0);
        expect(monitor.novelContainerIds, 'splitNode creates exactly one genuine temporary tab surface').toHaveLength(1);
        expect(monitor.novelHeaderIds, 'that temporary surface creates exactly one genuine new header').toHaveLength(1);
        expect(monitor.chromeAnimationMaxTargets,
            'operation-correlated chrome motion is scoped to at most one logical header').toBeLessThanOrEqual(1);
        expect(monitor.chromeAnimationLeakFrames,
            'coarse projection never replays construction or entry motion across multiple headers').toBe(0);
        expect(monitor.activeTabEmptyMaxMs,
            `no visible active tab exposes a sustained empty paint: ${JSON.stringify(monitor.activeTabEmptySamples)}`)
            .toBeLessThan(17);
        expect(monitor.missingBodyFrames, 'the preserved scale body never leaves the DOM between projections').toBe(0);
        expect(monitor.blankFrames,
            `no mounted visible scale row goes blank during choreography: ${JSON.stringify(monitor.blankSamples)}`)
            .toBe(0);
        expect(monitor.railMismatchFrames, 'both real rails remain present through every sampled frame').toBe(0);
        expect(monitor.overflowControlDuplicateFrames,
            `the projection never leaks duplicate overflow controls: counts=${JSON.stringify(monitor.overflowControlCounts)} ` +
            `samples=${JSON.stringify(monitor.overflowControlDuplicateSamples)}`)
            .toBe(0);
        expect(monitor.overflowControlCounts['1'], 'the real overflow state is observed').toBeGreaterThan(0);
        expect(monitor.securityCaptured, 'the overflow cue mounts Security before its structural move').toBe(true);
        expect(monitor.securityMissingFrames,
            `the active Security pane never leaves the DOM after capture: ${JSON.stringify(monitor.securityPresenceTransitions)}`)
            .toBe(0);
        expect(monitor.securityReplacementFrames, 'Security keeps the same DOM node across split and return').toBe(0);
        expect(monitor.securityStageBursts,
            'only the return crossing stages: the split promotes a never-presented card (entering, unstaged)').toBe(1);
        expect(monitor.securityEnterMotionFrames,
            'the promoted never-presented pane presents its entering grow-in without a fixed stage')
            .toBeGreaterThan(0);
        expect(monitor.securityStageFramesByBurst, 'the sequential sampler isolates the return stage')
            .toHaveLength(1);
        expect(monitor.securityStageFramesByBurst[0], 'the return stage spans multiple sequential samples')
            .toBeGreaterThan(1);
        expect(monitor.securityStageFrames).toBe(monitor.securityStageFramesByBurst.reduce((sum, count) => sum + count, 0));
        expect(monitor.securityBodyMissingFrames,
            'fixed staging keeps the exact pane inside its real destination body').toBe(0);
        expect(monitor.securityActiveHeaderMissFrames,
            'every staged frame retains a visible active tab header').toBe(0);
        expect(monitor.securityOverflowMutationFrames,
            'the real tab-body overflow contract stays hidden throughout the staged return').toBe(0);
        expect(monitor.securityFullyClippedFrames,
            `every staged frame paints pane content: ${JSON.stringify(monitor.securityFullyClippedSamples)}`).toBe(0);
        expect(monitor.palettes.length, 'the actual tour materially renders both theme palettes').toBeGreaterThanOrEqual(2);
        expect(monitor.flipSamples, 'committed transformations emit visible FLIP motion').toBeGreaterThan(0);
        await expect(page.locator('.workstation-workspace'))
            .not.toHaveClass(/neo-dashboard-dock-animating/);
        await expect(page.locator('.neo-dock-flip-fixed-stage'),
            'fixed staging leaves no class or active presentation residue').toHaveCount(0);
        await expect(page.locator('.neo-tab-overflow-control:visible'),
            'the returned twelve-tab group restores its one real overflow control').toHaveCount(1);

        // Two fresh document-tier spec runs remain byte-identical; the real-button receipt above
        // is the separate authority for asynchronous surface cues.
        const run1 = await app.callMethod(workspaceId, 'runTourSpec', [null, {restoreDocument: true}]),
              run2 = await app.callMethod(workspaceId, 'runTourSpec', [null, {restoreDocument: true}]);

        expect(run1.completed, `run 1 errors: ${JSON.stringify(run1.errors)}`).toBe(true);
        expect(run1.errors).toEqual([]);
        expect(run1.log).toHaveLength(workstationTourScript.scenes.flatMap(scene => scene.steps).length);
        expect(run1.log.filter(entry => entry.type === 'op').map(entry => entry.operation))
            .toEqual(['resizeSplit', 'splitNode', 'addTab']);
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

        const
            postTourChrome         = await readTabChromeIdentity(app, workspaceId),
            expectedPostTourChrome = {
                ...beforeChrome,
                'right-top-tabs': {
                    ...beforeChrome['right-top-tabs'],
                    buttons: {metrics: beforeChrome['right-top-tabs'].buttons.metrics}
                },
                'right-bottom-tabs': {
                    ...beforeChrome['right-bottom-tabs'],
                    buttons: {
                        ...beforeChrome['right-bottom-tabs'].buttons,
                        audit: beforeChrome['right-top-tabs'].buttons.audit
                    }
                }
            };

        const
            postTourDocument = (await app.getDockTopology(workspaceId)).document,
            postTourReceipt  = await app.callMethod(workspaceId, 'getTourReceipt', []),
            crossZoneCue     = postTourReceipt?.cueReceipts
                ?.find(entry => entry.cue?.type === 'cross-zone-showcase')?.receipt;

        expect(postTourChrome,
            'cross-zone + split/return preserve every chrome identity while Audit changes owner — ' +
            `document right-top=${JSON.stringify(postTourDocument.nodes['right-top-tabs']?.items)} ` +
            `right-bottom=${JSON.stringify(postTourDocument.nodes['right-bottom-tabs']?.items)} ` +
            `cueApplied=${crossZoneCue?.applied} ` +
            `cueDocAfter right-top=${JSON.stringify(crossZoneCue?.proof?.documentAfter?.nodes?.['right-top-tabs']?.items)} ` +
            `right-bottom=${JSON.stringify(crossZoneCue?.proof?.documentAfter?.nodes?.['right-bottom-tabs']?.items)}`)
            .toEqual(expectedPostTourChrome);

        const indicatorSetup = await page.evaluate(receipt => {
            const
                strip     = document.getElementById(receipt.stripId),
                indicator = strip?.querySelector('.neo-active-tab-indicator'),
                parseTime = value => value.endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000,
                durations = indicator
                    ? getComputedStyle(indicator).transitionDuration.split(',').map(value => parseTime(value.trim()))
                    : [];

            if (!indicator) return null;

            const state = globalThis.__workstationIndicatorMotion = {
                ends      : 0,
                properties: [],
                runs      : 0
            };

            indicator.addEventListener('transitionrun', event => {
                if (event.target === indicator) {
                    state.runs++;
                    state.properties.includes(event.propertyName) || state.properties.push(event.propertyName)
                }
            });
            indicator.addEventListener('transitionend', event => {
                event.target === indicator && state.ends++
            });

            return {
                durationMs : Math.max(0, ...durations),
                indicatorId: indicator.id || null
            }
        }, postTourChrome['heavy-tabs']);

        expect(indicatorSetup?.durationMs, 'the ordinary indicator keeps a non-zero theme transition')
            .toBeGreaterThan(0);

        const nextVisibleHeavyTab = page.locator(
            `[id="${postTourChrome['heavy-tabs'].headerId}"] .neo-tab-header-button:visible:not(.pressed)`
        ).first();

        await expect(nextVisibleHeavyTab, 'the returned dense group exposes another direct tab target').toBeVisible();
        await nextVisibleHeavyTab.click();
        await expect.poll(() => page.evaluate(() => globalThis.__workstationIndicatorMotion?.runs || 0), {
            message  : 'ordinary active-tab input starts the standard indicator transition',
            timeout  : 5000,
            intervals: [25, 50]
        }).toBeGreaterThan(0);
        await expect.poll(() => page.evaluate(() => globalThis.__workstationIndicatorMotion?.ends || 0), {
            message  : 'the standard indicator transition completes on the retained strip DOM node',
            timeout  : 5000,
            intervals: [25, 50]
        }).toBeGreaterThan(0);
        await expect(root).not.toHaveClass(/neo-dashboard-dock-animating/);

        const
            afterIdentity        = await readIdentity(app, workspaceId),
            afterChrome          = await readTabChromeIdentity(app, workspaceId),
            scaleSparklinesAfter = await readScaleSparklines(app, page);

        expect(afterIdentity, 'workspace, heavy pane, data panes, Provider, and stores survive all transformations')
            .toEqual(beforeIdentity);
        expect(afterChrome, 'ordinary active-tab input also preserves every tab-chrome component identity')
            .toEqual(postTourChrome);
        expect(scaleSparklinesAfter.length, 'the viewport-bounded scale component pool remains live')
            .toBeGreaterThan(0);
        expect(stableScaleComponentIds.every(id => scaleSparklinesAfter.some(entry => entry.id === id)),
            'the exact components exercised before and during transformation preserve identity').toBe(true);
        const domIdentityState = await page.evaluate(ids => ({
            ...Object.fromEntries(Object.entries(ids).map(([key, id]) => [
                key,
                globalThis.__workstationDomIdentity?.[key] === document.getElementById(id)
            ])),
            scaleBody: globalThis.__workstationDomIdentity?.scaleBody
                === document.querySelector('.workstation-scale-pane .neo-grid-body')
        }), domIdentityIds);
        const chromeDomIdentityState = await page.evaluate(() => {
            const entries    = Object.entries(globalThis.__workstationChromeDomIdentity || {}),
                  mismatches = entries
                      .filter(([, element]) => element !== document.getElementById(element.id))
                      .map(([key, element]) => ({id: element.id, key}));

            return {
                count: entries.length,
                mismatches
            }
        });

        expect(domIdentityState, 'the exact always-mounted pane, body, and Canvas DOM nodes survive every projection')
            .toEqual({canvas: true, feedPane: true, scaleBody: true, scalePane: true});
        expect(chromeDomIdentityState, 'every sampled structural chrome DOM node remains the exact same object')
            .toEqual({count: capturedChromeDomNodes, mismatches: []});
        expect(scaleSparklinesAfter.every(entry => entry.properties?.offscreenRegistered),
            'the preserved scale Canvas pool is registered after the final projection').toBe(true);
        expectSparklineCellFit(await readSparklineGeometry(page,'.workstation-scale-pane'));
        expectSparklineCellFit(await readSparklineGeometry(page,'.workstation-feed-pane'));
        expect(runtimeErrors, 'no global error or unhandled rejection across the journey').toEqual([]);
        expect(pageErrors, 'no Playwright pageerror across the journey').toEqual([])
    });

    test('the body-mounted overflow menu carries live Workstation theme and skin', async ({page, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-workspace', {timeout: 30000});
        await page.waitForSelector('.neo-tab-overflow-control', {timeout: 30000});

        const
            app        = await neuralLink.connectToApp('Workstation'),
            workspaces = asArray(await app.findInstances(
                {className: 'Workstation.view.Workspace'},
                ['id']
            )),
            workspaceId = workspaces[0]?.id,
            root        = page.locator('.workstation-workspace'),
            control     = page.locator('.neo-tab-overflow-control'),
            heavyToolbar = page.locator('.neo-tab-header-toolbar')
                .filter({hasText: 'Priority Alert Observatory'});

        expect(workspaces).toHaveLength(1);
        expect(workspaceId).toBeTruthy();
        await expect(control).toHaveCount(1);
        await expect(heavyToolbar).toHaveCount(1);
        expect(await page.evaluate(() =>
            document.querySelector('.neo-tab-overflow-control')?.parentElement === document.body
        ), 'the themed control remains a floating direct-body child').toBe(true);

        await control.click();

        const
            menu       = page.locator('.neo-tab-overflow-menu:visible'),
            menuItems  = menu.locator('.neo-list-item').filter({hasText: /\S/}),
            memoryItem = menuItems.filter({hasText: 'Memory Pressure Telemetry'});

        await expect(menu, 'the menu exposes its app-neutral product-skin identity').toHaveCount(1);
        await expect(menuItems.first()).toBeVisible({timeout: 10000});
        expect(await menuItems.count()).toBeGreaterThan(0);
        await expect(memoryItem).toHaveCount(1);

        const
            controlId   = await control.getAttribute('id'),
            darkRuntime = await app.getComponent(controlId, [
                'menuList.id',
                'menuList.theme',
                'parentId',
                'theme'
            ]),
            darkSkin    = await readOverflowMenuSkin(page);

        expect(darkRuntime.parentId).toBe('document.body');
        expect(darkRuntime.theme).toBe('neo-theme-neo-dark');
        expect(darkRuntime['menuList.id']).toBeTruthy();
        expect(darkRuntime['menuList.theme']).toBe('neo-theme-neo-dark');
        expect(darkSkin.parentIsBody).toBe(true);
        expect(darkSkin.controlThemeClasses).toEqual(['neo-theme-neo-dark']);
        expect(darkSkin.menuThemeClasses).toEqual(['neo-theme-neo-dark']);
        expect(darkSkin.tokens).toEqual({
            background: '#1a212c',
            hover     : 'color-mix(in srgb, #5eead4 14%, #1a212c)',
            icon      : '#8b97a8',
            ink       : '#d6dce6'
        });
        expect(darkSkin.menu.background).not.toBe('rgba(0, 0, 0, 0)');
        expect(darkSkin.menu.borderStyle).toBe('solid');
        expect(darkSkin.menu.borderWidth).toBe('1px');
        expect(darkSkin.menu.boxShadow).not.toBe('none');
        expect(darkSkin.menu.fontSize).toBe('12px');
        expect(darkSkin.item.height).toBe('30px');
        expect(darkSkin.item.paddingLeft).toBe('10px');
        expect(darkSkin.item.paddingRight).toBe('10px');
        expect(darkSkin.item.fontFamily).toContain('ui-monospace');
        expect(darkSkin.contrast.text, 'dark menu text keeps WCAG AA contrast').toBeGreaterThanOrEqual(4.5);
        expect(darkSkin.contrast.icon, 'dark menu icons keep non-text contrast').toBeGreaterThanOrEqual(3);

        await memoryItem.hover();
        const hoverBackground = await memoryItem.evaluate(element => getComputedStyle(element).backgroundColor);

        expect(hoverBackground, 'hover visibly strengthens the row').not.toBe(darkSkin.item.background);

        await memoryItem.focus();
        const focusStyle = await memoryItem.evaluate(element => {
            const style = getComputedStyle(element);

            return {
                color: style.outlineColor,
                style: style.outlineStyle,
                width: style.outlineWidth
            }
        });

        expect(focusStyle.style).toBe('solid');
        expect(focusStyle.width).toBe('1px');
        expect(focusStyle.color).not.toBe('rgba(0, 0, 0, 0)');

        await app.callMethod(workspaceId, 'setWorkspaceTheme', ['neo-theme-neo-light']);
        await expect(root).toHaveClass(/neo-theme-neo-light/);
        await expect(control).toHaveClass(/neo-theme-neo-light/);
        await expect(control).not.toHaveClass(/neo-theme-neo-dark/);
        await expect(menu).toHaveClass(/neo-theme-neo-light/);
        await expect(menu).not.toHaveClass(/neo-theme-neo-dark/);

        const
            lightRuntime = await app.getComponent(controlId, ['menuList.theme', 'theme']),
            lightSkin    = await readOverflowMenuSkin(page);

        expect(lightRuntime.theme).toBe('neo-theme-neo-light');
        expect(lightRuntime['menuList.theme']).toBe('neo-theme-neo-light');
        expect(lightSkin.controlThemeClasses).toEqual(['neo-theme-neo-light']);
        expect(lightSkin.menuThemeClasses).toEqual(['neo-theme-neo-light']);
        expect(lightSkin.tokens).toEqual({
            background: '#f7f9fc',
            hover     : 'color-mix(in srgb, #0f766e 14%, #f7f9fc)',
            icon      : '#5a6b80',
            ink       : '#1f2733'
        });
        expect(lightSkin.menu.background).not.toBe(darkSkin.menu.background);
        expect(lightSkin.item.color).not.toBe(darkSkin.item.color);
        expect(lightSkin.menu.fontSize).toBe('12px');
        expect(lightSkin.item.height).toBe('30px');
        expect(lightSkin.contrast.text, 'light menu text keeps WCAG AA contrast').toBeGreaterThanOrEqual(4.5);
        expect(lightSkin.contrast.icon, 'light menu icons keep non-text contrast').toBeGreaterThanOrEqual(3);

        await app.callMethod(workspaceId, 'setWorkspaceTheme', ['neo-theme-neo-dark']);
        await expect(root).toHaveClass(/neo-theme-neo-dark/);
        await expect(control).toHaveClass(/neo-theme-neo-dark/);
        await expect(control).not.toHaveClass(/neo-theme-neo-light/);
        await expect(menu).toHaveClass(/neo-theme-neo-dark/);
        await expect(menu).not.toHaveClass(/neo-theme-neo-light/);

        await memoryItem.click();
        await expect(page.locator('.neo-tab-header-button.pressed:visible')
            .filter({hasText: 'Memory Pressure Telemetry'}),
        'ordinary activeIndex still surfaces the selected hidden resident').toHaveCount(1)
    })
});
