import {test, expect} from '@playwright/test';

let componentId;

/**
 * @param {Object} page
 * @param {Object} config
 * @returns {Promise<String>} the created component's id
 */
async function createFileUpload(page, config) {
    const result = await page.evaluate(async config => Neo.worker.App.createNeoInstance({
        importPath: '../form/field/FileUpload.mjs',
        ntype     : 'file-upload-field',
        parentId  : 'component-test-viewport',
        width     : 320,
        ...config
    }), config);

    if (!result.success) {
        throw new Error(`Component creation failed: ${result.error.message}`);
    }

    return result.id
}

test.describe('Neo.form.field.FileUpload', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        if (componentId) {
            await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
            componentId = null
        }
    });

    test('renders in ready state with linked file input and label', async ({page}) => {
        componentId = await createFileUpload(page, {});

        const field = page.locator(`#${componentId}`),
              input = field.locator('input.neo-file-upload-input'),
              label = field.locator('label.neo-file-upload-label');

        await expect(field).toHaveClass(/neo-file-upload-field/);
        await expect(field).toHaveClass(/neo-field-empty/);
        await expect(field).toHaveClass(/neo-file-upload-state-ready/);
        await expect(input).toHaveAttribute('type', 'file');
        await expect(input).toHaveAttribute('id', `${componentId}-input`);
        await expect(label).toHaveAttribute('for', `${componentId}-input`);
        await expect(label).toHaveText('Choose file')
    });

    test('renders existing downloadable document state and download link, and resets via action button', async ({page}) => {
        componentId = await createFileUpload(page, {
            downloadUrl: '/api/documents/{documentId}',
            document   : {
                id      : 42,
                fileName: 'architecture.pdf',
                size    : 2500,
                status  : 'DOWNLOADABLE'
            }
        });

        const field        = page.locator(`#${componentId}`),
              actionButton = field.locator('.neo-file-upload-action-button'),
              filename     = field.locator('.neo-file-upload-filename'),
              label        = field.locator('label.neo-file-upload-label'),
              stateEl      = field.locator('.neo-file-upload-state');

        await expect(field).not.toHaveClass(/neo-field-empty/);
        await expect(field).toHaveClass(/neo-file-upload-state-downloadable/);
        await expect(filename).toHaveText('architecture.pdf');
        await expect(filename).toHaveAttribute('href', '/api/documents/42');
        await expect(stateEl).toHaveText('2.5KB');

        await page.evaluate(id => Neo.worker.App.setConfigs({id, state: 'deleted'}), componentId);
        await expect(field).toHaveClass(/neo-file-upload-state-deleted/);
        await expect(stateEl).toHaveText('File was deleted');

        await actionButton.click();

        await expect(field).toHaveClass(/neo-file-upload-state-ready/);
        await expect(label).toHaveText('Choose file')
    });

    test('validates file extension and maxSize when files are selected via the browser file input', async ({page}) => {
        componentId = await createFileUpload(page, {
            maxSize: '1kb',
            types  : {pdf: 1}
        });

        const field    = page.locator(`#${componentId}`),
              input    = field.locator('input.neo-file-upload-input'),
              filename = field.locator('.neo-file-upload-filename'),
              stateEl  = field.locator('.neo-file-upload-state'),
              errorEl  = field.locator('.neo-file-upload-error-message');

        await input.setInputFiles({
            name    : 'notes.txt',
            mimeType: 'text/plain',
            buffer  : Buffer.from('hello world')
        });

        await expect(field).not.toHaveClass(/neo-field-empty/);
        await expect(field).toHaveClass(/neo-invalid/);
        await expect(filename).toHaveText('notes.txt');
        await expect(stateEl).toContainText('invalid file format (.txt)');
        await expect(errorEl).toHaveText('Please use these file types pdf');

        await input.setInputFiles({
            name    : 'large.pdf',
            mimeType: 'application/pdf',
            buffer  : Buffer.alloc(1500, 65)
        });

        await expect(field).toHaveClass(/neo-invalid/);
        await expect(filename).toHaveText('large.pdf');
        await expect(stateEl).toHaveText('1.5KB');
        await expect(errorEl).toHaveText('File size exceeds 1KB')
    })
});
