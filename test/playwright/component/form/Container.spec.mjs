import {test, expect} from '@playwright/test';

let componentIds = [];

async function destroy(page, id) {
    await page.evaluate(async id => {
        const result = await Neo.worker.App.destroyNeoInstance(id);

        if (!result.success) {
            console.error(`Failed to destroy component ${id}:`, result.error)
        }
    }, id)
}

function createFormConfig(parentId) {
    return {
        ntype: 'form-container',
        parentId,
        items: [
            {ntype: 'textfield', id: 'form-field-1', labelText: 'First', value: 'a'},
            {ntype: 'file-upload-field', id: 'form-field-2', labelText: 'Upload'},
            {ntype: 'textfield', id: 'form-field-3', labelText: 'Last', value: 'b'}
        ]
    }
}

async function marginBottomOf(page, id) {
    await page.waitForSelector(`#${id}`);

    return page.evaluate(id => {
        return getComputedStyle(document.getElementById(id)).marginBottom
    }, id)
}

// getComputedStyle() can run before a class's theme stylesheet has finished loading:
// insertThemeFiles() only tells the main thread to add the <link>, it does not wait for the
// browser to fetch it. A <link> only gets a non-null .sheet once its CSS has actually loaded, so
// waiting on that (rather than just the element existing) keeps the two tests above honest about
// stylesheet load order instead of racing it.
async function stylesheetsLoaded(page, names) {
    await page.waitForFunction(names => {
        const links = [...document.querySelectorAll('link[rel="stylesheet"]')];

        return names.every(name => links.some(link => link.href.includes(name))) && links.every(link => link.sheet !== null)
    }, names)
}

test.describe('Neo.form.Container', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        // Registering the ntypes does not insert any stylesheet; a class's CSS only inserts the first
        // time an instance of it gets a windowId (see insertThemeFiles() in src/worker/App.mjs). So
        // preloading here keeps both tests free to control the actual *instantiation* order below.
        await page.evaluate(async () => {
            await Neo.worker.App.loadModule({path: '../form/Container.mjs'});
            await Neo.worker.App.loadModule({path: '../form/field/Text.mjs'});
            await Neo.worker.App.loadModule({path: '../form/field/FileUpload.mjs'})
        });

        componentIds = []
    });

    test.afterEach(async ({page}) => {
        for (const id of componentIds.reverse()) {
            await destroy(page, id)
        }

        componentIds = []
    });

    // https://github.com/neomjs/neo/issues/19230
    // The container's base margin-bottom rule and a field's own margin-bottom rule shared the same
    // specificity, so whichever stylesheet loaded last decided the outcome. A field's own margin must
    // win regardless of stylesheet load order.
    test('a field keeps its own margin-bottom when its stylesheet loads after the container', async ({page}) => {
        const result = await page.evaluate(config => Neo.worker.App.createNeoInstance(config), createFormConfig('component-test-viewport'));

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`)
        }

        componentIds.push(result.id);

        await stylesheetsLoaded(page, ['/form/Container.css', '/form/field/Text.css', '/form/field/FileUpload.css']);

        const expectedUploadMargin = await page.evaluate(() => {
            return `${parseFloat(getComputedStyle(document.documentElement).fontSize) * 2.5}px`
        });

        expect(await marginBottomOf(page, 'form-field-1')).toBe('5px');
        expect(await marginBottomOf(page, 'form-field-2')).toBe(expectedUploadMargin);
        expect(await marginBottomOf(page, 'form-field-3')).toBe('0px');
    });

    test('a field keeps its own margin-bottom when its stylesheet loaded before the container', async ({page}) => {
        // Create standalone instances of the field classes first, so their stylesheets insert into the
        // document before the container's stylesheet does.
        const standaloneTextField = await page.evaluate(config => Neo.worker.App.createNeoInstance(config), {
            ntype   : 'textfield',
            parentId: 'component-test-viewport',
            id      : 'standalone-textfield'
        });
        const standaloneUploadField = await page.evaluate(config => Neo.worker.App.createNeoInstance(config), {
            ntype   : 'file-upload-field',
            parentId: 'component-test-viewport',
            id      : 'standalone-upload-field'
        });

        componentIds.push(standaloneTextField.id, standaloneUploadField.id);

        // Wait for both to render, so their stylesheets insert into <head> before the form's does.
        await page.waitForSelector('#standalone-textfield');
        await page.waitForSelector('#standalone-upload-field');

        const result = await page.evaluate(config => Neo.worker.App.createNeoInstance(config), createFormConfig('component-test-viewport'));

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`)
        }

        componentIds.push(result.id);

        await stylesheetsLoaded(page, ['/form/Container.css', '/form/field/Text.css', '/form/field/FileUpload.css']);

        const expectedUploadMargin = await page.evaluate(() => {
            return `${parseFloat(getComputedStyle(document.documentElement).fontSize) * 2.5}px`
        });

        expect(await marginBottomOf(page, 'form-field-1')).toBe('5px');
        expect(await marginBottomOf(page, 'form-field-2')).toBe(expectedUploadMargin);
        expect(await marginBottomOf(page, 'form-field-3')).toBe('0px');
    });
});
