import {test, expect} from '../../fixtures.mjs';

test.use({viewport: {width: 1440, height: 900}});

/** @summary Opens the actual demo and installs a read-only identity observer in its own worker. */
async function openEmail(page, neuralLink) {
    await neuralLink.routeConfig(page.context(), config => ({...config, useAiClient: true, enableHotPatching: true}));
    await page.goto('/apps/email/index.html');
    const app = await neuralLink.connectToApp('Email');
    await expect(page.locator('.email-workspace')).toBeVisible();
    const [workspace] = await app.queryComponent({className: 'Email.view.WorkspaceContainer'}, ['id', 'controller.id']);
    expect(await app.patchCode('Email.view.WorkspaceContainer', 'emailTestState', `function() {
        const controller = this.controller;
        const references = this.emailTestReferences ||= new Map();
        const objects = {};
        for (const name of ['detail', 'reader', 'compose', 'draft', 'draftTo', 'draftSubject', 'draftBody']) {
            const item = controller.getReference(name);
            if (!item) continue;
            if (!references.has(name)) references.set(name, item);
            objects[name] = {id: item.id, same: references.get(name) === item && Neo.get(item.id) === item,
                windowId: item.windowId, parentId: item.parentId, mounted: item.mounted, value: item.value};
        }
        const inbox = controller.getReference('inbox');
        return {objects, items: this.items.map(item => item.id), detached: this.detachedItems.size,
            selected: controller.getReference('detail').stateProvider.getData('email')?.id ?? null,
            draftBody: controller.getReference('compose')?.stateProvider.getData('body') ?? null,
            storeCount: inbox.store.count, rowPool: inbox.body.items.length,
            actions: controller.getReference('compose')?.headerToolbar.items.filter(item => item.action)
                .map(item => ({action: item.action, id: item.id, hidden: item.hidden})) || []};
    }`)).toMatchObject({success: true});
    return {app, id: workspace.id, controllerId: workspace.properties['controller.id'],
        snapshot: () => app.callMethod(workspace.id, 'emailTestState')}
}

/** @summary Resolves a visible action from the retained Dialog's current toolbar. */
async function action(state, page, name) {
    const item = (await state.snapshot()).actions.find(item => item.action === name);
    return page.locator(`#${item.id}`)
}

/** @summary Opens one retained draft and resolves the live field IDs from the worker. */
async function compose(state, page) {
    await page.getByText('Compose', {exact: true}).click();
    await expect(page.locator('.email-compose-dialog')).toHaveCount(1);
    await expect(page.locator('.email-compose-dialog textarea')).toBeVisible();
    return (await state.snapshot()).objects
}

test('buffered selection drives the same functional reader through two native popup returns', async ({page, neuralLink}) => {
    const state = await openEmail(page, neuralLink);
    await expect(page.locator('.email-compose-dialog')).toHaveCount(0);
    await expect(page.locator('.email-detail-view')).toHaveText('Select an email to read');
    expect(await state.app.callMethod(state.controllerId, 'openInWindow', ['detail'])).toBe(false);
    const initial = await state.snapshot();
    expect(initial.storeCount).toBe(250);
    expect(initial.rowPool).toBeLessThan(initial.storeCount);
    const body = page.locator('.neo-grid-body');
    await body.hover();
    await page.mouse.wheel(0, 4000);
    const row = body.locator('[data-row-id]').filter({visible: true}).first();
    await expect.poll(async () => Number(await row.getAttribute('data-row-id'))).toBeGreaterThan(initial.rowPool);
    let selected = Number(await row.getAttribute('data-row-id')) + 1;
    await row.click();
    await expect.poll(async () => (await state.snapshot()).selected).toBe(selected);
    await expect(page.locator('.email-detail-view h1')).toHaveText(`Project conversation ${selected}`);

    for (let cycle = 0; cycle < 2; cycle++) {
        const opened = page.waitForEvent('popup');
        await page.getByText('Open in window', {exact: true}).click();
        const popup = await opened;
        await expect(popup.locator('.email-detail-view h1')).toHaveText(`Project conversation ${selected}`);
        await expect(popup.locator('.email-workspace')).toHaveCount(0);
        await expect(page.locator('.email-detail-panel')).toHaveCount(0);
        expect(await state.app.callMethod(state.controllerId, 'openInWindow', ['detail'])).toBe(false);
        if (cycle === 0) {
            const nextRow = body.locator('[data-row-id]').filter({visible: true}).nth(1);
            selected = Number(await nextRow.getAttribute('data-row-id')) + 1;
            await nextRow.click();
            await expect(popup.locator('.email-detail-view h1')).toHaveText(`Project conversation ${selected}`);
            expect((await state.snapshot()).objects.reader.same).toBe(true)
        }
        await popup.close({runBeforeUnload: true});
        await expect(page.locator('.email-detail-panel')).toHaveCount(1);
        await expect.poll(async () => (await state.snapshot()).detached).toBe(0);
        const returned = await state.snapshot();
        expect(returned.objects.detail).toMatchObject({...initial.objects.detail, mounted: true});
        expect(returned.objects.reader.same).toBe(true);
        expect((await state.app.verifyComponentConsistency(state.id)).consistent).toBe(true)
    }
});

