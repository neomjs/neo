import {expect, test} from '../../fixtures.mjs';

/**
 * @summary The grid cell-editing loop on a grid small enough that pooling never moves a cell: activation, commit,
 * cancel, focus, and the gestures that must not start or end an edit.
 *
 * Fixture: `apps/grid-cell-editing`, grid `#grid-cell-editing` (`cellEditing: true`, a `CellModel`). Pooling is
 * covered by `test/playwright/e2e/grid/CellEditingPooling.spec.mjs` on the same page's pooled grid.
 *
 * Cells are addressed by `data-field` and `data-record-id`, never by DOM order or cell id: a cell's DOM id is a
 * pool slot. Record ids are read once from the untouched grid, because an edit changes the text a lookup by
 * content would need.
 *
 * Negative arms never assert an absence right after an event: the App Worker handles events in order, so each
 * one records what the DOM did, then drives a later event with a visible effect, and only reads the recording
 * once that effect has landed.
 */
const GRID    = '#grid-cell-editing',
      EDITOR  = `${GRID} .neo-grid-editor`,
      INPUT   = `${EDITOR} input`,
      OUTSIDE = '#grid-cell-editing-outside';

/**
 * @param {import('@playwright/test').Page} page
 * @param {String} field
 * @param {String} recordId
 * @returns {import('@playwright/test').Locator}
 */
const cell = (page, field, recordId) => page.locator(`${GRID} .neo-grid-cell[data-field="${field}"][data-record-id="${recordId}"]`);

/**
 * The record id of the row whose `name` cell reads `Name <n>`.
 * @param {import('@playwright/test').Page} page
 * @param {Number} n
 * @returns {Promise<String>}
 */
const recordIdOf = (page, n) => page.locator(`${GRID} .neo-grid-cell[data-field="name"]`).getByText(`Name ${n}`, {exact: true})
    .getAttribute('data-record-id');

const activeElementId = page => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);

const viewIdOf = page => page.locator(`${GRID} .neo-grid-view`).first().getAttribute('id');

/**
 * Whether a worker instance still exists. `getConfigs` replies `false` for an unknown id, and a main thread that drops
 * falsy replies never settles it, so it races a second call to an instance that stays alive: replies arrive in
 * request order, so the second only wins when the first never comes.
 * @param {import('@playwright/test').Page} page
 * @param {String} id
 * @returns {Promise<Boolean>}
 */
const isLive = (page, id) => page.evaluate(id => Promise.race([
    Neo.worker.App.getConfigs({id, keys: ['id']}).then(reply => reply !== false),
    Neo.worker.App.getConfigs({id: 'grid-cell-editing-pooled', keys: ['id']}).then(() => false)
]), id);

/**
 * Resolves once the App Worker has handled every event sent before it, including the main-thread calls those made.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
const roundTrip = page => page.evaluate(() => Neo.worker.App.getConfigs({id: 'grid-cell-editing-pooled', keys: ['id']}));

/**
 * Whether DOM focus sits in the input of an editor embodied in the given cell.
 * @returns {Promise<Boolean>}
 */
const editingIn = (page, field, recordId) => page.evaluate(({field, recordId}) => {
    const input = document.activeElement,
          cell  = input?.closest?.('.neo-grid-cell');

    return input?.tagName === 'INPUT' && !!input.closest('.neo-grid-editor') &&
        cell?.dataset.field === field && cell?.dataset.recordId === recordId
}, {field, recordId});

