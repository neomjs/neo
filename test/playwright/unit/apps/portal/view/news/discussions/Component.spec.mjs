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
 * entry boundary, and category / closed-state badges. `parseComments` and the badge helpers are tested
 * directly on the prototype to avoid constructing the full state-provider-backed content component.
 */
const {parseFrontMatter, parseComments, getClosedBadgeHtml, getCategoryBadgeHtml} = Component.prototype;

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
