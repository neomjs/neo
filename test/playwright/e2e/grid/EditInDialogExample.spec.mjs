import {expect, test}                 from '../../fixtures.mjs';
import {attachPageSharedAppWorker}    from '../../sharedWorkerAppWorker.mjs';
import {runDedicatedWorkerNeuralLink} from '../../dedicatedWorkerNeuralLink.mjs';

/**
 * @summary `examples/grid/nestedRecordFields`: renders >= 20 partner records with nested `user.*` and `address.*`
 * columns, opens a full-width form dialog (>= 180px fields at 1440×900, usable at 390×844), commits changes on Save
 * with `.neo-is-modified` cell markers, supports keyboard open/close (`Enter`, `Space`, `Escape`), switches both
 * themes, and restores initial data on Reset.
 */
const URL = '/examples/grid/nestedRecordFields/index.html';

/**
 * @summary Reads the natural desktop frame after the edit-button opening animation settles.
 * @param {import('@playwright/test').Locator} dialog
 * @returns {Promise<{x: Number, y: Number, width: Number, height: Number}>}
 */
async function getSettledDesktopBounds(dialog) {
    let bounds;

    await expect.poll(async () => {
        bounds = await dialog.evaluate(root => {
            const {x, y, width, height, right, bottom} = root.getBoundingClientRect();

            if (width !== 420 || height <= 0 || x < 0 || y < 0 || right > innerWidth || bottom > innerHeight ||
                root.style.height || root.matches('.neo-animating, .animated-hiding-showing, .neo-dialog-sheet')) {
                return null
            }

            return {x, y, width, height}
        });

        return bounds
    }, {message: 'wait for the fully open contact editor on desktop'}).not.toBeNull();

    return bounds
}

/**
 * @summary Records the Dialog's first laid-out frame, including an offscreen initial position.
 * @param {import('@playwright/test').Page} page
 */
async function observeFirstDialogFrame(page) {
    await page.evaluate(() => {
        const observe = () => {
            const root = document.querySelector('.neo-dialog');

            if (root) {
                const {bottom, left, width} = root.getBoundingClientRect();

                if (width > 0) {
                    window.firstContactDialogFrame = {bottom, left, width};
                    return
                }
            }

            requestAnimationFrame(observe)
        };

        requestAnimationFrame(observe)
    })
}

