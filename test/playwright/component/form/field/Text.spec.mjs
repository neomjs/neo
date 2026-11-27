import {test, expect} from '@playwright/test';

let componentId;

async function createTextField(page, config) {
    const result = await page.evaluate(async (config) => {
        return Neo.worker.App.createNeoInstance({
            importPath: '../form/field/Text.mjs',
            ntype     : 'textfield',
            parentId  : 'component-test-viewport',
            flex      : 'none',
            labelText : 'My label',
            labelWidth: 80,
            style     : {margin: '20px'},
            width     : 300,
            ...config
        });
    }, config);

    if (!result.success) {
        throw new Error(`Component creation failed: ${result.error.message}`);
    }

    return result.id;
}

/**
 * @summary Captures the field with room for its floating inline label.
 */
async function captureField(page, field, path) {
    const box = await field.boundingBox();
    await page.screenshot({path, clip: {x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8),
        width: box.width + 16, height: box.height + 16}})
}

async function openThemedViewport(page, themes) {
    await page.route('**/empty-viewport/neo-config.json', async route => {
        const response = await route.fetch();
        await route.fulfill({json: {...await response.json(), themes}})
    });
    await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
    await expect(page.locator('#component-test-viewport')).toBeAttached();
    await expect(page.locator('body')).toContainClass(themes[0])
}

async function fieldContainer(page, parentId, config = {}) {
    const result = await page.evaluate(config => Neo.worker.App.createNeoInstance({
        importPath: '../container/Base.mjs', ntype: 'container', ...config
    }), {parentId, ...config});
    expect(result.success).toBe(true);
    return result.id
}