/**
 * Starts recording every editor node that enters `#grid-cell-editing`, and the most editors present at once.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
const recordEditors = page => page.evaluate(grid => {
    const root  = document.querySelector(grid),
          count = () => root.querySelectorAll('.neo-grid-editor').length;

    window.__editors = {added: 0, max: count()};

    new MutationObserver(records => {
        records.forEach(record => record.addedNodes.forEach(node => {
            if (node.nodeType === 1 && (node.matches('.neo-grid-editor') || node.querySelector('.neo-grid-editor'))) {
                window.__editors.added++
            }
        }));

        window.__editors.max = Math.max(window.__editors.max, count())
    }).observe(root, {childList: true, subtree: true})
}, GRID);

const editorsRecorded = page => page.evaluate(() => window.__editors);

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/grid-cell-editing/index.html');
    await page.waitForSelector(`${GRID} .neo-grid-cell[data-field="note"]`, {state: 'visible', timeout: 30000})
});

test.describe('grid cell editing — activation', () => {
    for (const [field, body] of [['code', 'locked-start'], ['name', 'center'], ['note', 'locked-end']]) {
        test(`a double-click embodies one editor in a ${body} cell, focused, showing the cell value`, async ({page}) => {
            const recordId = await recordIdOf(page, 2),
                  target   = cell(page, field, recordId),
                  value    = (await target.innerText()).trim();

            await target.dblclick();

            await expect.poll(() => editingIn(page, field, recordId), {message: 'focus lands in the embodied input'}).toBe(true);
            await expect(page.locator(EDITOR)).toHaveCount(1);
            await expect(target.locator('.neo-grid-editor input')).toHaveValue(value)
        });

        // A slowed main thread lands the render inserting the editor after the selection's render has settled the
        // activation's repaint, so only focusing on the editor's own mount finds the input in the DOM
        test(`a double-click focuses the editor of a ${body} cell while the main thread lags`, async ({page}) => {
            const recordId = await recordIdOf(page, 2),
                  cdp      = await page.context().newCDPSession(page);

            await cdp.send('Emulation.setCPUThrottlingRate', {rate: 8});
            await cell(page, field, recordId).dblclick();

            await expect.poll(() => editingIn(page, field, recordId), {message: 'focus lands in the embodied input', timeout: 10000}).toBe(true)
        })
    }

    test('Enter and F2 on a selected editable cell embody the editor', async ({page}) => {
        const recordId = await recordIdOf(page, 3),
              name     = cell(page, 'name', recordId),
              city     = cell(page, 'city', recordId);

        await name.click();
        await expect(name).toHaveClass(/neo-selected/);
        await page.keyboard.press('Enter');
        await expect.poll(() => editingIn(page, 'name', recordId), {message: 'Enter embodies the editor'}).toBe(true);

        await page.keyboard.press('Escape');
        await expect(page.locator(EDITOR)).toHaveCount(0);

        await city.click();
        await expect(city).toHaveClass(/neo-selected/);
        await page.keyboard.press('F2');
        await expect.poll(() => editingIn(page, 'city', recordId), {message: 'F2 embodies the editor'}).toBe(true)
    });

    test('Space on a selected cell and any gesture on a non-editable column start nothing', async ({page}) => {
        const recordId = await recordIdOf(page, 2),
              name     = cell(page, 'name', recordId),
              score    = cell(page, 'score', recordId),
              city     = cell(page, 'city', recordId);

        await name.click();
        await expect(name).toHaveClass(/neo-selected/);
        await recordEditors(page);

        await page.keyboard.press('Space');
        await score.dblclick();
        await page.keyboard.press('Enter');

        // Ordered round trip: once the App Worker has selected `city`, every event above has been handled
        await city.click();
        await expect(city).toHaveClass(/neo-selected/);

        expect((await editorsRecorded(page)).added, 'no editor entered the grid').toBe(0);

        // Positive control: the plugin is live, so the absence above is not a dead plugin
        await page.keyboard.press('Enter');
        await expect.poll(() => editingIn(page, 'city', recordId)).toBe(true)
    })
});

test.describe('grid cell editing — activation selects the value', () => {
    /**
     * The editor input's selection, read from the DOM rather than inferred from what typing did.
     * @returns {Promise<{end: Number, start: Number, value: String}>}
     */
    const selectionOf = page => page.evaluate(selector => {
        const el = document.querySelector(selector);

        return {end: el.selectionEnd, start: el.selectionStart, value: el.value}
    }, INPUT);

    // Every activation gesture, because the selection hangs off the editor's `mounted`, and each gesture reaches it
    // by a different route: a cell event, and two keys through grid.View's registry
    for (const [gesture, activate] of [
        ['a double-click', (page, target) => target.dblclick()],
        ['Enter',          async (page, target) => { await target.click(); await page.keyboard.press('Enter') }],
        ['F2',             async (page, target) => { await target.click(); await page.keyboard.press('F2') }]
    ]) {
        test(`${gesture} opens the editor with its whole value selected, so typing replaces it`, async ({page}) => {
            const recordId = await recordIdOf(page, 2),
                  target   = cell(page, 'name', recordId),
                  value    = (await target.innerText()).trim();

            await activate(page, target);
            await expect.poll(() => editingIn(page, 'name', recordId)).toBe(true);

            await expect.poll(() => selectionOf(page), {message: 'activation selects the whole value'})
                .toEqual({end: value.length, start: 0, value});

            // The consequence the selection exists for. A caret check alone passes on a selection of the wrong range;
            // this fails unless the replaced text is the WHOLE value
            await page.keyboard.type('Zed');
            await expect(page.locator(INPUT)).toHaveValue('Zed')
        })
    }
});

