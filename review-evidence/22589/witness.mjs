import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const [site, mode='inject'] = process.argv.slice(2);
assert.ok(site && ['inject', 'verify', 'red'].includes(mode),
    'Usage: node witness.mjs /path/to/built-engine [inject|verify|red]');
const root = resolve(site);
const {chromium, expect} = createRequire(join(root, 'package.json'))('@playwright/test');
const {createFileServer} = await import(pathToFileURL(join(root, 'buildScripts/util/fileServer.mjs')));
const files = createFileServer({root});
const server = createServer((request, response) => {
    if (request.url.startsWith('/release-check/')) request.url = request.url.slice('/release-check'.length);
    files.emit('request', request, response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const matchCountries = /\/resources\/examples\/data\/countries\.json(?:\?|$)/;
const browser = await chromium.launch({channel: 'chrome', headless: true});

async function exercise(distribution, field) {
    const context = await browser.newContext({viewport: {width: 1600, height: 680}});
    const page = await context.newPage();
    const gate = Promise.withResolvers();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    try {
        await context.route(matchCountries, async route => {
            await gate.promise;
            await route.continue();
        });
        const delivery = page.waitForResponse(response => matchCountries.test(response.url()));
        const prefix = distribution === 'esm' ? '/release-check' : '';
        const document = await page.goto(origin + prefix + '/dist/' + distribution + '/examples/grid/cellEditing/index.html');
        assert.equal(document.status(), 200);

        const order = number => page.locator('.neo-grid-cell[data-field="orderId"]')
            .filter({hasText: new RegExp('^SO-' + number + '$')}).first();
        const cell = (dataField, recordId) => page.locator('.neo-grid-cell[data-field="' + dataField + '"][data-record-id="' + recordId + '"]');
        await expect(order(1001)).toBeVisible();
        const firstId = await order(1001).getAttribute('data-record-id');
        const country = cell('country', firstId);
        const bodyId = await country.evaluate(node => node.closest('.neo-grid-body').id);
        const worker = () => page.workers().find(worker => /\/worker\/App\.mjs|\/appworker\.js/.test(worker.url()));
        await expect.poll(() => worker()?.url()).toBeTruthy();
        await expect(country).toHaveText('');

        const editorCell = cell(field, firstId);
        const input = editorCell.locator('.neo-grid-editor input:not(.neo-typeahead-input)');
        let nativeInput;
        if (mode !== 'red') {
            await editorCell.dblclick();
            await expect(input).toBeFocused();
            nativeInput = await input.elementHandle();
            if (field === 'item') await input.fill('Repaint preserves draft');
        }
        const before = await worker().evaluate(({bodyId, mode}) => {
            const body = Neo.get(bodyId);
            const provider = body.getStateProvider();
            const lookup = provider.getStore('countries');
            const record = body.store.get('SO-1001');
            globalThis.lookupWitness = {paints: 0, recordChanges: 0};
            body.store.on('recordChange', () => globalThis.lookupWitness.recordChanges++);
            if (mode === 'inject') {
                lookup.on('load', () => {
                    provider.component.exampleComponent.repaintCells();
                    globalThis.lookupWitness.paints++;
                });
            }
            return {ownsGrid: provider.component.exampleComponent === body.gridContainer,
                lookup: lookup.getCount(), code: record.country, version: record.version};
        }, {bodyId, mode});
        assert.equal(before.ownsGrid, true);
        assert.equal(before.lookup, 0);

        gate.resolve();
        assert.equal((await delivery).status(), 200);
        const read = () => worker().evaluate(id => {
            const body = Neo.get(id);
            const lookup = body.getStateProvider().getStore('countries');
            const record = body.store.get('SO-1001');
            return {lookup: lookup.getCount(), code: record.country, name: lookup.get('DE')?.name, version: record.version,
                ...globalThis.lookupWitness};
        }, bodyId);
        await expect.poll(async () => (await read()).lookup).toBe(243);
        const after = await read();
        assert.equal(after.name, 'Germany');
        assert.equal(after.code, before.code);
        assert.equal(after.version, before.version);
        assert.equal(after.recordChanges, 0);
        assert.equal(after.paints, mode === 'inject' ? 1 : 0);

        const receipt = {distribution, field, mode, before, after};
        if (mode === 'red') {
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            await expect(country).toHaveText('');
            receipt.countryCell = '';
        } else {
            assert.ok(await nativeInput.evaluate(node => node.isConnected && document.activeElement === node));
            receipt.sameFocusedInput = true;
            if (field === 'item') {
                await expect(country).toHaveText('Germany');
                await expect(input).toHaveValue('Repaint preserves draft');
                await input.press('Enter');
                await expect(editorCell).toHaveText('Repaint preserves draft');
                receipt.committed = await editorCell.textContent();
            } else {
                await expect(order(1002)).toBeVisible();
                const secondId = await order(1002).getAttribute('data-record-id');
                await expect(cell('country', secondId)).toHaveText('United States');
                await expect.poll(async () => {
                    if (await input.count() === 0) return true;
                    await page.keyboard.press('Escape');
                    return false;
                }).toBe(true);
                await expect(country).toHaveText('Germany');

                await page.locator('.neo-grid-view').first().hover();
                await page.mouse.wheel(0, 1500);
                await expect(order(1040)).toBeVisible();
                await expect(order(1001)).toHaveCount(0);
                const lastId = await order(1040).getAttribute('data-record-id');
                await expect(cell('country', lastId)).toHaveText('Denmark');
                await page.mouse.wheel(0, -1500);
                await expect(order(1001)).toBeVisible();
                await expect(country).toHaveText('Germany');
                receipt.wheelRoundTrip = ['SO-1001 Germany', 'SO-1040 Denmark', 'SO-1001 Germany'];
            }
        }
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({...receipt, errors}));
    } finally {
        gate.resolve();
        await context.close();
    }
}

try {
    for (const distribution of ['esm', 'production']) {
        await exercise(distribution, 'item');
        if (mode !== 'red') await exercise(distribution, 'country');
    }
} finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
}