test.describe('Grid edit-in-a-dialog example', () => {
    test('renders >= 20 rows and >= 2 nested columns, sizes all dialog fields >= 180px at 1440x900, saves nested edits, and resets', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(URL);

        const firstRow = page.locator('.neo-grid-row').first();
        await expect(firstRow.locator('.neo-grid-cell[data-field="user.firstname"]')).toHaveText('Amara', {timeout: 30000});
        await expect(firstRow.locator('.neo-grid-cell[data-field="address.country"]')).toHaveText('Nigeria');
        await expect(page.locator('.neo-edit-dialog-floating-edit')).toBeHidden();

        const ariaRowCount = Number(await page.getByRole('grid').getAttribute('aria-rowcount'));
        expect(ariaRowCount).toBeGreaterThanOrEqual(21); // 1 header row + >= 20 data rows (28 records)

        const nestedHeaders = await page.locator('.neo-grid-cell[data-field*="."]').evaluateAll(els =>
            [...new Set(els.map(el => el.getAttribute('data-field')))]
        );
        expect(nestedHeaders.length).toBeGreaterThanOrEqual(2);

        // Open dialog from row 0 Edit button and wait for the dialog's focus on its first field
        await firstRow.locator('.neo-button', {hasText: 'Edit'}).click();

        const dialog = page.locator('.neo-dialog');
        await expect(dialog.locator('input.neo-textfield-input').first()).toBeFocused({timeout: 10000});

        // Every form field (including CountryField) is >= 180px wide at 1440x900
        await expect.poll(async () => {
            const widths = await dialog.locator('.neo-textfield, .neo-checkboxfield').evaluateAll(els =>
                els.map(el => Math.round(el.getBoundingClientRect().width))
            );
            return widths.length === 7 ? Math.min(...widths) : 0
        }).toBeGreaterThanOrEqual(180);

        // Also assert the Country input wrapper itself is >= 180px wide (guarding against the ~30px collapse)
        await expect.poll(async () =>
            dialog.locator('.neo-countryfield .neo-input-wrapper').evaluate(
                el => Math.round(el.getBoundingClientRect().width)
            )
        ).toBeGreaterThanOrEqual(180);

        // Change nested address.city and nested user.lastname, then Save
        const cityInput     = dialog.locator('.neo-textfield').filter({hasText: 'City'}).locator('input.neo-textfield-input'),
              lastnameInput = dialog.locator('.neo-textfield').filter({hasText: 'Last Name'}).locator('input.neo-textfield-input');

        await cityInput.fill('Abuja');
        await lastnameInput.fill('Okafor-Nwosu');
        await dialog.locator('.neo-button', {hasText: 'Save'}).click();

        await expect(dialog).toBeHidden();
        await expect(firstRow.locator('.neo-grid-cell[data-field="address.city"]')).toHaveText('Abuja');
        await expect(firstRow.locator('.neo-grid-cell[data-field="address.city"]')).toHaveClass(/neo-is-modified/);
        await expect(firstRow.locator('.neo-grid-cell[data-field="user.lastname"]')).toHaveText('Okafor-Nwosu');
        await expect(firstRow.locator('.neo-grid-cell[data-field="user.lastname"]')).toHaveClass(/neo-is-modified/);
        await expect(firstRow.locator('.neo-grid-cell[data-field="user.firstname"]')).not.toHaveClass(/neo-is-modified/);

        // Reset restores unmodified store records
        await page.locator('.neo-button', {hasText: 'Reset'}).click();
        await expect(firstRow.locator('.neo-grid-cell[data-field="address.city"]')).toHaveText('Lagos');
        await expect(firstRow.locator('.neo-grid-cell[data-field="address.city"]')).not.toHaveClass(/neo-is-modified/)
    });

    test('opens and closes by keyboard, discards on Escape, saves on Enter, and works at 390x844 in both themes', async ({page}, testInfo) => {
        await page.setViewportSize({width: 390, height: 844});
        await page.goto(URL);

        const firstRow = page.locator('.neo-grid-row').first(),
              editBtn  = firstRow.locator('.neo-button', {hasText: 'Edit'}),
              dialog   = page.locator('.neo-dialog');

        await expect(editBtn).toBeVisible({timeout: 30000});

        await observeFirstDialogFrame(page);

        // Open by keyboard (focus Edit -> Enter) and wait for the dialog's focus on its first field
        await editBtn.focus();
        await page.keyboard.press('Enter');
        await expect(dialog.locator('input.neo-textfield-input').first()).toBeFocused({timeout: 10000});
        await expect.poll(() => page.evaluate(() => window.firstContactDialogFrame))
            .toEqual({bottom: 844, left: 0, width: 390});
        await expect(dialog).toHaveClass(/\bneo-responsive\b/);
        await expect(dialog).toHaveClass(/\bneo-dialog-sheet\b/);
        await expect(dialog).toHaveClass(/\bneo-theme-dark\b/);
        await expect(dialog).toHaveCSS('border-top-left-radius', '16px');
        await expect(dialog).toHaveCSS('border-top-right-radius', '16px');
        await expect(dialog.getByRole('separator', {name: 'Resize dialog'})).toBeVisible();
        await expect(dialog.getByRole('button', {name: 'maximize', exact: true})).toHaveCount(0);

        const lastControl = dialog.getByRole('button', {name: 'Save', exact: true}),
              darkFrame   = testInfo.outputPath('contact-dark-390.png');

        await expect(lastControl).toBeInViewport({ratio: 1});
        await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeInViewport({ratio: 1});
        await page.screenshot({animations: 'disabled', path: darkFrame});
        await testInfo.attach('Contact editor in Dark at 390 px', {contentType: 'image/png', path: darkFrame});

        await lastControl.focus();
        await page.keyboard.press('Tab');
        await expect(lastControl).not.toBeFocused();
        await expect.poll(() => dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
        await dialog.locator('input.neo-textfield-input').first().focus();

        // Usable field widths at 390x844 (every field fits inside viewport and Country input wrapper >= 160px)
        await expect.poll(async () =>
            dialog.locator('.neo-countryfield .neo-input-wrapper').evaluate(
                el => Math.round(el.getBoundingClientRect().width)
            )
        ).toBeGreaterThanOrEqual(160);

        // Type into focused First Name field, then press Escape -> discards draft and restores focus to Edit button
        await page.keyboard.type('DraftIgnored');
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(firstRow.locator('.neo-grid-cell[data-field="user.firstname"]')).toHaveText('Amara');
        await expect(editBtn).toBeFocused();

        // Re-open with Space on focused Edit button, switch theme first to verify light theme too
        await page.locator('.neo-button', {hasText: 'Light Theme'}).click();
        await expect(page.locator('.neo-viewport')).toHaveClass(/neo-theme-light/);
        await expect(page.getByText('Switched Theme', {exact: true})).toBeHidden({timeout: 10000});

        await editBtn.focus();
        await page.keyboard.press('Space');
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveClass(/neo-theme-light/);
        await expect(dialog).toHaveCSS('border-top-left-radius', '16px');
        await expect(dialog).toHaveCSS('border-top-right-radius', '16px');

        const firstnameInput = dialog.locator('.neo-textfield').filter({hasText: 'First Name'}).locator('input.neo-textfield-input');
        await expect(firstnameInput).toBeFocused({timeout: 5000});

        const lightFrame = testInfo.outputPath('contact-light-390.png');
        await page.screenshot({animations: 'disabled', path: lightFrame});
        await testInfo.attach('Contact editor in Light at 390 px', {contentType: 'image/png', path: lightFrame});

        // The first open was compact, so this is the Dialog's first use of desktop placement.
        await page.setViewportSize({width: 1200, height: 850});
        await expect(dialog).not.toHaveClass(/\bneo-dialog-sheet\b/);
        await expect(dialog.getByRole('button', {name: 'maximize', exact: true})).toBeVisible();
        await expect.poll(() => dialog.evaluate(root => {
            const {left, top, right, bottom} = root.getBoundingClientRect();

            return left >= 0 && top >= 0 && right <= innerWidth && bottom <= innerHeight
        })).toBe(true);
        await expect(firstnameInput).toBeFocused();
        await firstnameInput.fill('chioma');
        await page.keyboard.press('Enter');

        await expect(dialog).toBeHidden();
        await expect(firstRow.locator('.neo-grid-cell[data-field="user.firstname"]')).toHaveText('chioma');
        await expect(firstRow.locator('.neo-grid-cell[data-field="user.firstname"]')).toHaveClass(/neo-is-modified/)
    });

    test('Escape while the dialog still opens hands focus back to the Edit button (#21753)', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(URL);

        const editBtn = page.locator('.neo-grid-row').first().locator('.neo-button', {hasText: 'Edit'}),
              dialog  = page.locator('.neo-dialog');

        await expect(editBtn).toBeVisible({timeout: 30000});

        // The first field takes focus as the dialog mounts, before its open animation ends: Escape at once
        await editBtn.focus();
        await page.keyboard.press('Enter');
        await expect(dialog.locator('input.neo-textfield-input').first()).toBeFocused({timeout: 10000});

        // Records, for each focus the button takes, whether the modal is still in the DOM in front of it
        await editBtn.evaluate(el => {
            window.editFocusDialogInDom = [];
            el.addEventListener('focusin', () => window.editFocusDialogInDom.push(!!document.querySelector('.neo-dialog')))
        });
        await page.keyboard.press('Escape');

        await expect(dialog).toBeHidden();
        await expect(editBtn).toBeFocused();
        expect(await page.evaluate(() => window.editFocusDialogInDom)).toEqual([false])
    });

    test('a sheet returning to a smaller desktop fits the floating dialog inside the viewport', async ({page}) => {
        await page.setViewportSize({width: 1200, height: 850});
        await page.goto(URL);

        const edit   = page.locator('.neo-grid-row').first().getByRole('button', {name: 'Edit', exact: true}),
              dialog = page.locator('.neo-dialog'),
              right  = () => dialog.evaluate(node => node.getBoundingClientRect().right);

        await edit.click();
        await expect(dialog).not.toHaveClass(/neo-animating/);
        await expect.poll(right).toBeGreaterThan(700);

        await page.setViewportSize({width: 390, height: 844});
        await expect(dialog).toHaveClass(/\bneo-dialog-sheet\b/);
        await page.setViewportSize({width: 700, height: 850});
        await expect(dialog).not.toHaveClass(/\bneo-dialog-sheet\b/);
        await expect.poll(right).toBeLessThanOrEqual(700)
    });

    test('an open dialog keeps its provider, focus, and composition through a sheet round trip', async ({browser, context, page}) => {
        await page.setViewportSize({width: 1200, height: 850});

        await runDedicatedWorkerNeuralLink({browser, context, page}, async adapter => {
            await page.goto(URL);

            const firstRow = page.locator('.neo-grid-row').first(),
                  edit     = firstRow.getByRole('button', {name: 'Edit', exact: true}),
                  dialog   = page.locator('.neo-dialog'),
                  input    = dialog.locator('input.neo-textfield-input').first();

            await edit.click();
            await expect(input).toBeFocused();

            const app        = await adapter.connectToApp('Neo.examples.grid.nestedRecordFields'),
                  readEditor = async () => {
                      const [editor] = await app.queryComponent({className: 'Neo.examples.grid.nestedRecordFields.EditUserDialog'},
                          ['mounted', 'record.id', 'stateProvider.id']);

                      return {id: editor.id, ...editor.properties}
                  },
                  original      = await readEditor(),
                  desktopBounds = await getSettledDesktopBounds(dialog);

            expect(original.id).toBeTruthy();
            expect(original['stateProvider.id']).toBeTruthy();
            expect(original).toMatchObject({mounted: true, 'record.id': 'p01'});

            await input.fill('Draft ');
            await input.evaluate(element => {
                window.contactComposition = {element, events: []};

                for (const type of ['compositionstart', 'compositionupdate', 'compositionend', 'blur']) {
                    element.addEventListener(type, event => window.contactComposition.events.push({
                        type, data: event.data ?? null, trusted: event.isTrusted
                    }))
                }
            });

            const cdp             = await context.newCDPSession(page),
                  readComposition = () => input.evaluate(element => ({
                      events   : window.contactComposition.events,
                      focused  : document.activeElement === element,
                      sameInput: window.contactComposition.element === element,
                      selection: [element.selectionStart, element.selectionEnd],
                      value    : element.value
                  }));

            try {
                await cdp.send('Input.imeSetComposition', {text: '漢字', selectionStart: 0, selectionEnd: 1});
                const draft = await readComposition();

                expect(draft).toEqual({
                    events: [
                        {type: 'compositionstart', data: '', trusted: true},
                        {type: 'compositionupdate', data: '漢字', trusted: true}
                    ],
                    focused: true, sameInput: true, selection: [6, 7], value: 'Draft 漢字'
                });

                await page.setViewportSize({width: 390, height: 844});
                await expect(dialog).toHaveClass(/\bneo-dialog-sheet\b/);
                await expect.poll(() => dialog.evaluate(root => {
                    const {bottom, left, width} = root.getBoundingClientRect();

                    return {bottom, left, width}
                })).toEqual({bottom: 844, left: 0, width: 390});
                expect(await readEditor()).toEqual(original);
                expect(await readComposition()).toEqual(draft);

                await page.setViewportSize({width: 1200, height: 850});
                await expect(dialog).not.toHaveClass(/\bneo-dialog-sheet\b/);
                await expect.poll(() => dialog.boundingBox()).toEqual(desktopBounds);
                expect(await readEditor()).toEqual(original);
                expect(await readComposition()).toEqual(draft);

                await cdp.send('Input.insertText', {text: '漢字'});
                expect((await readComposition()).events.at(-1)).toMatchObject({type: 'compositionend', data: '漢字'});
                await page.keyboard.press('Escape');
                await expect(dialog).toBeHidden();
                await expect(firstRow.locator('.neo-grid-cell[data-field="user.firstname"]')).toHaveText('Amara');
                await expect(edit).toBeFocused()
            } finally {
                await cdp.detach()
            }
        })
    });

    test('a desktop resize interrupted by the sheet releases its proxy and resumes with the caller settings', async ({browser, context, page}) => {
        await page.setViewportSize({width: 1200, height: 850});

        await runDedicatedWorkerNeuralLink({browser, context, page}, async adapter => {
            await page.goto(URL);

            const initial = page.locator('.neo-dialog'),
                  view    = page.locator('.neo-grid-row').first(),
                  proxy   = page.locator('.neo-dragproxy');

            await view.getByRole('button', {name: 'Edit', exact: true}).click();
            await expect(initial.locator('input.neo-textfield-input').first()).toBeFocused();
            await expect(initial).not.toHaveClass(/neo-animating/);

            const app    = await adapter.connectToApp('Neo.examples.grid.nestedRecordFields'),
                  id     = await initial.getAttribute('id'),
                  dialog = page.locator(`[id="${id}"]`),
                  bounds = await dialog.boundingBox();

            const beginResize = async () => {
                const box    = await dialog.boundingBox(),
                      x      = box.x + box.width - 3,
                      y      = box.y + box.height / 2,
                      handle = dialog.locator('.neo-resizable-right');

                await expect(async () => {
                    await page.mouse.move(x - 24, y);
                    await page.mouse.move(x, y);
                    await expect(handle).toBeVisible({timeout: 250})
                }).toPass();

                const area = await handle.boundingBox(),
                      hx   = area.x + area.width / 2,
                      hy   = area.y + area.height / 2;

                await page.mouse.move(hx, hy);
                await page.mouse.down();
                await page.mouse.move(hx + 70, hy, {steps: 12});
                await expect(proxy).toBeVisible()
            };

            await beginResize();
            await page.setViewportSize({width: 390, height: 844});
            await expect(dialog).toHaveClass(/\bneo-dialog-sheet\b/);
            await expect(proxy).toHaveCount(0);
            await expect(page.locator('body')).not.toHaveClass(/\bneo-cursor-[a-z]+-resize\b/);
            await page.mouse.up();
            await expect(dialog.locator('.neo-resizable')).toHaveCount(0);

            await page.setViewportSize({width: 1200, height: 850});
            await expect(dialog).not.toHaveClass(/\bneo-dialog-sheet\b/);
            await expect.poll(() => dialog.boundingBox()).toEqual(bounds);

            await beginResize();
            await page.mouse.up();
            await expect(proxy).toHaveCount(0);
            await expect.poll(async () => (await dialog.boundingBox()).width).toBeGreaterThan(bounds.width + 50);

            const movedFrom = await dialog.boundingBox(),
                  title     = await dialog.locator('.neo-panel-header-text').boundingBox(),
                  titleX    = title.x + title.width / 2,
                  titleY    = title.y + title.height / 2;

            await page.mouse.move(titleX, titleY);
            await page.mouse.down();
            await page.mouse.move(titleX - 45, titleY, {steps: 10});
            await expect(proxy).toBeVisible();
            await page.mouse.up();
            await expect(proxy).toHaveCount(0);
            await expect.poll(async () => (await dialog.boundingBox()).x).toBeLessThan(movedFrom.x - 30);

            await app.setProperties(id, {draggable: false, resizable: false});
            await page.setViewportSize({width: 390, height: 844});
            await expect(dialog).toHaveClass(/\bneo-dialog-sheet\b/);
            await page.setViewportSize({width: 1200, height: 850});
            await expect(dialog).not.toHaveClass(/\bneo-dialog-sheet\b/);

            const desktop = await dialog.boundingBox();

            await page.mouse.move(desktop.x + desktop.width - 3, desktop.y + desktop.height / 2, {steps: 4});
            await expect(dialog.locator('.neo-resizable')).toHaveCount(0);
            await expect(dialog.locator('.neo-header-toolbar')).not.toHaveClass(/\bneo-draggable\b/);
            expect(await app.getComponent(id, ['draggable', 'resizable'])).toMatchObject({draggable: false, resizable: false})
        })
    });

    test('the compact grip previews, cancels and snaps without taking ownership of the desktop height', async ({browser, context, page}) => {
        await page.setViewportSize({width: 1200, height: 850});

        await runDedicatedWorkerNeuralLink({browser, context, page}, async adapter => {
            await page.goto(URL);

            const row    = page.locator('.neo-grid-row').first(),
                  dialog = page.locator('.neo-dialog'),
                  field  = dialog.locator('input.neo-textfield-input').first(),
                  grip   = dialog.getByRole('separator', {name: 'Resize dialog'});

            await row.getByRole('button', {name: 'Edit', exact: true}).click();
            await expect(field).toBeFocused();
            await getSettledDesktopBounds(dialog);

            const app        = await adapter.connectToApp('Neo.examples.grid.nestedRecordFields'),
                  id         = await dialog.getAttribute('id'),
                  readEditor = () => app.getComponent(id, ['record.id', 'stateProvider.id']),
                  readHeight = () => dialog.evaluate(el => {
                      const {bottom, height} = el.getBoundingClientRect();

                      return {
                          bottom,
                          height,
                          desktop: el.style.height,
                          preview: el.style.getPropertyValue('--neo-dialog-sheet-preview-height')
                      }
                  });

            const editor  = await readEditor(),
                  {style} = await app.getComponent(id, ['style']);

            await app.setProperties(id, {style: {...style, height: '410px'}});
            await expect.poll(async () => (await readHeight()).height).toBe(410);
            const desktop = await dialog.boundingBox();

            await field.fill('Unsaved draft');
            await page.setViewportSize({width: 390, height: 844});
            await expect(grip).toBeVisible();
            await expect(grip).toHaveAttribute('aria-valuenow', '0');

            const low    = await readHeight(),
                  dragUp = async distance => {
                      const {x, y, width, height} = await grip.boundingBox();

                      await page.mouse.move(x + width / 2, y + height / 2);
                      await page.mouse.down();
                      await page.mouse.move(x + width / 2, y + height / 2 - distance, {steps: 12})
                  };

            const cdp                   = await context.newCDPSession(page),
                  {x, y, width, height} = await grip.boundingBox(),
                  touch                 = (type, distance) => cdp.send('Input.dispatchTouchEvent', {
                      type,
                      touchPoints: distance === undefined ? [] : [{x: x + width / 2, y: y + height / 2 - distance}]
                  });

            try {
                await touch('touchStart', 0);
                for (const distance of [30, 60, 90, 120]) {
                    await touch('touchMove', distance)
                }
                await expect.poll(async () => (await readHeight()).height).toBeGreaterThan(low.height + 80);
                const preview = await readHeight();
                expect(preview).toMatchObject({bottom: 844, desktop: '410px'});
                expect(parseFloat(preview.preview)).toBeCloseTo(preview.height, 1);
                await expect(grip).toHaveAttribute('aria-valuenow', '0');

                await touch('touchCancel');
                await expect.poll(readHeight).toEqual(low);
                await expect(dialog).toBeVisible()
            } finally {
                await cdp.detach()
            }

            await dragUp(300);
            await expect.poll(async () => (await readHeight()).height).toBeGreaterThan(low.height + 200);
            await page.mouse.up();
            await expect(grip).toHaveAttribute('aria-valuenow', '1');
            await expect.poll(async () => (await readHeight()).preview).toBe('');
            const high = await readHeight();
            expect(high).toMatchObject({bottom: 844, desktop: '410px'});
            expect(high.height).toBeGreaterThan(low.height + 300);

            await grip.focus();
            await grip.press('Home');
            await expect.poll(readHeight).toEqual(low);
            await grip.press('ArrowUp');
            await expect.poll(readHeight).toEqual(high);
            await grip.press('ArrowDown');
            await expect.poll(readHeight).toEqual(low);
            await grip.press('End');
            await expect.poll(readHeight).toEqual(high);
            await grip.press('Enter');
            await expect(dialog).toBeVisible();
            await expect(grip).toBeFocused();
            await expect(field).toHaveValue('Unsaved draft');
            expect(await readEditor()).toEqual(editor);
            await expect(row.locator('.neo-grid-cell[data-field="user.firstname"]')).toHaveText('Amara');

            await dragUp(-120);
            await expect.poll(async () => (await readHeight()).height).toBeLessThan(high.height - 80);
            await page.setViewportSize({width: 1200, height: 850});
            await expect(grip).toHaveCount(0);
            await page.mouse.up();
            await expect.poll(() => dialog.boundingBox()).toEqual(desktop);
            expect((await readHeight()).preview).toBe('');
            await expect(field).toHaveValue('Unsaved draft')
        })
    });

    test('an invalid draft and the inner scroll position survive the presentation switch', async ({browser, context, page}) => {
        await page.setViewportSize({width: 1200, height: 300});

        await runDedicatedWorkerNeuralLink({browser, context, page}, async adapter => {
            await page.goto(URL);

            const edit      = page.locator('.neo-grid-row').first().getByRole('button', {name: 'Edit', exact: true}),
                  dialog    = page.locator('.neo-dialog'),
                  firstName = dialog.locator('input.neo-textfield-input').first(),
                  form      = dialog.locator('[data-ref="bodyContainer"]'),
                  lastField = dialog.locator('[data-ref="lastname-field"]'),
                  lastName  = lastField.locator('input');

            await edit.click();
            await expect(firstName).toBeFocused();
            await expect(dialog).not.toHaveClass(/neo-animating/);

            const app     = await adapter.connectToApp('Neo.examples.grid.nestedRecordFields'),
                  [field] = await app.queryComponent({reference: 'lastname-field'}, ['reference']);

            await app.setProperties(field.id, {minLength: 6});
            await lastName.fill('A');
            await firstName.focus();
            await expect(lastField).toHaveClass(/\bneo-invalid\b/);

            const readScroll = () => form.evaluate(node => node.scrollTop);

            await form.evaluate(node => {node.scrollTop = 20});
            await expect.poll(readScroll).toBe(20);

            for (const width of [390, 1200]) {
                await page.setViewportSize({width, height: 300});

                if (width === 390) {
                    await expect(dialog).toHaveClass(/\bneo-dialog-sheet\b/)
                } else {
                    await expect(dialog).not.toHaveClass(/\bneo-dialog-sheet\b/)
                }

                await expect(lastName).toHaveValue('A');
                await expect(lastField).toHaveClass(/\bneo-invalid\b/);
                await expect(firstName).toBeFocused();
                expect(await readScroll()).toBe(20)
            }
        })
    })
});

