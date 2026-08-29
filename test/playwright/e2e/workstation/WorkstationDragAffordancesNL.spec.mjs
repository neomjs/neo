import {test, expect}                                                                       from '../../fixtures.mjs';
import {assertAffordanceContainment, assertBootContainmentChain, assertChipHeaderExclusion} from '../utils/dockGeometry.mjs';
import {isFilmTake}                                                                         from '../utils/gpuIntent.mjs';

const filmTake = isFilmTake();

/**
 * Whitebox-e2e: the FLAGSHIP's drag-affordance journey — the durable real-pointer proof
 * that the workstation's composition of the shared gesture controller renders the full
 * affordance language and commits release truth on the dense 20-pane surface.
 *
 * Product truths proven against the running workstation:
 * 1. a real tab-header pointer drag LIGHTS the indicator menu and the zone preview on the
 *    flagship (the capability the standalone app never had);
 * 2. releasing at a zone center commits exactly that zone's tab-into through the reducer
 *    (App-Worker document truth) — release truth on the flagship;
 * 3. the preview design-language switch re-skins the affordances LIVE mid-gesture
 *    (`previewLanguage: 'signal'` → the signal chroma on the accepted zone treatment) —
 *    the switch and the affordances finally exist on the same surface.
 *
 * Run: NEO_E2E_PORT=8096 npx playwright test WorkstationDragAffordancesNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */

