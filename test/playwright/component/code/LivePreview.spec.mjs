import {test, expect} from '../../fixtures.mjs';

const FIXTURE   = '/test/playwright/component/apps/monaco-editor/index.html',
      HOST_ID   = 'monaco-test-viewport',
      ROOT_ID   = 'live-preview-test',
      VALID_SVG = '.neo-mermaid svg:not([aria-roledescription="error"])',
      INITIAL   = 'flowchart TD\n A[Initial] --> B[Diagram]',
      INVALID   = 'flowchart TD\n A--@@>>B[[[unclosed';

let surfaceId;

/**
 * @summary Mounts the real LivePreview or Markdown through the existing fixture's worker RPC.
 * @param {Object} neo
 * @param {Object} [config={}]
 * @returns {Promise<String>}
 */
async function createSurface(neo, config={}) {
    const result = await neo.createComponent({
        importPath: '../code/LivePreview.mjs',
        ntype     : 'live-preview',
        id        : ROOT_ID,
        parentId  : HOST_ID,
        language  : 'mermaid',
        value     : INITIAL,
        height    : 500,
        width     : 800,
        ...config
    });

    expect(result.success, 'the worker creates the requested component').toBe(true);
    surfaceId = result.id;
    return result.id
}

/**
 * @summary Requires a native Monaco model rather than accepting its wrapper's empty DOM holder.
 * @param {Object} page
 * @param {Object} livePreview
 * @returns {Promise<String>}
 */
async function editorIdFor(page, livePreview) {
    const holder = livePreview.locator('.neo-monaco-editor');

    await expect(holder).toHaveCount(1);
    const id = await holder.getAttribute('id');

    await expect.poll(() => page.evaluate(id => Boolean(
        Neo.main.addon.MonacoEditor.map[id]?.getModel()
    ), id), {message: 'the real Monaco model becomes ready'}).toBe(true);

    return id
}

/**
 * @summary Uses Monaco's public API, so its normal content event must cross into the App Worker.
 * @param {Object} page
 * @param {String} id
 * @param {String} value
 * @returns {Promise<void>}
 */
async function setEditorValue(page, id, value) {
    await page.evaluate(({id, value}) => Neo.main.addon.MonacoEditor.map[id].setValue(value), {id, value})
}

/**
 * @summary Activates the existing preview card through its ordinary tab UI.
 * @param {Object} livePreview
 * @returns {Promise<void>}
 */
async function showPreview(livePreview) {
    await livePreview.getByText('Preview', {exact: true}).click()
}

/**
 * @summary Measures painted label area and node containment instead of accepting SVG markup alone.
 * @param {Object} svg
 * @returns {Promise<Object>}
 */
async function diagramLayout(svg) {
    return svg.evaluate(element => {
        const rect   = element.getBoundingClientRect(),
              labels = [...element.querySelectorAll('.nodeLabel')].map(node => ({
                  text: node.textContent, rect: node.getBoundingClientRect().toJSON()
              })),
              nodes = [...element.querySelectorAll('g.node')].map(node => node.getBoundingClientRect().toJSON());

        return {
            rect          : rect.toJSON(), viewBox: element.getAttribute('viewBox'), labels, nodes,
            labelsHaveArea: labels.length > 0 && labels.every(label => label.rect.width > 0 && label.rect.height > 0),
            nodesContained: nodes.length > 0 && nodes.every(node => node.left >= rect.left && node.top >= rect.top &&
                node.right <= rect.right && node.bottom <= rect.bottom)
        }
    })
}

