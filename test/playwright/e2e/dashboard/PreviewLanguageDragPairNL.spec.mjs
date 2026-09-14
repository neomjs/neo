import {test, expect} from '../../fixtures.mjs';

/**
 * Whitebox-e2e: the preview-language switch over ONE scripted drag. The IDENTICAL committed
 * gesture (same tab, same path, same park point) is REPLAYED once per scene — four separately
 * replayed-and-cancelled drags — under the DEFAULT and SIGNAL languages in BOTH color modes, and
 * each parked scene is READ rather than captured: where the target zone preview, the §06
 * indicator menu and the body-mounted drag proxy sit, and how each of them paints.
 *
 * Every scene is compared with scenes read earlier in the same run, so the evidence carries its
 * own baseline: there is no golden to re-mint, no host whose rendering it encodes, and no
 * difference between a headed and a headless run.
 *
 * Product truths proven against the running childapp:
 * 1. the language modifier is a pure skin over the identical scripted gesture — every affordance
 *    parks in the same place in all four scenes, and the signal language repaints each of them;
 * 2. the drag proxy carries its scope (dock marker + language + NEAREST-ancestor theme) to its
 *    `document.body` mount — the light theme repaints every affordance INCLUDING the proxy (the
 *    cycle-2 falsified masking path);
 * 3. the hover-lock pulse fires with the fast token's duration (positive motion witness);
 * 4. under `prefers-reduced-motion: reduce`, the signal path's motion collapses to 0s
 *    through the token vocabulary (indicator transition AND the hover-lock breath).
 *
 * Run: NEO_AGENTOS_RUNTIME_ROOT=<a neo-agent-brain checkout> npx playwright test PreviewLanguageDragPairNL -c test/playwright/playwright.config.e2e.mjs
 */

