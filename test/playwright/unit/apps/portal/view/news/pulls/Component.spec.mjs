import {setup} from '../../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'PortalPullsComponentTest'
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../../src/core/_export.mjs';
import Component       from '../../../../../../../../apps/portal/view/news/pulls/Component.mjs';

/**
 * Unit coverage for the PR-specific parser in `Portal.view.news.pulls.Component`. These tests
 * exercise the three pieces of logic that are irreducibly PR-specific (and which the issue/ticket
 * parser does NOT cover): the two-section comment+review entry-split, the chronological merge-sort
 * across those two sections, and the PR-state / review-state badge mappings.
 *
 * The entry-split is the highest-risk piece: PR-review bodies (and PR descriptions) contain their
 * own `###` sub-headers and `---` rules, so a naive split would shred a single review into many
 * fragments. The discriminator is the backtick-wrapped `@user` header — these tests pin that.
 *
 * `parseEntries` / `getStateBadgeHtml` / `getReviewStateCls` are pure (they never read `this`
 * state), so they are tested directly on the prototype — avoiding the app-container + state-provider
 * coupling the full content Component requires at construct time.
 */
const {parseEntries, getStateBadgeHtml, getReviewStateCls} = Component.prototype;

test.describe('Portal.view.news.pulls.Component — PR markdown parser', () => {
    test('entry-split does not shred a body on its inner ### / --- and merge-sorts the two sections', () => {
        // alice (comment) carries an inner `### Inner Header` + a `---` rule that must stay INSIDE
        // her entry. carol's review body likewise carries an inner `### Strategic-Fit` + `---`.
        const commentsRaw = [
            '### `@alice` commented on 2026-05-18T20:00:00Z',
            '',
            'First comment.',
            '',
            '---',
            '',
            '### Inner Header (must NOT split)',
            '',
            'still alice.',
            '',
            '### `@bob` commented on 2026-05-18T20:30:00Z',
            '',
            'Second comment.'
        ].join('\n');

        const reviewsRaw = [
            '### `@carol` (APPROVED) reviewed on 2026-05-18T20:15:00Z',
            '',
            '### Strategic-Fit (inner, must NOT split)',
            '',
            'looks good.',
            '',
            '---',
            '',
            '### `@dave` (CHANGES_REQUESTED) reviewed on 2026-05-18T20:45:00Z',
            '',
            'needs work.'
        ].join('\n');

        const entries = parseEntries(commentsRaw, reviewsRaw);

        // 2 comments + 2 reviews = 4 entries — NOT more (no shredding on inner ###/---).
        expect(entries).toHaveLength(4);

        // Merge-sorted ascending by ISO timestamp ACROSS both sections.
        expect(entries.map(e => `${e.type}:${e.user}`)).toEqual([
            'comment:alice', // 20:00
            'review:carol',  // 20:15
            'comment:bob',   // 20:30
            'review:dave'    // 20:45
        ]);

        // The inner header + rule survived inside the owning entry.
        expect(entries[0].body).toContain('### Inner Header (must NOT split)');
        expect(entries[0].body).toContain('---');
        expect(entries[1].body).toContain('### Strategic-Fit (inner, must NOT split)');

        // Reviews carry their parsed state; comments do not.
        expect(entries[1].state).toBe('APPROVED');
        expect(entries[3].state).toBe('CHANGES_REQUESTED');
        expect(entries[0].state).toBeUndefined()
    });

    test('handles a one-sided PR (comments only) and an empty PR (dependabot degrade) without throwing', () => {
        const commentsOnly = parseEntries(
            '### `@neo-gpt` commented on 2026-05-18T10:00:00Z\n\nlgtm.',
            ''
        );
        expect(commentsOnly).toHaveLength(1);
        expect(commentsOnly[0]).toMatchObject({type: 'comment', user: 'neo-gpt'});

        // A body-only PR (no comments, no reviews) yields zero entries — modifyMarkdown then renders
        // just the description via super (the graceful-degrade path).
        expect(parseEntries('', '')).toEqual([])
    });

    test('3-state PR badge: OPEN / MERGED / CLOSED render distinctly', () => {
        const open   = getStateBadgeHtml('OPEN'),
              merged = getStateBadgeHtml('MERGED'),
              closed = getStateBadgeHtml('CLOSED');

        expect(open).toContain('neo-state-open');
        expect(merged).toContain('neo-state-merged');
        expect(merged).toContain('fa-code-merge'); // MERGED is visually distinct from OPEN/CLOSED
        expect(merged).toContain('Merged');
        expect(closed).toContain('neo-state-closed');
        expect(getStateBadgeHtml('')).toBe('') // empty state → no badge
    });

    test('review-state → color class, with a non-throwing neutral fallback', () => {
        expect(getReviewStateCls('APPROVED')).toBe('neo-review-approved');
        expect(getReviewStateCls('CHANGES_REQUESTED')).toBe('neo-review-changes');
        // COMMENTED / DISMISSED / unknown / empty all fall through to neutral — never throws.
        expect(getReviewStateCls('COMMENTED')).toBe('neo-review-neutral');
        expect(getReviewStateCls('DISMISSED')).toBe('neo-review-neutral');
        expect(getReviewStateCls('SOMETHING_NEW')).toBe('neo-review-neutral');
        expect(getReviewStateCls('')).toBe('neo-review-neutral')
    })
});
