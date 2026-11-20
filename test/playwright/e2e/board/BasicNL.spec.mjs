import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The board's basic example: one seeded store of 40 cards behind a board and a table.
 *
 * The board is driven through the store itself. `onPipelinePush` is the store's push-update path, which is
 * `record.set` on the keyed record; `add` and `remove` create and destroy records. A card's DOM element carries a mark
 * set from the page before a move, so the witness can tell a moved node from a recreated one even though the id scheme
 * (`<board>__card__<key>`) would give a recreated card the same id.
 *
 * Run: npm run test-e2e -- test/playwright/e2e/board/BasicNL.spec.mjs
 */
const
    COUNTS     = {backlog: 12, ready: 10, 'in-progress': 6, review: 2, done: 10},
    STATUSES   = Object.keys(COUNTS),
    asArray    = value => Array.isArray(value) ? value : value ? [value] : [],
    firstId    = async (app, className) => asArray(await app.findInstances({className}, ['id']))[0]?.id,
    seedSliced = async (app, boardId, storeId, perColumn, budget) => {
        const records = STATUSES.flatMap(status => Array.from({length: perColumn}, (_, i) => ({
            id         : `${status}-${i}`,
            status,
            order      : i * 1000,
            title      : `${status} task ${i}`,
            description: 'Short task',
            tags       : [],
            assignees  : []
        })));

        await app.callMethod(storeId, 'setData', [records]);

        for (const status of STATUSES) {
            await app.setProperties(`${boardId}__col__${status}`, {maxRenderedCards: budget, overscan: 0})
        }
    },
    // Opens the example and binds the Neural Link to it, with readers bound to its board
    open    = async (page, neuralLink, theme) => {
        await page.goto(`/examples/board/basic/index.html${theme ? `?theme=${theme}` : ''}`);
        await page.locator('.neo-board-card').first().waitFor({timeout: 30000});

        const app     = await neuralLink.connectToApp('BoardBasic'),
              boardId = await firstId(app, 'Neo.board.Container'),
              gridId  = await firstId(app, 'Neo.grid.Container'),
              storeId = await firstId(app, 'Neo.examples.board.basic.MainStore');

        return {
            app,
            boardId,
            gridId,
            storeId,
            badge   : status => page.locator(`[id="${boardId}__col__${status}"] .neo-board-column-count`),
            column  : status => page.locator(`[id="${boardId}__col__${status}"]`),
            records : status => app.callMethod(boardId, 'getColumnRecords', [status]),
            domOrder: status => page.locator(`[id="${boardId}__col__${status}"] .neo-board-card`)
                .evaluateAll(cards => cards.map(card => card.id)),
            push    : data => app.callMethod(storeId, 'onPipelinePush', [data])
        }
    };

