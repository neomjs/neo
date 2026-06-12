import {setup} from '../../../../../../setup.mjs';
import {readFileSync} from 'node:fs';

setup({
    appConfig: {
        name: 'PortalDiscussionsComponentTest'
    }
});

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../../../../../src/Neo.mjs';
import * as core        from '../../../../../../../../src/core/_export.mjs';
import Component        from '../../../../../../../../apps/portal/view/news/discussions/Component.mjs';
import DiscussionsStore from '../../../../../../../../apps/portal/store/Discussions.mjs';
import {marked}         from '../../../../../../../../node_modules/marked/lib/marked.esm.js';

/**
 * Unit coverage for the Discussion-specific parser in `Portal.view.news.discussions.Component`.
 *
 * The view inherits the shared timeline/canvas contract from the ticket content stack; these tests pin
 * only the irreducibly Discussion-specific pieces: folded YAML titles, the backtick-`@user` comment
 * entry boundary, structured reply parsing, and category / closed-state badges. Parser and badge
 * helpers are tested directly on the prototype to avoid constructing the full state-provider-backed
 * content component.
 */
const {
    getCategoryBadgeHtml,
    getClosedBadgeHtml,
    modifyMarkdown,
    parseComments,
    parseFrontMatter,
    renderReplies
} = Component.prototype;

const timelineFixture = new URL('./fixtures/discussion-timeline.md', import.meta.url);

test.describe('Portal.view.news.discussions.Component - Discussion markdown parser', () => {
    test('parses folded and literal frontmatter block scalars used by discussion titles', () => {
        const component = Object.create(Component.prototype);

        const data = parseFrontMatter.call(component, [
            'title: >-',
            '  Discussion titles can be',
            '  folded across lines',
            'body: |',
            '  first line',
            '  second line',
            'closed: false'
        ].join('\n'));

        expect(data.title).toBe('Discussion titles can be folded across lines');
        expect(data.body).toBe('first line\nsecond line');
        expect(data.closed).toBe(false)
    });

    test('comment entry-split ignores inner ### headings and horizontal rules', () => {
        const commentsRaw = [
            '### `@alice` commented on 2026-05-20T17:39:52Z',
            '',
            'First comment.',
            '',
            '---',
            '',
            '### Inner heading (must NOT split)',
            '',
            'Still Alice.',
            '',
            '---',
            '',
            '### `@bob` commented on 2026-05-20T17:50:28Z',
            '',
            'Second comment.'
        ].join('\n');

        const entries = parseComments(commentsRaw);

        expect(entries).toHaveLength(2);
        expect(entries[0]).toMatchObject({
            user: 'alice',
            date: '2026-05-20T17:39:52Z'
        });
        expect(entries[0].body).toContain('### Inner heading (must NOT split)');
        expect(entries[0].body).toContain('---');
        expect(entries[0].body).toContain('Still Alice.');
        expect(entries[0].body).not.toMatch(/\n---$/);
        expect(entries[1]).toMatchObject({
            user: 'bob',
            body: 'Second comment.'
        })
    });

    test('parses structured replies as children of the preceding top-level comment', () => {
        const commentsRaw = [
            '### `@parent` commented on 2026-05-20T17:39:52Z',
            '',
            'Parent body.',
            '',
            '#### Reply depth=1 by `@child` on 2026-05-20T18:00:00Z',
            '',
            '> [!ANSWER]',
            '',
            'Reply body.',
            '',
            '### Nested reply heading stays in reply markdown.',
            '',
            '---',
            '',
            '### `@next` commented on 2026-05-20T19:00:00Z',
            '',
            'Next comment.'
        ].join('\n');

        const entries = parseComments(commentsRaw);

        expect(entries).toHaveLength(2);
        expect(entries[0]).toMatchObject({
            user: 'parent',
            date: '2026-05-20T17:39:52Z',
            body: 'Parent body.'
        });
        expect(entries[0].replies).toHaveLength(1);
        expect(entries[0].replies[0]).toMatchObject({
            depth: 1,
            user : 'child',
            date : '2026-05-20T18:00:00Z'
        });
        expect(entries[0].replies[0].body).toContain('> [!ANSWER]');
        expect(entries[0].replies[0].body).toContain('### Nested reply heading stays in reply markdown.');
        expect(entries[0].replies[0].body).not.toMatch(/\n---$/);
        expect(entries[1]).toMatchObject({
            user: 'next',
            body: 'Next comment.'
        })
    });

    test('legacy flattened reply blockquotes remain parent-body markdown', () => {
        const commentsRaw = [
            '### `@parent` commented on 2026-05-20T17:39:52Z',
            '',
            'Parent body.',
            '',
            '> **Reply by `@legacy-child`** on 2026-05-20T18:00:00Z',
            '>',
            '> Legacy reply body.'
        ].join('\n');

        const entries = parseComments(commentsRaw);

        expect(entries).toHaveLength(1);
        expect(entries[0].replies).toHaveLength(0);
        expect(entries[0].body).toContain('> **Reply by `@legacy-child`** on 2026-05-20T18:00:00Z');
        expect(entries[0].body).toContain('> Legacy reply body.')
    });

    test('renders replies inside the parent comment bubble without timeline section records', () => {
        const html = renderReplies.call({
            repoUserUrl       : 'https://github.com/',
            formatTimestamp   : value => value,
            wrapMarkdownTables: Component.prototype.wrapMarkdownTables
        }, [{
            depth: 1,
            user : 'child',
            date : '2026-05-20T18:00:00Z',
            body : [
                'Reply body.',
                '',
                '| Key | Value |',
                '| --- | --- |',
                '| mode | nested reply |'
            ].join('\n')
        }]);

        expect(html).toContain('neo-discussion-replies');
        expect(html).toContain('neo-discussion-reply depth-1');
        expect(html).toContain('https://github.com/child');
        expect(html).toContain('replied on 2026-05-20T18:00:00Z');
        expect(html).toContain('<p>Reply body.</p>');
        expect(html).toContain('<div class="neo-markdown-table-wrapper"><table>')
    });

    test('category and closed-state badges render stable semantic classes', () => {
        const category = getCategoryBadgeHtml('Ideas'),
              closed   = getClosedBadgeHtml(true),
              open     = getClosedBadgeHtml('false');

        expect(category).toContain('neo-discussion-category-badge');
        expect(category).toContain('Ideas');
        expect(closed).toContain('neo-state-closed');
        expect(closed).toContain('Closed');
        expect(open).toContain('neo-state-open');
        expect(open).toContain('Open');
        expect(getCategoryBadgeHtml('')).toBe('')
    })

    test('keeps generated timeline HTML out of escaped markdown code blocks', () => {
        const
            content       = readFileSync(timelineFixture, 'utf8'),
            sectionsStore = {data: []};

        const component = Object.create(Component.prototype);

        Object.defineProperties(component, {
            getStateProvider: {
                value() {
                    return {
                        getStore: () => sectionsStore
                    }
                }
            },
            formatTimestamp: {
                value: value => value
            },
            id: {
                value: 'discussion-html-literal-regression-test'
            },
            issuesUrl: {
                value: '#/news/tickets/'
            },
            record: {
                value: {id: '11891'}
            },
            renderFrontmatter: {
                value: true
            },
            replaceTicketIds: {
                value: true
            },
            repoUserUrl: {
                value: 'https://github.com/'
            },
            updateSectionsStore: {
                value: false
            },
            useFrontmatterDetails: {
                value: true
            }
        });

        const html = marked.parse(modifyMarkdown.call(component, content));

        expect(html).toContain('<div id="timeline-11891-2" class="neo-timeline-item comment"');
        expect(html).toContain('<div id="timeline-11891-2-target" class="neo-timeline-avatar">');
        expect(html).not.toContain('&lt;div id=&quot;timeline-11891-2');
        expect(html).not.toContain('&lt;div id=&quot;timeline-11891-2-target');
        expect(sectionsStore.data.map(record => record.id)).toContain('timeline-11891-2')
    })
});