test.describe('grid cell editing — terminals', () => {
    test('Enter writes a valid dirty draft, removes the editor and returns focus to the View', async ({page}) => {
        const recordId = await recordIdOf(page, 2),
              name     = cell(page, 'name', recordId),
              viewId   = await viewIdOf(page);

        await name.dblclick();
        await expect.poll(() => editingIn(page, 'name', recordId)).toBe(true);

        await page.keyboard.type('Edited name');
        await page.keyboard.press('Enter');

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(name).toHaveText('Edited name');
        await expect.poll(() => activeElementId(page), {message: 'focus returns to the View'}).toBe(viewId);

        // A commit is no cancel. The fixture writes every `cellEditCancel` onto the grid's node, and one component's
        // renders land in order: once a later cancel shows there, an earlier one would
        await cell(page, 'note', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'note', recordId)).toBe(true);
        await page.keyboard.press('Escape');
        await expect(page.locator(GRID)).toHaveClass(/edit-cancelled-note-escape/);
        await expect(page.locator(GRID), 'the commit announced no cancel').not.toHaveClass(/edit-cancelled-name/)
    });

    // Focus returning to the View is only half of what the arrow keys need: they move from a selected cell, and a
    // commit that ends the edit in place used to leave none. Tab never had this hole — it selects the cell it moves to.
    test('Enter leaves the edited cell selected, so the arrow keys have an anchor', async ({page}) => {
        const recordId = await recordIdOf(page, 2),
              name     = cell(page, 'name', recordId),
              score    = cell(page, 'score', recordId);

        await name.dblclick();
        await expect.poll(() => editingIn(page, 'name', recordId)).toBe(true);

        await page.keyboard.type('Edited name');
        await page.keyboard.press('Enter');

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(name, 'the edited cell is the anchor').toHaveClass(/neo-selected/);

        // …and it is a real anchor, not only a class: ArrowRight moves from it to the next column
        await page.keyboard.press('ArrowRight');
        await expect(score).toHaveClass(/neo-selected/);
        await expect(name).not.toHaveClass(/neo-selected/)
    });

    test('Escape discards the draft, destroys the editor and returns focus to the View', async ({page}) => {
        const recordId = await recordIdOf(page, 4),
              note     = cell(page, 'note', recordId),
              viewId   = await viewIdOf(page);

        await note.dblclick();
        await expect.poll(() => editingIn(page, 'note', recordId)).toBe(true);

        const editorId = await page.locator(EDITOR).getAttribute('id');

        await page.keyboard.type(' draft');
        await page.keyboard.press('Escape');

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(note).toHaveText('Note 4');
        await expect(page.locator(GRID), 'the cancel is announced, with its reason').toHaveClass(/edit-cancelled-note-escape/);
        await expect.poll(() => activeElementId(page)).toBe(viewId);
        expect(await isLive(page, editorId), 'the editor instance is destroyed, not only unmounted').toBe(false)
    });

    test('an invalid draft blocks Enter: the edit stays open and nothing is written', async ({page}) => {
        const recordId = await recordIdOf(page, 5),
              name     = cell(page, 'name', recordId);

        await name.dblclick();
        await expect.poll(() => editingIn(page, 'name', recordId)).toBe(true);

        // `name` is required: an empty draft is invalid
        await page.keyboard.press('ControlOrMeta+A');
        await page.keyboard.press('Backspace');
        await expect(page.locator(INPUT)).toHaveValue('');

        await page.keyboard.press('Enter');
        await page.keyboard.type('Z');

        // Z reaches the input only if Enter left the editor open and focused
        await expect(page.locator(INPUT)).toHaveValue('Z');

        await page.keyboard.press('Escape');
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(name, 'Enter wrote nothing: Escape restores the original').toHaveText('Name 5')
    });

    // The same block Enter meets, through the two gestures that also end an edit. Both already hold; the arms exist so
    // a later change to either terminal cannot quietly commit a draft the field rejects.
    test('an invalid draft blocks Tab: the edit stays open and focused', async ({page}) => {
        const recordId = await recordIdOf(page, 5),
              name     = cell(page, 'name', recordId);

        await name.dblclick();
        await expect.poll(() => editingIn(page, 'name', recordId)).toBe(true);

        await page.keyboard.press('ControlOrMeta+A');
        await page.keyboard.press('Backspace');
        await expect(page.locator(INPUT)).toHaveValue('');

        await page.keyboard.press('Tab');
        await page.keyboard.type('Z');

        // Z reaches the input only if Tab left the editor open and focused
        await expect(page.locator(INPUT)).toHaveValue('Z');

        await page.keyboard.press('Escape');
        await expect(name, 'Tab wrote nothing').toHaveText('Name 5')
    });

    test('an invalid draft survives focus leaving the grid: the edit stays open', async ({page}) => {
        const recordId = await recordIdOf(page, 5),
              name     = cell(page, 'name', recordId);

        await name.dblclick();
        await expect.poll(() => editingIn(page, 'name', recordId)).toBe(true);

        await page.keyboard.press('ControlOrMeta+A');
        await page.keyboard.press('Backspace');
        await expect(page.locator(INPUT)).toHaveValue('');

        await page.locator(OUTSIDE).click();

        // A valid draft commits away here — see `focus leaving the grid commits the draft`. An invalid one cannot.
        // Escape is no longer a way to read this: the click put focus outside the grid, so no key reaches the editor
        await expect(page.locator(EDITOR)).toHaveCount(1);
        await expect(page.locator(INPUT), 'the draft the field rejects is still pending, not written').toHaveValue('');
        await expect(name, 'the cell still shows its editor, not a value').toHaveText('Required')
    })
});