test.describe('Board, basic example: one store, two views', () => {
    test.setTimeout(120000);
    test.use({viewport: {height: 1080, width: 1920}});

    test('the five columns render the seeded counts, in-progress over its WIP limit and review under it', async ({page, neuralLink}) => {
        const {boardId, storeId, app, badge, column, domOrder, records} = await open(page, neuralLink);

        expect(boardId, 'the board exists').toBeTruthy();
        expect(await app.callMethod(storeId, 'getCount', [])).toBe(40);

        for (const [status, count] of Object.entries(COUNTS)) {
            const columnRecords = await records(status);

            expect(columnRecords, `${status}: the column holds its status's records`).toHaveLength(count);
            expect(await domOrder(status), `${status}: the DOM order is getColumnRecords' order`)
                .toEqual(columnRecords.map(record => `${boardId}__card__${record.id}`))
        }

        await expect(column('in-progress')).toHaveClass(/neo-board-column-wip-exceeded/);
        await expect(badge('in-progress')).toHaveText('6/5');
        await expect(column('review')).not.toHaveClass(/neo-board-column-wip-exceeded/);
        await expect(badge('review')).toHaveText('2/3')
    });

    test('opens in the dark theme on a system that prefers dark, unless ?theme= names another', async ({page}) => {
        const url   = '/examples/board/basic/index.html',
              theme = () => page.locator('.board-example').evaluate(node => [...node.classList].find(cls => cls.startsWith('neo-theme-')));

        await page.emulateMedia({colorScheme: 'light'});
        await page.goto(url);
        await expect.poll(theme, 'a light system gets the first configured theme').toBe('neo-theme-neo-light');

        await page.emulateMedia({colorScheme: 'dark'});
        await page.goto(url);
        await expect.poll(theme, 'a dark system gets the dark theme').toBe('neo-theme-neo-dark');

        await page.goto(`${url}?theme=neo-theme-light`);
        await expect.poll(theme, '?theme= wins over the system').toBe('neo-theme-light')
    });

    for (const theme of ['neo-theme-neo-light', 'neo-theme-neo-dark']) {
        test(`a card dragged to another column moves its record, and the table on the same store shows the new status (${theme})`, async ({page, neuralLink}, testInfo) => {
            const {app, boardId, gridId, storeId, domOrder, records} = await open(page, neuralLink, theme),
                  cardId                                             = `${boardId}__card__1`,
                  row                                                = page.locator(`[id="${gridId}"]`).getByRole('row').filter({hasText: 'Design the login form'});

            expect((await app.getComponent(boardId, ['store.id']))['store.id'], 'the board binds the store').toBe(storeId);
            expect((await app.getComponent(gridId, ['store.id']))['store.id'], 'the table binds the same instance').toBe(storeId);
            expect((await records('backlog')).map(record => record.id), 'card 1 starts in the backlog').toContain(1);
            await expect(row).toContainText('Backlog');

            await page.locator(`[id="${cardId}"]`).evaluate(node => {node.dataset.witness = 'moved'});

            // A real pointer drag: the board's zone commits the drop through its single writer
            const from = await page.locator(`[id="${cardId}"]`).boundingBox(),
                  to   = await page.locator(`[id="${boardId}__col__ready"]`).boundingBox();

            await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
            await page.mouse.down();
            await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2, {steps: 4});
            await page.mouse.move(to.x + to.width / 2, to.y + 120, {steps: 16});
            await page.mouse.up();

            // The drop commits after the zone restores the dragged node, so the record is the truth to wait on
            await expect.poll(async () => (await records('ready')).some(record => record.id === 1), {message: 'card 1 is a Ready record'}).toBe(true);
            expect(await domOrder('ready'), 'the board projects it into Ready').toContain(cardId);
            await expect(page.locator(`[id="${cardId}"]`), 'the same DOM node, moved').toHaveAttribute('data-witness', 'moved');
            expect(await app.callMethod(storeId, 'getCount', []), 'a move adds no record').toBe(40);
            await expect(row, 'the table row of the same record shows the new status').toContainText('Ready');

            await testInfo.attach(`board-basic-${theme}`, {body: await page.screenshot(), contentType: 'image/png'})
        })
    }

    for (const theme of ['neo-theme-neo-light', 'neo-theme-neo-dark']) {
        test(`a column dragged by its header carries its cards, leaves its slot empty and moves once (${theme})`, async ({page, neuralLink}, testInfo) => {
            const {boardId, column, domOrder, records} = await open(page, neuralLink, theme),
                  proxy  = page.locator('.neo-dragproxy'),
                  order  = () => page.locator(`[id^="${boardId}__col__"]`).evaluateAll((nodes, prefix) =>
                      nodes.map(node => node.id.slice(prefix.length)).filter(status => !status.includes('_')), `${boardId}__col__`),
                  cards  = await domOrder('ready'),
                  from   = await page.locator(`[id="${boardId}__col__ready"] .neo-board-column-header`).boundingBox(),
                  to     = await column('in-progress').boundingBox(),
                  y      = from.y + from.height / 2;

            expect(await order(), 'the seeded column order').toEqual(STATUSES);

            await page.mouse.move(from.x + 24, y);
            await page.mouse.down();
            await page.mouse.move(from.x + 44, y, {steps: 4});

            await expect(proxy.locator('.neo-board-column-header'), 'the proxy carries the header').toHaveCount(1);
            await expect(proxy.locator('.neo-board-card'), 'and every card the column renders').toHaveCount(cards.length);
            await expect(proxy.locator(`[id^="${boardId}__card__"]`), 'as copies, never the live card nodes').toHaveCount(0);
            await expect(column('ready'), 'the slot stays empty while the column is carried').toHaveCSS('visibility', 'hidden');

            const slot = await column('ready').boundingBox();

            expect((await proxy.boundingBox()).width, 'the proxy is as wide as the slot').toBe(slot.width);
            expect((await proxy.locator('.neo-board-column').boundingBox()).width, 'and the carried column fills it').toBe(slot.width);

            await page.mouse.move(to.x + to.width / 2 + 24, y, {steps: 16});
            expect((await proxy.boundingBox()).y, 'a level pointer keeps the column level with its slot').toBe(slot.y);

            const frame = testInfo.outputPath(`board-column-drag-${theme}.png`);
            await page.screenshot({path: frame});
            await testInfo.attach(`board-column-drag-${theme}`, {path: frame, contentType: 'image/png'});
            await page.mouse.up();

            await expect.poll(order, {message: 'one move: Ready lands after In Progress'}).toEqual(['backlog', 'in-progress', 'ready', 'review', 'done']);
            await expect(column('ready')).not.toHaveCSS('visibility', 'hidden');
            await expect(proxy).toHaveCount(0);
            expect(await page.evaluate(id => Neo.main.addon.DragDrop.zoneRegistrations[id] ?? null, `${boardId}__col__ready`),
                'the zone registry stays keyed on headers, so card drags inside the column keep their zone').toBeNull();
            expect(await domOrder('ready'), 'the moved column keeps its cards').toEqual(cards);

            // A card drag inside the moved column must still reach the card zone, not the column zone
            const moved = (await records('ready'))[0].id,
                  card  = await page.locator(`[id="${boardId}__card__${moved}"]`).boundingBox(),
                  into  = await column('review').boundingBox();

            await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
            await page.mouse.down();
            await page.mouse.move(card.x + card.width / 2 + 20, card.y + card.height / 2, {steps: 4});
            await page.mouse.move(into.x + into.width / 2, into.y + 120, {steps: 16});
            await page.mouse.up();

            await expect.poll(async () => (await records('review')).some(record => record.id === moved),
                {message: 'a card dragged out of the moved column lands in Review'}).toBe(true)
        })
    }

    test('a windowed column dragged by its header carries only the cards it renders', async ({page, neuralLink}) => {
        const {app, boardId, storeId, domOrder} = await open(page, neuralLink),
              proxy = page.locator('.neo-dragproxy');

        await seedSliced(app, boardId, storeId, 60, 8);
        await expect.poll(async () => (await domOrder('ready')).length, {message: 'the column windows its 60 cards'}).toBeLessThan(60);

        const rendered = (await domOrder('ready')).length,
              from     = await page.locator(`[id="${boardId}__col__ready"] .neo-board-column-header`).boundingBox(),
              y        = from.y + from.height / 2;

        await page.mouse.move(from.x + 24, y);
        await page.mouse.down();
        await page.mouse.move(from.x + 44, y, {steps: 4});

        await expect(proxy.locator('.neo-board-card'), 'the proxy clones the rendered window only').toHaveCount(rendered);

        await page.mouse.up()
    });

    for (const theme of ['neo-theme-neo-light', 'neo-theme-neo-dark']) {
        test(`at 1440 × 900 all five columns are in view on first paint, the table below them (${theme})`, async ({page, neuralLink}, testInfo) => {
            await page.setViewportSize({height: 900, width: 1440});

            const {boardId} = await open(page, neuralLink, theme);

            for (const status of STATUSES) {
                const id                    = `${boardId}__col__${status}`,
                      {height, width, x, y} = await page.locator(`[id="${id}"]`).boundingBox(),
                      // Whatever the pointer would hit at the column's two edges, below its header
                      edges                 = await page.evaluate(({id, points}) => points.map(([px, py]) =>
                          !!document.elementFromPoint(px, py)?.closest(`[id="${id}"]`)), {id, points: [[x + 2, y + 24], [x + width - 2, y + 24]]});

                expect(x, `${status}: starts in view`).toBeGreaterThanOrEqual(0);
                expect(x + width, `${status}: ends in view`).toBeLessThanOrEqual(1440);
                expect(edges, `${status}: nothing covers either edge`).toEqual([true, true]);
                expect(height, `${status}: a column, not a strip`).toBeGreaterThan(300)
            }

            await testInfo.attach(`board-basic-1440-${theme}`, {body: await page.screenshot(), contentType: 'image/png'})
        })
    }

    test('at 390 × 844 the first screen shows the board, its first column whole, and the table below it', async ({page, neuralLink}, testInfo) => {
        await page.setViewportSize({height: 844, width: 390});

        const {boardId, gridId} = await open(page, neuralLink),
              first             = await page.locator(`[id="${boardId}__col__backlog"]`).boundingBox(),
              table             = await page.locator(`[id="${gridId}"]`).boundingBox();

        expect(first.x, 'the first column starts in view').toBeGreaterThanOrEqual(0);
        expect(first.x + first.width, 'and ends in view').toBeLessThanOrEqual(390);
        expect(first.y, 'at the top of the first screen').toBeLessThan(844 / 2);
        expect(table.y, 'the table starts below the board').toBeGreaterThanOrEqual(first.y + first.height - 1);

        await testInfo.attach('board-basic-390', {body: await page.screenshot(), contentType: 'image/png'})
    });

    test('with swimlanes, every lane header reads toggle, title and count from its start and keeps them in view, also on a board narrower than its columns', async ({page, neuralLink}) => {
        const {app, boardId, storeId} = await open(page, neuralLink),
              lanes                   = ['Alpha', 'Beta', 'Gamma'],
              board                   = page.locator(`[id="${boardId}"]`),
              // Per lane, against the board's padding box (a scrollbar excluded): where the toggle starts, whether
              // toggle, title and count follow in that order, and whether all three lie inside the box
              headers = () => board.evaluate(node => {
                  const left  = node.getBoundingClientRect().left + node.clientLeft,
                        right = left + node.clientWidth,
                        box   = (lane, part) => lane.querySelector(`.neo-board-lane-${part}`).getBoundingClientRect();

                  return [...node.querySelectorAll('.neo-board-lane')].map(lane => {
                      const [toggle, title, count] = ['collapse', 'title', 'count'].map(part => box(lane, part));

                      return {
                          start : Math.round(toggle.left - left),
                          order : toggle.right <= title.left && title.right <= count.left,
                          inView: [toggle, title, count].every(rect => rect.left >= left - 1 && rect.right <= right + 1)
                      }
                  })
              }),
              // Board padding 12, lane border 1, header padding 12
              expected = lanes.map(() => ({start: 25, order: true, inView: true}));

        await app.callMethod(storeId, 'setData', [STATUSES.flatMap(status => lanes.map((lane, i) => ({
            id: `${status}-${lane}`, status, lane, order: i * 1000, title: `${lane} ${status}`, description: 'Short task', tags: [], assignees: []
        })))]);
        // Alpha stays whole and sets the scroll range; Beta stays open but narrows to one column; Gamma folds
        await app.setProperties(boardId, {laneField: 'lane', lanes: lanes.map(value => ({value, collapsed: value === 'Gamma'}))});
        await expect(page.locator(`[id="${boardId}__col__done__Beta"]`)).toHaveCount(1);

        for (const status of STATUSES.slice(1)) {
            await app.setProperties(`${boardId}__col__${status}__Beta`, {collapsed: true})
        }

        await expect.poll(headers, '1920 wide, the columns fit').toEqual(expected);

        for (const [width, height] of [[1280, 720], [390, 844]]) {
            await page.setViewportSize({height, width});
            await expect.poll(() => board.evaluate(node => node.scrollWidth > node.clientWidth), `${width} wide: the columns overflow the board`).toBe(true);
            await expect.poll(headers, `${width} wide, at rest`).toEqual(expected);

            await board.evaluate(node => {node.scrollLeft = node.scrollWidth});
            await expect.poll(headers, `${width} wide, scrolled to the end`).toEqual(expected)
        }
    });

    test('record.set({status, order}) moves the same card instance to the head of another column', async ({page, neuralLink}) => {
        const {boardId, domOrder, push, records} = await open(page, neuralLink),
              [moved]                            = await records('backlog'),
              cardId                             = `${boardId}__card__${moved.id}`;

        // A mark on the DOM element itself: a moved node keeps it, a recreated one would not
        await page.locator(`[id="${cardId}"]`).evaluate(node => {node.dataset.witness = 'moved'});

        await push({id: moved.id, status: 'ready', order: 500});

        await expect.poll(async () => (await domOrder('ready'))[0], {message: 'the card leads the ready column'}).toBe(cardId);
        expect(await domOrder('backlog')).not.toContain(cardId);
        await expect(page.locator(`[id="${cardId}"]`), 'the same DOM node, moved').toHaveAttribute('data-witness', 'moved');
        expect((await records('ready'))[0]).toMatchObject({id: moved.id, order: 500, status: 'ready'})
    });

    test('store.add and store.remove create and destroy exactly one card', async ({page, neuralLink}) => {
        const {boardId, storeId, app, domOrder} = await open(page, neuralLink),
              cardId                            = `${boardId}__card__41`;

        await app.callMethod(storeId, 'add', [{id: 41, title: 'A card from the witness', status: 'ready', order: 99000}]);

        await expect.poll(async () => (await domOrder('ready')).length).toBe(COUNTS.ready + 1);
        expect((await domOrder('ready')).at(-1)).toBe(cardId);
        await expect(page.locator('.neo-board-card')).toHaveCount(41);

        await app.callMethod(storeId, 'remove', [41]);

        await expect.poll(async () => (await domOrder('ready')).length).toBe(COUNTS.ready);
        await expect(page.locator(`[id="${cardId}"]`)).toHaveCount(0);
        await expect(page.locator('.neo-board-card')).toHaveCount(40)
    });

    // An invariant: two header updates in flight keep one badge node
    test('a column header keeps one badge node through a quick out-and-back', async ({page, neuralLink}) => {
        const {badge, push, records} = await open(page, neuralLink),
              [moved]                = await records('in-progress');

        // Out, until the header shows it, then straight back: the second update starts while the first settles
        await push({id: moved.id, status: 'review'});
        await expect(badge('in-progress').first()).toHaveText('5/5');
        await push({id: moved.id, status: 'in-progress'});

        await expect(badge('in-progress'), 'one badge node').toHaveCount(1);
        await expect(badge('in-progress')).toHaveText('6/5');
        await expect(badge('review')).toHaveCount(1);
        await expect(badge('review')).toHaveText('2/3')
    });

    test('double-click and F2 focus the inline title field; Enter commits once without opening the CardEditor, and Escape writes nothing', async ({page, neuralLink}) => {
        const {records} = await open(page, neuralLink),
              card0     = page.locator('.neo-board-card').first(),
              title0    = card0.locator('.neo-board-card-title'),
              before0   = (await title0.innerText()).trim();

        await title0.dblclick();

        const input0 = card0.locator('.neo-board-card-inline-editor input');

        await input0.waitFor({timeout: 5000});
        await expect.poll(() => input0.evaluate(el => el === document.activeElement)).toBe(true);

        await input0.fill(`${before0} X`);
        await input0.press('Enter');

        await expect(card0.locator('.neo-board-card-title')).toHaveText(`${before0} X`);
        await expect(page.locator('.neo-board-card-editor')).toBeHidden();
        expect((await records('backlog'))[0].title).toBe(`${before0} X`);
        await expect(card0).toBeFocused();

        const card1   = page.locator('.neo-board-card').nth(1),
              before1 = (await card1.locator('.neo-board-card-title').innerText()).trim();

        await card1.focus();
        await expect(card1).toBeFocused();
        await page.keyboard.press('F2');

        const input1 = card1.locator('.neo-board-card-inline-editor input');

        await input1.waitFor({timeout: 5000});
        await expect.poll(() => input1.evaluate(el => el === document.activeElement)).toBe(true);

        await input1.fill(`${before1} discarded`);
        await input1.press('Escape');

        await expect(card1.locator('.neo-board-card-title')).toHaveText(before1);
        expect((await records('backlog'))[1].title).toBe(before1)
    });

    test('openCardEditor shows the editor for a record whose card is not rendered', async ({page, neuralLink}) => {
        const {app, boardId, storeId} = await open(page, neuralLink);

        await seedSliced(app, boardId, storeId, 20, 3);
        await expect(page.locator(`[id="${boardId}__card__backlog-15"]`)).toHaveCount(0);

        await app.callMethod(boardId, 'openCardEditor', ['backlog-15']);
        await expect(page.locator('.neo-board-card-editor')).toBeVisible()
    });

    test('menu button opens the CardEditor; Cancel discards edits and Save by click writes the status change and closes the editor', async ({page, neuralLink}) => {
        const {app, boardId, records, storeId} = await open(page, neuralLink);

        await seedSliced(app, boardId, storeId, 20, 3);

        await page.locator(`[id="${boardId}__card__backlog-0"] .neo-board-card-menu-button`).click();

        const dialog = page.locator('.neo-board-card-editor');

        await dialog.waitFor({state: 'visible', timeout: 5000});
        await app.callMethod(`${boardId}__editor`, 'setFieldValue', ['title', 'Discarded title']);
        await page.locator('.neo-board-card-editor-cancel').click();
        await expect(dialog).toBeHidden();
        expect((await records('backlog'))[0].title).toBe('backlog task 0');

        await page.locator(`[id="${boardId}__card__backlog-0"] .neo-board-card-menu-button`).click();
        await dialog.waitFor({state: 'visible', timeout: 5000});
        await app.callMethod(`${boardId}__editor`, 'setFieldValue', ['status', 'done']);
        await page.locator('.neo-board-card-editor-save').click();
        await expect(dialog).toBeHidden();

        const doneRecords = await records('done');

        expect(doneRecords.at(-1)).toMatchObject({id: 'backlog-0', status: 'done'})
    });

    test('the card editor keeps WCAG contrast on Save in neo-light and on header icons and field outlines in cyberpunk', async ({page, neuralLink}) => {
        const measureEditor = () => page.locator('.neo-board-card-editor').evaluate(editor => {
            const parseRgb = value => (value.match(/\d+(\.\d+)?/g) || [0, 0, 0]).slice(0, 3).map(Number),
                  lum      = ([r, g, b]) => [r, g, b]
                      .map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
                      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0),
                  ratio    = (a, b) => {
                      const [l1, l2] = [lum(parseRgb(a)), lum(parseRgb(b))];
                      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
                  },
                  editorBg = getComputedStyle(editor).backgroundColor,
                  header   = editor.querySelector('.neo-header-toolbar'),
                  headerBg = getComputedStyle(header).backgroundColor,
                  saveBtn  = editor.querySelector('.neo-board-card-editor-save'),
                  saveText = editor.querySelector('.neo-board-card-editor-save .neo-button-text') || saveBtn;

            document.activeElement?.blur?.();

            return {
                saveContrast : ratio(getComputedStyle(saveText).color, getComputedStyle(saveBtn).backgroundColor),
                iconContrasts: [...editor.querySelectorAll('.neo-header-toolbar .neo-button-glyph')]
                    .map(glyph => ratio(getComputedStyle(glyph).color, headerBg)),
                fieldBorders : [...editor.querySelectorAll('.neo-textfield-input, .neo-selectfield-input')].map(input => {
                    const style = getComputedStyle(input);
                    return {
                        contrast: ratio(style.borderTopColor, editorBg),
                        style   : style.borderTopStyle,
                        width   : parseFloat(style.borderTopWidth)
                    }
                })
            }
        });

        const light = await open(page, neuralLink, 'neo-theme-neo-light');

        await light.app.callMethod(light.boardId, 'openCardEditor', [1]);
        await expect(page.locator('.neo-board-card-editor')).toBeVisible();
        expect((await light.app.getComponent(`${light.boardId}__editor`, ['hidden'])).hidden).toBe(false);

        const lightMetrics = await measureEditor();

        expect(lightMetrics.saveContrast, 'neo-light Save label >= 4.5:1').toBeGreaterThanOrEqual(4.5);

        const cyber = await open(page, neuralLink, 'neo-theme-cyberpunk');

        await cyber.app.callMethod(cyber.boardId, 'openCardEditor', [1]);
        await expect(page.locator('.neo-board-card-editor')).toBeVisible();
        expect((await cyber.app.getComponent(`${cyber.boardId}__editor`, ['hidden'])).hidden).toBe(false);

        const cyberMetrics = await measureEditor();

        expect(cyberMetrics.iconContrasts.length).toBeGreaterThanOrEqual(2);
        cyberMetrics.iconContrasts.forEach(contrast => expect(contrast, 'cyberpunk header icon >= 3:1').toBeGreaterThanOrEqual(3));
        expect(cyberMetrics.fieldBorders.length).toBeGreaterThanOrEqual(7);
        cyberMetrics.fieldBorders.forEach(border => {
            expect(border.width, 'cyberpunk field border width').toBeGreaterThanOrEqual(1);
            expect(border.style).not.toBe('none');
            expect(border.contrast, 'cyberpunk unfocused field outline >= 3:1').toBeGreaterThanOrEqual(3)
        })
    })
});
