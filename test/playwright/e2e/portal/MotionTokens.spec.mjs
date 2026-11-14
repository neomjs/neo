import {expect, test} from '../../fixtures.mjs';

const PORTAL = '/apps/portal/index.html',
      LIST   = '.portal-examples-list.neo-list';

/**
 * @summary Pins the examples list's transition to the motion vocabulary (`resources/scss/_motion.scss`):
 * it resolves through `--motion-panel` and `--ease-out-soft`, and collapses to `0s` under reduced motion.
 * The spec reads one element's computed style, so it covers that list, not every Portal transition.
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