test.describe('grid cell editing — one session', () => {
    test('activating another cell commits the current draft first, and one editor exists at a time', async ({page}) => {
        const first  = await recordIdOf(page, 2),
              second = await recordIdOf(page, 3),
              name   = cell(page, 'name', first),
              city   = cell(page, 'city', second);

        await name.dblclick();
        await expect.poll(() => editingIn(page, 'name', first)).toBe(true);
        await recordEditors(page);

        await page.keyboard.type('Moved name');
        await city.dblclick();

        await expect.poll(() => editingIn(page, 'city', second), {message: 'the new cell is embodied'}).toBe(true);
        await expect(name).toHaveText('Moved name');
        expect((await editorsRecorded(page)).max, 'never two editors at once').toBeLessThanOrEqual(1)
    });

    test('focus leaving the grid commits the draft', async ({page}) => {
        const recordId = await recordIdOf(page, 1),
              note     = cell(page, 'note', recordId);

        await note.dblclick();
        await expect.poll(() => editingIn(page, 'note', recordId)).toBe(true);

        await page.keyboard.type('Left note');
        await page.locator(OUTSIDE).click();

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(note).toHaveText('Left note');
        expect(await activeElementId(page), 'focus stays where the user put it').toBe('grid-cell-editing-outside')
    });

    test('disabling the plugin cancels the open edit, and the grid says why', async ({page}) => {
        const recordId = await recordIdOf(page, 3),
              name     = cell(page, 'name', recordId);

        await name.dblclick();
        await expect.poll(() => editingIn(page, 'name', recordId)).toBe(true);
        await page.keyboard.type('Z');

        await page.evaluate(() => Neo.worker.App.setConfigs({id: 'grid-cell-editing-plugin', disabled: true}));

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(name, 'the draft was not written').toHaveText('Name 3');
        await expect(page.locator(GRID), 'the cancel is announced, with its reason').toHaveClass(/edit-cancelled-name-disabled/)
    });

    test('turning editable off on the active column cancels its session', async ({page}) => {
        const recordId = await recordIdOf(page, 6),
              city     = cell(page, 'city', recordId),
              name     = cell(page, 'name', recordId),
              value    = (await city.innerText()).trim();

        await city.dblclick();
        await expect.poll(() => editingIn(page, 'city', recordId)).toBe(true);
        await page.keyboard.type(' draft');

        await page.evaluate(() => Neo.worker.App.setConfigs({id: 'grid-cell-editing-city', editable: false}));

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(city).toHaveText(value);
        await expect(page.locator(GRID), 'the cancel is announced, with its reason').toHaveClass(/edit-cancelled-city-notEditable/);

        await recordEditors(page);
        await city.dblclick();
        await name.dblclick();
        await expect.poll(() => editingIn(page, 'name', recordId), {message: 'positive control: another column still edits'}).toBe(true);
        expect((await editorsRecorded(page)).added, 'only the name editor entered').toBe(1)
    })
});