test.describe('Neo.code.LivePreview Mermaid editing', () => {
    let pageErrors;

    test.beforeEach(async ({page, neo}) => {
        surfaceId = null;
        pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        await page.goto(FIXTURE);
        await expect(page.locator('#monaco-test-editor .monaco-editor')).toBeVisible();
        await neo.destroyComponent('monaco-test-editor')
    });

    test.afterEach(async ({neo}) => {
        surfaceId && await neo.destroyComponent(surfaceId);
        expect(pageErrors, 'no exception escapes the real editor/renderer lifecycle').toEqual([])
    });

    test('a Mermaid model highlights syntax and real editor changes render as diagrams', async ({page, neo}, testInfo) => {
        await createSurface(neo);
        const live        = page.locator(`#${ROOT_ID}`),
              editorId    = await editorIdFor(page, live),
              replacement = 'flowchart TD\n A[Changed] --> B[Diagram]';

        await expect.poll(() => page.evaluate(id => {
            const editor = Neo.main.addon.MonacoEditor.map[id];

            return {
                language: editor.getModel().getLanguageId(),
                tokens  : monaco.editor.tokenize('flowchart TD\n %% comment\n A --> B', 'mermaid')
                    .flat().map(token => token.type)
            }
        }, editorId)).toEqual({
            language: 'mermaid',
            tokens  : expect.arrayContaining(['keyword.mermaid', 'comment.mermaid', 'operator.mermaid'])
        });

        await setEditorValue(page, editorId, replacement);
        await expect.poll(() => neo.getConfig(ROOT_ID, ['language', 'value'])).toEqual(['mermaid', replacement]);
        await showPreview(live);
        await expect(live.locator(VALID_SVG)).toHaveCount(1);
        await expect(live.locator(VALID_SVG)).toContainText('Changed');

        await live.getByText('Source', {exact: true}).click();
        await expect(page.locator(`#${editorId} .monaco-editor`)).toBeVisible();
        await page.evaluate(id => {
            const editor     = Neo.main.addon.MonacoEditor.map[id],
                  model      = editor.getModel(),
                  lineNumber = model.getLineCount();

            editor.focus();
            editor.setPosition({lineNumber, column: model.getLineMaxColumn(lineNumber)})
        }, editorId);
        await expect.poll(() => page.evaluate(id => Neo.main.addon.MonacoEditor.map[id].hasTextFocus(), editorId)).toBe(true);
        await page.keyboard.insertText('\n B --> C[Typed]');
        await expect.poll(() => page.evaluate(id => Neo.main.addon.MonacoEditor.map[id].getValue(), editorId))
            .toContain('B --> C[Typed]');
        const typed = await page.evaluate(id => Neo.main.addon.MonacoEditor.map[id].getValue(), editorId);

        expect(typed).toContain(replacement);
        await expect.poll(() => neo.getConfig(ROOT_ID, ['value'])).toEqual([typed]);
        await showPreview(live);
        await expect(live.locator(VALID_SVG)).toHaveCount(1);
        await expect(live.locator(VALID_SVG)).toContainText('Typed');
        await expect(live.locator(VALID_SVG).getByText('Typed', {exact: true})).toBeVisible();
        await live.screenshot({path: testInfo.outputPath('live-mermaid-preview.png')})
    });

    test('empty input clears a diagram and an invalid edit recovers after correction', async ({page, neo}) => {
        await createSurface(neo);
        const live     = page.locator(`#${ROOT_ID}`),
              editorId = await editorIdFor(page, live);

        await showPreview(live);
        await expect(live.locator(VALID_SVG)).toHaveCount(1);
        await setEditorValue(page, editorId, '');
        await expect.poll(() => neo.getConfig(ROOT_ID, ['value'])).toEqual(['']);
        await expect(live.locator('.neo-mermaid svg')).toHaveCount(0);

        await setEditorValue(page, editorId, INVALID);
        await expect(live.locator('.neo-mermaid')).toContainText('Mermaid Error');
        await expect(live.locator(VALID_SVG)).toHaveCount(0);

        await setEditorValue(page, editorId, 'flowchart TD\n A[Recovered] --> B[Valid]');
        await expect(live.locator(VALID_SVG)).toHaveCount(1);
        await expect(live.locator(VALID_SVG)).toContainText('Recovered');
        await expect(live.locator('.neo-mermaid')).not.toContainText('Mermaid Error')
    });

    test('rapid native model changes retain only the latest valid source', async ({page, neo}) => {
        await createSurface(neo);
        const live     = page.locator(`#${ROOT_ID}`),
              editorId = await editorIdFor(page, live),
              latest   = 'flowchart TD\n A[Latest] --> B[Wins]';

        await showPreview(live);
        await expect(live.locator(VALID_SVG)).toHaveCount(1);
        await page.evaluate(({id, invalid, latest}) => {
            const editor = Neo.main.addon.MonacoEditor.map[id];

            editor.setValue('flowchart TD\n A[Superseded] --> B[Old]');
            editor.setValue(invalid);
            editor.setValue(latest)
        }, {id: editorId, invalid: INVALID, latest});

        await expect.poll(() => neo.getConfig(ROOT_ID, ['value'])).toEqual([latest]);
        await expect(live.locator(VALID_SVG)).toHaveCount(1);
        await expect(live.locator(VALID_SVG)).toContainText('Latest');
        await expect(live.locator('.neo-mermaid')).not.toContainText('Superseded');
        await expect(live.locator('.neo-mermaid')).not.toContainText('Mermaid Error')
    });

    test('a Markdown mermaid live-preview fence owns an editable Mermaid model', async ({page, neo}) => {
        await createSurface(neo, {
            importPath: '../component/Markdown.mjs',
            ntype     : 'markdown',
            value     : `# Editable diagram\n\n\`\`\`mermaid live-preview\n${INITIAL}\n\`\`\``
        });
        const live = page.locator(`#${ROOT_ID} .neo-code-live-preview`);

        await expect(live).toHaveCount(1);
        const liveId   = await live.getAttribute('id'),
              editorId = await editorIdFor(page, live);

        expect(await neo.getConfig(liveId, ['language'])).toEqual(['mermaid']);
        await setEditorValue(page, editorId, 'flowchart TD\n A[Document] --> B[Edited]');
        await showPreview(live);
        await expect(live.locator(VALID_SVG)).toHaveCount(1);
        await expect(live.locator(VALID_SVG)).toContainText('Edited')
    });

    for (const control of [{
        language: 'markdown',
        value   : '# Markdown control',
        text    : 'Markdown control'
    }, {
        language: 'neomjs',
        value   : `import Button from '../button/Base.mjs';
class PreviewButton extends Button {
    static config = {className: 'Test.LivePreview.ControlButton', text: 'JavaScript control'}
}
export default Neo.setupClass(PreviewButton);`,
        text: 'JavaScript control'
    }]) {
        test(`${control.language} keeps its existing preview renderer`, async ({page, neo}) => {
            await createSurface(neo, {language: control.language, value: control.value});
            const live = page.locator(`#${ROOT_ID}`);

            await editorIdFor(page, live);
            await showPreview(live);
            await expect(live.getByText(control.text, {exact: true})).toBeVisible();
            await expect(live.locator('.neo-mermaid')).toHaveCount(0)
        })
    }

    for (const action of ['destroy', 'switch renderer']) {
        test(`${action} while the real Mermaid module loads cannot revive the old preview`, async ({page, neo}) => {
            let release, entered;
            const gate    = new Promise(resolve => { release = resolve }),
                  blocked = new Promise(resolve => { entered = resolve });

            await page.route('**/dist/mermaid.mjs', async route => {
                entered();
                await gate;
                await route.continue()
            });

            await createSurface(neo);
            const live     = page.locator(`#${ROOT_ID}`),
                  editorId = await editorIdFor(page, live);

            try {
                await showPreview(live);
                await blocked;
                if (action === 'destroy') {
                    await neo.destroyComponent(ROOT_ID);
                    surfaceId = null;
                    await expect(live).toHaveCount(0)
                } else {
                    await neo.setConfig(ROOT_ID, {language: 'markdown', value: '# Replacement renderer'});
                    await expect(live.getByRole('heading', {name: 'Replacement renderer'})).toBeVisible()
                }
            } finally {
                release()
            }

            await expect.poll(() => page.evaluate(() => Boolean(Neo.main.addon.Mermaid?.mermaid))).toBe(true);
            if (action === 'destroy') {
                expect(await neo.getConfig(ROOT_ID, ['id'])).toBe(false);
                expect(await page.evaluate(id => Boolean(Neo.main.addon.MonacoEditor.map[id]), editorId)).toBe(false);
                await expect(live).toHaveCount(0)
            } else {
                expect(await neo.getConfig(ROOT_ID, ['language', 'value'])).toEqual(['markdown', '# Replacement renderer']);
                await expect(live.getByRole('heading', {name: 'Replacement renderer'})).toBeVisible();
                await expect(live.locator('.neo-mermaid')).toHaveCount(0)
            }
        })
    }

    test('a source edit renders readable labels inside the visible preview without a manual rerender', async ({page, neo}, testInfo) => {
        await createSurface(neo, {activeView: 'preview'});
        const live     = page.locator(`#${ROOT_ID}`),
              editorId = await editorIdFor(page, live),
              source   = 'flowchart TD\n A[Hidden edit] --> B[Second node]';

        await expect(live.locator(VALID_SVG)).toBeVisible();
        await live.getByText('Source', {exact: true}).click();
        await expect(page.locator(`#${editorId} .monaco-editor`)).toBeVisible();
        await page.evaluate(() => {
            const addon    = Neo.main.addon.Mermaid,
                  original = addon.render;

            window.__mermaidRenderEntries = [];
            addon.render = function(data) {
                const ancestors = [];
                for (let node = document.getElementById(data.id); node && ancestors.length < 6; node = node.parentElement) {
                    ancestors.push({id: node.id, display: getComputedStyle(node).display,
                        visibility: getComputedStyle(node).visibility, rect: node.getBoundingClientRect().toJSON()})
                }
                window.__mermaidRenderEntries.push({ancestors});
                window.__lastMermaidRenderData = data;
                return window.__lastMermaidRender = original.call(this, data)
            }
        });

        await setEditorValue(page, editorId, source);
        await expect.poll(() => neo.getConfig(ROOT_ID, ['value'])).toEqual([source]);
        await page.evaluate(() => window.__lastMermaidRender);
        await showPreview(live);
        await neo.getConfig(ROOT_ID, ['value']);
        await page.evaluate(() => window.__lastMermaidRender);
        await expect(live.locator(VALID_SVG)).toBeVisible();
        await expect(live.locator(VALID_SVG)).toContainText('Hidden edit');

        const normal = await diagramLayout(live.locator(VALID_SVG));
        await live.screenshot({path: testInfo.outputPath('normal-source-preview.png')});
        await page.evaluate(() => Neo.main.addon.Mermaid.render(window.__lastMermaidRenderData));
        const visibleRerender = await diagramLayout(live.locator(VALID_SVG));
        await live.screenshot({path: testInfo.outputPath('visible-rerender-control.png')});

        await testInfo.attach('mermaid-visibility.json', {
            body       : JSON.stringify({entries: await page.evaluate(() => window.__mermaidRenderEntries), normal, visibleRerender}),
            contentType: 'application/json'
        });
        expect(visibleRerender.labelsHaveArea, 'the visible rerender is a real positive control').toBe(true);
        expect(visibleRerender.nodesContained, 'the visible control contains its nodes').toBe(true);
        expect(normal.labelsHaveArea, 'ordinary Source edits must produce readable labels').toBe(true);
        expect(normal.nodesContained, 'ordinary Source edits must fit the SVG viewBox').toBe(true)
    });
});
