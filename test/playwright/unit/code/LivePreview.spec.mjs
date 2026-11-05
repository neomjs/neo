import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'LivePreviewMermaidTest'}});

import {expect, test} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import LivePreview    from '../../../../src/code/LivePreview.mjs';
import Mermaid        from '../../../../src/component/wrapper/Mermaid.mjs';
import Markdown       from '../../../../src/component/Markdown.mjs';
import '../../../../src/manager/Instance.mjs';

/**
 * @summary Exercises LivePreview's language dispatch and owned preview lifetime with real components.
 * Native editor input, syntax tokens and SVG rendering are covered by the component-tier journey.
 */
test.describe('Neo.code.LivePreview — Mermaid source', () => {
    let preview, nativeEditor;

    test.beforeAll(() => {
        nativeEditor = Neo.main.addon.MonacoEditor;
        // Unmounted unit editors own no native instance, but still release their native holder on destroy.
        Neo.main.addon.MonacoEditor = {destroyInstance: Neo.emptyFn}
    });

    test.afterAll(() => {
        if (nativeEditor === undefined) {
            delete Neo.main.addon.MonacoEditor
        } else {
            Neo.main.addon.MonacoEditor = nativeEditor
        }
    });

    test.afterEach(() => {
        preview?.destroy();
        preview = null
    });

    test('Mermaid is an explicit language on the preview and its editor, and creates the existing wrapper', async () => {
        preview = Neo.create(LivePreview, {activeView: 'preview', language: 'mermaid', value: 'graph TD\nA --> B'});

        expect(preview.language).toBe('mermaid');
        expect(preview.getItem('editor').language).toBe('mermaid');

        await preview.doRunSource();

        const [diagram] = preview.getPreviewContainer().items;

        expect(diagram).toBeInstanceOf(Mermaid);
        expect(diagram.value).toBe('graph TD\nA --> B')
    });

    test('successive source values reuse one diagram and empty source removes the previous output', async () => {
        preview = Neo.create(LivePreview, {activeView: 'preview', language: 'mermaid', value: 'graph TD\nA --> B'});
        await preview.doRunSource();

        const container = preview.getPreviewContainer(), diagram = container.items[0];

        preview.value = 'sequenceDiagram\nAlice->>Bob: Hello';
        await preview.doRunSource();

        expect(container.items).toEqual([diagram]);
        expect(diagram.value).toBe(preview.value);

        preview.value = '';
        await preview.doRunSource();

        expect(preview.getItem('editor').value).toBe('');
        expect(container.items).toEqual([]);
        expect(diagram.isDestroyed).toBe(true)
    });

    test('renderer switches remove the prior owned component and retain Markdown behavior', async () => {
        preview = Neo.create(LivePreview, {activeView: 'preview', language: 'mermaid', value: 'graph TD\nA --> B'});
        await preview.doRunSource();

        const diagram = preview.getPreviewContainer().items[0];

        preview.set({language: 'markdown', value: '# A Markdown preview'});
        await preview.doRunSource();

        const markdown = preview.getPreviewContainer().items[0];

        expect(markdown).toBeInstanceOf(Markdown);
        expect(markdown.value).toBe('# A Markdown preview');
        expect(diagram.isDestroyed).toBe(true);

        await markdown.ready();
        await markdown.render({code: markdown.value});

        preview.set({language: 'mermaid', value: 'graph LR\nC --> D'});
        await preview.doRunSource();

        expect(preview.getPreviewContainer().items[0]).toBeInstanceOf(Mermaid);
        expect(preview.getPreviewContainer().items[0].value).toBe('graph LR\nC --> D');
        expect(markdown.isDestroyed).toBe(true)
    });

    test('a pending renderer import cannot repopulate a preview after leaving it', async () => {
        preview = Neo.create(LivePreview, {activeView: 'preview', language: 'mermaid', value: 'graph TD\nA --> B'});

        const pending = preview.doRunSource();

        preview.onActiveIndexChange({item: {reference: 'editor'}, value: 0});
        await pending;

        expect(preview.getPreviewContainer().items).toEqual([])
    });

    test('a pending renderer import cannot create children after its owner is destroyed', async () => {
        preview = Neo.create(LivePreview, {activeView: 'preview', language: 'mermaid', value: 'graph TD\nA --> B'});

        const container = preview.getPreviewContainer(), pending = preview.doRunSource();

        preview.destroy();
        await pending;

        expect(container.isDestroyed).toBe(true)
    });

    test('Mermaid waits for its local preview to be exposed before measuring a diagram', async () => {
        preview = Neo.create(LivePreview, {language: 'mermaid', value: 'graph TD\nA --> B'});

        await preview.doRunSource();
        expect(preview.getPreviewContainer().items).toEqual([]);

        preview.activeView = 'preview';
        await preview.doRunSource();

        expect(preview.getPreviewContainer().items[0]).toBeInstanceOf(Mermaid)
    });

    test('a Markdown Mermaid live-preview fence is extracted as editable source before static diagrams', () => {
        const markdown = Object.create(Markdown.prototype), map = {}, staticMap = {},
              source   = '```mermaid live-preview\ngraph TD\nA --> B\n```\n\n```mermaid\ngraph LR\nC --> D\n```',
              editable = markdown.processLivePreviewBlocks(source, map),
              rendered = markdown.processMermaidBlocks(editable, staticMap);

        expect(Object.values(map)).toEqual([{code: 'graph TD\nA --> B', language: 'mermaid'}]);
        expect(Object.values(staticMap)).toEqual(['graph LR\nC --> D']);
        expect(rendered).not.toContain('```')
    });

    test('the JavaScript live-preview fence remains on the existing execution path', () => {
        const markdown = Object.create(Markdown.prototype), map = {};

        markdown.processLivePreviewBlocks('```javascript live-preview\nexport default Neo.component.Base\n```', map);

        expect(Object.values(map)).toEqual([{code: 'export default Neo.component.Base', language: 'javascript'}]);
        expect(LivePreview.config.language).toBe('neomjs')
    })
});
