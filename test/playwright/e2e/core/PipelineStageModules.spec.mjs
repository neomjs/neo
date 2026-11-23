import {expect, test} from '../../fixtures.mjs';

test('app-owned connection, parser and normalizer modules execute in Data and deliver rows to Store', async ({page, neuralLink}, testInfo) => {
    await page.goto('/test/playwright/e2e/core/fixtures/pipeline-stages/index.html');
    const app = await neuralLink.connectToApp('PipelineStageModules');
    let receipt;
    await expect.poll(async () => {
        receipt = (await app.getComponent('pipeline-stage-probe', ['receipt'])).receipt;
        return receipt?.status
    }, {message: 'the real Data-worker read settles with an inspectable Store outcome'}).toMatch(/complete|failed/);
    await testInfo.attach('worker-store-receipt', {body: JSON.stringify(receipt, null, 2), contentType: 'application/json'});
    expect(receipt.status, receipt.error).toBe('complete');
    expect(receipt.remoteId).toBeTruthy();
    expect(receipt.appHasStages, 'only Data imports the custom modules').toBe(false);
    expect(receipt.count).toBe(1);
    expect(receipt.rows).toEqual([{id: 1, connectionRealm: 'data', parserRealm: 'data', normalizerRealm: 'data',
        connectionPath: false, parserPath: false, normalizerPath: false}]);
    await expect(page.getByText('Loaded 1 row(s) from the Data worker')).toBeVisible()
});
