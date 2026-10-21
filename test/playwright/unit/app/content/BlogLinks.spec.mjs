import {setup} from '../../../setup.mjs';

const appName = 'PortalBlogLinksTest';

setup({
    appConfig: {
        name: appName
    }
});

import fs             from 'fs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import {marked}       from '../../../../../dist/marked.mjs';
import BlogComponent  from '../../../../../apps/portal/view/news/blog/Component.mjs';

/**
 * @summary Verifies that `Portal.view.news.blog.Component` rewrites relative `.md` links in blog posts
 * onto the Portal's blog and learn routes while leaving external URLs and repo-escaped paths untouched.
 */
test.describe('Portal.view.news.blog.Component relative link rewriting (#19901)', () => {
    let component;
    let testRun = 0;

    test.beforeEach(() => {
        testRun++;
        component = Neo.create(BlogComponent, {
            appName,
            id                 : `portal-blog-component-${testRun}`,
            updateSectionsStore: false
        })
    });

    test.afterEach(() => {
        component?.destroy();
        component = null
    });

    test('rewrites a relative guide link in the-organism-already-existed onto #/learn/', () => {
        component.record = {id: 'blog/the-organism-already-existed'};

        const markdown = fs.readFileSync('learn/blog/the-organism-already-existed.md', 'utf8'),
              html     = component.rewriteLinks(marked.parse(markdown));

        expect(html).toContain('href="#/learn/guides/datahandling/DynamicGrids"');
        expect(html).not.toContain('href="../guides/datahandling/DynamicGrids.md"')
    });

    test('rewrites a sibling blog post link in a v10 post onto #/news/blog/', () => {
        component.record = {id: 'blog/v10-deep-dive-state-provider'};

        const markdown = fs.readFileSync('learn/blog/v10-deep-dive-state-provider.md', 'utf8'),
              html     = component.rewriteLinks(marked.parse(markdown));

        expect(html).toContain('href="#/news/blog/blog/v10-post1-love-story"');
        expect(html).toContain('href="#/news/blog/blog/v10-deep-dive-vdom-revolution"');
        expect(html).not.toContain('href="./v10-post1-love-story.md"')
    });

    test('covers both learn/blog/ and learn/guide targets, preserves fragments and leaves absolute URLs and escaped repo paths as written', () => {
        component.record = {id: 'blog/the-organism-already-existed'};

        const html = component.rewriteLinks(marked.parse([
            '[Guide](../guides/datahandling/DynamicGrids.md#sorting)',
            '[Sibling](./v10-post1-love-story.md#intro)',
            '[External](https://example.com/docs/DynamicGrids.md)',
            '[RepoFile](../../.github/AI_QUICK_START.md)'
        ].join('\n\n')));

        expect(html).toContain('href="#/learn/guides/datahandling/DynamicGrids#sorting"');
        expect(html).toContain('href="#/news/blog/blog/v10-post1-love-story#intro"');
        expect(html).toContain('href="https://example.com/docs/DynamicGrids.md"');
        expect(html).toContain('href="../../.github/AI_QUICK_START.md"')
    })
});
