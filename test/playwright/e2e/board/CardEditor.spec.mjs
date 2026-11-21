import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The hiring pipeline example: a candidate renamed on the card itself, and moved, retitled and reassigned in
 * the board's card editor.
 *
 * Gestures are real pointer and key input; the records and the board are read in the App Worker. Candidates are keyed
 * `c-01` to `c-24` in stage order: `c-01` is the first of Applied, `c-02` the second.
 *
 * Run: npm run test-e2e -- test/playwright/e2e/board/CardEditor.spec.mjs
 */
const
    THEMES = ['neo-theme-neo-dark', 'neo-theme-neo-light', 'neo-theme-light', 'neo-theme-dark', 'neo-theme-cyberpunk'],
    STAGES = ['applied', 'screen', 'interview', 'offer', 'hired'],
    // Reads the board from the App Worker: its id, one record's fields and each column's keys in order
    readBoard = (page, key = 'c-01') => page.workers().find(worker => worker.url().includes('worker/App')).evaluate(([key, stages]) => {
        const board  = [...globalThis.Neo.manager.Instance.items.values()].find(instance => instance.className === 'Neo.board.Container'),
              record = board.store.get(key);

        return {
            id     : board.id,
            record : {assignees: [...record.assignees], status: record.status, tags: [...record.tags], title: record.title},
            columns: Object.fromEntries(stages.map(stage => [stage, board.getColumnRecords(stage).map(item => item.id)]))
        }
    }, [key, STAGES]),
    // Opens the example and collects console errors
    open = async (page, theme) => {
        const errors = [];

        // The test server has no favicon: that request is the browser's own, not the example's
        page.on('console', msg => {
            const {url} = msg.location();
            msg.type() === 'error' && !url?.endsWith('/favicon.ico') && errors.push(`${msg.text()} ${url}`.trim())
        });
        page.on('pageerror', err => errors.push(err.message));

        await page.goto(`/examples/board/cardEditor/index.html${theme ? `?theme=${theme}` : ''}`);
        await page.locator('.neo-board-card').first().waitFor({timeout: 30000});
        await expect.poll(() => page.workers().some(worker => worker.url().includes('worker/App'))).toBe(true);

        const {id} = await readBoard(page);

        return {
            errors,
            card  : key   => page.locator(`[id="${id}__card__${key}"]`),
            column: stage => page.locator(`[id="${id}__col__${stage}"]`),
            editor: page.locator('.neo-board-card-editor'),
            read  : key   => readBoard(page, key)
        }
    };

