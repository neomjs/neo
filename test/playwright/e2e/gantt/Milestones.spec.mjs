import {expect, test} from '../../fixtures.mjs';

const
    URL        = '/examples/gantt/milestones/index.html',
    GATE_IDS   = ['gate-spec', 'gate-proto', 'gate-code', 'gate-cert', 'gate-rc', 'gate-launch'],
    THEMES     = ['neo-theme-neo-dark', 'neo-theme-neo-light', 'neo-theme-cyberpunk'],
    VIEWPORTS  = [{width: 1440, height: 900}, {width: 960, height: 540}, {width: 390, height: 844}],
    MS_PER_DAY = 86_400_000;

/**
 * @summary Waits for the dedicated App Worker and evaluates `fn` inside it.
 * @param {import('@playwright/test').Page} page
 * @param {Function} fn
 * @param {*} [arg]
 * @returns {Promise<*>}
 */
async function evalInAppWorker(page, fn, arg) {
    await expect.poll(() => page.workers().some(worker => worker.url().includes('worker/App'))).toBe(true);
    const worker = page.workers().find(item => item.url().includes('worker/App'));
    return worker.evaluate(fn, arg)
}

/**
 * @summary Switches the live example Viewport theme inside the App Worker.
 * @param {import('@playwright/test').Page} page
 * @param {String} theme
 */
async function setExampleTheme(page, theme) {
    await evalInAppWorker(page, nextTheme => {
        const items = [...globalThis.Neo.manager.Instance.items.values()];
        items.filter(item => item.className === 'Neo.examples.gantt.milestones.Viewport').forEach(vp => {
            vp.theme = nextTheme
        })
    }, theme);
    await expect(page.locator(`.milestones-viewport.${theme}`)).toHaveCount(1)
}

for (const theme of THEMES) {
    test(`${theme}: all six milestone gates draw as centred diamonds with labels and vertex-aligned links at 1440×900 and 390×844`, async ({page}) => {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text())
            }
        });

        for (const size of VIEWPORTS) {
            await page.setViewportSize(size);
            await page.goto(URL);
            await expect(page.locator('.neo-gantt-bar-milestone')).toHaveCount(6);
            await expect(page.locator('.neo-gantt-dependency-arrow')).toHaveCount(11);

            await setExampleTheme(page, theme);

            await expect.poll(async () => {
                const workerGeometry = await evalInAppWorker(page, gateIds => {
                    const
                        items = [...globalThis.Neo.manager.Instance.items.values()],
                        gantt = items.find(item => item.className === 'Neo.gantt.Container'),
                        layer = items.find(item => item.className === 'Neo.gantt.DependencyLayer');

                    if (!gantt?.timeAxis || !gantt?.store || !layer) {
                        return null
                    }

                    const
                        half  = Math.max(7, Math.round((gantt.rowHeight || 48) * 0.28)),
                        gates = Object.fromEntries(gateIds.map(id => {
                            const rec = gantt.store.get(id);
                            return [id, {
                                offsetPx: gantt.timeAxis.dateToOffset(rec.startDate),
                                startMs : new Date(rec.startDate).getTime()
                            }]
                        })),
                        arrows = layer.arrows.map(arrow => {
                            const nums = arrow.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
                            return {
                                endX  : nums[nums.length - 2],
                                fromId: arrow.data.fromId,
                                startX: nums[0],
                                toId  : arrow.data.toId
                            }
                        });

                    return {arrows, gates, half}
                }, GATE_IDS);

                if (!workerGeometry) {
                    return null
                }

                return page.evaluate(({gateIds, viewport, worker}) => {
                    const
                        track = document.querySelector('.neo-grid-body .neo-timeline-track'),
                        tRect = track?.getBoundingClientRect();

                    if (!tRect || tRect.width <= 0) {
                        return null
                    }

                    const gateChecks = gateIds.map(id => {
                        const
                            bar     = document.querySelector(`.neo-gantt-bar-milestone[data-event-id="${id}"]`),
                            svg     = bar?.querySelector('svg.neo-gantt-milestone-diamond'),
                            poly    = svg?.querySelector('polygon.neo-gantt-milestone-shape'),
                            label   = bar?.querySelector('.neo-gantt-milestone-label'),
                            handles = bar ? bar.querySelectorAll('.neo-timeline-bar-handle').length : -1;

                        if (!bar || !svg || !poly || !label) {
                            return {id, ready: false}
                        }

                        const
                            bRect      = bar.getBoundingClientRect(),
                            lRect      = label.getBoundingClientRect(),
                            pStyle     = getComputedStyle(poly),
                            lStyle     = getComputedStyle(label),
                            centerDiff = Math.abs((bRect.left + bRect.width / 2) - (tRect.left + worker.gates[id].offsetPx)),
                            inViewport = bRect.left >= 0 && bRect.right <= viewport.width && bRect.top >= 0 && bRect.bottom <= viewport.height;

                        return {
                            centerDiff,
                            fillVisible  : Boolean(pStyle.fill && pStyle.fill !== 'none' && pStyle.fill !== 'rgba(0, 0, 0, 0)'),
                            handles,
                            id,
                            inViewport,
                            isSquare     : Math.abs(bRect.width - worker.half * 2) <= 1 && Math.abs(bRect.height - worker.half * 2) <= 1,
                            labelReadable: lRect.width > 8 && lRect.right <= viewport.width + 1 && lStyle.color !== 'rgba(0, 0, 0, 0)',
                            ready        : true,
                            strokeVisible: Boolean(pStyle.stroke && pStyle.stroke !== 'none' && pStyle.stroke !== 'rgba(0, 0, 0, 0)')
                        }
                    });

                    const arrowChecks = worker.arrows.map(arrow => {
                        const
                            fromGate = worker.gates[arrow.fromId],
                            toGate   = worker.gates[arrow.toId],
                            fromOk   = !fromGate || Math.abs(arrow.startX - (fromGate.offsetPx + worker.half)) <= 0.5,
                            toOk     = !toGate   || Math.abs(arrow.endX   - (toGate.offsetPx   - worker.half)) <= 0.5;

                        return fromOk && toOk
                    });

                    const
                        bar         = document.querySelector('.milestones-toolbar'),
                        barOverflow = bar ? bar.scrollWidth - bar.clientWidth : 999,
                        toolbarOk   = barOverflow <= 1 && [...(bar?.querySelectorAll('.neo-button') || [])]
                            .filter(btn => btn.offsetParent !== null)
                            .every(btn => {
                                const r = btn.getBoundingClientRect();
                                return r.left >= -0.5 && r.right <= viewport.width + 0.5
                            });

                    return {
                        allArrowsMeetVertices: arrowChecks.length === 11 && arrowChecks.every(Boolean),
                        allGatesReady        : gateChecks.every(g =>
                            g.ready &&
                            g.handles === 0 &&
                            g.isSquare &&
                            g.centerDiff <= 1.2 &&
                            g.inViewport &&
                            g.fillVisible &&
                            g.strokeVisible &&
                            g.labelReadable
                        ),
                        toolbarOk
                    }
                }, {gateIds: GATE_IDS, viewport: size, worker: workerGeometry})
            }).toEqual({
                allArrowsMeetVertices: true,
                allGatesReady        : true,
                toolbarOk            : true
            });

            expect(errors).toEqual([])
        }
    })
}

