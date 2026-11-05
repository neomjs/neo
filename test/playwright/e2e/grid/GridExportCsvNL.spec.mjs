import {readFile}     from 'node:fs/promises';
import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Pins `Neo.grid.Container#exportCsv()` end to end: the app worker builds the CSV, the main thread's
 * on-demand `Neo.main.addon.FileDownload` hands it to the browser, and the downloaded file is exactly `toCsv()`.
 */
test.describe('Neo.grid.Container#exportCsv (Neural Link)', () => {
    test.setTimeout(90000);

    test('downloads toCsv() as the named file, columns in lock-region order', async ({page, neuralLink}) => {
        await page.goto('/examples/grid/lockedColumns/index.html');

        const app = await neuralLink.connectToApp('Neo.examples.grid.lockedColumns');

        await page.waitForSelector('.neo-grid-container', {state: 'visible', timeout: 30000});

        const grids  = await app.findInstances({className: 'Neo.grid.Container'}, ['id']),
              gridId = Array.isArray(grids) ? grids[0]?.id : grids?.id;

        expect(gridId, 'the example must expose its grid').toBeTruthy();

        const expected = await app.callMethod(gridId, 'toCsv', [{}]),
              lines    = expected.split('\r\n');

        // `#`, `Rank` and `User` are locked start and `Updated` is locked end, whatever the centre holds
        expect(lines[0].startsWith('#,Rank,User,Total,')).toBe(true);
        expect(lines[0].endsWith(',Updated')).toBe(true);
        expect(lines.length).toBeGreaterThan(1);

        const [download] = await Promise.all([
            page.waitForEvent('download'),
            app.callMethod(gridId, 'exportCsv', [{fileName: 'rows.csv'}])
        ]);

        expect(download.suggestedFilename()).toBe('rows.csv');
        expect(await readFile(await download.path(), 'utf8')).toBe(expected)
    })
});