test.describe('Board, card editor example: a hiring pipeline edited on the card and in its editor', () => {
    test.setTimeout(120000);
    test.use({viewport: {height: 900, width: 1440}});

    test('a name is renamed on the card: Enter saves, Escape restores, focus returns, and the card keeps its size', async ({page}) => {
        const {card, errors, read} = await open(page),
              before               = await card('c-01').boundingBox();

        await card('c-01').locator('.neo-board-card-title').dblclick();
        const field = card('c-01').locator('.neo-board-card-inline-editor input');
        await expect(field).toBeFocused();

        const edited = await card('c-01').boundingBox();

        // A native input and a title line box can round a fraction of a CSS pixel differently.
        expect(Math.abs(edited.height - before.height), 'the card keeps its height while edited').toBeLessThan(0.25);

        await field.fill('Aiko Brandt-Sato');
        await page.keyboard.press('Enter');

        await expect.poll(async () => (await read('c-01')).record.title, {message: 'Enter saves'}).toBe('Aiko Brandt-Sato');
        await expect(card('c-01').locator('.neo-board-card-title')).toHaveText('Aiko Brandt-Sato');
        expect(await page.evaluate(() => !!document.activeElement?.closest('[id$="__card__c-01"]')), 'focus returns to the card').toBe(true);

        await page.keyboard.press('F2');
        await expect(field).toBeFocused();
        await field.fill('Nobody');
        await page.keyboard.press('Escape');

        await expect(card('c-01').locator('.neo-board-card-title')).toHaveText('Aiko Brandt-Sato');
        expect((await read('c-01')).record.title, 'Escape restores').toBe('Aiko Brandt-Sato');
        expect(errors).toEqual([])
    });

    test('the editor moves a candidate to Interview and saves name, role and recruiter; Cancel and Escape change nothing', async ({page}) => {
        const {card, editor, errors, read} = await open(page);

        // Cancel and Escape write nothing
        await card('c-02').locator('.neo-board-card-menu-button').click();
        await expect(editor).toBeVisible();
        await editor.getByLabel('Role').fill('Staff data analyst');
        await editor.getByRole('button', {name: 'Cancel'}).click();
        await expect(editor).toBeHidden();

        await card('c-02').locator('.neo-board-card-menu-button').click();
        await expect(editor).toBeVisible();
        await expect(editor.getByLabel('Role'), 'Cancel kept the record\'s value').toHaveValue('Data analyst');
        await page.keyboard.press('Escape');
        await expect(editor).toBeHidden();
        expect((await read('c-02')).record).toEqual({assignees: ['Jordan'], status: 'applied', tags: ['Data analyst'], title: 'Bruno Okafor'});

        // A new stage moves the card; name, role and recruiter save with it
        await card('c-02').locator('.neo-board-card-menu-button').click();
        await expect(editor).toBeVisible();
        await editor.getByLabel('Name').fill('Bruno Okafor-Lind');
        await editor.getByLabel('Stage').selectOption({label: 'Interview'});
        await editor.getByLabel('Role').fill('Staff data analyst');
        await editor.getByLabel('Recruiter').fill('Sam');
        await editor.getByRole('button', {name: 'Save'}).click();
        await expect(editor).toBeHidden();

        await expect.poll(async () => (await read('c-02')).record, {message: 'one save writes name, stage, role and recruiter'})
            .toEqual({assignees: ['Sam'], status: 'interview', tags: ['Staff data analyst'], title: 'Bruno Okafor-Lind'});

        const {columns} = await read('c-02');

        expect(columns.interview, 'the card moved to Interview').toContain('c-02');
        expect(columns.applied).not.toContain('c-02');
        await expect(card('c-02').locator('.neo-board-card-title')).toHaveText('Bruno Okafor-Lind');
        await expect(card('c-02').locator('.neo-board-card-tag')).toHaveText('Staff data analyst');
        expect(errors).toEqual([])
    });

    for (const theme of THEMES) {
        test(`at 1440 × 900 the five stages are in view, 24 candidates across them (${theme})`, async ({page}, testInfo) => {
            const {column, errors, read} = await open(page, theme),
                  {columns}              = await read();

            for (const stage of STAGES) {
                const {width, x} = await column(stage).boundingBox();

                expect(x, `${stage}: starts in view`).toBeGreaterThanOrEqual(0);
                expect(x + width, `${stage}: ends in view`).toBeLessThanOrEqual(1440)
            }

            expect(Object.values(columns).flat()).toHaveLength(24);
            expect(errors).toEqual([]);

            await testInfo.attach(`board-card-editor-1440-${theme}`, {body: await page.screenshot(), contentType: 'image/png'})
        })
    }

    test('at 390 × 844 Applied fits the screen whole', async ({page}, testInfo) => {
        await page.setViewportSize({height: 844, width: 390});

        const {column, errors} = await open(page),
              applied          = await column('applied').boundingBox();

        expect(applied.x, 'Applied starts in view').toBeGreaterThanOrEqual(0);
        expect(applied.x + applied.width, 'and ends in view').toBeLessThanOrEqual(390);
        expect(errors).toEqual([]);

        await testInfo.attach('board-card-editor-390', {body: await page.screenshot(), contentType: 'image/png'})
    })
});
