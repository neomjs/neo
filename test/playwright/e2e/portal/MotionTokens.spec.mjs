import {expect, test} from '../../fixtures.mjs';

const PORTAL = '/apps/portal/index.html',
      LIST   = '.portal-examples-list.neo-list';

/**
 * @summary Pins the Portal's transitions to the motion vocabulary (`resources/scss/_motion.scss`).
 * The duration is read from computed style, so a literal `300ms` or `ease-out` sneaking back into
 * the Portal SCSS fails here instead of silently bypassing the reduced-motion collapse.
 */
test.describe('Portal motion tokens', () => {
    const readTransition = page => page.locator(LIST).first().evaluate(el => {
        const style = getComputedStyle(el);
        return {duration: style.transitionDuration, timing: style.transitionTimingFunction}
    });

    test('the examples list transition resolves through --motion-panel and --ease-out-soft', async ({page}) => {
        await page.goto(`${PORTAL}#/examples`);
        await expect(page.locator(LIST).first()).toBeAttached();

        const token      = await page.locator(LIST).first().evaluate(el => getComputedStyle(el).getPropertyValue('--motion-panel').trim());
        const transition = await readTransition(page);

        expect(token).toBe('280ms');
        expect(transition.duration).toBe('0.28s');
        expect(transition.timing).toContain('cubic-bezier');
    });

    test('reduced motion collapses the examples list transition to zero', async ({page}) => {
        await page.emulateMedia({reducedMotion: 'reduce'});
        await page.goto(`${PORTAL}#/examples`);
        await expect(page.locator(LIST).first()).toBeAttached();

        expect((await readTransition(page)).duration).toBe('0s');
    });
});
