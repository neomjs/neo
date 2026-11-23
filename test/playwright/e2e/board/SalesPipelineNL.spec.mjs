import {test, expect} from '../../fixtures.mjs';

const statuses = ['discovery', 'proposal', 'negotiation', 'won'],
      themes   = ['neo-theme-neo-light', 'neo-theme-neo-dark', 'neo-theme-light', 'neo-theme-dark', 'neo-theme-cyberpunk'],
      money    = value => new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0}).format(value),
      asArray  = value => Array.isArray(value) ? value : value ? [value] : [];

/** @summary Opens the real example and reads its public board projection through Neural Link. */
async function open(page, neuralLink, theme='neo-theme-neo-dark') {
    await page.goto(`/examples/board/salesPipeline/index.html?theme=${theme}`);
    await expect(page.locator('.sales-pipeline-board .neo-board-card').first()).toBeVisible();
    const app   = await neuralLink.connectToApp('BoardSalesPipeline'),
          board = asArray(await app.findInstances({className: 'Neo.board.Container'}, ['id']))[0];
    expect(board?.id).toBeTruthy();
    const boardId = board.id;
    return {
        records: status => app.callMethod(boardId, 'getColumnRecords', [status]),
        column : status => page.locator(`[id="${boardId}__col__${status}"]`),
        card   : key => page.locator(`[id="${boardId}__card__${key}"]`)
    }
}

/** @summary Compares every rendered stage total with all of its worker-owned deal amounts. */
async function expectTotals(view) {
    const totals = {};
    for (const status of statuses) {
        const records = await view.records(status);
        totals[status] = records.reduce((sum, record) => sum + record.amount, 0);
        await expect(view.column(status).locator('.neo-board-column-summary')).toHaveText(money(totals[status]))
    }
    return totals
}

test.describe('Sales pipeline example', () => {
    test('keyboard advance and reset move Harbor and reconcile each stage total', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 1440, height: 900});
        const view     = await open(page, neuralLink), initial = await expectTotals(view),
              proposal = await view.records('proposal'), negotiation = await view.records('negotiation'),
              advance  = page.getByRole('button', {name: 'Advance Harbor Museum'}),
              reset    = page.getByRole('button', {name: 'Reset', exact: true});

        expect(initial).toEqual({discovery: 25000, proposal: 30000, negotiation: 34000, won: 36000});
        expect(proposal.find(record => record.id === 'harbor-museum')).toMatchObject({amount: 18000, status: 'proposal'});
        await expect(advance).toBeEnabled();
        await advance.focus();
        await page.keyboard.press('Enter');
        await expect.poll(async () => (await view.records('negotiation')).some(record => record.id === 'harbor-museum')).toBe(true);
        expect((await view.records('proposal')).some(record => record.id === 'harbor-museum')).toBe(false);
        expect(await expectTotals(view)).toEqual({...initial, proposal: initial.proposal - 18000, negotiation: initial.negotiation + 18000});
        await expect(advance).toBeDisabled();

        await reset.click();
        await expect.poll(async () => (await view.records('proposal')).map(record => record.id)).toEqual(proposal.map(record => record.id));
        expect((await view.records('negotiation')).map(record => record.id)).toEqual(negotiation.map(record => record.id));
        expect(await expectTotals(view)).toEqual(initial);
        await expect(advance).toBeEnabled()
    });

    test('pointer drag moves a deal and both stage totals', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 1440, height: 900});
        const view   = await open(page, neuralLink), initial = await expectTotals(view),
              from   = await view.card('harbor-museum').boundingBox(),
              target = await view.column('negotiation').boundingBox();
        expect(from).toBeTruthy();
        expect(target).toBeTruthy();
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {steps: 24});
        await page.mouse.up();
        await expect.poll(async () => (await view.records('negotiation')).some(record => record.id === 'harbor-museum')).toBe(true);
        expect(await expectTotals(view)).toEqual({...initial, proposal: initial.proposal - 18000, negotiation: initial.negotiation + 18000})
    });

    for (const theme of themes) {
        test(`opens with reconciled totals on mobile in ${theme}`, async ({page, neuralLink}) => {
            await page.setViewportSize({width: 390, height: 844});
            const view = await open(page, neuralLink, theme);
            await expect(page.locator('.sales-pipeline-viewport')).toHaveClass(new RegExp(theme));
            expect(await expectTotals(view)).toEqual({discovery: 25000, proposal: 30000, negotiation: 34000, won: 36000})
        })
    }
});