test('slipping DSP firmware cascades Gates 3–6, Reset restores the plan, and dragging a milestone moves downstream gates', async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(msg.text())
        }
    });

    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(URL);
    await expect(page.locator('.neo-gantt-bar-milestone')).toHaveCount(6);

    const readGateDates = () => evalInAppWorker(page, gateIds => {
        const
            items = [...globalThis.Neo.manager.Instance.items.values()],
            gantt = items.find(item => item.className === 'Neo.gantt.Container');

        return Object.fromEntries(gateIds.map(id => {
            const rec = gantt.store.get(id);
            return [id, {
                endMs  : new Date(rec.endDate).getTime(),
                startMs: new Date(rec.startDate).getTime()
            }]
        }))
    }, GATE_IDS);

    const initial  = await readGateDates(),
          resetBtn = page.getByRole('button', {name: 'Reset', exact: true});

    await expect(resetBtn).toBeDisabled();

    await page.getByRole('button', {name: 'Slip DSP firmware +3 days'}).click();
    await expect(page.locator('.milestones-launch-pill')).toHaveText('Gate 6 · Public launch: Mon 30 Nov (+3d)');
    await expect(resetBtn).toBeEnabled();

    const afterSlip = await readGateDates();
    expect(afterSlip['gate-spec'].startMs).toBe(initial['gate-spec'].startMs);
    expect(afterSlip['gate-proto'].startMs).toBe(initial['gate-proto'].startMs);
    for (const id of ['gate-code', 'gate-cert', 'gate-rc', 'gate-launch']) {
        expect(afterSlip[id].startMs).toBe(initial[id].startMs + 3 * MS_PER_DAY);
        expect(afterSlip[id].endMs).toBe(afterSlip[id].startMs)
    }

    await resetBtn.click();
    await expect(page.locator('.milestones-launch-pill')).toHaveText('Gate 6 · Public launch: Fri 27 Nov');
    await expect(resetBtn).toBeDisabled();
    expect(await readGateDates()).toEqual(initial);

    const
        gate3   = page.locator('.neo-gantt-bar-milestone[data-event-id="gate-code"]'),
        track   = page.locator('.neo-grid-body .neo-timeline-track').first(),
        gBox    = await gate3.boundingBox(),
        tBox    = await track.boundingBox(),
        twoDays = (tBox.width / 36) * 2,
        startX  = gBox.x + gBox.width / 2,
        startY  = gBox.y + gBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + twoDays, startY, {steps: 12});

    const proxyBox = await page.locator('.neo-gantt-task-proxy').boundingBox();
    expect(proxyBox).not.toBeNull();
    expect(Math.abs(proxyBox.width - proxyBox.height)).toBeLessThanOrEqual(1);

    await page.mouse.up();

    await expect.poll(async () => (await readGateDates())['gate-code'].startMs)
        .toBeGreaterThanOrEqual(initial['gate-code'].startMs + MS_PER_DAY);

    const afterDrag = await readGateDates(),
          deltaMs   = afterDrag['gate-code'].startMs - initial['gate-code'].startMs;

    expect(deltaMs).toBeGreaterThanOrEqual(MS_PER_DAY);
    expect(afterDrag['gate-proto'].startMs).toBe(initial['gate-proto'].startMs);
    expect(afterDrag['gate-launch'].startMs).toBe(initial['gate-launch'].startMs + deltaMs);
    expect(errors).toEqual([])
});
