/**
 * @summary The Colors dashboard generates its own data, and says so, when its WebSocket backend is out of reach.
 * @see https://github.com/neomjs/neo/issues/21330
 */
import {test, expect}     from '../../fixtures.mjs';
import {activeLaunchArgs} from '../utils/gpuIntent.mjs';

// The backend's host resolves to a closed local port, so the socket in the shared data worker cannot connect.
// A file-level `launchOptions` replaces the project's, so the suite's own launch arguments are passed along.
test.use({launchOptions: {args: [...activeLaunchArgs(), '--host-resolver-rules=MAP still-castle-38841.herokuapp.com 127.0.0.1:9']}});

test('colors: with the backend out of reach, the app generates its data and says so', async ({page}) => {
    await page.goto('/apps/colors/index.html');

    const cells = page.locator('.neo-grid-body .neo-grid-cell[data-field="columnA"]'),
          start = page.getByRole('button', {name: 'Start', exact: true}),
          stop  = page.getByRole('button', {name: 'Stop', exact: true}),
          read  = () => cells.evaluateAll(nodes => nodes.map(node => [...node.classList].find(cls => cls.startsWith('color-'))));

    await expect(page.locator('.colors-data-source')).toHaveText('Data: generated in the app, the backend is not reachable', {timeout: 15000});
    await expect(cells.first()).toBeVisible();

    const before = await read();

    expect(before.length).toBeGreaterThan(0);

    await start.click();
    await expect.poll(read, {message: 'a tick changes the rendered cells'}).not.toEqual(before);
    await stop.click();
    await expect(start).toBeEnabled()
});