test('draft survives hide, animated maximize, refusal and guarded native popup return', async ({page, context, neuralLink}) => {
    const state   = await openEmail(page, neuralLink);
    const fields  = await compose(state, page);
    const subject = page.locator(`#${fields.draftSubject.id} input`);
    const body    = page.locator(`#${fields.draftBody.id} textarea`);
    await subject.fill('A retained draft');
    await body.fill('Written in the inbox window');
    await expect.poll(async () => (await state.snapshot()).objects.draftBody.value).toBe('Written in the inbox window');
    expect((await state.snapshot()).draftBody).toBe('Written in the inbox window');
    await page.screenshot({path: test.info().outputPath('compose.png')});
    await (await action(state, page, 'close')).click();
    await expect(page.locator('.email-compose-dialog')).toHaveCount(0);
    await compose(state, page);
    await expect(subject).toHaveValue('A retained draft');
    await expect(body).toHaveValue('Written in the inbox window');

    const before = await page.locator('.email-compose-dialog').boundingBox();
    await page.evaluate(id => {
        window.emailMotion = [];
        const until  = performance.now() + 1000;
        const sample = () => {
            const element = document.getElementById(id);
            if (!element) return;
            const rect = element.getBoundingClientRect();
            window.emailMotion.push({width: rect.width, height: rect.height});
            if (performance.now() < until) requestAnimationFrame(sample)
        };
        requestAnimationFrame(sample)
    }, fields.compose.id);
    await (await action(state, page, 'maximize')).click();
    await expect.poll(async () => Math.round((await page.locator('.email-compose-dialog').boundingBox()).width)).toBe(1440);
    await expect.poll(() => page.evaluate(width => window.emailMotion.some(rect => rect.width > width + 5 && rect.width < 1435), before.width)).toBe(true);
    await (await action(state, page, 'maximize')).click();
    await expect.poll(async () => Math.round((await page.locator('.email-compose-dialog').boundingBox()).width)).toBe(Math.round(before.width));
    await expect(body).toHaveValue('Written in the inbox window');

    await page.evaluate(() => {window.emailOriginalOpen = window.open; window.open = () => null});
    expect(await state.app.callMethod(state.controllerId, 'openInWindow', ['compose'])).toBe(false);
    expect((await state.snapshot()).detached).toBe(0);
    await expect(body).toHaveValue('Written in the inbox window');
    await page.evaluate(() => {window.open = window.emailOriginalOpen; delete window.emailOriginalOpen});

    let release;
    const held = new Promise(resolve => {release = resolve});
    await context.route('**/apps/email/index.html?*', async route => {await held; await route.continue()});
    const opened = page.waitForEvent('popup');
    await (await action(state, page, 'popout')).click();
    const popup = await opened;
    await page.keyboard.press('Escape');
    expect(await state.app.callMethod(state.controllerId, 'openInWindow', ['compose'])).toBe(false);
    release();
    await expect(popup.locator(`#${fields.draftSubject.id} input`)).toHaveValue('A retained draft');
    await expect(popup.locator(`#${fields.draftBody.id} textarea`)).toBeVisible();
    await popup.screenshot({path: test.info().outputPath('compose-popup.png')});
    await expect(popup.locator('.email-workspace')).toHaveCount(0);
    await expect(page.locator('.email-compose-dialog')).toHaveCount(0);
    await page.getByText('Compose', {exact: true}).click();
    expect(context.pages()).toHaveLength(2);
    await popup.locator(`#${fields.draftBody.id} textarea`).fill('Edited in the popup');
    await expect.poll(async () => (await state.snapshot()).objects.draftBody.value).toBe('Edited in the popup');
    await popup.close({runBeforeUnload: true});
    await expect(body).toHaveValue('Edited in the popup');
    const returned = await state.snapshot();
    expect(returned.detached).toBe(0);
    for (const name of ['compose', 'draft', 'draftTo', 'draftSubject', 'draftBody']) {
        expect(returned.objects[name]).toMatchObject({id: fields[name].id, same: true, parentId: fields[name].parentId, windowId: fields[name].windowId})
    }
    const reopened = page.waitForEvent('popup');
    await (await action(state, page, 'popout')).click();
    const secondPopup = await reopened;
    await expect(secondPopup.locator(`#${fields.draftBody.id} textarea`)).toHaveValue('Edited in the popup');
    await secondPopup.close({runBeforeUnload: true});
    await expect(body).toHaveValue('Edited in the popup');
    await expect(page.locator('.email-compose-dialog')).toHaveCount(1);
    expect((await state.snapshot()).objects.compose.same).toBe(true);
    expect((await state.app.verifyComponentConsistency(state.id)).consistent).toBe(true)
});

