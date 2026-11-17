/**
 * @summary Colors and finance still render live cell updates through their existing controller entry points.
 * @see https://github.com/neomjs/neo/issues/20974
 */
import {test, expect} from '../../fixtures.mjs';

for (const app of ['colors', 'finance']) {
    test(`${app}: a live update reaches an existing grid cell`, async ({page}) => {
        await page.goto(`/apps/${app}/index.html`);

        const field = app === 'colors' ? 'columnA' : 'value',
              cells = page.locator(`.neo-grid-body .neo-grid-cell[data-field="${field}"]`),
              start = page.getByRole('button', {name: 'Start', exact: true}),
              stop  = page.getByRole('button', {name: 'Stop', exact: true}),
              read  = () => cells.evaluateAll((nodes, colors) => nodes.map(node => colors
                  ? [...node.classList].find(cls => cls.startsWith('color-'))
                  : node.textContent.trim()), app === 'colors');

        await expect(cells.first()).toBeVisible();
        if (await stop.isEnabled()) await stop.click();
        await expect(start).toBeEnabled();
        const before = await read();
        expect(before.length).toBeGreaterThan(0);

        await start.click();
        await expect.poll(read, {message: `${app} updates its rendered cells after a tick`}).not.toEqual(before);
        await stop.click();
        await expect(start).toBeEnabled()
    })
}
