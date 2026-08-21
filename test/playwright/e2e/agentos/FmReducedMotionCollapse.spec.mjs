import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Gate-3 rendered witness: the FM hover transitions that ride the motion vocabulary actually
 * COLLAPSE under `prefers-reduced-motion: reduce` in the live browser, and animate under
 * `no-preference`. The ratified motion audit rejects source inference as motion evidence — this reads
 * the browser's COMPUTED values on the mounted surface, across both vocabulary tiers the cleanup touches:
 *
 * - `--motion-fast` (the `.agent-button` / `.fm-preset-button` / `.fm-fleet-start` hover pairs), proven
 *   on a real rendered cockpit-bar button's computed `transition-duration`;
 * - `--motion-fast` AND `--motion-base` (the `--motion-base` tier carries the `DemoAWorkspace` pip +
 *   the `HealthBar` count fade), proven by the document-root computed token values — the live cascade
 *   resolution of `_motion.scss`'s `prefers-reduced-motion` override, not a source read.
 *
 * A pure-CSS witness (no Neural Link): the collapse is browser cascade behaviour, so `page.emulateMedia`
 * + `getComputedStyle` is the faithful probe. Companion to the merged selector-strip motion witness.
 *
 * Run: NEO_E2E_PORT=8121 npx playwright test agentos/FmReducedMotionCollapse -c test/playwright/playwright.config.e2e.mjs --workers=1
 *
 * @see resources/scss/_motion.scss (the vocabulary + the reduced-motion collapse this witnesses)
 * @see apps/agentos/view/fleet/FleetCockpit.mjs (the cockpit-bar buttons carrying --motion-fast)
 */
test.describe('AgentOS FM motion vocabulary — reduced-motion collapse witness (#15509)', () => {
    test.setTimeout(90000);

    test('the hover transitions collapse to 0s under prefers-reduced-motion and animate under no-preference', async ({page}) => {
        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});

        // a real cockpit-bar button carries the --motion-fast hover transition (ungated)
        const button = page.locator('.fm-cockpit-bar .neo-button').first();

        await expect(button).toBeVisible({timeout: 30000});

        // custom properties inherit, so the button carries the effective (theme-scoped) token values —
        // read them where they resolve, not at :root (the FM tokens are scoped to an app/theme ancestor)
        const readTokens = () => button.evaluate(el => {
            const s = getComputedStyle(el);
            return {fast: s.getPropertyValue('--motion-fast').trim(), base: s.getPropertyValue('--motion-base').trim()}
        });

        // ── reduced motion: the tokens collapse, so the rendered transition is 0s ────────────────
        await page.emulateMedia({reducedMotion: 'reduce'});

        const collapsed = await button.evaluate(el => getComputedStyle(el).transitionDuration);

        expect(collapsed, 'the button hover transition collapses to 0s under reduced motion')
            .toMatch(/^0s(,\s*0s)*$/);

        const reducedTokens = await readTokens();

        expect(reducedTokens.fast, '--motion-fast collapses to 0ms under reduced motion (the .agent-button / cockpit-bar tier)').toBe('0ms');
        expect(reducedTokens.base, '--motion-base collapses to 0ms under reduced motion (the pip + health-bar tier)').toBe('0ms');

        // ── no preference: the transition is real (non-zero), so motion still exists when allowed ─
        await page.emulateMedia({reducedMotion: 'no-preference'});

        const animated = await button.evaluate(el => getComputedStyle(el).transitionDuration);

        expect(animated, 'the button hover transition animates under no-preference').not.toMatch(/^0s/);

        const preferenceTokens = await readTokens();

        expect(preferenceTokens.fast, '--motion-fast is non-zero under no-preference').not.toBe('0ms');
        expect(preferenceTokens.base, '--motion-base is non-zero under no-preference').not.toBe('0ms')
    });

    /**
     * The panel-tier rendered witness: the FM panel alias (`--fm-motion-panel`) drives REAL reveal
     * motion on the manage-instances drawer (`fm-im-reveal`) and collapses under
     * `prefers-reduced-motion`. The instance switcher is now a framework menu, so this also
     * guards the ownership handoff: no retired FM-specific menu animation may survive on that
     * floating surface. Computed values on mounted elements, per the ratified motion audit — source
     * inheritance is not motion evidence.
     */
    test('the manager panel reveal renders 280ms and collapses, while the framework switcher owns no FM animation', async ({page}) => {
        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});

        const trigger = page.locator('.fm-instance-trigger');

        await expect(trigger).toBeVisible({timeout: 30000});

        const readMotion = locator => locator.evaluate(el => {
            const s = getComputedStyle(el);
            return {
                duration: s.animationDuration,
                name    : s.animationName,
                panel   : s.getPropertyValue('--fm-motion-panel').trim()
            }
        });

        // ── no preference: the reveal is real motion, timed by the alias ─────────────────────────
        await page.emulateMedia({reducedMotion: 'no-preference'});
        await trigger.click();

        const menu = page.locator('.fm-instance-menu');

        await expect(menu).toBeVisible();

        const menuAnimated = await readMotion(menu);

        expect(menuAnimated.name, 'the framework menu carries no retired FM-specific reveal animation')
            .not.toBe('fm-instance-menu-reveal');

        // the manage-instances drawer rides the same alias through its own reveal
        await page.locator('.fm-instance-manage').click();

        const manager = page.locator('.fm-instance-manager');

        await expect(manager).toBeVisible();

        const managerAnimated = await readMotion(manager);

        expect(managerAnimated.name,     'the manager drawer runs its reveal animation').toBe('fm-im-reveal');
        expect(managerAnimated.duration, 'the drawer reveal is timed by the panel alias (280ms)').toBe('0.28s');

        // ── reduced motion: the alias collapses via the vocabulary, the in-file gate removes the reveal ─
        await page.emulateMedia({reducedMotion: 'reduce'});

        const managerReduced = await readMotion(manager);

        expect(managerReduced.panel, '--fm-motion-panel collapses to 0ms under reduced motion (vocabulary-layer inheritance)').toBe('0ms');
        expect(managerReduced.name,  'the drawer reveal is gated off under reduced motion — the state change lands instantly').toBe('none')
    });
});
