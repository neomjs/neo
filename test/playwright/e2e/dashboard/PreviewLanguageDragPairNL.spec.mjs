import {test, expect} from '../../fixtures.mjs';

/**
 * Whitebox-e2e: the SAME-SCRIPTED-DRAG evidence set for the preview-language switch — the
 * capture a composed specimen board cannot certify. The IDENTICAL committed gesture script
 * (same tab, same path, same park point) is REPLAYED once per scene — four separately
 * replayed-and-cancelled drags, one per captured golden — under the DEFAULT and SIGNAL
 * languages in BOTH color modes: target zone preview + §06 indicator menu + the
 * body-mounted drag proxy, all in frame.
 *
 * Evidence honesty (the demo-surface motion audit's boundary): the four goldens are STATIC
 * post-settle APPEARANCE evidence. Rendered motion is witnessed separately and executably:
 * a positive `animationstart` witness proves the signal hover-lock pulse RUNS with its
 * token duration in normal mode, and the reduced-motion counter-witness proves every
 * animation/transition entry computes 0s under `prefers-reduced-motion: reduce`.
 *
 * Product truths proven against the running childapp:
 * 1. the language modifier is a pure skin over the identical scripted gesture — same park
 *    point, same active candidate, different rendered language;
 * 2. the drag proxy carries its scope (dock marker + language + NEAREST-ancestor theme) to
 *    its `document.body` mount — the light captures render the projected daylight palette
 *    on every affordance INCLUDING the proxy (the cycle-2 falsified masking path);
 * 3. the hover-lock pulse fires with the fast token's duration (positive motion witness);
 * 4. under `prefers-reduced-motion: reduce`, the signal path's motion collapses to 0s
 *    through the token vocabulary (indicator transition AND the hover-lock breath).
 *
 * Determinism: the demo's live seconds clock is FROZEN worker-side for the run — the
 * pane's own `frozenTime` config is set to a constant through the Neural Link fixture
 * (plain JSON possession, no code patching) — and the pane stays fully VISIBLE in every
 * golden. It sits at the editor-zone park point, inside the very affordance cluster the
 * baselines certify, so masking it would paint over the evidence subject; freezing kills
 * the churn without hiding one pixel of it. Baselines refresh ONLY via
 * `--update-snapshots` — a refreshed golden is a reviewed design decision (the PR diff is
 * the review surface).
 *
 * Run: NEO_E2E_PORT=8096 npx playwright test PreviewLanguageDragPairNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */

test.describe('Preview design language — the same-scripted-drag capture set (Neural Link)', () => {
    test.setTimeout(180000);

    test.skip(process.env.NEO_TEST_SKIP_CI === 'true', 'rendered-platform goldens — local harness only');

    /**
     * Boots the demo, connects the bridge, and resolves the ids + zone geometry.
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

        // Freeze the seconds clock for the whole run through the pane's own determinism seam
        // (`frozenTime` config, plain JSON over the link — no masking, no hot patching). The
        // pane sits at the editor-zone park point INSIDE the certified affordance cluster —
        // it must stay fully visible in the goldens, so its churn dies at the source.
        const clocks  = await app.findInstances({className: 'Neo.examples.dashboard.choreography.ClockPane'}, ['id']);
        const clockId = (Array.isArray(clocks) ? clocks[0] : clocks)?.id;

        expect(clockId, 'the ClockPane must exist in the App Worker').toBeTruthy();
        await app.callMethod(clockId, 'set', [{frozenTime: '10:00:00'}]);
        await page.waitForFunction(() =>
            document.querySelector('.agentos-dockdemo-clock-time')?.textContent === '10:00:00'
        , null, {timeout: 10000});

        const zoneBoxes = await page.$$eval('.neo-dashboard-dock-tabs', els =>
            els.map(el => { const r = el.getBoundingClientRect(); return {x: r.x, y: r.y, width: r.width, height: r.height} })
        );
        const [editorZone] = [...zoneBoxes].sort((a, b) => a.x - b.x);

        const workspaceBox = await page.$eval('.neo-dashboard', el => {
            const r = el.getBoundingClientRect();
            return {x: r.x, y: r.y, width: r.width, height: r.height}
        });

        return {
            app,
            editorCenter: {x: editorZone.x + editorZone.width / 2, y: editorZone.y + editorZone.height / 2},
            host,
            workspaceBox
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
        // settle: move stream round-trip + affordance motion (tokens: 280ms) fully landed
        await page.waitForTimeout(600);

        await expect(page.locator('.neo-dashboard-dock-drop-indicators:not(.neo-dashboard-dock-drop-indicators-hidden)'),
            'the indicator layer is visible mid-drag').toBeVisible();
        await expect(page.locator('.neo-dragproxy'), 'the drag proxy is mounted').toBeVisible()
    }

    /**
     * Cancels the parked gesture without committing (Escape, then release) and waits for
     * the affordance teardown so the next capture starts from the resting state.
     * @param {Object} page
     */
    async function cancelTheDrag(page) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(120);
        await page.mouse.up();
        await expect(page.locator('.neo-dragproxy')).toHaveCount(0);
        await page.waitForTimeout(400)
    }

    test('the identical scripted gesture, replayed per scene: default/signal × dark/light + the pulse witness', async ({page, neuralLink}) => {
        const {app, editorCenter, host, workspaceBox} = await bootDemo(page, neuralLink);
        // The clock is frozen worker-side (see bootDemo), so the remaining noise floor is
        // sub-pixel anti-aliasing on live-gesture frames — a language or palette regression
        // diffs in the tens of thousands of pixels. NO masks: every certified surface is
        // fully visible in the baselines.
        const shot = {clip: workspaceBox, maxDiffPixels: 150};

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

        await expect(page).toHaveScreenshot('drag-pair-default-dark.png', shot);
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

        await expect(page).toHaveScreenshot('drag-pair-signal-dark.png', shot);

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

        // light / SIGNAL — the cycle-2 falsifier scene, now on a live gesture
        await parkTheDrag(page, editorCenter);

        const lightProxy = await page.$eval('.neo-dragproxy', el => ({
            themes   : [...el.classList].filter(cls => cls.startsWith('neo-theme-')),
            signalVar: getComputedStyle(el).getPropertyValue('--agent-dock-preview-signal').trim()
        }));

        expect(lightProxy.themes, 'the NEAREST ancestor theme rides the proxy — not the dark boot theme')
            .toEqual(['neo-theme-neo-light']);
        expect(lightProxy.signalVar, 'the proxy renders the projected daylight pigment')
            .toBe('#0f766e');

        await expect(page).toHaveScreenshot('drag-pair-signal-light.png', shot);
        await cancelTheDrag(page);

        // light / DEFAULT
        await app.callMethod(host, 'removeCls', ['neo-preview-lang-signal']);
        await expect(page.locator('.neo-preview-lang-signal')).toHaveCount(0);

        await parkTheDrag(page, editorCenter);
        await expect(page).toHaveScreenshot('drag-pair-default-light.png', shot);
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
