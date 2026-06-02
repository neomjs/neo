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

    test('wrapMarkdownTables wraps each rendered Markdown table', () => {
        const html = '<table><tbody><tr><td>One</td></tr></tbody></table><p>Between</p><table class="wide"><tbody><tr><td>Two</td></tr></tbody></table>';

        expect(markdown.wrapMarkdownTables(html)).toBe(
            '<div class="neo-markdown-table-wrapper"><table><tbody><tr><td>One</td></tr></tbody></table></div><p>Between</p><div class="neo-markdown-table-wrapper"><table class="wide"><tbody><tr><td>Two</td></tr></tbody></table></div>'
        )
    })
});