test.describe('Compact floating contact action', () => {
    test.use({hasTouch: true});

    test('edits the current selection and returns focus to the floating opener', async ({browser, context, page}) => {
        await page.setViewportSize({width: 390, height: 844});

        await runDedicatedWorkerNeuralLink({browser, context, page}, async adapter => {
            await page.goto(URL);

            const action    = page.getByRole('button', {name: 'Edit contact', exact: true}),
                  rows      = page.locator('.neo-grid-row'),
                  firstName = rows.first().locator('.neo-grid-cell[data-field="user.firstname"]'),
                  name      = rows.nth(2).locator('.neo-grid-cell[data-field="user.firstname"]'),
                  dialog    = page.locator('.neo-dialog'),
                  input     = dialog.locator('input.neo-textfield-input').first(),
                  app       = await adapter.connectToApp('Neo.examples.grid.nestedRecordFields'),
                  [view]    = await app.queryComponent({ntype: 'grid-view'}, ['selectedRows']);

            await expect(name).toHaveText('Mei-Ling');
            await expect(action).toBeVisible();

            const placement = await action.evaluate(el => {
                const actionRect = el.getBoundingClientRect(),
                      gridRect   = document.querySelector('.neo-grid-container').getBoundingClientRect();

                return {
                    clearsGrid: actionRect.top >= gridRect.bottom,
                    fits      : actionRect.left >= 0 && actionRect.right <= innerWidth && actionRect.bottom <= innerHeight,
                    height    : actionRect.height
                }
            });

            expect(placement).toMatchObject({clearsGrid: true, fits: true});
            expect(placement.height).toBeGreaterThanOrEqual(44);

            await name.tap();
            await action.tap();
            await expect(dialog).toHaveClass(/\bneo-dialog-sheet\b/);
            await expect(input).toBeFocused();
            await expect(input).toHaveValue('Mei-Ling');

            const [editor] = await app.queryComponent({className: 'Neo.examples.grid.nestedRecordFields.EditUserDialog'},
                ['animateTargetId', 'record.id']);

            expect(editor.properties).toMatchObject({
                animateTargetId: await page.locator('.neo-edit-dialog-floating-edit').getAttribute('id'),
                'record.id'    : 'p03'
            });

            await input.fill('Uncommitted draft');
            await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
            await expect(dialog).toBeHidden();
            await expect(name).toHaveText('Mei-Ling');
            await expect(action).toBeFocused();

            await action.press('Enter');
            await expect(input).toBeFocused();
            await expect(input).toHaveValue('Mei-Ling');
            await input.fill('Escape draft');
            await page.keyboard.press('Escape');
            await expect(dialog).toBeHidden();
            await expect(name).toHaveText('Mei-Ling');
            await expect(action).toBeFocused();

            await action.press('Enter');
            await expect(input).toBeFocused();

            const close = dialog.getByRole('button', {name: 'close', exact: true});

            await expect(close).toBeVisible();
            await close.tap();
            await expect(dialog).toBeHidden();
            await expect(action).toBeFocused();

            await action.press('Space');
            await expect(input).toBeFocused();
            await input.fill('Mei');
            await dialog.getByRole('button', {name: 'Save', exact: true}).click();
            await expect(dialog).toBeHidden();
            await expect(name).toHaveText('Mei');
            await expect(firstName).toHaveText('Amara');
            await expect(action).toBeFocused();

            await firstName.tap();
            await action.tap();
            await expect(input).toBeFocused();
            await expect(input).toHaveValue('Amara');

            const [reopened] = await app.queryComponent({className: 'Neo.examples.grid.nestedRecordFields.EditUserDialog'},
                ['animateTargetId', 'record.id']);
            expect(reopened.id).toBe(editor.id);
            expect(reopened.properties).toMatchObject({
                animateTargetId: editor.properties.animateTargetId,
                'record.id'    : 'p01'
            });

            await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
            await expect(dialog).toBeHidden();
            await expect(action).toBeFocused();

            await firstName.tap();
            await expect.poll(async () => (await app.getComponent(view.id, ['selectedRows'])).selectedRows).toEqual([]);
            await action.tap();
            await expect(dialog).toBeHidden();
            await expect(page.getByText('Select a row to edit a contact.', {exact: true})).toBeVisible()
        })
    })
});