test('Material fields paint a single bottom indicator and a nested Neo field keeps its local border width', async ({page}) => {
    await openThemedViewport(page, ['neo-theme-material-dark', 'neo-theme-neo-light']);

    const mount    = async config => page.locator('#' + await createTextField(page, {clearable: false, ...config}));
    const neoScope = await fieldContainer(page, 'component-test-viewport', {theme: 'neo-theme-neo-light'});
    const plain    = await mount({}),
          wrapped = await mount({clearable: true, value: 'Clear me'}),
          inline  = await mount({labelPosition: 'inline'}),
          legacy  = await mount({parentId: neoScope, labelPosition: 'inline', style: {'--neo-textfield-border-width': '3px'}});

    const input   = plain.locator('input'),
          wrapper = wrapped.locator('.neo-input-wrapper'),
          overlay = inline.locator('.neo-label-wrapper');
    const segments = overlay.locator(':scope > div');
    await expect(segments).toHaveCount(3);
    for (const owner of [input, wrapper, ...await segments.all()]) {
        await expect(owner).toHaveCSS('border-width', '0px 0px 1px');
        await expect(owner).toHaveCSS('border-bottom-color', /^oklch\(0\.745 /);
        await expect(owner).toHaveCSS('border-bottom-left-radius', '0px');
        await expect(owner).toHaveCSS('border-bottom-right-radius', '0px')
    }
    await expect(input).toHaveCSS('height', '56px');
    await expect(overlay).toHaveCSS('height', '56px');
    await expect(input).toHaveCSS('background-color', /^oklch\(0\.33 /);
    const fill = await input.evaluate(el => getComputedStyle(el).backgroundColor);
    await expect(overlay).toHaveCSS('background-color', fill);
    await expect(inline.locator('input')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(inline.locator('input')).toHaveCSS('border-bottom-color', 'rgba(0, 0, 0, 0)');

    await expect(legacy).not.toHaveClass(/neo-theme-/);
    await expect(legacy.locator('.neo-label-wrapper')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(legacy.locator('.neo-left-border')).toHaveCSS('border-width', '3px 0px 3px 3px');

    await expect(wrapper).toHaveCSS('height', '56px');
    await expect(wrapper.locator('input')).toHaveCSS('border-width', '0px');
    await expect(wrapper.locator('input')).toHaveCSS('height', '55px');
    await expect(wrapped.locator('.neo-field-trigger')).toHaveCSS('height', '55px');

    await page.emulateMedia({reducedMotion: 'no-preference'});
    await expect(input).toHaveCSS('border-image-source', /^linear-gradient/);
    await expect(plain).toHaveCSS('--neo-textfield-focus-extent', '0%');
    await expect(plain).toHaveCSS('transition-duration', '0.2s');
    await input.focus();
    await expect(plain).toHaveCSS('--neo-textfield-focus-extent', '50%');
    await expect(input).toHaveCSS('border-bottom-width', '2px');
    await expect(input).toHaveCSS('height', '56px');
    await wrapper.locator('input').focus();
    await expect(wrapper).toHaveCSS('border-bottom-width', '2px');
    await expect(wrapper).toHaveCSS('height', '56px');
    await expect(wrapper.locator('input')).toHaveCSS('height', '54px');
    await expect(wrapped.locator('.neo-field-trigger')).toHaveCSS('height', '54px');
    await inline.locator('input').focus();
    await expect(segments.first()).toHaveCSS('border-bottom-width', '2px');
    await expect(overlay).toHaveCSS('height', '56px');
    await expect(legacy.locator('input')).toHaveCSS('border-image-source', 'none');
    await page.emulateMedia({reducedMotion: 'reduce'});
    await expect(plain).toHaveCSS('transition-duration', '0s');
    await expect(overlay.locator('label')).toHaveCSS('transition-duration', '0s');
    await input.focus();
    await expect(plain).toHaveCSS('--neo-textfield-focus-extent', '50%');
    await input.blur();
    await expect(plain).toHaveCSS('--neo-textfield-focus-extent', '0%');
    await page.evaluate(id => Neo.worker.App.setConfigs({id, readOnly: true}), await plain.getAttribute('id'));
    await expect(input).toHaveCSS('border-image-source', 'none');
});

for (const [outer, inner] of [
    ['neo-theme-material-dark', 'neo-theme-neo-light'],
    ['neo-theme-neo-light', 'neo-theme-material-dark']
]) {
    test(`textfield preserves ${inner} across nested containers inside ${outer}`, async ({page, context}) => {
        const reference    = await context.newPage();
        const switchedHost = 'neo-theme-neo-dark';
        await Promise.all([
            openThemedViewport(page, [outer, inner, switchedHost]),
            openThemedViewport(reference, [inner, outer, switchedHost])
        ]);

        const field = async (target, parentId, labelPosition = 'inline') => {
            const id = await createTextField(target, {parentId, clearable: false, labelPosition});
            return target.locator('#' + id)
        };
        const surface = locator => locator.evaluate(el => {
            const input      = getComputedStyle(el.querySelector('input')),
                  label      = el.querySelector('.neo-label-wrapper'),
                  overlay    = getComputedStyle(label),
                  segment    = getComputedStyle(label.querySelector('.neo-left-border')),
                  focusPaint = getComputedStyle(label, '::after').backgroundImage !== 'none';
            return {
                colorScheme: input.colorScheme, color: input.color, font: input.font,
                inputHeight: input.height, padding: input.padding, borderColor: segment.borderBottomColor, borderWidth: segment.borderWidth,
                indicator  : input.getPropertyValue('--neo-textfield-border-bottom-width').trim(),
                overlayFill: overlay.backgroundColor, focusPaint,
                duration   : getComputedStyle(el).transitionDuration
            }
        });

        const viewport   = 'component-test-viewport',
              host       = await fieldContainer(page, viewport),
              island     = await fieldContainer(page, host, {theme: inner}),
              descendant = await fieldContainer(page, island),
              nested     = await field(page, descendant),
              standalone = await field(reference, await fieldContainer(reference, viewport)),
              roleFill   = 'rgb(24, 64, 96)',
              scope      = await fieldContainer(page, descendant, {
                  cls: ['neo-theme-scope'], style: {'--neo-color-background-field': roleFill}
              }),
              scoped     = await field(page, await fieldContainer(page, scope));

        await expect(page.locator('#' + island)).toContainClass(inner);
        await expect(page.locator('#' + host)).not.toHaveClass(/neo-theme-/);
        await expect(page.locator('#' + descendant)).not.toHaveClass(/neo-theme-/);
        await expect(nested).not.toHaveClass(/neo-theme-/);
        await expect(scoped).not.toHaveClass(/neo-theme-/);
        await expect(standalone.locator('input')).toBeVisible();
        await expect(nested.locator('input')).toBeVisible();
        const paint = locator => locator.locator('input').evaluate(el => {
            const {backgroundColor, borderColor, borderRadius, borderWidth, color, font} = getComputedStyle(el);
            return {backgroundColor, borderColor, borderRadius, borderWidth, color, font}
        });
        const plain       = await field(page, descendant, 'left'),
              scopedPlain = await field(page, scope, 'left'),
              control     = await field(reference, viewport, 'left'),
              normalPaint = await paint(control);
        expect(await paint(plain)).toEqual(normalPaint);
        expect(await paint(scopedPlain)).toEqual({...normalPaint, backgroundColor: roleFill});
        const normal = await surface(standalone);
        expect(normal.colorScheme).toBe(inner === 'neo-theme-material-dark' ? 'dark' : 'light');
        expect(normal.focusPaint).toBe(inner === 'neo-theme-material-dark');
        expect(await surface(nested)).toEqual(normal);
        const scopedSurface = await surface(scoped);
        expect(scopedSurface).toEqual({...normal, overlayFill: inner === 'neo-theme-material-dark' ? roleFill : normal.overlayFill});
        await page.evaluate(({id, theme}) => Neo.worker.App.setConfigs({id, theme}), {id: host, theme: switchedHost});
        await expect(page.locator('#' + host)).toContainClass(switchedHost);
        await expect(page.locator('#' + island)).toContainClass(inner);
        await expect.poll(() => surface(nested)).toEqual(normal);
        await expect.poll(() => surface(scoped)).toEqual(scopedSurface);
        await expect.poll(() => paint(plain)).toEqual(normalPaint);
        await expect.poll(() => paint(scopedPlain)).toEqual({...normalPaint, backgroundColor: roleFill})
    });
}

test.describe('Neo.form.field.Text', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', { state: 'attached' });
    });

    test.afterEach(async ({page}) => {
        if (componentId) {
            await page.evaluate(async (id) => {
                const result = await Neo.worker.App.destroyNeoInstance(id);
                if (!result.success) {
                    console.error(`Failed to destroy component ${id}:`, result.error);
                }
            }, componentId);
            componentId = null;
        }
    });

    test('Check isTouched on focusLeave', async ({page}) => {
        componentId = await createTextField(page, {value: 'Hello World!'});
        const field = page.locator(`#${componentId}`);
        const input = field.locator('input');

        await expect(input).toHaveValue('Hello World!');
        await expect(field).not.toHaveClass(/neo-is-touched/);

        await input.click();
        await input.blur();

        await expect(field).toHaveClass(/neo-is-touched/);
    });

    test('Check isTouched on focusEnter', async ({page}) => {
        componentId = await createTextField(page, {isTouchedEvent: 'focusEnter', value: 'Hello World!'});
        const field = page.locator(`#${componentId}`);
        const input = field.locator('input');

        await expect(input).toHaveValue('Hello World!');
        await expect(field).not.toHaveClass(/neo-is-touched/);

        await input.click();

        await expect(field).toHaveClass(/neo-is-touched/);
    });

    test('Check isTouched set initially', async ({page}) => {
        componentId = await createTextField(page, {isTouched: true, value: 'Hello World!'});
        const field = page.locator(`#${componentId}`);
        const input = field.locator('input');

        await expect(input).toHaveValue('Hello World!');
        await expect(field).toHaveClass(/neo-is-touched/);
    });

    test('Label Positions', async ({page}) => {
        componentId = await createTextField(page);
        const field = page.locator(`#${componentId}`);
        const label = field.locator('.neo-textfield-label');

        // left (default)
        await expect(label).toBeVisible();

        // top
        await page.evaluate(id => Neo.worker.App.setConfigs({id, labelPosition: 'top'}), componentId);
        await expect(field).toHaveClass(/label-top/);

        // bottom
        await page.evaluate(id => Neo.worker.App.setConfigs({id, labelPosition: 'bottom'}), componentId);
        await expect(field).toHaveClass(/label-bottom/);

        // right
        await page.evaluate(id => Neo.worker.App.setConfigs({id, labelPosition: 'right'}), componentId);
        await expect(field).toHaveClass(/label-right/);

        // inline
        await page.evaluate(id => Neo.worker.App.setConfigs({id, labelPosition: 'inline'}), componentId);
        await expect(field).toHaveClass(/label-inline/);
    });

    test('top-labelled fields contain their inputs in consecutive grid rows', async ({page}) => {
        const grid = await page.evaluate(() => Neo.worker.App.createNeoInstance({
            importPath: '../container/Base.mjs',
            ntype     : 'container',
            parentId  : 'component-test-viewport',
            flex      : 'none',
            layout    : 'grid',
            style     : {gridTemplateColumns: '300px', rowGap: '4px'}
        }));

        expect(grid.success).toBe(true);
        componentId = grid.id;

        const firstId  = await createTextField(page, {parentId: grid.id, labelPosition: 'top', labelText: 'First',  style: {}}),
              secondId = await createTextField(page, {parentId: grid.id, labelPosition: 'top', labelText: 'Second', style: {}}),
              first    = page.locator(`#${firstId}`),
              second   = page.locator(`#${secondId}`);

        await expect(page.locator(`#${grid.id}`)).toHaveCSS('display', 'grid');
        await expect(second.locator('input')).toBeVisible();

        const firstBox  = await first.boundingBox(),
              inputBox  = await first.locator('input').boundingBox(),
              nextLabel = await second.locator('.neo-textfield-label').boundingBox(),
              inputEnd  = inputBox.y + inputBox.height;

        expect(inputEnd).toBeLessThanOrEqual(firstBox.y + firstBox.height + 1);
        expect(inputEnd).toBeLessThan(nextLabel.y)
    });

    // `value` is trimmed, the DOM is not: a render between a typed space and the next character used to write the
    // trimmed value back over the input. The wrapped setter sees every programmatic write, and none of the typing.
    test('a space typed at the end survives a render that lands before the next character', async ({page}) => {
        componentId = await createTextField(page);
        const field = page.locator(`#${componentId}`);
        const input = field.locator('input');

        await input.click();

        await page.evaluate(() => {
            const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

            window.__valueWrites = [];

            Object.defineProperty(HTMLInputElement.prototype, 'value', {
                configurable: true,
                get() {return descriptor.get.call(this)},
                set(value) {
                    window.__valueWrites.push({had: descriptor.get.call(this), wrote: value});
                    descriptor.set.call(this, value)
                }
            });
        });

        await page.keyboard.type('ab ');

        // Any render of the field will do; the label reaching the DOM proves this one has landed
        await page.evaluate(id => Neo.worker.App.setConfigs({id, labelText: 'Rendered'}), componentId);
        await expect(field.locator('.neo-textfield-label')).toHaveText('Rendered');

        await page.keyboard.type('c');

        await expect(input).toHaveValue('ab c');
        expect(await page.evaluate(() => window.__valueWrites), 'no render wrote the input').toEqual([]);
    });

    for (const type of ['Text', 'TextArea']) {
        test(`${type} character counter follows the visible text without rewriting user input`, async ({page}) => {
            componentId = await createTextField(page, {
                importPath   : `../form/field/${type}.mjs`,
                ntype        : type === 'Text' ? 'textfield' : 'textarea',
                labelPosition: 'top', maxLength: 200, showCharacterCount: true, clearable: true
            });
            const field   = page.locator(`#${componentId}`), input = field.locator('input, textarea'),
                  counter = field.locator('.neo-textfield-character-count');
            await expect(counter).toHaveText('0 / 200');
            await expect(input).toHaveAttribute('aria-describedby', `${componentId}__character-count`);

            await input.click();
            await page.evaluate(type => {
                const prototype  = type === 'Text' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
                      descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
                window.__counterValueWrites = [];
                Object.defineProperty(prototype, 'value', {
                    configurable: true,
                    get() {return descriptor.get.call(this)},
                    set(value) {window.__counterValueWrites.push(value); descriptor.set.call(this, value)}
                })
            }, type);
            await page.keyboard.type('ab ');
            await expect(counter).toHaveText('3 / 200');
            await expect(input).toHaveValue('ab ');
            await page.keyboard.type('c');
            await expect(counter).toHaveText('4 / 200');
            expect(await input.evaluate(node => node.selectionStart)).toBe(4);
            expect(await page.evaluate(() => window.__counterValueWrites)).toEqual([]);

            await page.keyboard.type(' ');
            await expect(counter).toHaveText('5 / 200');
            await input.blur();
            await expect(input).toHaveValue('ab c');
            await expect(counter).toHaveText('4 / 200');

            await page.evaluate(id => Neo.worker.App.setConfigs({id, value: 'set in code'}), componentId);
            await expect(counter).toHaveText('11 / 200');
            await page.evaluate(id => Neo.worker.App.setConfigs({id, maxLength: 20}), componentId);
            await expect(counter).toHaveText('11 / 20');
            await page.evaluate(id => Neo.worker.App.setConfigs({id, maxLength: null}), componentId);
            await expect(counter).toHaveText('11');
            await input.fill('pasted');
            await expect(counter).toHaveText('6');
            await field.hover();
            await field.locator('.neo-trigger-clear').click();
            await expect(counter).toHaveText('0');
        });

        for (const labelPosition of ['left', 'right', 'top', 'bottom', 'inline']) {
            test(`${type} counter and errors occupy separate rows with a ${labelPosition} label`, async ({page}, testInfo) => {
                componentId = await createTextField(page, {
                    importPath: `../form/field/${type}.mjs`,
                    ntype     : type === 'Text' ? 'textfield' : 'textarea',
                    labelPosition, maxLength: 200, showCharacterCount: true, value: 'Hello',
                    subLabelText: 'A helpful description', clearable: true
                });
                const field = page.locator(`#${componentId}`), counter = field.locator('.neo-textfield-character-count'),
                      input = field.locator(':scope > .neo-input-wrapper, :scope > .neo-textfield-input'),
                      error = field.locator('.neo-textfield-error');
                await expect(counter).toHaveText('5 / 200');
                await page.evaluate(id => Neo.worker.App.setConfigs({id, error: 'Please check this value'}), componentId);
                await expect(error).toBeVisible();
                const boxes                            = await Promise.all([input, counter, error].map(locator => locator.boundingBox()));
                const [inputBox, counterBox, errorBox] = boxes;
                expect(counterBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height - 1);
                expect(counterBox.y - inputBox.y - inputBox.height).toBeLessThan(10);
                expect(counterBox.x + counterBox.width).toBeCloseTo(inputBox.x + inputBox.width, -1);
                expect(errorBox.y).toBeGreaterThanOrEqual(counterBox.y + counterBox.height - 1);
                if (labelPosition === 'inline') {
                    const labelBox = await field.locator('.neo-label-wrapper').boundingBox();
                    await captureField(page, field, testInfo.outputPath(`${type}-inline-counter.png`));
                    expect(labelBox.height).toBeCloseTo(inputBox.height, -1);
                }
            });
        }
    }

    test('counter is opt-in and handles zero limits and string length', async ({page}) => {
        componentId = await createTextField(page, {maxLength: 200, value: 'Hello'});
        const field   = page.locator(`#${componentId}`), input = field.locator('input'),
              counter = field.locator('.neo-textfield-character-count');
        await expect(counter).toHaveCount(0);
        await page.evaluate(id => Neo.worker.App.setConfigs({id, showCharacterCount: true}), componentId);
        await expect(counter).toHaveText('5 / 200');
        await expect(input).toHaveAttribute('aria-describedby', `${componentId}__character-count`);
        await page.evaluate(id => Neo.worker.App.setConfigs({id, value: '😀', maxLength: 0}), componentId);
        await expect(counter).toHaveText('2 / 0');
        await page.evaluate(id => Neo.worker.App.setConfigs({id, showCharacterCount: false}), componentId);
        await expect(counter).toHaveCount(0);
        await expect(input).not.toHaveAttribute('aria-describedby');
    });

    for (const [example, count] of [['text', '13 / 40'], ['textarea', '88 / 200']]) {
        test(`${example} example exposes its live counter control`, async ({page}, testInfo) => {
            await page.goto(`/examples/form/field/${example}/index.html`);
            // The live field, which the inspector drives, is the stage's first item; its states render below it
            const field       = page.locator('.neo-example-container > .neo-textfield'),
                  counter     = field.locator('.neo-textfield-character-count'),
                  toggleInput = page.getByRole('checkbox', {name: 'showCharacterCount', exact: true}),
                  toggle      = page.locator('label').filter({has: toggleInput});
            await expect(counter).toHaveText(count);
            await toggle.click();
            await expect(counter).toHaveCount(0);
            await toggle.click();
            await expect(counter).toHaveText(count);
            await captureField(page, field, testInfo.outputPath(`${example}-counter-example.png`));
        });
    }

    test('TextArea counter stays below auto-growing text', async ({page}) => {
        componentId = await createTextField(page, {importPath: '../form/field/TextArea.mjs', ntype: 'textarea',
            autoGrow: true, rows: 1, labelPosition: 'inline', maxLength: 200, showCharacterCount: true});
        const field   = page.locator(`#${componentId}`), input = field.locator('textarea'),
              counter = field.locator('.neo-textfield-character-count');
        await expect(counter).toHaveText('0 / 200');
        const initialHeight = (await input.boundingBox()).height,
              value         = 'one\ntwo\nthree\nfour\nfive\nsix';
        await input.fill(value);
        await expect(counter).toHaveText(`${value.length} / 200`);
        await expect.poll(async () => (await input.boundingBox()).height).toBeGreaterThan(initialHeight);
        const inputBox = await input.boundingBox(), counterBox = await counter.boundingBox();
        expect(counterBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height - 1);
        expect(counterBox.y - inputBox.y - inputBox.height).toBeLessThan(10);
    });

    for (const labelPosition of ['left', 'right', 'top', 'inline']) {
        test(`a ${labelPosition}-labelled field shows an in-flow error under its input, at the input's width`, async ({page}) => {
            componentId = await createTextField(page, {labelPosition, width: 360});
            const field = page.locator(`#${componentId}`), input = field.locator('input'),
                  error = field.locator('.neo-textfield-error'),
                  plain = await input.boundingBox();
            await page.evaluate(id => Neo.worker.App.setConfigs({id, error: 'Min length violation: 2 / 3'}), componentId);
            await expect(error).toBeVisible();
            const inputBox = await input.boundingBox(), errorBox = await error.boundingBox();
            expect(Math.abs(inputBox.width - plain.width)).toBeLessThan(1);
            expect(errorBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height - 1);
            expect(Math.abs(errorBox.x - inputBox.x)).toBeLessThan(2);
        });
    }

    test('an absolute error leaves the field on one row', async ({page}) => {
        componentId = await createTextField(page, {errorPositionAbsolute: true, labelPosition: 'left', width: 360});
        const field = page.locator(`#${componentId}`), input = field.locator('input'),
              plain = await field.boundingBox(), plainInput = await input.boundingBox();
        await page.evaluate(id => Neo.worker.App.setConfigs({id, error: 'Min length violation: 2 / 3'}), componentId);
        await expect(field.locator('.neo-textfield-error.neo-absolute')).toBeAttached();
        expect(await field.evaluate(node => getComputedStyle(node).display)).toBe('flex');
        expect(Math.abs((await field.boundingBox()).height - plain.height)).toBeLessThan(1);
        expect(Math.abs((await input.boundingBox()).width - plainInput.width)).toBeLessThan(1);
    });

    for (const type of ['Text', 'TextArea']) {
        test(`${type} projects native disabled across mount, runtime/bound toggles, and remount while preserving programmatic writes and readOnly focus`, async ({page}) => {
            await expect.poll(() => page.workers().some(w => w.url().includes('/worker/App'))).toBe(true);
            const appWorker = page.workers().find(w => w.url().includes('/worker/App'));

            const container = await appWorker.evaluate(async ({type}) => {
                const [
                    {default: Button},
                    {default: FormContainer},
                    {default: StateProvider},
                    {default: FieldModule}
                ] = await Promise.all([
                    import('../button/Base.mjs'),
                    import('../form/Container.mjs'),
                    import('../state/Provider.mjs'),
                    import(`../form/field/${type}.mjs`)
                ]);

                const viewport = Neo.getComponent('component-test-viewport'),
                      host     = Neo.create(FormContainer, {
                          appName      : viewport.appName,
                          parentId     : viewport.id,
                          windowId     : viewport.windowId,
                          stateProvider: {
                              module: StateProvider,
                              data  : {
                                  boundValue: 'Bound value',
                                  locked    : true
                              }
                          },
                          items: [{
                              module: Button,
                              text  : 'Before sentinel'
                          }, {
                              module       : FieldModule,
                              clearable    : false,
                              disabled     : true,
                              labelPosition: 'left',
                              labelText    : 'Initial disabled',
                              name         : 'initialField',
                              value        : 'Initial value'
                          }, {
                              module       : FieldModule,
                              labelPosition: 'inline',
                              labelText    : 'Bound disabled',
                              name         : 'boundField',
                              bind         : {
                                  disabled: data => data.locked,
                                  value   : data => data.boundValue
                              }
                          }, {
                              module   : FieldModule,
                              readOnly : true,
                              labelText: 'Read only',
                              name     : 'readOnlyField',
                              value    : 'Selectable value'
                          }]
                      });

                viewport.add(host);

                return {
                    boundId   : host.items[2].id,
                    hostId    : host.id,
                    initialId : host.items[1].id,
                    readOnlyId: host.items[3].id,
                    sentinelId: host.items[0].id
                }
            }, {type});

            componentId = container.hostId;

            const selector      = type === 'Text' ? 'input' : 'textarea',
                  sentinel      = page.locator(`#${container.sentinelId}`),
                  initialField  = page.locator(`#${container.initialId}`),
                  initialInput  = initialField.locator(selector),
                  boundField    = page.locator(`#${container.boundId}`),
                  boundInput    = boundField.locator(selector),
                  readOnlyInput = page.locator(`#${container.readOnlyId}`).locator(selector);

            await expect(initialField).toHaveClass(/neo-disabled/);
            await expect(boundField).toHaveClass(/neo-disabled/);
            await expect(initialInput).toBeDisabled();
            await expect(boundInput).toBeDisabled();
            expect(await initialField.evaluate(el => {
                const style = getComputedStyle(el);
                return {opacity: style.opacity, pointerEvents: style.pointerEvents}
            })).toEqual({opacity: '0.5', pointerEvents: 'none'});
            expect(await readOnlyInput.evaluate(el => ({disabled: el.disabled, readOnly: el.readOnly}))).toEqual({
                disabled: false,
                readOnly: true
            });

            // Tab from sentinel skips both disabled fields and lands directly on the read-only field
            await sentinel.focus();
            await page.keyboard.press('Tab');
            await expect(initialInput).not.toBeFocused();
            await expect(boundInput).not.toBeFocused();
            await expect(readOnlyInput).toBeFocused();

            // Read-only field allows selection while rejecting edits
            await readOnlyInput.selectText();
            expect(await readOnlyInput.evaluate(el => el.value.slice(el.selectionStart, el.selectionEnd))).toBe('Selectable value');
            await page.keyboard.type('Attempted edit');
            await expect(readOnlyInput).toHaveValue('Selectable value');

            // Programmatic field.value, FormContainer#setValues, and StateProvider writes still update the displayed input while disabled
            await appWorker.evaluate(async ({hostId, initialId}) => {
                const host  = Neo.getComponent(hostId),
                      field = Neo.getComponent(initialId);
                field.value = 'Programmatic direct';
                await field.promiseUpdate();
                host.getStateProvider().setData({boundValue: 'Bound while disabled'});
                await host.setValues({initialField: 'Form write while disabled'})
            }, container);

            await expect(initialInput).toHaveValue('Form write while disabled');
            await expect(boundInput).toHaveValue('Bound while disabled');
            await expect(initialInput).toBeDisabled();
            await expect(boundInput).toBeDisabled();

            // Remounting a disabled field preserves native disabled on the owning input
            await appWorker.evaluate(({hostId, initialId}) => {
                const host  = Neo.getComponent(hostId),
                      field = Neo.getComponent(initialId);
                host.remove(field, false)
            }, container);
            await expect(initialField).toHaveCount(0);

            await appWorker.evaluate(({hostId, initialId}) => {
                const host  = Neo.getComponent(hostId),
                      field = Neo.getComponent(initialId);
                host.insert(1, field)
            }, container);
            await expect(initialInput).toBeVisible();
            await expect(initialInput).toBeDisabled();

            // Re-enabling via StateProvider and config restores Tab focus, typing, and worker value sync
            await appWorker.evaluate(({hostId, initialId}) => {
                Neo.getComponent(initialId).disabled = false;
                Neo.getComponent(hostId).getStateProvider().setData({locked: false})
            }, container);

            await expect(initialInput).toBeEnabled();
            await expect(boundInput).toBeEnabled();

            await sentinel.focus();
            await page.keyboard.press('Tab');
            await expect(initialInput).toBeFocused();
            await initialInput.selectText();
            await page.keyboard.type('Updated value');
            await expect(initialInput).toHaveValue('Updated value');
            await expect.poll(() => appWorker.evaluate(id => Neo.getComponent(id).value, container.initialId)).toBe('Updated value');

            await page.keyboard.press('Tab');
            await expect(boundInput).toBeFocused();
            await boundInput.fill('Bound updated');
            expect(await appWorker.evaluate(id => Neo.getComponent(id).value, container.boundId)).toBe('Bound updated')
        });
    }

    test('hash route #disabled=true blocks pointer and Tab keyboard edits while preserving programmatic updates and re-enable', async ({page}) => {
        await page.goto('/examples/form/field/text/index.html#disabled=true');

        const liveField      = page.locator('.neo-example-container > .neo-textfield'),
              liveInput      = liveField.locator('input.neo-textfield-input'),
              stageDisabled  = page.locator('.neo-field-states .neo-textfield.neo-disabled input.neo-textfield-input'),
              disabledBox    = page.getByRole('checkbox', {name: 'disabled', exact: true}),
              disabledToggle = page.locator('label').filter({has: disabledBox});

        await expect(liveField).toHaveClass(/neo-disabled/);
        await expect(liveInput).toHaveValue('Neo Workspace');
        await expect(liveInput).toBeDisabled();
        await expect(stageDisabled).toBeDisabled();

        await expect.poll(() => page.workers().some(w => w.url().includes('/worker/App'))).toBe(true);
        const appWorker = page.workers().find(w => w.url().includes('/worker/App')),
              fieldId   = await liveField.getAttribute('id'),
              inputId   = await liveInput.getAttribute('id');

        expect(await appWorker.evaluate(id => ({
            disabled: Neo.getComponent(id).disabled,
            value   : Neo.getComponent(id).value
        }), fieldId)).toEqual({disabled: true, value: 'Neo Workspace'});

        expect(await liveField.evaluate(el => {
            const style = getComputedStyle(el);
            return {opacity: style.opacity, pointerEvents: style.pointerEvents}
        })).toEqual({opacity: '0.5', pointerEvents: 'none'});

        // 1. Physical pointer click on the input leaves focus on document.body
        await page.evaluate(() => document.activeElement?.blur?.());
        const box = await liveInput.boundingBox();
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');

        // 2. Tab from document.body (1st Tab + full sweep) never focuses the disabled input; typing changes neither DOM nor worker
        let reachedDisabledInput = false;
        for (let i = 0; i < 40; i++) {
            await page.keyboard.press('Tab');
            if (await page.evaluate(id => document.activeElement?.id === id, inputId)) {
                reachedDisabledInput = true;
                break
            }
        }
        expect(reachedDisabledInput).toBe(false);

        await page.evaluate(() => document.activeElement?.blur?.());
        await page.keyboard.press('Tab');
        expect(await page.evaluate(id => document.activeElement?.id === id, inputId)).toBe(false);
        await page.keyboard.type('Keyboard audit');
        await expect(liveInput).toHaveValue('Neo Workspace');
        expect(await appWorker.evaluate(id => Neo.getComponent(id).value, fieldId)).toBe('Neo Workspace');

        // 3. Setting field.value in the App worker while disabled updates both display and worker model
        await appWorker.evaluate(id => {
            Neo.getComponent(id).value = 'Programmatic audit'
        }, fieldId);
        await expect(liveInput).toHaveValue('Programmatic audit');
        await expect(liveInput).toBeDisabled();
        expect(await appWorker.evaluate(id => Neo.getComponent(id).value, fieldId)).toBe('Programmatic audit');

        // 4. Re-enable and type: both display and worker accept 'Enabled audit'
        await page.evaluate(() => {
            const sentinel = document.createElement('button');
            sentinel.id = 'text-example-tab-sentinel';
            sentinel.textContent = 'Sentinel';
            document.querySelector('.neo-example-container').prepend(sentinel)
        });
        const sentinel = page.locator('#text-example-tab-sentinel');

        await disabledToggle.click();
        await expect(liveField).not.toHaveClass(/neo-disabled/);
        await expect(liveInput).toBeEnabled();

        await sentinel.focus();
        await page.keyboard.press('Tab');
        await expect(liveInput).toBeFocused();
        await liveInput.selectText();
        await page.keyboard.type('Enabled audit');
        await expect(liveInput).toHaveValue('Enabled audit');
        await expect.poll(() => appWorker.evaluate(id => Neo.getComponent(id).value, fieldId)).toBe('Enabled audit')
    });

    for (const type of ['Text', 'TextArea']) {
        test(`${type} live readOnly toggle reflects native readOnly and HTML attribute while keeping focus, selection, and programmatic writes`, async ({page}) => {
            componentId = await createTextField(page, {
                importPath: `../form/field/${type}.mjs`,
                ntype     : type === 'Text' ? 'textfield' : 'textarea',
                value     : 'Editable seed'
            });

            await expect.poll(() => page.workers().some(w => w.url().includes('/worker/App'))).toBe(true);
            const appWorker = page.workers().find(w => w.url().includes('/worker/App')),
                  selector  = type === 'Text' ? 'input' : 'textarea',
                  field     = page.locator(`#${componentId}`),
                  input     = field.locator(selector);

            await expect(input).toHaveValue('Editable seed');

            await appWorker.evaluate(id => {
                Neo.getComponent(id).readOnly = true
            }, componentId);

            await expect(field).toHaveClass(/neo-readonly/);
            await expect.poll(() => input.evaluate(el => ({
                disabled: el.disabled,
                expando : Object.hasOwn(el, 'readonly'),
                hasAttr : el.hasAttribute('readonly'),
                readOnly: el.readOnly
            }))).toEqual({
                disabled: false,
                expando : false,
                hasAttr : true,
                readOnly: true
            });

            await input.focus();
            await expect(input).toBeFocused();
            await input.selectText();
            expect(await input.evaluate(el => el.value.slice(el.selectionStart, el.selectionEnd))).toBe('Editable seed');

            await page.keyboard.press('End');
            await page.keyboard.type('X');
            await expect(input).toHaveValue('Editable seed');
            expect(await appWorker.evaluate(id => Neo.getComponent(id).value, componentId)).toBe('Editable seed');

            await appWorker.evaluate(id => {
                Neo.getComponent(id).value = 'Programmatic update'
            }, componentId);
            await expect(input).toHaveValue('Programmatic update');

            await appWorker.evaluate(id => {
                Neo.getComponent(id).readOnly = false
            }, componentId);

            await expect(field).not.toHaveClass(/neo-readonly/);
            await expect.poll(() => input.evaluate(el => ({
                expando : Object.hasOwn(el, 'readonly'),
                hasAttr : el.hasAttribute('readonly'),
                readOnly: el.readOnly
            }))).toEqual({
                expando : false,
                hasAttr : false,
                readOnly: false
            });

            await input.focus();
            await page.keyboard.press('End');
            await page.keyboard.type('!');
            await expect(input).toHaveValue('Programmatic update!');
            await expect.poll(() => appWorker.evaluate(id => Neo.getComponent(id).value, componentId)).toBe('Programmatic update!')
        });
    }

    test('text example readOnly checkbox and #readOnly=true reload sync native readOnly, HTML attribute, displayed value, and worker state', async ({page}) => {
        await page.goto('/examples/form/field/text/index.html');

        const liveField      = page.locator('.neo-example-container > .neo-textfield'),
              liveInput      = liveField.locator('input.neo-textfield-input'),
              readOnlyBox    = page.getByRole('checkbox', {name: 'readOnly', exact: true}),
              readOnlyToggle = page.locator('label').filter({has: readOnlyBox});

        await expect(liveInput).toHaveValue('Neo Workspace');
        await expect.poll(() => page.workers().some(w => w.url().includes('/worker/App'))).toBe(true);
        let appWorker = page.workers().find(w => w.url().includes('/worker/App')),
            fieldId   = await liveField.getAttribute('id');

        // 1. Toggle readOnly ON via example checkbox: native input rejects typing while keeping focus/selection & programmatic writes
        await readOnlyToggle.click();
        await expect(readOnlyBox).toBeChecked();
        await expect(liveField).toHaveClass(/neo-readonly/);
        await expect.poll(() => liveInput.evaluate(el => ({
            expando : Object.hasOwn(el, 'readonly'),
            hasAttr : el.hasAttribute('readonly'),
            readOnly: el.readOnly
        }))).toEqual({
            expando : false,
            hasAttr : true,
            readOnly: true
        });

        await liveInput.focus();
        await expect(liveInput).toBeFocused();
        await page.keyboard.press('End');
        await page.keyboard.type('X');
        await expect(liveInput).toHaveValue('Neo Workspace');
        expect(await appWorker.evaluate(id => ({
            readOnly: Neo.getComponent(id).readOnly,
            value   : Neo.getComponent(id).value
        }), fieldId)).toEqual({readOnly: true, value: 'Neo Workspace'});

        await appWorker.evaluate(id => {
            Neo.getComponent(id).value = 'Server pushed'
        }, fieldId);
        await expect(liveInput).toHaveValue('Server pushed');

        // 2. Fresh load at #readOnly=true, then uncheck readOnly: native input becomes editable again and clears attribute
        await page.goto('/examples/form/field/text/index.html#readOnly=true');
        await page.reload();
        await expect(liveField).toHaveClass(/neo-readonly/);
        await expect(readOnlyBox).toBeChecked();
        await expect.poll(() => liveInput.evaluate(el => ({
            hasAttr : el.hasAttribute('readonly'),
            readOnly: el.readOnly
        }))).toEqual({hasAttr: true, readOnly: true});

        await expect.poll(() => page.workers().some(w => w.url().includes('/worker/App'))).toBe(true);
        appWorker = page.workers().find(w => w.url().includes('/worker/App'));
        fieldId   = await liveField.getAttribute('id');

        await readOnlyToggle.click();
        await expect(readOnlyBox).not.toBeChecked();
        await expect(liveField).not.toHaveClass(/neo-readonly/);
        await expect.poll(() => liveInput.evaluate(el => ({
            expando : Object.hasOwn(el, 'readonly'),
            hasAttr : el.hasAttribute('readonly'),
            readOnly: el.readOnly
        }))).toEqual({
            expando : false,
            hasAttr : false,
            readOnly: false
        });

        await liveInput.focus();
        await page.keyboard.press('End');
        await page.keyboard.type(' v2');
        await expect(liveInput).toHaveValue('Neo Workspace v2');
        await expect.poll(() => appWorker.evaluate(id => ({
            readOnly: Neo.getComponent(id).readOnly,
            value   : Neo.getComponent(id).value
        }), fieldId)).toEqual({readOnly: false, value: 'Neo Workspace v2'})
    });

    test('DeltaUpdates toggles readonly via attribute presence without throwing on getter-only custom elements or creating expandos on non-form retags', async ({page}) => {
        const result = await page.evaluate(() => {
            if (!customElements.get('neo-readonly-getter-probe')) {
                class ReadOnlyGetterProbe extends HTMLElement {
                    get readOnly() {
                        return true
                    }
                }
                customElements.define('neo-readonly-getter-probe', ReadOnlyGetterProbe)
            }

            const host = document.createElement('div');
            document.body.appendChild(host);

            try {
                // 1. Live readonly delta on a getter-only custom element applies cleanly and reaches subsequent attributes
                const custom = document.createElement('neo-readonly-getter-probe');
                custom.id = 'readonly-getter-delta-probe';
                host.appendChild(custom);

                Neo.main.DeltaUpdates.updateNode({
                    id        : 'readonly-getter-delta-probe',
                    attributes: {
                        readonly    : 'true',
                        'data-after': 'applied'
                    }
                });

                const afterSet = {
                    afterAttr: custom.getAttribute('data-after'),
                    hasAttr  : custom.hasAttribute('readonly'),
                    ownLower : Object.hasOwn(custom, 'readonly'),
                    ownProp  : Object.hasOwn(custom, 'readOnly'),
                    readOnly : custom.readOnly
                };

                Neo.main.DeltaUpdates.updateNode({
                    id        : 'readonly-getter-delta-probe',
                    attributes: {
                        readonly    : null,
                        'data-after': 'cleared'
                    }
                });

                const afterClear = {
                    afterAttr: custom.getAttribute('data-after'),
                    hasAttr  : custom.hasAttribute('readonly')
                };

                // 2. Retagging an editable <input> to the getter-only custom element succeeds without throwing
                const editableInput = document.createElement('input');
                editableInput.id = 'readonly-retag-custom-probe';
                host.appendChild(editableInput);

                const retaggedCustom = Neo.main.DeltaUpdates.changeNodeName(editableInput, 'neo-readonly-getter-probe');

                // 3. Retagging a readonly <input> to <textarea> preserves native reflection via attribute copy;
                //    retagging to <span> creates no own readOnly property
                const roInput = document.createElement('input');
                roInput.id = 'readonly-retag-native-probe';
                roInput.toggleAttribute('readonly', true);
                host.appendChild(roInput);

                const retaggedTextarea = Neo.main.DeltaUpdates.changeNodeName(roInput, 'textarea');

                const plainInput = document.createElement('input');
                plainInput.id = 'readonly-retag-span-probe';
                host.appendChild(plainInput);

                const retaggedSpan = Neo.main.DeltaUpdates.changeNodeName(plainInput, 'span');

                return {
                    afterClear,
                    afterSet,
                    retaggedCustom: {
                        inDom  : retaggedCustom.parentNode === host,
                        tagName: retaggedCustom.tagName
                    },
                    retaggedSpan: {
                        ownReadOnly: Object.hasOwn(retaggedSpan, 'readOnly'),
                        tagName    : retaggedSpan.tagName
                    },
                    retaggedTextarea: {
                        hasAttr : retaggedTextarea.hasAttribute('readonly'),
                        ownProp : Object.hasOwn(retaggedTextarea, 'readOnly'),
                        readOnly: retaggedTextarea.readOnly,
                        tagName : retaggedTextarea.tagName
                    }
                }
            } finally {
                host.remove()
            }
        });

        expect(result).toEqual({
            afterSet: {
                afterAttr: 'applied',
                hasAttr  : true,
                ownLower : false,
                ownProp  : false,
                readOnly : true
            },
            afterClear: {
                afterAttr: 'cleared',
                hasAttr  : false
            },
            retaggedCustom: {
                inDom  : true,
                tagName: 'NEO-READONLY-GETTER-PROBE'
            },
            retaggedTextarea: {
                hasAttr : true,
                ownProp : false,
                readOnly: true,
                tagName : 'TEXTAREA'
            },
            retaggedSpan: {
                ownReadOnly: false,
                tagName    : 'SPAN'
            }
        })
    });
});