test.describe('Workstation drag affordances — the flagship journey (Neural Link)', () => {
    test.setTimeout(120000);

    /**
     * Boots the flagship, connects the bridge, and resolves ids + zone geometry.
     * @param {Object} page
     * @param {Object} neuralLink
     * @returns {Promise<Object>}
     */
    async function bootFlagship(page, neuralLink) {
        await page.goto('/apps/workstation/index.html');

        await page.waitForSelector('.workstation-dock-host',              {timeout: 60000});
        await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});
        await page.evaluate(() => document.fonts.ready);

        // LAYOUT readiness, not DOM presence: dev-mode styles land after the elements do,
        // and a drag against the collapsed frame measures zero-area zones (the controller
        // self-heals per frame, but the journey must assert against the settled surface).
        // The gate covers the host AND a projected zone — panes hydrate async, so the host
        // can reach full height while individual tab zones still measure 0×0.
        await page.waitForFunction(() => {
            const host = document.querySelector('.workstation-dock-host');
            const zone = [...document.querySelectorAll('.neo-dashboard-dock-tabs')]
                .find(el => el.querySelector('.neo-grid-container'));
            return host && host.getBoundingClientRect().height > 300
                && zone && zone.getBoundingClientRect().height > 100
        }, {timeout: 60000});

        const app        = await neuralLink.connectToApp('Workstation');
        const workspaces = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']);
        const wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(wsId, 'the Workspace must exist in the App Worker').toBeTruthy();

        // the scale zone (left column of the dense layout) is the drop target
        const scaleBox = await page.evaluate(() => {
            const zone = [...document.querySelectorAll('.neo-dashboard-dock-tabs')]
                .find(el => el.querySelector('.neo-grid-container'));
            const r = zone.getBoundingClientRect();
            return {x: r.x, y: r.y, width: r.width, height: r.height}
        });

        return {app, scaleBox, wsId}
    }

    /**
     * Real pointer drag of the Audit tab, parked at the target point (arming cleared, the
     * move stream settled).
     * @param {Object} page
     * @param {Object} target {x, y}
     */
    async function parkAuditDrag(page, target) {
        const header = page.locator('.neo-tab-header-button', {hasText: 'Audit'}).first();

        await expect(header).toBeVisible();

        const box = await header.boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 12, {steps: 4});
        await expect(page.locator('.neo-tab-header-toolbar.neo-is-dragging')).toBeVisible();
        await page.mouse.move(target.x, target.y, {steps: 15});
        await page.waitForTimeout(300);

        // Park with a micro-jiggle: a real hand is never frame-perfect still, and the
        // controller's geometry self-heal is per-move-frame by design — a parked pointer
        // emits no frames, so the settle must not depend on exactly one measurement.
        for (const dx of [2, -2, 1]) {
            await page.mouse.move(target.x + dx, target.y, {steps: 1});
            await page.waitForTimeout(120)
        }
        await page.waitForTimeout(300)
    }

    /**
     * @summary Starts an ordinary real-pointer Audit-tab drag and returns its source geometry.
     * @param {Object} page
     * @returns {Promise<Object>}
     */
    async function startAuditDrag(page) {
        const header = page.locator('.neo-tab-header-button', {hasText: 'Audit'}).first();

        await expect(header).toBeVisible();

        const box = await header.boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 12, {steps: 4});
        await expect(page.locator('.neo-tab-header-toolbar.neo-is-dragging')).toBeVisible();
        await expect(page.locator('.neo-dock-dragproxy')).toBeVisible();

        return box
    }

    /**
     * @summary Moves the active real-pointer drag to one stable observation position.
     * @param {Object} page
     * @param {{x: Number, y: Number}} target
     */
    async function parkActivePointer(page, target) {
        await page.mouse.move(target.x, target.y, {steps: 12});

        for (const dx of [2, -2, 1]) {
            await page.mouse.move(target.x + dx, target.y, {steps: 1});
            await page.waitForTimeout(80)
        }

        await page.waitForTimeout(250)
    }

    /**
     * @summary Reads the ordinary dock tab proxy's body-mount, theme identity, geometry, and painted treatment.
     * @param {Object} page
     * @returns {Promise<Object|null>}
     */
    async function readDockProxyTreatment(page) {
        return page.evaluate(() => {
            const
                proxy = [...document.querySelectorAll('.neo-dock-dragproxy')]
                    .find(element => element.getClientRects().length > 0),
                parseColor = value => {
                    const channels = value?.match(/[\d.]+/g)?.map(Number) || [];

                    return {
                        alpha: channels.length > 3 ? channels[3] : 1,
                        rgb  : channels.slice(0, 3)
                    }
                },
                luminance = value => {
                    const {rgb} = parseColor(value);

                    return rgb.map(channel => {
                        channel /= 255;
                        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
                    }).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0)
                },
                contrast = (foreground, background) => {
                    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);

                    return (values[0] + .05) / (values[1] + .05)
                };

            if (!proxy) return null;

            const
                content     = proxy.querySelector('.neo-tab-header-button') || proxy,
                text        = proxy.querySelector('.neo-button-text') || content,
                icon        = proxy.querySelector('.neo-button-glyph'),
                proxyRect   = proxy.getBoundingClientRect(),
                proxyStyle  = getComputedStyle(proxy),
                contentRect = content.getBoundingClientRect(),
                textStyle   = getComputedStyle(text),
                iconStyle   = icon && getComputedStyle(icon);

            return {
                classes    : [...proxy.classList],
                contentRect: {
                    height: contentRect.height,
                    width : contentRect.width
                },
                contrast   : {
                    glyph: iconStyle ? contrast(iconStyle.color, proxyStyle.backgroundColor) : null,
                    text : contrast(textStyle.color, proxyStyle.backgroundColor)
                },
                parentIsBody: proxy.parentElement === document.body,
                rect        : {
                    height: proxyRect.height,
                    left  : proxyRect.left,
                    top   : proxyRect.top,
                    width : proxyRect.width
                },
                style       : {
                    background     : proxyStyle.backgroundColor,
                    backgroundAlpha: parseColor(proxyStyle.backgroundColor).alpha,
                    borderColor    : proxyStyle.borderColor,
                    borderRadius   : proxyStyle.borderRadius,
                    borderStyle    : proxyStyle.borderStyle,
                    borderWidth    : proxyStyle.borderWidth,
                    boxShadow      : proxyStyle.boxShadow,
                    glyphColor     : iconStyle?.color || null,
                    textColor      : textStyle.color
                },
                tokens      : {
                    border: proxyStyle.getPropertyValue('--agent-dock-proxy-border').trim(),
                    ground: proxyStyle.getPropertyValue('--agent-dock-proxy-ground').trim(),
                    shadow: proxyStyle.getPropertyValue('--agent-dock-proxy-shadow').trim(),
                    text  : proxyStyle.getPropertyValue('--agent-dock-proxy-text').trim()
                }
            }
        })
    }

    /**
     * Reads the browser's painted overlay geometry while Neural Link owns interaction truth.
     * @summary Captures the fix-critical containing-block and rect contract without creating a shared helper.
     * @param {Object} page
     * @returns {Promise<Object>}
     */
    async function readParkedOverlayGeometry(page) {
        return page.evaluate(() => {
            const
                dockHost       = document.querySelector('.workstation-dock-host'),
                indicatorLayer = document.querySelector('.neo-dashboard-dock-drop-indicators'),
                previewLayer   = document.querySelector('.neo-dock-preview'),
                targetZone     = [...document.querySelectorAll('.neo-dashboard-dock-tabs')]
                    .find(element => element.querySelector('.neo-grid-container')),
                readRect       = element => {
                    const rect = element?.getBoundingClientRect();

                    return rect && {
                        bottom: rect.bottom,
                        height: rect.height,
                        left  : rect.left,
                        right : rect.right,
                        top   : rect.top,
                        width : rect.width
                    }
                };

            return {
                dockHost               : readRect(dockHost),
                dockHostId             : dockHost.id,
                hostPosition           : getComputedStyle(dockHost).position,
                indicatorLayer         : readRect(indicatorLayer),
                indicatorOffsetParentId: indicatorLayer.offsetParent?.id,
                indicatorZIndex        : Number.parseInt(getComputedStyle(indicatorLayer).zIndex, 10),
                previewAffordance      : readRect(document.querySelector('.neo-dock-preview-affordance')),
                previewLayer           : readRect(previewLayer),
                previewOffsetParentId  : previewLayer.offsetParent?.id,
                previewPointerEvents   : getComputedStyle(previewLayer).pointerEvents,
                previewZIndex          : Number.parseInt(getComputedStyle(previewLayer).zIndex, 10),
                targetZone             : readRect(targetZone),
                topChip                : readRect(document.querySelector(
                    '.neo-dashboard-dock-drop-chip-top:not(.neo-dashboard-dock-drop-indicator-off)'
                )),
                tourbar          : readRect(document.querySelector('.workstation-tourbar')),
                visibleIndicators: [...document.querySelectorAll(
                    '.neo-dashboard-dock-drop-indicator:not(.neo-dashboard-dock-drop-indicator-off),'
                    + '.neo-dashboard-dock-drop-chip:not(.neo-dashboard-dock-drop-indicator-off)'
                )].map(readRect)
            }
        })
    }

    test('the parked affordances stay inside the dock positioning host', async ({page, neuralLink}) => {
        const {app, scaleBox} = await bootFlagship(page, neuralLink);
        const center          = {x: scaleBox.x + scaleBox.width / 2, y: scaleBox.y + scaleBox.height / 2};

        await parkAuditDrag(page, center);

        const
            indicators = await app.findInstances({className: 'Neo.dashboard.dock.interaction.DropIndicators'}, ['id']),
            indId      = (Array.isArray(indicators) ? indicators[0] : indicators)?.id,
            indState   = await app.getComponent(indId, ['candidateSet', 'mounted']),
            geometry   = await readParkedOverlayGeometry(page),
            within     = (inner, outer) => inner.left >= outer.left - 1
                && inner.top >= outer.top - 1
                && inner.right <= outer.right + 1
                && inner.bottom <= outer.bottom + 1,
            intersects = (first, second) => first.left < second.right
                && first.right > second.left
                && first.top < second.bottom
                && first.bottom > second.top;

        expect(indState?.candidateSet, 'worker truth built the candidate set before geometry truth').toBeTruthy();
        expect(geometry.hostPosition, 'the dock host establishes the overlay containing block').toBe('relative');
        expect(geometry.indicatorOffsetParentId).toBe(geometry.dockHostId);
        expect(geometry.previewOffsetParentId).toBe(geometry.dockHostId);
        expect(geometry.indicatorLayer).toEqual(geometry.dockHost);
        expect(geometry.previewLayer).toEqual(geometry.dockHost);
        expect(geometry.previewPointerEvents).toBe('none');
        expect(geometry.previewZIndex).toBeLessThan(geometry.indicatorZIndex);
        expect(geometry.visibleIndicators.length).toBeGreaterThan(0);
        expect(geometry.visibleIndicators.every(rect => within(rect, geometry.dockHost)),
            'every painted indicator stays inside the dock host').toBe(true);
        expect(within(geometry.previewAffordance, geometry.dockHost),
            'the painted preview stays inside the dock host').toBe(true);
        expect(intersects(geometry.topChip, geometry.tourbar),
            'the top edge chip never overlaps the app header').toBe(false);
        expect(Math.abs(geometry.previewAffordance.left - geometry.targetZone.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.previewAffordance.top - geometry.targetZone.top)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.previewAffordance.width - geometry.targetZone.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.previewAffordance.height - geometry.targetZone.height)).toBeLessThanOrEqual(1);

        await page.keyboard.press('Escape');
        await page.waitForTimeout(120);
        await page.mouse.up();
        await page.waitForTimeout(300)
    });

    test('the ordinary body-mounted tab proxy has a theme-owned surface in both modes', async ({page, neuralLink}) => {
        const
            {app, scaleBox, wsId} = await bootFlagship(page, neuralLink),
            positions             = [{
                x: scaleBox.x + scaleBox.width * .25,
                y: scaleBox.y + Math.min(70, scaleBox.height * .25)
            }, {
                x: scaleBox.x + scaleBox.width * .68,
                y: scaleBox.y + scaleBox.height * .48
            }],
            assertTreatment = (receipt, theme) => {
                const themeClasses = receipt.classes.filter(cls => cls.startsWith('neo-theme-'));

                expect(receipt.parentIsBody, `${theme} proxy remains a direct-body embodiment`).toBe(true);
                expect(themeClasses, `${theme} proxy carries exactly its nearest theme`).toEqual([`neo-theme-${theme}`]);
                expect(receipt.classes).toContain('neo-preview-lang-signal');
                expect(receipt.tokens.ground, `${theme} proxy resolves its app-projected ground`).toBeTruthy();
                expect(receipt.tokens.border, `${theme} proxy resolves its app-projected border`).toBeTruthy();
                expect(receipt.tokens.text, `${theme} proxy resolves its app-projected text`).toBeTruthy();
                expect(receipt.tokens.shadow, `${theme} proxy resolves its app-projected elevation`).toBeTruthy();
                expect(receipt.style.backgroundAlpha, `${theme} proxy surface is nontransparent`).toBeGreaterThan(.9);
                expect(receipt.style.borderStyle).toBe('solid');
                expect(receipt.style.borderWidth).toBe('1px');
                expect(receipt.style.borderRadius).not.toBe('0px');
                expect(receipt.style.boxShadow).not.toBe('none');
                expect(
                    receipt.contrast.text,
                    `${theme} proxy text keeps WCAG AA contrast (${receipt.style.textColor} on ${receipt.style.background})`
                ).toBeGreaterThanOrEqual(4.5);
                if (receipt.contrast.glyph !== null) {
                    expect(
                        receipt.contrast.glyph,
                        `${theme} proxy glyph keeps non-text contrast (${receipt.style.glyphColor} on ${receipt.style.background})`
                    ).toBeGreaterThanOrEqual(3)
                }
            },
            runThemeWitness = async theme => {
                const sourceRect = await startAuditDrag(page);

                await parkActivePointer(page, positions[0]);
                const first = await readDockProxyTreatment(page);

                await parkActivePointer(page, positions[1]);
                const second = await readDockProxyTreatment(page);

                assertTreatment(first, theme);
                assertTreatment(second, theme);
                expect(first.rect.width, `${theme} proxy keeps source-strip width`).toBeGreaterThanOrEqual(sourceRect.width);
                expect(first.rect.height, `${theme} proxy keeps source-strip height`).toBeGreaterThanOrEqual(sourceRect.height);
                expect(second.rect.width).toBe(first.rect.width);
                expect(second.rect.height).toBe(first.rect.height);
                expect(
                    Math.hypot(second.rect.left - first.rect.left, second.rect.top - first.rect.top),
                    `${theme} proxy treatment survives movement between two distinct observation positions`
                ).toBeGreaterThan(20);

                await page.keyboard.press('Escape');
                await page.waitForTimeout(120);
                await page.mouse.up();
                await expect(page.locator('.neo-dock-dragproxy')).toHaveCount(0)
            };

        await app.callMethod(wsId, 'set', [{previewLanguage: 'signal'}]);
        await expect(page.locator('.workstation-dock-host')).toHaveClass(/neo-preview-lang-signal/);
        await runThemeWitness('neo-dark');

        await app.callMethod(wsId, 'setWorkspaceTheme', ['neo-theme-neo-light']);
        await expect(page.locator('.workstation-viewport')).toHaveClass(/neo-theme-neo-light/);
        await runThemeWitness('neo-light')
    });

    test('same-gesture tear-out re-entry resumes proxy motion without reacquisition', async ({page, neuralLink}, testInfo) => {
        const
            {app, wsId} = await bootFlagship(page, neuralLink),
            header      = page.locator('.neo-tab-header-button', {hasText: 'Audit'}).first(),
            headerBox   = await header.boundingBox(),
            hostBox     = await page.locator('.workstation-dock-host').boundingBox(),
            viewport    = await page.evaluate(() => ({height: innerHeight, width: innerWidth})),
            start       = {x: headerBox.x + headerBox.width / 2, y: headerBox.y + headerBox.height / 2},
            outside     = {x: viewport.width + 180, y: viewport.height + 180},
            reentry     = {
                x: hostBox.x + hostBox.width * .35,
                y: hostBox.y + hostBox.height * .35
            },
            documentBefore  = (await app.getComponent(wsId, ['dockModel'])).dockModel,
            heartbeatBefore = (await app.getComponent(wsId, ['feedSequence'])).feedSequence,
            paneIdBefore    = await app.callMethod(wsId, 'getPaneIdentity', ['audit']),
            popupPromise    = page.waitForEvent('popup', {timeout: 30000});

        let reexitPopup = null;

        try {
            await page.mouse.move(start.x, start.y);
            await page.mouse.down();
            await page.waitForTimeout(120);
            await page.mouse.move(start.x + 12, start.y + 4, {steps: 4});
            await page.mouse.move(start.x + 20, start.y + 28, {steps: 4});
            await expect(page.locator('.neo-dock-dragproxy')).toBeVisible();

            await page.mouse.move(outside.x, outside.y, {steps: 36});

            const popup = await popupPromise;

            await popup.waitForLoadState('domcontentloaded');
            const firstVesselGeneration = new URL(popup.url()).searchParams.get('vesselGeneration');

            await page.mouse.move(outside.x, outside.y + 24, {steps: 3});
            await page.mouse.move(reentry.x, reentry.y, {steps: 40});

            const proxy = page.locator('.neo-dock-dragproxy');

            await expect(proxy).toBeVisible();
            await expect.poll(() => popup.isClosed(), {
                message: 'the real popup retires while the original pointer remains down',
                timeout: 15000
            }).toBe(true);

            const
                positions = [
                    {x: reentry.x + 70,  y: reentry.y + 35},
                    {x: reentry.x + 170, y: reentry.y + 95}
                ],
                samples = [];

            for (const pointer of positions) {
                await page.mouse.move(pointer.x, pointer.y, {steps: 10});
                await page.waitForTimeout(160);
                samples.push({pointer, proxy: (await readDockProxyTreatment(page)).rect});

                if (filmTake) {
                    const frame = await page.screenshot();

                    expect(frame.length, 'the film profile retains a non-empty post-conversion frame')
                        .toBeGreaterThan(10000);
                    await testInfo.attach(`post-entry-motion-frame-${samples.length}.png`, {
                        body       : frame,
                        contentType: 'image/png'
                    })
                }
            }

            const
                [first, second] = samples,
                firstOffset     = {
                    x: first.pointer.x - first.proxy.left,
                    y: first.pointer.y - first.proxy.top
                },
                secondOffset    = {
                    x: second.pointer.x - second.proxy.left,
                    y: second.pointer.y - second.proxy.top
                };

            expect(second.proxy.left - first.proxy.left,
                'the resumed proxy follows the second post-entry pointer delta on x')
                .toBeCloseTo(second.pointer.x - first.pointer.x, 0);
            expect(second.proxy.top - first.proxy.top,
                'the resumed proxy follows the second post-entry pointer delta on y')
                .toBeCloseTo(second.pointer.y - first.pointer.y, 0);
            expect(secondOffset.x, 'the source grab offset survives the native-to-local morph')
                .toBeCloseTo(firstOffset.x, 0);
            expect(secondOffset.y, 'the source grab offset survives the native-to-local morph')
                .toBeCloseTo(firstOffset.y, 0);

            const
                reexitStart        = {x: outside.x + 40, y: outside.y + 40},
                reexitDrive        = {x: outside.x + 160, y: outside.y + 110},
                reexitPopupPromise = page.waitForEvent('popup', {timeout: 30000});

            await page.evaluate(() => {
                const
                    main     = globalThis.Neo.Main,
                    original = main.windowMoveTo.bind(main),
                    trace    = globalThis.__workstationReexitWindowMoves = [];

                main.windowMoveTo = data => {
                    const
                        win   = main.openWindows[data.windowName]?.win,
                        entry = {
                            data  : {...data},
                            handle: {
                                exists : Boolean(win),
                                closed : win?.closed ?? null,
                                movable: typeof win?.moveTo === 'function'
                            },
                            result: 'pending'
                        };

                    trace.push(entry);

                    let result;

                    try {
                        result = original(data)
                    } catch (error) {
                        entry.result = `throw:${error.message}`;
                        throw error
                    }

                    Promise.resolve(result).then(value => {
                        entry.result = value
                    }, error => {
                        entry.result = `reject:${error.message}`
                    });

                    return result
                }
            });

            await page.mouse.move(reexitStart.x, reexitStart.y, {steps: 40});
            reexitPopup = await reexitPopupPromise;
            await reexitPopup.waitForLoadState('domcontentloaded');

            // `window.moveTo` is a platform-granted effect. This host can open the popup but may
            // refuse every physical move (macOS/Chrome window-management policy); that is a stage
            // ceiling, not evidence that the continuing gesture failed to emit move traffic. The
            // positive control is strict: at least one call must arrive and EVERY completed result
            // must be the adapter's verified `false`. Missing calls, pending calls, or any admitted
            // move keep the behavioral witness live.
            await expect.poll(() => page.evaluate(() => {
                const trace = globalThis.__workstationReexitWindowMoves || [];

                return trace.length > 0 && trace.every(entry => entry.result !== 'pending')
            }), {
                message: 'the second-generation pointer emits settled native move admissions',
                timeout: 5000
            }).toBe(true);

            const openingMoveTrace = await page.evaluate(() => globalThis.__workstationReexitWindowMoves);

            expect(
                openingMoveTrace.every(entry => Number.isFinite(entry.data.x) && Number.isFinite(entry.data.y)),
                'every native move request carries finite screen coordinates'
            ).toBe(true);
            expect(
                openingMoveTrace.every(entry =>
                    entry.handle.exists && entry.handle.closed === false && entry.handle.movable
                ),
                'every native move request resolves the live named popup handle'
            ).toBe(true);

            test.skip(
                openingMoveTrace.every(entry => entry.result === false),
                'host refused every verified window.moveTo effect; native pointer-follow is stage-bound here'
            );

            const
                secondVesselGeneration = new URL(reexitPopup.url()).searchParams.get('vesselGeneration'),
                firstWindowPosition    = await reexitPopup.evaluate(() => ({x: screenX, y: screenY})),
                pointerDelta           = {
                    x: reexitDrive.x - reexitStart.x,
                    y: reexitDrive.y - reexitStart.y
                };

            await page.mouse.move(reexitDrive.x, reexitDrive.y, {steps: 12});
            await expect.poll(async () => {
                const current = await reexitPopup.evaluate(() => ({x: screenX, y: screenY}));

                return {
                    x: current.x - firstWindowPosition.x,
                    y: current.y - firstWindowPosition.y
                }
            }, {
                message: 'the fresh vessel follows the continuing pointer',
                timeout: 15000
            }).toEqual(pointerDelta);

            const
                secondWindowPosition = await reexitPopup.evaluate(() => ({x: screenX, y: screenY})),
                reexitReceipt        = {
                    firstVesselGeneration,
                    firstWindowPosition,
                    pointerDelta,
                    secondVesselGeneration,
                    secondWindowPosition,
                    windowDelta: {
                        x: secondWindowPosition.x - firstWindowPosition.x,
                        y: secondWindowPosition.y - firstWindowPosition.y
                    }
                };

            expect(secondVesselGeneration, 're-exit mints a fresh vessel generation')
                .not.toBe(firstVesselGeneration);
            expect(reexitReceipt.windowDelta).toEqual(reexitReceipt.pointerDelta);

            const
                documentAfter  = (await app.getComponent(wsId, ['dockModel'])).dockModel,
                heartbeatAfter = (await app.getComponent(wsId, ['feedSequence'])).feedSequence;

            expect(documentAfter, 're-entry is a zero-document-mutation transition').toEqual(documentBefore);
            expect(await app.callMethod(wsId, 'getPaneIdentity', ['audit']),
                'the live pane is resumed, never cloned or recreated').toBe(paneIdBefore);
            expect(heartbeatAfter, 'live pane production advances throughout the morph')
                .toBeGreaterThan(heartbeatBefore);

            await testInfo.attach('post-entry-motion-receipt.json', {
                body       : Buffer.from(JSON.stringify({firstOffset, reexitReceipt, secondOffset, samples}, null, 2)),
                contentType: 'application/json'
            })
        } finally {
            await page.keyboard.press('Escape').catch(() => {});
            await page.waitForTimeout(120);
            await page.mouse.up().catch(() => {});
            if (reexitPopup && !reexitPopup.isClosed()) {
                await reexitPopup.close().catch(() => {})
            }
        }
    });

    /**
     * The systematic rect layer's flagship home — the boot containment chain and the
     * per-child affordance families, read through component ids (restyle-proof), complementing
     * the fix-critical class-selector witness above rather than replacing it.
     */
    test('the flagship chrome tiles the window, and every affordance child stays contained by component-id truth', async ({page, neuralLink}) => {
        const {app, scaleBox} = await bootFlagship(page, neuralLink);

        const readId = result => result?.properties?.id ?? result?.id ?? (Array.isArray(result) ? readId(result[0]) : null);

        const [tourBar, statusBar, dockHost] = await Promise.all([
                app.queryComponent({reference: 'tour-bar'},   ['id']),
                app.queryComponent({reference: 'status-bar'}, ['id']),
                app.queryComponent({reference: 'dock-host'},  ['id'])
            ]),
            ids = {dockHostId: readId(dockHost), statusBarId: readId(statusBar), tourBarId: readId(tourBar)};

        expect(ids.tourBarId,   'the tour bar must expose a component id (reference: tour-bar)').toBeTruthy();
        expect(ids.statusBarId, 'the status bar must expose a component id').toBeTruthy();
        expect(ids.dockHostId,  'the dock host must expose a component id').toBeTruthy();

        // Family 1 — the boot containment chain: chrome bands tile without gaps, host owns the rest
        await assertBootContainmentChain(app, ids, {viewportHeight: await page.evaluate(() => globalThis.innerHeight)});

        // Families 2 + 4 — mid-gesture: every seeded affordance child contained, none over the header
        const center = {x: scaleBox.x + scaleBox.width / 2, y: scaleBox.y + scaleBox.height / 2};

        await parkAuditDrag(page, center);

        const candidateKeys = ['cross-center', 'cross-top', 'cross-right', 'cross-bottom', 'cross-left',
                'chip-top', 'chip-right', 'chip-bottom', 'chip-left'],
            children = await Promise.all(candidateKeys.map(candidateKey =>
                app.queryComponent({candidateKey}, ['id']))),
            indicatorIds = children.map(readId).filter(Boolean);

        expect(indicatorIds.length, 'the nine seeded affordance children must resolve').toBe(9);

        await assertAffordanceContainment(app, {dockHostId: ids.dockHostId, indicatorIds});
        await assertChipHeaderExclusion(app, {tourBarId: ids.tourBarId, indicatorIds});

        await page.keyboard.press('Escape');
        await page.waitForTimeout(120);
        await page.mouse.up();
        await page.waitForTimeout(300)
    });

    test('a real drag lights the menu + preview, and the release commits release truth', async ({page, neuralLink}) => {
        const {app, scaleBox, wsId} = await bootFlagship(page, neuralLink);
        const center                = {x: scaleBox.x + scaleBox.width / 2, y: scaleBox.y + scaleBox.height / 2};

        await parkAuditDrag(page, center);

        // worker truth first (localizes a failure to gesture-vs-render): the parked hover
        // BUILT a candidate set — the §06 pipeline ran end-to-end in the App Worker. This
        // also witnesses the sensor's detached-node dispatch repair: the dense toolbar's
        // overflow re-collapse replaces the dragged button's node mid-gesture, and the move
        // stream must survive that (src/main/draggable/sensor/Base.mjs#trigger).
        const indicators = await app.findInstances({className: 'Neo.dashboard.dock.interaction.DropIndicators'}, ['id']);
        const indId      = (Array.isArray(indicators) ? indicators[0] : indicators)?.id;
        const indState   = await app.getComponent(indId, ['candidateSet', 'mounted']);

        expect(indState?.candidateSet, 'the parked hover built a candidate set (worker truth)').toBeTruthy();

        // the flagship's first affordances: menu + preview, live mid-gesture
        await expect(page.locator('.neo-dashboard-dock-drop-indicators:not(.neo-dashboard-dock-drop-indicators-hidden)'),
            'the indicator layer is visible mid-drag').toBeVisible();
        await expect(page.locator('.neo-dock-preview > *').first(),
            'the zone preview renders').toBeVisible();

        await page.mouse.up();
        await page.waitForTimeout(900); // commit + re-projection settle

        // worker truth: the release at the scale zone's center committed tab-into there
        const {dockModel} = await app.getComponent(wsId, ['dockModel']);
        const scaleNode   = Object.values(dockModel.nodes)
            .find(node => node.type === 'tabs' && node.items?.includes('scale'));

        expect(scaleNode.items, 'audit joined the scale zone — release truth on the flagship').toContain('audit');

        // the affordances retired with the gesture
        await expect(page.locator('.neo-dashboard-dock-drop-indicators')).toHaveClass(/neo-dashboard-dock-drop-indicators-hidden/)
    });

    test('the preview design language re-skins the affordances live on the same surface', async ({page, neuralLink}) => {
        const {app, scaleBox, wsId} = await bootFlagship(page, neuralLink);
        const center                = {x: scaleBox.x + scaleBox.width / 2, y: scaleBox.y + scaleBox.height / 2};

        // the gesture parks FIRST, on the default language — the switch must land mid-gesture
        await parkAuditDrag(page, center);

        const readTreatment = () => page.$eval('.neo-dock-preview-affordance.neo-dock-preview-accepted', el => {
            const style = getComputedStyle(el);
            return {borderColor: style.borderColor, boxShadow: style.boxShadow}
        });

        const defaultTreatment = await readTreatment();

        // LIVE mid-gesture switch: the config lands in the App Worker while the drag is parked;
        // the host's language modifier swaps and the PARKED affordance re-resolves its aliases
        // through the cascade — no re-render, no new gesture
        await app.callMethod(wsId, 'set', [{previewLanguage: 'signal'}]);
        await expect(page.locator('.neo-preview-lang-signal')).toBeVisible();

        const signalTreatment = await readTreatment();

        // the accepted zone treatment now renders the SIGNAL chroma (the workstation's own
        // projected alias — dark boot: #5eead4). The border hue is shared family accent; the
        // language's OWN signature — the layered signal glow — is what must visibly change on
        // the live parked affordance.
        expect(signalTreatment.borderColor).toBe('rgb(94, 234, 212)');
        expect(signalTreatment.boxShadow, 'the switch re-skinned the LIVE parked affordance').not.toBe(defaultTreatment.boxShadow);

        // cancel — this scene commits nothing
        await page.keyboard.press('Escape');
        await page.waitForTimeout(120);
        await page.mouse.up();
        await page.waitForTimeout(300);

        const {dockModel} = await app.getComponent(wsId, ['dockModel']);

        expect(dockModel.nodes['right-top-tabs'].items, 'the cancelled gesture committed nothing').toContain('audit')
    })
});
