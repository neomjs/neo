import {setup} from '../../setup.mjs';

const appName = 'MarkdownTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import Markdown from '../../../../src/component/Markdown.mjs';

class DeferredMarkdown extends Markdown {
    static config = {className: 'Test.Unit.Component.Markdown.DeferredMarkdown'}

    highlights = []
    mountDelays = []

    processReadonlyCodeBlocks(code) {
        return new Promise(resolve => this.highlights.push(() => resolve(code)))
    }

    timeout(time, options) {
        if (time === 10) {
            return new Promise(resolve => this.mountDelays.push(resolve))
        }

        return super.timeout(time, options)
    }
}

Neo.setupClass(DeferredMarkdown);

test.describe('Neo.component.Markdown', () => {
    const markdown = Object.create(Markdown.prototype, {windowId: {value: null}});

    test('wrapMarkdownTables wraps rendered Markdown tables', () => {
        const html = '<p>Intro</p><table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Neo</td></tr></tbody></table>';

        expect(markdown.wrapMarkdownTables(html)).toBe(
            '<p>Intro</p><div class="neo-markdown-table-wrapper"><table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Neo</td></tr></tbody></table></div>'
        )
    });

    test('wrapMarkdownTables preserves frontmatter tables', () => {
        const html = '<details><summary>Frontmatter</summary><table class="neo-frontmatter-table"><tbody><tr><td>title</td><td>News</td></tr></tbody></table></details>';

        expect(markdown.wrapMarkdownTables(html)).toBe(html)
    });

    test('wrapMarkdownTables leaves content without tables unchanged', () => {
        const html = '<p>No tabular content here.</p>';

        expect(markdown.wrapMarkdownTables(html)).toBe(html)
    });

    test('a restored code token is inserted verbatim, not read as a substitution pattern', () => {
        // Red-first: the guide `learn/guides/uibuildingblocks/DockLayouts.md` authors the inline
        // code `$` while documenting an engine-reserved sigil. Ticket protection swaps every inline
        // code span for a token, then restores it with `content.replace(token, value)` — and as a
        // STRING replacement, the restored "`$`" reads as `$` + backtick, which is JS's "insert
        // everything before the match" pattern. The whole preceding document is spliced back in.
        const component = Object.create(Markdown.prototype, {windowId: {value: null}});

        Object.assign(component, {
            issuesUrl        : 'https://example.com/issues/',
            renderFrontmatter: false,
            replaceTicketIds : true
        });

        const content = 'Alpha sentinel-marker appears once.\n\nSee #123, and the reserved `$` sigil.\n',
              result  = component.modifyMarkdown(content);

        expect(result.split('sentinel-marker').length - 1,
            'restoring the token must not splice the preceding document back in').toBe(1);
        expect(result, 'and the authored inline code survives unchanged').toContain('`$`')
    });

    test('a ticket id inside a Markdown link stays part of that link, and a bare one still becomes a ticket link', () => {
        // A blog post's link to a Discussion, whose text names the Discussion's number, rendered as two links, and
        // the second one opened the tickets view for that number
        const component = Object.create(Markdown.prototype, {windowId: {value: null}});

        Object.assign(component, {
            issuesUrl        : '#/news/tickets/',
            renderFrontmatter: false,
            replaceTicketIds : true
        });

        const result = component.modifyMarkdown('See [PR #14458](https://example.com/pull/14458) and #10074.\n');

        expect(result, 'the link is left as written').toContain('[PR #14458](https://example.com/pull/14458)');
        expect(result, 'no ticket link for the id inside it').not.toContain('href="#/news/tickets/14458"');
        expect(result, 'the bare id').toContain('<a href="#/news/tickets/10074">#10074</a>')
    });

    test('a code span inside a Markdown link stays part of that link', () => {
        // Blog posts link code names, `[`openapi.yaml`](url)`, and rendered the link text as a bold
        // NEO_INLINE_CODE_n placeholder: the link's token held the code span's token
        const component = Object.create(Markdown.prototype, {windowId: {value: null}});

        Object.assign(component, {
            issuesUrl        : '#/news/tickets/',
            renderFrontmatter: false,
            replaceTicketIds : true
        });

        const result = component.modifyMarkdown('See [`openapi.yaml`](https://example.com/openapi.yaml) and #10074.\n');

        expect(result, 'the link is left as written').toContain('[`openapi.yaml`](https://example.com/openapi.yaml)');
        expect(result, 'no placeholder is left behind').not.toContain('NEO_INLINE_CODE');
        expect(result, 'the bare id').toContain('<a href="#/news/tickets/10074">#10074</a>')
    });

    test('wrapMarkdownTables wraps each rendered Markdown table', () => {
        const html = '<table><tbody><tr><td>One</td></tr></tbody></table><p>Between</p><table class="wide"><tbody><tr><td>Two</td></tr></tbody></table>';

        expect(markdown.wrapMarkdownTables(html)).toBe(
            '<div class="neo-markdown-table-wrapper"><table><tbody><tr><td>One</td></tr></tbody></table></div><p>Between</p><div class="neo-markdown-table-wrapper"><table class="wide"><tbody><tr><td>Two</td></tr></tbody></table></div>'
        )
    });

    test('excludes head-only SEO frontmatter keys (seoTitle, seoDescription, robots) without rendering an empty Frontmatter details block (#20917)', () => {
        const component = Object.create(Markdown.prototype, {windowId: {value: null}});

        Object.assign(component, {
            renderFrontmatter    : true,
            replaceTicketIds     : false,
            useFrontmatterDetails: true
        });

        const seoOnlyDoc = [
            '---',
            'seoTitle: "JavaScript Data Grid in a Web Worker | Neo.mjs"',
            'seoDescription: "100k rows off the main thread."',
            'robots: "noindex, follow"',
            '---',
            '# Main Heading',
            '',
            'Body paragraph.'
        ].join('\n');

        expect(component.frontMatterToHtml(component.parseFrontMatter(
            'seoTitle: "JavaScript Data Grid"\nseoDescription: "Desc"\nrobots: "noindex, follow"'
        ))).toBe('');

        const seoOnlyRendered = component.modifyMarkdown(seoOnlyDoc);
        expect(seoOnlyRendered).not.toContain('<details>');
        expect(seoOnlyRendered).not.toContain('neo-frontmatter-table');
        expect(seoOnlyRendered).not.toContain('seoTitle');
        expect(seoOnlyRendered).toContain('<h1 class="neo-h1">Main Heading</h1>');

        const mixedDoc = [
            '---',
            'title: Architecture Guide',
            'status: published',
            'seoTitle: "Web Worker UI Architecture | Neo.mjs"',
            'seoDescription: "Off-main-thread UI guide."',
            '---',
            '# Worker Architecture'
        ].join('\n');

        const mixedRendered = component.modifyMarkdown(mixedDoc);
        expect(mixedRendered).toContain('<details><summary>Frontmatter</summary><table class="neo-frontmatter-table"><tbody>');
        expect(mixedRendered).toContain('<tr><td>title</td><td>Architecture Guide</td></tr>');
        expect(mixedRendered).toContain('<tr><td>status</td><td>published</td></tr>');
        expect(mixedRendered).not.toContain('seoTitle');
        expect(mixedRendered).not.toContain('seoDescription');
    });
});