test.describe('grid cell editing — pointer inside the editor', () => {
    test('a click inside the editor keeps focus in it and leaves the cell selection alone', async ({page}) => {
        const recordId = await recordIdOf(page, 2),
              name     = cell(page, 'name', recordId);

        await name.click();
        await expect(name).toHaveClass(/neo-selected/);
        await page.keyboard.press('Enter');
        await expect.poll(() => editingIn(page, 'name', recordId)).toBe(true);

        await page.evaluate(input => {
            window.__steals = 0;
            document.querySelector(input).addEventListener('focusout', () => window.__steals++)
        }, INPUT);

        await page.locator(INPUT).click({position: {x: 8, y: 6}});
        await roundTrip(page);

        expect(await page.evaluate(() => window.__steals), 'nothing took focus from the editor').toBe(0);

        // The cancel repaints the row from the selection model, so a toggled selection would show after it
        await page.keyboard.press('Escape');
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(name, 'the click did not toggle the selection').toHaveClass(/neo-selected/)
    })
});

test.describe('grid cell editing — teardown', () => {
    test('destroying the grid destroys the active editor', async ({page}) => {
        const recordId = await recordIdOf(page, 2);

        await cell(page, 'name', recordId).dblclick();
        await expect.poll(() => editingIn(page, 'name', recordId)).toBe(true);

        const editorId = await page.locator(EDITOR).getAttribute('id');

        await page.evaluate(() => Neo.worker.App.destroyNeoInstance('grid-cell-editing'));

        expect(await isLive(page, editorId), 'the grid took its editor down with it').toBe(false)
    });

    test('destroying the plugin alone discards the draft, restores the cell and releases the View keys', async ({page}) => {
        // The fixture gives this grid's plugin its id, so the arm names one plugin rather than a construction order
        const pluginId = 'grid-cell-editing-plugin',
              recordId = await recordIdOf(page, 2),
              name     = cell(page, 'name', recordId);

        await name.dblclick();
        await expect.poll(() => editingIn(page, 'name', recordId)).toBe(true);
        await page.keyboard.type('Z');

        const editorId = await page.locator(EDITOR).getAttribute('id');

        expect(await isLive(page, pluginId), `${pluginId} exists`).toBe(true);
        await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), pluginId);

        expect(await isLive(page, editorId), 'the plugin took its editor down with it').toBe(false);
        await expect(page.locator(EDITOR), 'no editor stays in the cell').toHaveCount(0);
        await expect(name, 'the draft was not written').toHaveText('Name 2');
        await expect(page.locator(GRID), 'the grid lives on, and hears the cancel').toHaveClass(/edit-cancelled-name-destroy/);

        // A key registered for the destroyed plugin would throw in the App Worker, which fails the arm
        await page.keyboard.press('Enter');
        await roundTrip(page);
        await expect(page.locator(EDITOR)).toHaveCount(0)
    })
});

