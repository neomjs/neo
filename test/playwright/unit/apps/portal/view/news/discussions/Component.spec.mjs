import {setup} from '../../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'PortalDiscussionsComponentTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';
import Component      from '../../../../../../../../apps/portal/view/news/discussions/Component.mjs';

/**
 * Unit coverage for the Discussion-specific parser in `Portal.view.news.discussions.Component`.
 *
 * The view inherits the shared timeline/canvas contract from the ticket content stack; these tests pin
 * only the irreducibly Discussion-specific pieces: folded YAML titles, the backtick-`@user` comment
 * entry boundary, structured reply parsing, and category / closed-state badges. Parser and badge
 * helpers are tested directly on the prototype to avoid constructing the full state-provider-backed
 * content component.
 */
const {parseFrontMatter, parseComments, renderReplies, getClosedBadgeHtml, getCategoryBadgeHtml} = Component.prototype;

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
            repoUserUrl    : 'https://github.com/',
            formatTimestamp: value => value
        }, [{
            depth: 1,
            user : 'child',
            date : '2026-05-20T18:00:00Z',
            body : 'Reply body.'
        }]);

        expect(html).toContain('neo-discussion-replies');
        expect(html).toContain('neo-discussion-reply depth-1');
        expect(html).toContain('https://github.com/child');
        expect(html).toContain('replied on 2026-05-20T18:00:00Z');
        expect(html).toContain('<p>Reply body.</p>')
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
});