test.describe('Preview design language — one scripted drag, replayed per scene (Neural Link)', () => {
    test.setTimeout(180000);

    /**
     * Boots the demo, connects the bridge, and resolves the workspace id + the editor zone center.
     * @param {Object} page
     * @param {Object} neuralLink
     * @returns {Promise<Object>}
     */
    async function bootDemo(page, neuralLink) {
        await page.goto('/examples/dashboard/choreography/index.html');

        await page.waitForSelector('.agentos-dockdemo-tour-play',          {timeout: 20000});
        await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 20000});
        await page.evaluate(() => document.fonts.ready);

        const app        = await neuralLink.connectToApp('Neo.examples.dashboard.choreography');
        const workspaces = await app.findInstances({className: 'Neo.examples.dashboard.choreography.DemoAWorkspace'}, ['id']);
        const host       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(host, 'the DemoAWorkspace must exist in the App Worker').toBeTruthy();

        const zoneBoxes = await page.$$eval('.neo-dashboard-dock-tabs', els =>
            els.map(el => { const r = el.getBoundingClientRect(); return {x: r.x, y: r.y, width: r.width, height: r.height} })
        );
        const [editorZone] = [...zoneBoxes].sort((a, b) => a.x - b.x);

        return {
            app,
            editorCenter: {x: editorZone.x + editorZone.width / 2, y: editorZone.y + editorZone.height / 2},
            host
        }
    }

    /**
     * Runs THE committed gesture: a real pointer drag of the Preview tab header, parked at
     * the editor-zone center (tab-into: full zone flood + the 5-position cross + proxy).
     * Identical coordinates every invocation — the language/theme under it is the variable.
     * @param {Object} page
     * @param {Object} target {x, y}
     */
    async function parkTheDrag(page, target) {
        const header = page.locator('.neo-tab-header-button', {hasText: 'Preview'}).first();

        await expect(header).toBeVisible();

        const box = await header.boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        // clear the Mouse sensor's intentional click-vs-drag arming (distance + 100ms)
        await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 12, {steps: 4});
        await expect(page.locator('.neo-tab-header-toolbar.neo-is-dragging')).toBeVisible();
        await page.mouse.move(target.x, target.y, {steps: 15});
        // settle on a condition, not a delay: a fixed wait can read the scene before the hover has
        // reached the park point. Settled means the center indicator has hover-locked inside the
        // accepted preview covering the park point, and no affordance is still in motion.
        await expect.poll(() => page.evaluate(({x, y}) => {
            const inside  = (rect, px, py) => px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom,
                  preview = [...document.querySelectorAll('.neo-dock-preview-accepted')]
                      .map(element => element.getBoundingClientRect()).find(rect => inside(rect, x, y)),
                  locked  = document.querySelector('.neo-dashboard-dock-drop-indicator-center.neo-dashboard-dock-drop-indicator-active')
                      ?.getBoundingClientRect();

            return Boolean(preview && locked)
                && inside(preview, locked.left + locked.width / 2, locked.top + locked.height / 2)
                && [...document.querySelectorAll('.neo-dashboard-dock-drop-indicator, .neo-dashboard-dock-drop-chip, .neo-dock-preview-affordance, .neo-dragproxy')]
                    .every(element => element.getAnimations().every(animation => animation.playState !== 'running'))
        }, target), 'the center indicator hover-locks on the park point').toBe(true);

        await expect(page.locator('.neo-dashboard-dock-drop-indicators:not(.neo-dashboard-dock-drop-indicators-hidden)'),
            'the indicator layer is visible mid-drag').toBeVisible();
        await expect(page.locator('.neo-dragproxy'), 'the drag proxy is mounted').toBeVisible()
    }

    /**
     * Cancels the parked gesture without committing (Escape, then release) and waits for
     * the affordance teardown so the next scene starts from the resting state.
     * @param {Object} page
     */
    async function cancelTheDrag(page) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(120);
        await page.mouse.up();
        await expect(page.locator('.neo-dragproxy')).toHaveCount(0);
        await page.waitForTimeout(400)
    }

    /**
     * Reads the parked scene as values: the active candidate, the box of every visible affordance,
     * and the paint of the three surfaces the preview language restyles. Elements are listed in DOM
     * order, so two readings of the same gesture line up element by element.
     * @param {Object} page
     * @returns {Promise<{geometry: Object, paint: Object}>}
     */
    function readScene(page) {
        return page.evaluate(() => {
            const visible = selector => [...document.querySelectorAll(selector)]
                      .filter(element => element.checkVisibility({opacityProperty: true, visibilityProperty: true})),
                  surfaces = {
                      indicators: visible('.neo-dashboard-dock-drop-indicator, .neo-dashboard-dock-drop-chip'),
                      preview   : visible('.neo-dock-preview-accepted'),
                      proxy     : visible('.neo-dock-dragproxy')
                  },
                  read     = reader => Object.fromEntries(Object.entries(surfaces).map(([name, elements]) => [name, elements.map(reader)])),
                  active   = document.querySelector('.neo-dashboard-dock-drop-indicator-active');

            return {
                geometry: {
                    active: active && [...active.classList].sort(),
                    ...read(element => {
                        const {x, y, width, height} = element.getBoundingClientRect();
                        return [x, y, width, height].map(Math.round)
                    })
                },
                paint: read(element => {
                    const {backgroundColor, borderTopColor, boxShadow} = getComputedStyle(element);
                    return {backgroundColor, borderTopColor, boxShadow}
                })
            }
        })
    }

    /**
     * Whether `scene` paints each surface differently from `baseline`, element by element. A surface
     * with no element on it counts as not repainted, so a missing affordance cannot pass.
     * @param {Object} scene
     * @param {Object} baseline
     * @returns {Object} surface name → Boolean
     */
    function repainted(scene, baseline) {
        return Object.fromEntries(Object.entries(scene.paint).map(([name, paints]) => [name,
            paints.length > 0 && paints.every((paint, index) => JSON.stringify(paint) !== JSON.stringify(baseline.paint[name][index]))
        ]))
    }

    test('the identical scripted gesture, replayed per scene: default/signal × dark/light + the pulse witness', async ({page, neuralLink}) => {
        const {app, editorCenter, host} = await bootDemo(page, neuralLink);
        const everySurface              = {indicators: true, preview: true, proxy: true};

        // The positive motion witness arms BEFORE any signal gesture: the hover-lock pulse
        // replays on every re-lock (the -active class toggles), and `animationstart` is
        // event-truth — timing-independent, unlike sampling a 120ms animation mid-flight.
        await page.evaluate(() => {
            window.__pulseWitness = [];
            document.addEventListener('animationstart', event => {
                if (event.animationName === 'neo-preview-signal-lock') {
                    window.__pulseWitness.push({duration: getComputedStyle(event.target).animationDuration})
                }
            }, true)
        });

        // ── dark / DEFAULT ────────────────────────────────────────────────────────────
        await parkTheDrag(page, editorCenter);

        const defaultProxyCls = await page.$eval('.neo-dragproxy', el => [...el.classList]);

        expect(defaultProxyCls, 'default gesture: no language modifier rides the proxy')
            .not.toContain('neo-preview-lang-signal');
        expect(defaultProxyCls, 'the dock ownership marker rides every dock proxy')
            .toContain('neo-dock-dragproxy');

        // the scene every later one is compared against
        const defaultDark = await readScene(page);

        await cancelTheDrag(page);

        // ── dark / SIGNAL (the language flips WORKER-side, same as an app config would;
        // the workspace is an ancestor of both the affordance overlays and the toolbars,
        // so descendant scoping AND the proxy's parent-chain walk both see it) ──────────
        await app.callMethod(host, 'addCls', ['neo-preview-lang-signal']);
        await expect(page.locator('.neo-preview-lang-signal .neo-dashboard-dock-tabs').first()).toBeVisible();

        await parkTheDrag(page, editorCenter);

        const signalProxy = await page.$eval('.neo-dragproxy', el => ({
            cls      : [...el.classList],
            signalVar: getComputedStyle(el).getPropertyValue('--agent-dock-preview-signal').trim()
        }));

        expect(signalProxy.cls).toContain('neo-preview-lang-signal');
        expect(signalProxy.cls.filter(cls => cls.startsWith('neo-theme-')),
            'exactly ONE carried theme — never the boot-theme duplicate').toHaveLength(1);
        expect(signalProxy.signalVar, 'the signal alias resolves ON the body-mounted proxy — no fallback masking')
            .not.toBe('');

        const signalDark = await readScene(page);

        expect(signalDark.geometry, 'the language is a pure skin: every affordance parks where the default one did')
            .toEqual(defaultDark.geometry);
        expect(repainted(signalDark, defaultDark), 'dark: the signal language repaints every affordance')
            .toEqual(everySurface);

        // the positive motion witness: parking on the zone center hover-locked the CENTER
        // indicator — the pulse must have RUN, at the fast token's real duration
        const pulses = await page.evaluate(() => window.__pulseWitness);

        expect(pulses.length, 'the signal hover-lock pulse fired on lock').toBeGreaterThanOrEqual(1);
        pulses.forEach(pulse => expect(pulse.duration, 'the pulse runs at the fast token duration').toBe('0.12s'));

        await cancelTheDrag(page);

        // ── LIGHT mode: theme-swap an INNER root (the workspace); document.body keeps the
        // boot theme — exactly the carried-scope shape the proxy contract exists for ─────
        await app.callMethod(host, 'set', [{theme: 'neo-theme-neo-light'}]);
        await page.waitForFunction(() =>
            getComputedStyle(document.querySelector('.neo-dashboard-dock-tabs'))
                .getPropertyValue('--agent-dock-preview-accept').trim() === '#0d9488'
        , null, {timeout: 20000});
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);

        // light / SIGNAL — the cycle-2 falsifier scene, on a live gesture
        await parkTheDrag(page, editorCenter);

        const lightProxy = await page.$eval('.neo-dragproxy', el => ({
            themes   : [...el.classList].filter(cls => cls.startsWith('neo-theme-')),
            signalVar: getComputedStyle(el).getPropertyValue('--agent-dock-preview-signal').trim()
        }));

        expect(lightProxy.themes, 'the NEAREST ancestor theme rides the proxy — not the dark boot theme')
            .toEqual(['neo-theme-neo-light']);
        expect(lightProxy.signalVar, 'the proxy renders the projected daylight pigment')
            .toBe('#0f766e');

        const signalLight = await readScene(page);

        expect(signalLight.geometry, 'the theme is a pure skin as well').toEqual(defaultDark.geometry);
        expect(repainted(signalLight, signalDark), 'signal: the light theme repaints every affordance, the body-mounted proxy included')
            .toEqual(everySurface);

        await cancelTheDrag(page);

        // light / DEFAULT
        await app.callMethod(host, 'removeCls', ['neo-preview-lang-signal']);
        await expect(page.locator('.neo-preview-lang-signal')).toHaveCount(0);

        await parkTheDrag(page, editorCenter);

        const defaultLight = await readScene(page);

        expect(defaultLight.geometry, 'back to the default language, still the same places').toEqual(defaultDark.geometry);
        expect(repainted(defaultLight, defaultDark), 'default: the light theme repaints every affordance')
            .toEqual(everySurface);
        expect(repainted(signalLight, defaultLight), 'light: the signal language repaints every affordance')
            .toEqual(everySurface);

        await cancelTheDrag(page)
    });

    test('reduced motion collapses the signal path through the tokens on the live gesture', async ({page, neuralLink}) => {
        await page.emulateMedia({reducedMotion: 'reduce'});

        const {app, editorCenter, host} = await bootDemo(page, neuralLink);

        await app.callMethod(host, 'addCls', ['neo-preview-lang-signal']);
        await expect(page.locator('.neo-preview-lang-signal .neo-dashboard-dock-tabs').first()).toBeVisible();

        await parkTheDrag(page, editorCenter);

        // parked at the zone center: the CENTER indicator is the active (hover-locked)
        // candidate — the signal chip breath (neo-preview-signal-lock) rides
        // --dock-transition-duration-fast, so the vocabulary collapse must zero it
        const motion = await page.$eval('.neo-dashboard-dock-drop-indicator-active', el => {
            const style = getComputedStyle(el);
            return {animationDuration: style.animationDuration, transitionDuration: style.transitionDuration}
        });

        // computed durations serialize as one entry PER animated/transitioned property —
        // every entry must be zero, whatever the property count
        const allZero = value => value.split(',').map(entry => entry.trim()).every(entry => entry === '0s');

        expect(allZero(motion.animationDuration),  `the hover-lock breath collapses to 0s (got: ${motion.animationDuration})`).toBe(true);
        expect(allZero(motion.transitionDuration), `the indicator transition collapses to 0s (got: ${motion.transitionDuration})`).toBe(true);

        await cancelTheDrag(page)
    })
});
