import {test, expect} from '../../fixtures.mjs';

let rootId;

/**
 * @summary Exercises proxy-free Splitter resizing with buffered Grid and TreeGrid siblings.
 *
 * This is the performance-risk falsifier, not a benchmark claim: both widgets carry large stores
 * and column virtualization, while the assertions require every repeated live resize to settle with
 * aligned headers/cells and no queued VDOM work.
 *
 * The cadence test guards the property the live architecture was chosen for: per-frame delivery.
 * It samples both modes over one identical paced gesture and asserts the relative relationship —
 * live target cadence against the deferred proxy baseline — because a same-run contrast
 * self-normalizes for runner speed where an absolute wall-clock budget would flake.
 *
 * @see https://github.com/neomjs/neo/issues/17819
 */
test.describe('Neo.component.Splitter — heavy buffered siblings', () => {
    test.setTimeout(90000);
    test.use({viewport: {height: 800, width: 1200}});

    test.beforeEach(async ({neo, page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        await neo.loadModule('../container/Base.mjs');
        await neo.loadModule('../component/Splitter.mjs');
        await neo.loadModule('../button/Split.mjs');
        await neo.loadModule('../../examples/grid/bigData/GridContainer.mjs');
        await neo.loadModule('../../examples/grid/treeBigData/GridContainer.mjs')
    });

    test.afterEach(async ({neo}) => {
        if (rootId) {
            await neo.destroyComponent(rootId);
            rootId = null
        }
    });

    const readGeometry = page => page.evaluate(() => {
        const ids = ['splitter-heavy-grid', 'splitter-heavy-handle', 'splitter-heavy-tree'];

        return Object.fromEntries(ids.map(id => {
            const rect = document.getElementById(id).getBoundingClientRect();
            return [id, {height: rect.height, width: rect.width, x: rect.x, y: rect.y}]
        }))
    });

    const assertGridAligned = async (page, gridId, label) => {
        const result = await page.evaluate(id => {
            const grid    = document.getElementById(id),
                  toolbar = grid.querySelector('.neo-grid-header-toolbar'),
                  body    = grid.querySelector('.neo-grid-body'),
                  row     = body.querySelector('[role="row"]'),
                  clip    = body.getBoundingClientRect(),
                  visible = rect => rect.width > 0 && rect.right > clip.left + 1 && rect.left < clip.right - 1,
                  headers = [...toolbar.children]
                      .map(node => node.getBoundingClientRect())
                      .filter(visible)
                      .map(rect => ({width: Math.round(rect.width), x: Math.round(rect.x)})),
                  cells   = [...row.children]
                      .map(node => node.getBoundingClientRect())
                      .filter(visible)
                      .map(rect => ({width: Math.round(rect.width), x: Math.round(rect.x)}));

            return {cells, headers}
        }, gridId);

        expect(result.headers.length, `${label}: visible header/cell count`).toBe(result.cells.length);

        result.headers.forEach(header => {
            const cell = result.cells.find(item => Math.abs(item.x - header.x) <= 1);

            expect(cell, `${label}: a visible cell starts under header x=${header.x}`).toBeDefined();
            expect(Math.abs(cell.width - header.width), `${label}: matching widths at x=${header.x}`)
                .toBeLessThanOrEqual(1)
        })
    };

    const drag = async (page, splitterId, delta, onHold) => {
        const splitter = page.locator(`#${splitterId}`),
              box      = await splitter.boundingBox(),
              x        = box.x + box.width / 2,
              y        = box.y + box.height / 2;

        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.waitForTimeout(120); // production Mouse sensor threshold; pointer stays held
        await page.mouse.move(x + delta, y, {steps: 30});
        await onHold?.();
        await page.mouse.up()
    };

    const mountHeavyFixture = async (neo, {liveResize = true} = {}) => {
        const result = await neo.createComponent({
            importPath: '../container/Base.mjs',
            ntype     : 'container',
            parentId  : 'component-test-viewport',
            height    : 520,
            id        : 'splitter-heavy-root',
            layout    : {ntype: 'hbox', align: 'stretch'},
            width     : 1000,
            items     : [{
                className   : 'Neo.examples.grid.bigData.GridContainer',
                id          : 'splitter-heavy-grid',
                minWidth    : 0,
                wrapperStyle: {flex: '1 1 0%', minWidth: 0}
            }, {
                ntype     : 'splitter',
                id        : 'splitter-heavy-handle',
                liveResize
            }, {
                className   : 'Neo.examples.grid.treeBigData.GridContainer',
                id          : 'splitter-heavy-tree',
                minWidth    : 0,
                wrapperStyle: {flex: '1 1 0%', minWidth: 0}
            }]
        });

        return result
    };

    const awaitHeavyFixtureReady = async page => {
        await expect(page.locator('#splitter-heavy-grid .neo-grid-body [role="row"]').first())
            .toBeVisible({timeout: 30000});
        await expect(page.locator('#splitter-heavy-tree .neo-grid-body [role="row"]').first())
            .toBeVisible({timeout: 30000});
        await expect(page.locator('#splitter-heavy-tree .neo-tree-toggle').first(),
            'the second sibling is a real TreeGrid').toBeVisible()
    };

    const awaitGestureSettled = (neo, page, label) => expect.poll(async () => {
        const state = await neo.getConfig('splitter-heavy-handle', [
                  'isVdomUpdating', 'needsVdomUpdate'
              ]),
              mainState = await page.evaluate(() => Neo.main.addon.DragDrop.dragResize.state);

        return mainState == null && !state.isVdomUpdating && !state.needsVdomUpdate
    }, {
        message  : `${label}: gesture and VDOM queues settle`,
        intervals: [30, 50, 100],
        timeout  : 5000
    }).toBe(true);

    /**
     * One rAF-sampled paced drag. Each animation frame records the resize target's live width and
     * the drag proxy's live x, so per-frame delivery is measured on the thread that owns it in
     * both modes: the live path mutates the target inline style, the deferred path moves the proxy.
     */
    const sampledDrag = async (page, splitterId, delta, segments, segmentPauseMs) => {
        const splitter = page.locator(`#${splitterId}`),
              box      = await splitter.boundingBox(),
              x        = box.x + box.width / 2,
              y        = box.y + box.height / 2;

        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.waitForTimeout(120); // production Mouse sensor threshold; pointer stays held

        await page.evaluate(() => {
            const capture = window.__cadenceCapture = {frames: [], running: true};

            const loop = () => {
                if (!capture.running) return;

                const proxy = document.querySelector('.neo-dragproxy'),
                      tree  = document.getElementById('splitter-heavy-tree');

                capture.frames.push({
                    proxyX   : proxy ? proxy.getBoundingClientRect().x : null,
                    t        : performance.now(),
                    treeWidth: tree.getBoundingClientRect().width
                });

                requestAnimationFrame(loop)
            };

            requestAnimationFrame(loop)
        });

        for (let segment = 1; segment <= segments; segment++) {
            await page.mouse.move(x + Math.round(delta * segment / segments), y);
            await page.waitForTimeout(segmentPauseMs)
        }

        const frames = await page.evaluate(() => {
            window.__cadenceCapture.running = false;
            return window.__cadenceCapture.frames
        });

        await page.mouse.up();

        return frames
    };

    /**
     * Distinct-value cadence over one sampled gesture. `updates` counts frames whose observed value
     * moved by more than the float-noise guard; `perSecond` normalizes over the capture window, so
     * the two arms stay comparable on any runner speed.
     */
    const cadenceMetrics = (frames, key) => {
        const values   = frames.map(frame => ({t: frame.t, value: frame[key]})),
              windowMs = frames.length > 1 ? frames.at(-1).t - frames[0].t : 0;

        let last    = null,
            updates = 0;

        values.forEach(({value}) => {
            if (value !== null && (last === null || Math.abs(value - last) > 0.5)) {
                last = value;
                updates++
            }
        });

        return {
            frameCount: frames.length,
            perSecond : windowMs > 0 ? updates / windowMs * 1000 : 0,
            updates,
            windowMs
        }
    };

    /**
     * Committed from measurement, with the margin derived from BOTH directions:
     * - honest runs measure 0.865–0.964 locally and above 1.0 on CI, so 0.75 keeps ~13% headroom
     *   below the worst observed honest run;
     * - the named unacceptable pattern — the live target updating only every second observed
     *   frame — scores exactly 0.5, so the bar rejects it with 33% separation. The threshold
     *   falsifier test below pins that meaning: lowering the ratio back into false-green
     *   territory turns the synthetic degraded series green and that control red.
     */
    const CADENCE_RATIO = 0.75, MIN_FRAMES = 8, MIN_UPDATES = 6;

    test('repeated live resizes settle both virtualized widgets without geometry split-brain', async ({neo, page}) => {
        const result = await mountHeavyFixture(neo);

        expect(result.success, JSON.stringify(result.error || result)).toBe(true);
        rootId = result.id;

        await awaitHeavyFixtureReady(page);

        const initial = await readGeometry(page);

        for (const [index, delta] of [70, -70, 55, -55].entries()) {
            const before = await readGeometry(page);

            await drag(page, 'splitter-heavy-handle', delta, async () => {
                await expect.poll(async () => {
                    const held = await readGeometry(page);
                    return Math.abs(held['splitter-heavy-handle'].x - before['splitter-heavy-handle'].x)
                }, {
                    message  : `cycle ${index + 1}: the real boundary moves while held`,
                    intervals: [30, 50, 100],
                    timeout  : 5000
                }).toBeGreaterThan(Math.abs(delta) - 15);

                await expect(page.locator('.neo-dragproxy')).toHaveCount(0)
            });

            await awaitGestureSettled(neo, page, `cycle ${index + 1}`);

            await assertGridAligned(page, 'splitter-heavy-grid', `cycle ${index + 1} Grid`);
            await assertGridAligned(page, 'splitter-heavy-tree', `cycle ${index + 1} TreeGrid`)
        }

        const settled = await readGeometry(page);

        expect(Math.abs(settled['splitter-heavy-handle'].x - initial['splitter-heavy-handle'].x),
            'opposite resize pairs return to the initial boundary').toBeLessThanOrEqual(3);
        expect(Math.abs(settled['splitter-heavy-grid'].width - initial['splitter-heavy-grid'].width))
            .toBeLessThanOrEqual(3);
        expect(Math.abs(settled['splitter-heavy-tree'].width - initial['splitter-heavy-tree'].width))
            .toBeLessThanOrEqual(3)
    })

    test('live target cadence holds against the deferred proxy baseline', async ({neo, page}) => {
        // Why relative, not absolute: a wall-clock frame budget flakes on shared runners. Driving both
        // modes over the identical paced gesture in one run self-normalizes for machine speed, and the
        // deferred proxy — a plain main-thread transform with no layout work — is the known-smooth
        // baseline the live path promised to match. The mode cross-checks double as the positive
        // control: a harness that cannot tell live cadence from deferred cadence goes red here, so a
        // green run proves the comparison itself still has teeth.
        const SEGMENTS = 16, SEGMENT_PAUSE_MS = 20, DELTA = 160;

        const result = await mountHeavyFixture(neo);

        expect(result.success, JSON.stringify(result.error || result)).toBe(true);
        rootId = result.id;

        await awaitHeavyFixtureReady(page);

        // Arm 1 — live mode: the registered target follows every pointer frame on the main thread.
        const liveFrames = await sampledDrag(page, 'splitter-heavy-handle', DELTA, SEGMENTS, SEGMENT_PAUSE_MS);

        await awaitGestureSettled(neo, page, 'live arm');

        // Arm 2 — deferred mode on an identical fresh mount: same start geometry, same gesture
        // path, same direction. Re-mounting instead of toggling `liveResize` keeps the arms
        // symmetric — the live arm's committed resize never skews the deferred arm's layout.
        await neo.destroyComponent(rootId);
        rootId = null;

        const remount = await mountHeavyFixture(neo, {liveResize: false});

        expect(remount.success, JSON.stringify(remount.error || remount)).toBe(true);
        rootId = remount.id;

        await awaitHeavyFixtureReady(page);

        const deferredFrames = await sampledDrag(page, 'splitter-heavy-handle', DELTA, SEGMENTS, SEGMENT_PAUSE_MS);

        await awaitGestureSettled(neo, page, 'deferred arm');

        const deferred = {
                  proxy: cadenceMetrics(deferredFrames, 'proxyX'),
                  tree : cadenceMetrics(deferredFrames, 'treeWidth')
              },
              live = {
                  proxy: cadenceMetrics(liveFrames, 'proxyX'),
                  tree : cadenceMetrics(liveFrames, 'treeWidth')
              };

        console.log('[cadence-gate]', JSON.stringify({deferred, live}));

        // Timing capture must exist — an empty or stalled rAF loop fails loud, never vacuous-green.
        expect(live.tree.frameCount,     'live arm captured animation frames').toBeGreaterThan(MIN_FRAMES);
        expect(deferred.tree.frameCount, 'deferred arm captured animation frames').toBeGreaterThan(MIN_FRAMES);

        // Mode cross-checks: the arms must be distinguishable for either cadence figure to mean anything.
        expect(live.proxy.updates,     'live mode never renders a proxy').toBe(0);
        expect(deferred.tree.updates,  'deferred mode freezes the target mid-gesture').toBeLessThanOrEqual(1);
        expect(live.tree.updates,      'the live target tracks the pointer').toBeGreaterThanOrEqual(MIN_UPDATES);
        expect(deferred.proxy.updates, 'the deferred proxy tracks the pointer').toBeGreaterThanOrEqual(MIN_UPDATES);

        // The committed relationship: live-mode target delivery holds the measured margin
        // against the proxy baseline (derivation at the CADENCE_RATIO declaration).
        expect(live.tree.perSecond, `live cadence holds >= ${CADENCE_RATIO}x the proxy baseline`)
            .toBeGreaterThanOrEqual(CADENCE_RATIO * deferred.proxy.perSecond)
    })

    test('the committed cadence bar rejects a halved live cadence', () => {
        // Threshold falsifier: the unacceptable pattern the bar exists to catch is the live
        // target updating only every second observed frame. Feeding that synthetic series
        // through the SAME committed metric and predicate must fail the gate — so this control
        // goes red if CADENCE_RATIO is ever lowered back into the false-green range (<= 0.5)
        // where a half-cadence live arm would pass as "keeping pace".
        const frameMs        = 16.67,
              degradedLive   = [],
              steadyBaseline = [];

        for (let i = 0; i < 30; i++) {
            const t = i * frameMs;

            steadyBaseline.push({t, proxyX: 100 + i * 4});                       // updates every frame
            degradedLive.push({t, treeWidth: 400 + Math.floor(i / 2) * 4})       // updates every 2nd frame
        }

        const baseline = cadenceMetrics(steadyBaseline, 'proxyX'),
              degraded = cadenceMetrics(degradedLive, 'treeWidth');

        expect(baseline.updates, 'the synthetic baseline tracks every frame').toBe(30);
        expect(degraded.updates, 'the synthetic degraded arm halves delivery').toBe(15);

        expect(degraded.perSecond, 'the committed bar rejects half-cadence delivery')
            .toBeLessThan(CADENCE_RATIO * baseline.perSecond)
    })

    test('sizes the outer Flexbox wrapper of a component with a distinct logical root', async ({neo, page}) => {
        const result = await neo.createComponent({
            importPath: '../container/Base.mjs',
            ntype     : 'container',
            parentId  : 'component-test-viewport',
            height    : 120,
            id        : 'splitter-wrapped-root',
            layout    : {ntype: 'hbox', align: 'stretch'},
            width     : 600,
            items     : [{
                id          : 'splitter-wrapped-previous',
                ntype       : 'component',
                wrapperStyle: {flex: '1 1 0%', minWidth: 0}
            }, {
                id        : 'splitter-wrapped-handle',
                liveResize: true,
                ntype     : 'splitter'
            }, {
                className   : 'Neo.button.Split',
                id          : 'splitter-wrapped-target',
                text        : 'Wrapped target',
                wrapperStyle: {flex: '1 1 0%', minWidth: 0}
            }]
        });

        expect(result.success, JSON.stringify(result.error || result)).toBe(true);
        rootId = result.id;

        const readWrappedGeometry = () => page.evaluate(() => {
            const outer = document.getElementById('splitter-wrapped-target__wrapper'),
                  inner = document.getElementById('splitter-wrapped-target');

            return {
                innerInlineWidth: inner.style.width,
                innerWidth      : inner.getBoundingClientRect().width,
                outerInlineWidth: outer.style.width,
                outerWidth      : outer.getBoundingClientRect().width
            }
        });

        await expect(page.locator('#splitter-wrapped-target__wrapper')).toBeVisible();
        await expect(page.locator('#splitter-wrapped-target')).toBeVisible();

        const before = await readWrappedGeometry();

        await drag(page, 'splitter-wrapped-handle', 70);

        await expect.poll(async () => {
            const geometry = await readWrappedGeometry(),
                  style    = await neo.getConfig('splitter-wrapped-target', 'wrapperStyle');

            return Math.abs(parseFloat(geometry.outerInlineWidth) - parseFloat(style.width))
        }, {
            message  : 'the terminal wrapperStyle update reaches the outer layout node',
            intervals: [30, 50, 100],
            timeout  : 5000
        }).toBeLessThanOrEqual(1);

        const after        = await readWrappedGeometry(),
              wrapperStyle = await neo.getConfig('splitter-wrapped-target', 'wrapperStyle');

        expect(before.outerInlineWidth, 'Flexbox owns the initial wrapper size').toBe('');
        expect(after.outerWidth, 'the selected outer layout item shrinks').toBeLessThan(before.outerWidth - 50);
        expect(after.outerInlineWidth).toBe(wrapperStyle.width);
        expect(wrapperStyle.flex).toBe('none');
        expect(after.innerInlineWidth, 'the inner logical root does not receive layout sizing').toBe('');
        expect(after.innerWidth).toBeLessThanOrEqual(after.outerWidth)
    })
});