test.describe('Portal discussions tree state affordance (#12314)', () => {
    test('discussion leaves render state glyphs sourced from the tree record', () => {
        const store = Neo.create(DiscussionsStore, {
            id  : 'portal-discussions-tree-state-store-test',
            data: [{
                id       : 'Ideas',
                isLeaf   : false,
                parentId : null,
                collapsed: false
            }, {
                id      : '12062',
                isLeaf  : true,
                parentId: 'Ideas/active-chunk-2',
                state   : 'open',
                title   : 'Orchestrator-as-SSOT for REM'
            }, {
                id      : '11024',
                isLeaf  : true,
                parentId: 'Ideas/archive-v8-30-0-chunk-1',
                state   : 'closed',
                title   : 'Lead role semantics'
            }, {
                id      : '11180',
                isLeaf  : true,
                parentId: 'Q&A/archive-v8-30-0-chunk-1',
                state   : 'answered',
                title   : 'Archive-cutting rule'
            }]
        });

        try {
            expect(store.get('12062').treeNodeName).toContain('discussion-state-badge neo-state-open');
            expect(store.get('12062').treeNodeName).toContain('title="Open"');
            expect(store.get('11024').treeNodeName).toContain('discussion-state-badge neo-state-closed');
            expect(store.get('11024').treeNodeName).toContain('title="Closed"');
            expect(store.get('11180').treeNodeName).toContain('discussion-state-badge neo-state-answered');
            expect(store.get('11180').treeNodeName).toContain('title="Answered"');
            expect(store.get('Ideas').treeNodeName).toBe('Ideas')
        } finally {
            store.destroy()
        }
    })
});
