import {setup} from '../../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'PortalTicketsComponentTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';
import Component      from '../../../../../../../../apps/portal/view/news/tickets/Component.mjs';

/**
 * Unit coverage for `Portal.view.news.tickets.Component#frontMatterToHtml` and `modifyMarkdown`.
 *
 * Verifies that `id`, `title`, `state`, and `labels` are omitted from `.neo-frontmatter-table`
 * (since they are already rendered in the H1 title and `.neo-ticket-labels` header bar), preventing
 * duplicate metadata rows and raw `id: <number>` + `labels: ai` token combinations at the top of
 * ticket pages while retaining non-header metadata (`author`, `createdAt`, `subIssues`, etc.).
 */
const {frontMatterToHtml, modifyMarkdown} = Component.prototype;

function createTicketComponent(overrides = {}) {
    const sectionsStore = {data: []};
    const labelsStore   = {
        get: label => label === 'ai' ? {color: '#1f883d', textColor: '#ffffff'} : null
    };

    const component = Object.create(Component.prototype);

    Object.defineProperties(component, {
        formatTimestamp: {
            value: value => value
        },
        getStateProvider: {
            value: () => ({
                getStore: name => name === 'labels' ? labelsStore : sectionsStore
            })
        },
        id: {
            value: 'ticket-component-test'
        },
        issuesUrl: {
            value: '#/news/tickets/'
        },
        record: {
            value: {id: '12742', parentId: 'Backlog'}
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
        },
        ...overrides
    });

    return {component, sectionsStore};
}

test.describe('Portal.view.news.tickets.Component — frontmatter deduplication (#20089)', () => {
    test('frontMatterToHtml omits id, title, state, and labels while keeping author and timestamps', () => {
        const {component} = createTicketComponent();

        const html = frontMatterToHtml.call(component, {
            id       : 12742,
            title    : 'Sample ticket',
            state    : 'CLOSED',
            labels   : ['ai', 'enhancement'],
            author   : 'tobiu',
            createdAt: '2026-10-24T00:00:00Z'
        });

        expect(html).toContain('<table class="neo-frontmatter-table">');
        expect(html).toContain('<tr><td>author</td><td><a href="https://github.com/tobiu" target="_blank">tobiu</a></td></tr>');
        expect(html).toContain('<tr><td>createdAt</td><td>2026-10-24T00:00:00Z</td></tr>');
        expect(html).not.toContain('<td>id</td>');
        expect(html).not.toContain('<td>12742</td>');
        expect(html).not.toContain('<td>title</td>');
        expect(html).not.toContain('<td>state</td>');
        expect(html).not.toContain('<td>labels</td>');
    });

    test('frontMatterToHtml returns empty string when only header-rendered fields are present', () => {
        const {component} = createTicketComponent();

        const html = frontMatterToHtml.call(component, {
            id    : 12742,
            title : 'Header-only metadata',
            state : 'OPEN',
            labels: ['ai']
        });

        expect(html).toBe('');
    });

    test('modifyMarkdown renders state and labels in .neo-ticket-labels under H1 without duplicating them in frontmatter', () => {
        const {component} = createTicketComponent();

        const markdown = [
            '---',
            'id: 12742',
            'title: Fix sitemap dilution',
            'state: CLOSED',
            'labels:',
            '  - ai',
            'author: tobiu',
            'createdAt: 2026-10-24T00:00:00Z',
            '---',
            '# Ticket #12742: Fix sitemap dilution',
            '',
            'Ticket body content.'
        ].join('\n');

        const html = modifyMarkdown.call(component, markdown);

        expect(html).toContain('<h1 id="ticket-title-ticket-component-test"');
        expect(html).toContain('<div class="neo-ticket-labels">');
        expect(html).toContain('neo-state-closed');
        expect(html).toContain('>ai</span>');
        expect(html).not.toContain('<td>id</td>');
        expect(html).not.toContain('<td>labels</td>');
    });
});
