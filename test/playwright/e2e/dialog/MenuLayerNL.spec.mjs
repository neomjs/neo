import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Whitebox regression: floating button menus, submenus, and grid search scope menus
 * share `.neo-floating` (`1000`) and DOM order with `Neo.dialog.Base` and `DomAccess#syncModalMask`
 * without requiring application `zIndex` overrides, while preserving explicit `menu.zIndex` cascades
 * and nested modal dialog picker/Escape/focus-trap behavior.
 */
test.use({viewport: {width: 1400, height: 900}});

/**
 * Finds the dedicated App Worker for the current page.
 * @param {import('@playwright/test').Page} page
 * @returns {import('@playwright/test').Worker}
 */
function getAppWorker(page) {
    const worker = page.workers().find(candidate => candidate.url().includes('/worker/App.mjs'));

    if (!worker) {
        throw new Error('Dedicated App Worker not found')
    }

    return worker
}

/**
 * Opens a `DemoDialog` from `opener` and waits until its show flight settles.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} opener
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function openSettledDialog(page, opener) {
    const count = await page.locator('.neo-dialog').count();
    let   last  = null;

    await opener.click();

    const dialog = page.locator('.neo-dialog').nth(count);
    await expect(dialog.locator(':focus')).toHaveCount(1);

    await expect.poll(async () => {
        const box  = await dialog.boundingBox(),
              key  = box && `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)},${Math.round(box.height)}`,
              done = Boolean(box && key === last && box.width > 300 && box.x >= 0 && box.y >= 0);

        last = key;
        return done
    }, {intervals: [80]}).toBe(true);

    return dialog
}

/**
 * Computes an interior hit-test point inside the intersection of `targetId` and optional `overlapId`
 * and returns live DOM paint/hit/order facts.
 * @param {import('@playwright/test').Page} page
 * @param {String} targetId
 * @param {String|null} [overlapId=null]
 * @returns {Promise<Object|null>}
 */
function inspectHitAndLayer(page, targetId, overlapId=null) {
    return page.evaluate(({targetId, overlapId}) => {
        const target  = document.getElementById(targetId),
              overlap = overlapId ? document.getElementById(overlapId) : null;

        if (!target || (overlapId && !overlap)) {
            return null
        }

        const tr     = target.getBoundingClientRect(),
              or     = overlap ? overlap.getBoundingClientRect() : tr,
              left   = Math.max(tr.left, or.left),
              top    = Math.max(tr.top, or.top),
              right  = Math.min(tr.right, or.right),
              bottom = Math.min(tr.bottom, or.bottom);

        if (right - left < 4 || bottom - top < 4) {
            return null
        }

        const x   = Math.round((left + right) / 2),
              y   = Math.round((top + bottom) / 2),
              hit = document.elementFromPoint(x, y);

        return {
            followsOverlap: overlap
                ? Boolean(overlap.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING)
                : null,
            hitId        : hit?.id || null,
            hitTag       : hit?.tagName || null,
            inlineZIndex : target.style.zIndex,
            overlapZIndex: overlap ? getComputedStyle(overlap).zIndex : null,
            parentTag    : target.parentElement?.tagName || null,
            targetOwnsHit: Boolean(hit && target.contains(hit)),
            x,
            y,
            zIndex       : getComputedStyle(target).zIndex
        }
    }, {targetId, overlapId})
}