test.describe('Neo.component.Markdown render order', () => {
    const flush   = () => new Promise(resolve => setImmediate(resolve)),
          article = (heading, id) => [
              `# ${heading}`, '', '```json neo-component', JSON.stringify({id, html: id}), '```'
          ].join('\n'),
          orphanId = 'markdown-destroyed-owner-child';

    let markdown, highlights, mountDelays;

    test.beforeEach(() => {
        markdown = Neo.create(DeferredMarkdown, {appName});
        ({highlights, mountDelays} = markdown)
    });

    test.afterEach(async () => {
        highlights.forEach(resume => resume());
        await flush();
        mountDelays.forEach(resume => resume());
        await flush();
        markdown.destroy();
        Neo.get(orphanId)?.destroy()
    });

    test('a delayed highlight pass cannot replace the latest HTML', async () => {
        markdown.value = '# Earlier heading';
        markdown.value = '# Current heading';

        highlights[1]();
        await flush();

        expect(markdown.html).toContain('Current heading');

        highlights[0]();
        await flush();

        expect(markdown.html).toContain('Current heading')
    });

    test('an obsolete mount delay cannot add a child to the current article', async () => {
        markdown.value = article('Earlier article', 'markdown-earlier-widget');
        highlights[0]();
        await flush();

        markdown.value = article('Current article', 'markdown-current-widget');
        highlights[1]();
        await flush();

        mountDelays[1]();
        await flush();

        const [current] = markdown.activeComponents;

        expect(current.id).toBe('markdown-current-widget');

        mountDelays[0]();
        await flush();

        expect(markdown.activeComponents).toEqual([current]);
        expect(Neo.get('markdown-earlier-widget')).toBeFalsy()
    });

    test('a ready mount delay cannot register a child after its owner is destroyed', async () => {
        markdown.value = article('Closing article', orphanId);
        highlights[0]();
        await flush();

        mountDelays[0]();
        markdown.destroy();
        await flush();

        expect(Neo.get(orphanId)).toBeFalsy()
    });

    test('a pending mount delay settles when its owner is destroyed', async () => {
        const mountQueued = Promise.withResolvers();

        markdown.timeout = (time, options) => {
            const pending = Markdown.prototype.timeout.call(markdown, time, options);
            mountQueued.resolve();
            return pending
        };

        const render = markdown.render({code: article('Closing article', orphanId)});
        highlights[0]();
        await mountQueued.promise;

        markdown.destroy();

        await expect(render).resolves.toEqual({});
        expect(Neo.get(orphanId)).toBeFalsy()
    });

    test('windowId change preserves embedded components across same-config windows and re-renders links on hash -> pathname transition (#22170)', async () => {
        const prevWindowConfigs = Neo.windowConfigs,
              widgetId          = 'markdown-window-move-widget';

        Neo.windowConfigs = {
            ...prevWindowConfigs,
            'win-hash-a': {routerMode: 'hash',     routerBasePath: ''},
            'win-hash-b': {routerMode: 'hash',     routerBasePath: ''},
            'win-path'  : {routerMode: 'pathname', routerBasePath: '/alpha'}
        };

        try {
            markdown.set({
                issuesUrl       : '#/news/tickets/',
                replaceTicketIds: true,
                windowId        : 'win-hash-a'
            });
            markdown.contentRoute = '#/learn/';

            markdown.value = [
                '# Routing article',
                '',
                'See #42.',
                '',
                '```json neo-component',
                JSON.stringify({id: widgetId, html: widgetId}),
                '```'
            ].join('\n');

            highlights[0]();
            await flush();
            mountDelays[0]();
            await flush();

            const [initialEmbedded] = markdown.activeComponents;

            expect(initialEmbedded.id).toBe(widgetId);
            expect(initialEmbedded.isDestroyed).toBeFalsy();
            expect(markdown.html).toContain('href="#/news/tickets/42"');
            expect(highlights).toHaveLength(1);

            // Moving between two windows with identical router config keeps the live child instance intact
            markdown.windowId = 'win-hash-b';
            await flush();

            expect(markdown.activeComponents).toEqual([initialEmbedded]);
            expect(initialEmbedded.isDestroyed).toBeFalsy();
            expect(initialEmbedded.windowId).toBe('win-hash-b');
            expect(highlights, 'same-config windowId move must not re-render').toHaveLength(1);

            // Moving from a hash window to a pathname window re-renders internal route links
            markdown.windowId = 'win-path';
            await flush();

            expect(highlights, 'hash -> pathname move triggers a fresh render').toHaveLength(2);
            highlights[1]();
            await flush();
            mountDelays[1]();
            await flush();

            expect(markdown.html).toContain('href="/alpha/news/tickets/42"');
            expect(markdown.html).not.toContain('target="_blank"');
            expect(markdown.activeComponents[0].id).toBe(widgetId);
            expect(markdown.activeComponents[0].windowId).toBe('win-path')
        } finally {
            Neo.windowConfigs = prevWindowConfigs;
            Neo.get(widgetId)?.destroy()
        }
    });
});
