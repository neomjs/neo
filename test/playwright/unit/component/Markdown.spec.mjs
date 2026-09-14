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
import Markdown from '../../../../src/component/Markdown.mjs';

test.describe('Neo.component.Markdown', () => {
    const markdown = Object.create(Markdown.prototype);

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
        const component = Object.create(Markdown.prototype);

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

    test('wrapMarkdownTables wraps each rendered Markdown table', () => {
        const html = '<table><tbody><tr><td>One</td></tr></tbody></table><p>Between</p><table class="wide"><tbody><tr><td>Two</td></tr></tbody></table>';

        expect(markdown.wrapMarkdownTables(html)).toBe(
            '<div class="neo-markdown-table-wrapper"><table><tbody><tr><td>One</td></tr></tbody></table></div><p>Between</p><div class="neo-markdown-table-wrapper"><table class="wide"><tbody><tr><td>Two</td></tr></tbody></table></div>'
        )
    })
});