test.describe('Dialog and Menu Layering', () => {
    test('AC-1: grid searchToolbar scope menu inside a non-modal dialog paints above the dialog and owns hit testing without zIndex override', async ({page, neuralLink}) => {
        await neuralLink.routeConfig(page, config => ({...config, useAiClient: true}));
        await page.goto('/examples/grid/issues/index.html');

        const app = await neuralLink.connectToApp('Neo.examples.grid.issues');

        let baseGrid;
        await expect.poll(async () => {
            [baseGrid] = await app.queryComponent({ntype: 'grid-container'}, ['id']);
            return Boolean(baseGrid)
        }).toBe(true);

        const baseProps = await app.getComponent(baseGrid.id, ['store.id']);
        await expect.poll(async () => (await app.getComponent(baseProps['store.id'], ['count'])).count).toBeGreaterThan(0);

        // Relative to src/worker/App.mjs in dedicated App Worker
        const appWorker = getAppWorker(page),
              reproIds  = await appWorker.evaluate(async gridId => {
                  const {default: Dialog} = await import('../dialog/Base.mjs'),
                        {default: Grid}   = await import('../grid/Container.mjs'),
                        grid              = Neo.getComponent(gridId),
                        dialog            = Neo.create(Dialog, {
                            appName        : grid.appName,
                            windowId       : grid.windowId,
                            modal          : false,
                            resizable      : false,
                            draggable      : false,
                            title          : 'Menu layering reproduction',
                            wrapperStyle   : {left: '160px', top: '100px', width: '850px', height: '500px'},
                            containerConfig: {layout: 'fit'},
                            items          : [{
                                module       : Grid,
                                store        : grid.store,
                                searchToolbar: {appName: grid.appName, windowId: grid.windowId},
                                columns      : [
                                    {dataField: 'id', text: 'ID', width: 100},
                                    {dataField: 'title', text: 'Title', flex: 1, minWidth: 200},
                                    {dataField: 'area', text: 'Area', width: 160}
                                ]
                            }]
                        });

                  return {
                      dialogGridId: dialog.down({ntype: 'grid-container'}).id,
                      dialogId    : dialog.id
                  }
              }, baseGrid.id);

        let toolbarId;
        await expect.poll(async () => {
            toolbarId = (await app.getComponent(reproIds.dialogGridId, ['searchToolbar.id']))['searchToolbar.id'];
            return typeof toolbarId === 'string' && toolbarId.length > 0
        }).toBe(true);

        const dialog   = page.locator(`#${reproIds.dialogId}`),
              scopeBtn = dialog.getByRole('button', {name: 'Grid columns', exact: true});

        await expect(dialog).toBeVisible();
        await expect(scopeBtn).toBeVisible();
        await scopeBtn.click();

        const scopeMenu = page.locator('.neo-grid-search-scope-menu.neo-floating');
        await expect(scopeMenu).toBeVisible();

        const menuId = await scopeMenu.getAttribute('id'),
              layer  = await inspectHitAndLayer(page, menuId, reproIds.dialogId);

        expect(layer).not.toBeNull();
        expect(layer.parentTag).toBe('BODY');
        expect(layer.inlineZIndex).toBe('');
        expect(layer.zIndex).toBe('1000');
        expect(layer.overlapZIndex).toBe('1000');
        expect(layer.followsOverlap).toBe(true);
        expect(layer.targetOwnsHit, 'scope menu owns elementFromPoint over its owning dialog').toBe(true);

        const menuState = await app.getComponent(menuId, ['floating', 'mounted', 'parentId', 'zIndex']);

        expect(menuState).toEqual({
            floating: true,
            mounted : true,
            parentId: 'document.body',
            zIndex  : null
        });

        // Real pointer selection (no {force: true}) updates search scope and closes the menu
        await scopeMenu.getByText('Title', {exact: true}).click();
        await expect(scopeMenu).toBeHidden();
        await expect.poll(() => app.callMethod(toolbarId, 'getSearchFields')).toEqual(['title'])
    });

    test('AC-2 & AC-3: body-level and dialog-hosted button menus, submenus, explicit menu.zIndex across reopen, and modal mask coherence', async ({page, neuralLink}) => {
        await neuralLink.routeConfig(page, config => ({...config, useAiClient: true}));
        await page.goto('/examples/dialog/index.html');
        await expect(page.locator('.neo-dialog input[name="name"]')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(page.locator('.neo-dialog')).toHaveCount(0);

        const app = await neuralLink.connectToApp('Neo.examples.dialog');

        let mainToolbar;
        await expect.poll(async () => {
            [mainToolbar] = await app.queryComponent({ntype: 'toolbar'}, ['id']);
            return Boolean(mainToolbar)
        }).toBe(true);

        const appWorker = getAppWorker(page),
              bodySetup = await appWorker.evaluate(async toolbarId => {
                  const {default: Button} = await import('../button/Base.mjs'),
                        toolbar           = Neo.getComponent(toolbarId),
                        bgBtn             = toolbar.add({
                            module: Button,
                            text  : 'Body Menu',
                            menu  : {
                                hideOnLeafItemClick: false,
                                subMenuHoverDelay  : 0,
                                items              : [{
                                    id   : 'body-group',
                                    text : 'Body Group',
                                    items: [{id: 'body-sub-leaf', text: 'Body Sub Leaf'}]
                                }, {
                                    id  : 'body-leaf',
                                    text: 'Body Plain'
                                }]
                            }
                        });

                  return {bgBtnId: bgBtn.id}
              }, mainToolbar.id);

        const bgBtn = page.locator(`#${bodySetup.bgBtnId}`);
        await expect(bgBtn).toBeVisible();
        await bgBtn.click();

        const menus = page.locator('.neo-menu-list.neo-floating');
        await expect(menus).toHaveCount(1);

        const bodyRootId = await menus.nth(0).getAttribute('id');
        await menus.nth(0).getByText('Body Group', {exact: true}).click();
        await expect(menus).toHaveCount(2);

        const bodySubId    = await menus.nth(1).getAttribute('id'),
              bodySubLayer = await inspectHitAndLayer(page, bodySubId);

        expect(bodySubLayer.parentTag).toBe('BODY');
        expect(bodySubLayer.zIndex).toBe('1000');
        expect(bodySubLayer.inlineZIndex).toBe('');
        expect(bodySubLayer.targetOwnsHit).toBe(true);

        const subFollowsRoot = await page.evaluate(({rootId, subId}) => {
            const root = document.getElementById(rootId),
                  sub  = document.getElementById(subId);
            return Boolean(root.compareDocumentPosition(sub) & Node.DOCUMENT_POSITION_FOLLOWING)
        }, {rootId: bodyRootId, subId: bodySubId});
        expect(subFollowsRoot).toBe(true);

        // 1a. Interactive path: opening a modal dialog captures focus, automatically unmounting focused background menus
        const createRootBtn = page.getByRole('button', {name: 'Edit selected contact', exact: true}),
              focusedDialog = await appWorker.evaluate(rootId => {
                  const mainView  = Neo.getComponent(rootId).app.mainView,
                        createBtn = mainView.down({text: 'Edit selected contact'});

                  mainView.createDialog({component: createBtn});
                  return mainView.dialog.id
              }, bodyRootId);

        await expect(page.locator(`#${focusedDialog}`).locator(':focus')).toHaveCount(1);
        await expect(menus).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(page.locator('.neo-dialog')).toHaveCount(0);
        await expect(page.locator('.neo-dialog-modal-mask')).toHaveCount(0);

        // 1b. Pure stacking path: even if unfocused background menus remain mounted before a modal dialog opens,
        // neither background root nor background submenu (`1000`) defeats the later `.neo-dialog-modal-mask` (`1000`)
        await appWorker.evaluate(btnId => {
            const root = Neo.getComponent(btnId).menuList,
                  rec  = root.store.getAt(0);

            root.focusOnMount = false;
            root.initVnode(true);
            root.showSubMenu(root.getItemId(rec), rec, false)
        }, bodySetup.bgBtnId);
        await expect(menus).toHaveCount(2);

        await appWorker.evaluate(btnId => {
            Neo.getComponent(btnId).menuList.syncOutsidePointerListener(false)
        }, bodySetup.bgBtnId);

        const dialog1   = await openSettledDialog(page, createRootBtn),
              dialog1Id = await dialog1.getAttribute('id');

        await expect(page.locator('.neo-dialog-modal-mask')).toHaveCount(1);
        await expect(menus).toHaveCount(2);

        const maskDominatesBgMenus = await page.evaluate(({rootId, subId}) => {
            const mask = document.querySelector('.neo-dialog-modal-mask'),
                  root = document.getElementById(rootId),
                  sub  = document.getElementById(subId),
                  sr   = sub.getBoundingClientRect(),
                  hit  = document.elementFromPoint(Math.round(sr.left + sr.width / 2), Math.round(sr.top + sr.height / 2));

            return {
                hitIsMaskOrDialog: Boolean(hit && (hit === mask || hit.closest('.neo-dialog'))),
                maskAfterRoot    : Boolean(root.compareDocumentPosition(mask) & Node.DOCUMENT_POSITION_FOLLOWING),
                maskAfterSub     : Boolean(sub.compareDocumentPosition(mask) & Node.DOCUMENT_POSITION_FOLLOWING),
                subZIndex        : getComputedStyle(sub).zIndex
            }
        }, {rootId: bodyRootId, subId: bodySubId});

        expect(maskDominatesBgMenus).toEqual({
            hitIsMaskOrDialog: true,
            maskAfterRoot    : true,
            maskAfterSub     : true,
            subZIndex        : '1000'
        });

        await appWorker.evaluate(btnId => {
            const root = Neo.getComponent(btnId).menuList;
            root.hideSubMenu();
            root.unmount()
        }, bodySetup.bgBtnId);
        await expect(menus).toHaveCount(0);

        // Add both a default cascade menu button and an explicit zIndex: 1500 menu button inside modal Dialog 1
        const dialogBtnIds = await appWorker.evaluate(async dlgId => {
            const {default: Button} = await import('../button/Base.mjs'),
                  dlg               = Neo.getComponent(dlgId),
                  defaultBtn        = dlg.add({
                      module: Button,
                      style : {marginTop: '1em'},
                      text  : 'Dialog Menu',
                      menu  : {
                          subMenuHoverDelay: 0,
                          items            : [{
                              id   : 'dlg-group',
                              text : 'Dialog Cascade',
                              items: [{id: 'dlg-sub', text: 'Dialog Deep Action'}]
                          }]
                      }
                  }),
                  customZBtn        = dlg.add({
                      module: Button,
                      style : {marginTop: '1em', marginLeft: '1em'},
                      text  : 'Custom Z Menu',
                      menu  : {
                          subMenuHoverDelay: 0,
                          zIndex           : 1500,
                          items            : [{
                              id   : 'z-group',
                              text : 'Pinned Layer',
                              items: [{id: 'z-sub', text: 'Pinned Sub'}]
                          }]
                      }
                  });

            return {customZBtnId: customZBtn.id, defaultBtnId: defaultBtn.id}
        }, dialog1Id);

        // 1. Default button menu + submenu inside modal Dialog 1
        await page.locator(`#${dialogBtnIds.defaultBtnId}`).click();
        await expect(menus).toHaveCount(1);

        const dlgMenuRootId    = await menus.nth(0).getAttribute('id'),
              dlgMenuRootLayer = await inspectHitAndLayer(page, dlgMenuRootId, dialog1Id);

        expect(dlgMenuRootLayer.parentTag).toBe('BODY');
        expect(dlgMenuRootLayer.zIndex).toBe('1000');
        expect(dlgMenuRootLayer.inlineZIndex).toBe('');
        expect(dlgMenuRootLayer.followsOverlap).toBe(true);
        expect(dlgMenuRootLayer.targetOwnsHit).toBe(true);

        await menus.nth(0).getByText('Dialog Cascade', {exact: true}).click();
        await expect(menus).toHaveCount(2);

        const dlgMenuSubId    = await menus.nth(1).getAttribute('id'),
              dlgMenuSubLayer = await inspectHitAndLayer(page, dlgMenuSubId);

        expect(dlgMenuSubLayer.parentTag).toBe('BODY');
        expect(dlgMenuSubLayer.zIndex).toBe('1000');
        expect(dlgMenuSubLayer.inlineZIndex).toBe('');
        expect(dlgMenuSubLayer.targetOwnsHit).toBe(true);

        await menus.nth(1).getByText('Dialog Deep Action', {exact: true}).click();
        await expect(menus).toHaveCount(0);
        await expect(dialog1).toBeVisible();

        // 2. Explicit menu: {zIndex: 1500} persists across hide/reopen and cascades 1501 to submenu
        const customZBtn = page.locator(`#${dialogBtnIds.customZBtnId}`);

        for (let pass = 0; pass < 2; pass++) {
            await customZBtn.click();
            await expect(menus).toHaveCount(1);

            const zRootId    = await menus.nth(0).getAttribute('id'),
                  zRootState = await app.getComponent(zRootId, ['zIndex']),
                  zRootLayer = await inspectHitAndLayer(page, zRootId, dialog1Id);

            expect(zRootState.zIndex).toBe(1500);
            expect(zRootLayer.zIndex).toBe('1500');
            expect(zRootLayer.inlineZIndex).toBe('1500');
            expect(zRootLayer.targetOwnsHit).toBe(true);

            await menus.nth(0).getByText('Pinned Layer', {exact: true}).click();
            await expect(menus).toHaveCount(2);

            const zSubId    = await menus.nth(1).getAttribute('id'),
                  zSubState = await app.getComponent(zSubId, ['zIndex']),
                  zSubLayer = await inspectHitAndLayer(page, zSubId);

            expect(zSubState.zIndex).toBe(1501);
            expect(zSubLayer.zIndex).toBe('1501');
            expect(zSubLayer.inlineZIndex).toBe('1501');
            expect(zSubLayer.targetOwnsHit).toBe(true);

            if (pass === 1) {
                await app.setProperties(zRootId, {zIndex: 1600});
                await expect.poll(async () => (await inspectHitAndLayer(page, zSubId))?.zIndex).toBe('1601');
                await app.setProperties(zRootId, {zIndex: 1500});
                await expect.poll(async () => (await inspectHitAndLayer(page, zSubId))?.zIndex).toBe('1501')
            }

            await menus.nth(1).getByText('Pinned Sub', {exact: true}).click();
            await expect(menus).toHaveCount(0)
        }
    });

    test('AC-4: examples/dialog nested modals preserve ComboBox picker layering, Picker Escape isolation, focus wrapping, and mask teardown', async ({page, neuralLink}) => {
        await neuralLink.routeConfig(page, config => ({...config, useAiClient: true}));
        await page.goto('/examples/dialog/index.html');
        await expect(page.locator('.neo-dialog input[name="name"]')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(page.locator('.neo-dialog')).toHaveCount(0);

        await neuralLink.connectToApp('Neo.examples.dialog');

        const createRootBtn = page.getByRole('button', {name: 'Edit selected contact', exact: true}),
              dialogs       = page.locator('.neo-dialog'),
              mask          = page.locator('.neo-dialog-modal-mask');

        const dialog1 = await openSettledDialog(page, createRootBtn),
              dialog2 = await openSettledDialog(page, dialog1.getByRole('button', {name: 'Edit another contact', exact: true})),
              dialog3 = await openSettledDialog(page, dialog2.getByRole('button', {name: 'Edit another contact', exact: true}));

        await expect(dialogs).toHaveCount(3);
        await expect(mask).toHaveCount(1);

        const dialog2Id = await dialog2.getAttribute('id'),
              dialog3Id = await dialog3.getAttribute('id');

        const maskOrder = await page.evaluate(topDialogId => {
            const maskEl = document.querySelector('.neo-dialog-modal-mask');
            return {
                maskZIndex   : getComputedStyle(maskEl).zIndex,
                nextSiblingId: maskEl.nextElementSibling?.id || null
            }
        }, dialog3Id);

        expect(maskOrder).toEqual({
            maskZIndex   : '1000',
            nextSiblingId: dialog3Id
        });

        // Open ComboBox picker in Dialog 3: sits at 1000 after Dialog 3 and owns hit testing
        await dialog3.locator('.fa-caret-down').first().click();

        const picker = page.locator('.neo-picker-container.neo-floating');
        await expect(picker).toBeVisible();

        const pickerId    = await picker.getAttribute('id'),
              pickerLayer = await inspectHitAndLayer(page, pickerId);

        expect(pickerLayer.zIndex).toBe('1000');
        expect(pickerLayer.targetOwnsHit).toBe(true);

        const pickerFollowsDialog3 = await page.evaluate(({dlgId, pkrId}) => {
            const dlg = document.getElementById(dlgId),
                  pkr = document.getElementById(pkrId);
            return Boolean(dlg.compareDocumentPosition(pkr) & Node.DOCUMENT_POSITION_FOLLOWING)
        }, {dlgId: dialog3Id, pkrId: pickerId});
        expect(pickerFollowsDialog3).toBe(true);

        // Picker Escape closes only the picker, keeping all 3 nested modal dialogs open
        await page.keyboard.press('Escape');
        await expect(picker).toBeHidden();
        await expect(dialogs).toHaveCount(3);
        await expect(dialog3.locator(':focus')).toHaveCount(1);

        // Local Tab focus wrapping (`requestAnimationFrame` in `DomAccess#onTrappedFocusMovement`) stays trapped inside Dialog 3
        await dialog3.locator('input:not([disabled])').first().focus();
        for (let step = 0; step < 6; step++) {
            await page.keyboard.press('Tab');
            await expect.poll(() => page.evaluate(dlgId => {
                const dlg = document.getElementById(dlgId),
                      el  = document.activeElement;
                return Boolean(dlg && el && dlg.contains(el) && !el.classList.contains('neo-focus-trap'))
            }, dialog3Id)).toBe(true)
        }

        // Teardown across nested close button + Escape re-anchors and removes the shared modal mask
        await dialog3.getByRole('button', {name: 'close'}).click();
        await expect(dialogs).toHaveCount(2);
        await expect(mask).toHaveCount(1);
        expect(await page.evaluate(() => document.querySelector('.neo-dialog-modal-mask')?.nextElementSibling?.id)).toBe(dialog2Id);

        await page.keyboard.press('Escape');
        await expect(dialogs).toHaveCount(1);
        await expect(mask).toHaveCount(1);

        await page.keyboard.press('Escape');
        await expect(dialogs).toHaveCount(0);
        await expect(mask).toHaveCount(0);
        await expect(createRootBtn).toBeFocused();

        // Reopen works cleanly after full teardown
        const reopened = await openSettledDialog(page, createRootBtn);
        await expect(reopened).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dialogs).toHaveCount(0);
        await expect(mask).toHaveCount(0)
    })
});