test.describe('grid cell editing — aria-readonly', () => {
    /**
     * Per rendered cell of the small grid, its field and whether it carries `aria-readonly="true"`, read in one task.
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<Object>} `{field: [Boolean, …]}`
     */
    const readonlyByField = page => page.evaluate(grid => {
        const result = {};

        document.querySelectorAll(`${grid} .neo-grid-cell`).forEach(node => {
            (result[node.dataset.field] ??= []).push(node.getAttribute('aria-readonly') === 'true')
        });

        return result
    }, GRID);

    /**
     * @param {Object} byField
     * @returns {String[]} The fields whose every rendered cell is marked read-only, sorted
     */
    const readonlyFields = byField => Object.keys(byField).filter(field => byField[field].every(Boolean)).sort();

    test('with editing on, the cells of the non-editable columns are read-only, and no editable cell is', async ({page}) => {
        const byField = await readonlyByField(page);

        // `id` and `score` are the fixture's non-editable columns, one locked to the start and one in the center
        expect(readonlyFields(byField)).toEqual(['id', 'score']);

        for (const field of ['code', 'name', 'city', 'note']) {
            expect(byField[field], `${field} has rendered cells`).not.toHaveLength(0);
            expect(byField[field].some(Boolean), `no ${field} cell is read-only`).toBe(false)
        }
    });

    test('a column turned non-editable at runtime becomes read-only in every rendered row, and back', async ({page}) => {
        await page.evaluate(() => Neo.worker.App.setConfigs({id: 'grid-cell-editing-city', editable: false}));
        await expect.poll(async () => readonlyFields(await readonlyByField(page))).toEqual(['city', 'id', 'score']);

        await page.evaluate(() => Neo.worker.App.setConfigs({id: 'grid-cell-editing-city', editable: true}));
        await expect.poll(async () => readonlyFields(await readonlyByField(page))).toEqual(['id', 'score'])
    });

    test('a disabled plugin leaves no cell read-only, and enabling it marks the non-editable ones again', async ({page}) => {
        // With editing off there are no editable cells to tell apart, so no cell claims to be the exception
        await page.evaluate(() => Neo.worker.App.setConfigs({id: 'grid-cell-editing-plugin', disabled: true}));
        await expect.poll(async () => Object.values(await readonlyByField(page)).flat().some(Boolean)).toBe(false);

        await page.evaluate(() => Neo.worker.App.setConfigs({id: 'grid-cell-editing-plugin', disabled: false}));
        await expect.poll(async () => readonlyFields(await readonlyByField(page))).toEqual(['id', 'score'])
    });

    test('a plugin destroyed on its own leaves no cell read-only, and cellEditing turned on marks them again', async ({page}) => {
        expect(readonlyFields(await readonlyByField(page))).toEqual(['id', 'score']);

        // Without its plugin the grid edits nothing, so no cell claims to be the exception
        await page.evaluate(() => Neo.worker.App.destroyNeoInstance('grid-cell-editing-plugin'));
        await expect.poll(async () => Object.values(await readonlyByField(page)).flat().some(Boolean)).toBe(false);

        // `cellEditing: true` imports its plugin, which lands after these rows rendered
        await page.evaluate(() => Neo.worker.App.setConfigs({id: 'grid-cell-editing', cellEditing: true}));
        await expect.poll(async () => readonlyFields(await readonlyByField(page))).toEqual(['id', 'score'])
    })
});