test('a detached draft remains editable after the source closes, without a retired return owner', async ({page, neuralLink}) => {
    const state  = await openEmail(page, neuralLink);
    const fields = await compose(state, page);
    expect(await state.app.patchCode('Email.view.ComposeDialog', 'draftIdentityWitness', `function() {
        this.draftTestReferences ||= [this, this.down({reference: 'draft'}), this.down({reference: 'draftBody'})];
        return {same: this.draftTestReferences.every(item => Neo.get(item.id) === item && !item.isDestroyed),
            body: this.down({reference: 'draftBody'}).value, providerBody: this.stateProvider.getData('body')};
    }`)).toMatchObject({success: true});
    await state.app.callMethod(fields.compose.id, 'draftIdentityWitness');
    const opened = page.waitForEvent('popup');
    await (await action(state, page, 'popout')).click();
    const popup  = await opened;
    const errors = [];
    popup.on('pageerror', error => errors.push(error.message));
    popup.on('console', message => {if (message.type() === 'error') errors.push(message.text())});
    await expect(popup.locator(`#${fields.draftBody.id} textarea`)).toBeVisible();
    await page.close({runBeforeUnload: true});
    await expect.poll(async () => (await state.app.queryComponent({className: 'Email.view.WorkspaceContainer'}, ['id'])).length).toBe(0);
    await popup.locator(`#${fields.draftBody.id} textarea`).fill('Still editable without the inbox');
    await expect.poll(() => state.app.callMethod(fields.compose.id, 'draftIdentityWitness')).toEqual({
        same: true, body: 'Still editable without the inbox', providerBody: 'Still editable without the inbox'
    });
    await popup.keyboard.press('Escape');
    await expect(popup.locator(`#${fields.draftBody.id} textarea`)).toBeVisible();
    expect(errors).toEqual([]);
    await popup.close({runBeforeUnload: true})
});

test('reader and draft detach together and return independently', async ({page, context, neuralLink}) => {
    const state = await openEmail(page, neuralLink);
    await page.locator('.neo-grid-body [data-row-id="0"]').click();
    const fields = await compose(state, page);
    await page.locator(`#${fields.draftBody.id} textarea`).fill('Independent draft');
    const detailOpened = page.waitForEvent('popup');
    await page.locator('.email-detail-panel').getByText('Open in window', {exact: true}).click();
    const detailPopup = await detailOpened;
    await expect(detailPopup.locator('.email-detail-view h1')).toHaveText('Project conversation 1');
    const composeOpened = page.waitForEvent('popup');
    await (await action(state, page, 'popout')).click();
    const composePopup = await composeOpened;
    await expect(composePopup.locator(`#${fields.draftBody.id} textarea`)).toHaveValue('Independent draft');
    expect(context.pages()).toHaveLength(3);
    expect((await state.snapshot()).detached).toBe(2);
    await detailPopup.close({runBeforeUnload: true});
    await expect(page.locator('.email-detail-view h1')).toHaveText('Project conversation 1');
    await expect.poll(async () => (await state.snapshot()).detached).toBe(1);
    await composePopup.locator(`#${fields.draftBody.id} textarea`).fill('Other popup still works');
    await composePopup.close({runBeforeUnload: true});
    await expect(page.locator(`#${fields.draftBody.id} textarea`)).toHaveValue('Other popup still works');
    await expect.poll(async () => (await state.snapshot()).detached).toBe(0);
    const returned = await state.snapshot();
    expect(Object.values(returned.objects).every(item => item.same)).toBe(true);
    expect(returned.draftBody).toBe('Other popup still works');
    expect((await state.app.verifyComponentConsistency(state.id)).consistent).toBe(true)
});