test('two contact editors on one App Worker follow their own windows', async ({browser, context, page}) => {
    await context.route('**/examples/grid/nestedRecordFields/neo-config.json*', async route => {
        const response = await route.fetch();

        await route.fulfill({response, json: {...await response.json(), useSharedWorkers: true}})
    });

    const compact = await context.newPage();

    let wideWorker, compactWorker;

    try {
        await page.setViewportSize({width: 1200, height: 850});
        await page.goto(URL);
        await expect(page.getByRole('grid')).toBeVisible();

        await compact.setViewportSize({width: 390, height: 844});
        await compact.goto(URL);
        await expect(compact.getByRole('grid')).toBeVisible();

        wideWorker    = await attachPageSharedAppWorker({browser, page});
        compactWorker = await attachPageSharedAppWorker({browser, page: compact});

        expect(wideWorker).toBeTruthy();
        expect(compactWorker?.targetId).toBe(wideWorker.targetId);

        const wideWindow    = await page.evaluate(() => Neo.worker.Manager.windowId),
              compactWindow = await compact.evaluate(() => Neo.worker.Manager.windowId),
              wideDialog    = page.locator('.neo-dialog'),
              compactDialog = compact.locator('.neo-dialog');

        expect(wideWindow).toBeTruthy();
        expect(compactWindow).toBeTruthy();
        expect(compactWindow).not.toBe(wideWindow);

        await page.locator('.neo-grid-row').first().getByRole('button', {name: 'Edit', exact: true}).click();
        await expect(wideDialog.locator('input.neo-textfield-input').first()).toBeFocused();
        await expect(wideDialog).not.toHaveClass(/\bneo-dialog-sheet\b/);

        await observeFirstDialogFrame(compact);
        await compact.locator('.neo-grid-row').first().locator('.neo-grid-cell[data-field="user.firstname"]').click();
        await compact.getByRole('button', {name: 'Edit contact', exact: true}).click();
        await expect(compactDialog.locator('input.neo-textfield-input').first()).toBeFocused();
        await expect(compactDialog).toHaveClass(/\bneo-dialog-sheet\b/);
        await expect.poll(() => compact.evaluate(() => window.firstContactDialogFrame))
            .toEqual({bottom: 844, left: 0, width: 390});

        const wideId    = await wideDialog.getAttribute('id'),
              compactId = await compactDialog.getAttribute('id'),
              read      = (worker, id) => worker.evaluate(editorId => {
                  const editor = Neo.getComponent(editorId);

                  return {id: editor.id, presentation: editor.presentation, providerId: editor.stateProvider.id, windowId: editor.windowId}
              }, id),
              wideState    = await read(wideWorker, wideId),
              compactState = await read(compactWorker, compactId);

        expect(compactId).not.toBe(wideId);
        expect(wideState).toMatchObject({presentation: 'dialog', windowId: wideWindow});
        expect(compactState).toMatchObject({presentation: 'sheet', windowId: compactWindow});
        expect(compactState.providerId).not.toBe(wideState.providerId);

        await compact.setViewportSize({width: 1200, height: 844});
        await expect(compactDialog).not.toHaveClass(/\bneo-dialog-sheet\b/);
        await expect(compactDialog.locator('input.neo-textfield-input').first()).toBeFocused();
        expect(await read(compactWorker, compactId)).toEqual({...compactState, presentation: 'dialog'});
        expect(await read(wideWorker, wideId)).toEqual(wideState)
    } finally {
        await compactWorker?.close();
        await wideWorker?.close();
        await compact.close()
    }
});
