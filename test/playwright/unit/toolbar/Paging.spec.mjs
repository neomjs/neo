import {setup} from '../../setup.mjs';

const appName = 'ToolbarPagingTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
// Bare import: the constructor registers `Neo.get`, which the child buttons call during
// destroy. The binding itself is not used here.
import '../../../../src/manager/Instance.mjs';
import Store           from '../../../../src/data/Store.mjs';
import Paging          from '../../../../src/toolbar/Paging.mjs';

/**
 * @summary `Neo.toolbar.Paging` is arithmetic plus enablement, and both have edges that only
 * appear at the boundaries. `getMaxPages()` is a single `Math.ceil`, and every disabled flag is
 * strict equality against one of its two ends, so an empty store drives `maxPages` to 0 while
 * `currentPage` stays 1 and only the first/prev pair matches.
 *
 * Expectations here were read off the running instance rather than derived from the source, and
 * the two places where reading the source would have produced a wrong test are noted inline.
 * Where a result looks unintended it is asserted as-is with a note, so the disagreement is
 * recorded rather than silently blessed. No `src/` file backs these assertions; a fix would be
 * its own ticket.
 *
 * `store.totalCount` is set directly throughout: it is populated from a server response
 * (`Store.mjs:1016`) and never from local `data`, so a store built from an array reports
 * `getCount()` correctly while `totalCount` stays 0. That is what `getMaxPages()` reads.
 */
test.describe('Neo.toolbar.Paging - page maths and navigation enablement', () => {
    const owned = [];
    const own   = instance => {
        owned.push(instance);
        return instance
    };

    test.afterEach(() => {
        owned.splice(0).forEach(instance => instance?.destroy?.())
    });

    /** A paging toolbar over a store whose `totalCount` is the given value. */
    const toolbar = (totalCount, config = {}) => {
        const store = own(Neo.create(Store, {data: []}));

        store.totalCount = totalCount;

        return own(Neo.create(Paging, {appName, store, ...config}))
    };

    const nav = t => ({
        first: t.down({reference: 'nav-button-first'}).disabled,
        prev : t.down({reference: 'nav-button-prev'}) .disabled,
        next : t.down({reference: 'nav-button-next'}) .disabled,
        last : t.down({reference: 'nav-button-last'}) .disabled
    });

    test.describe('getMaxPages()', () => {
        test('an exact multiple divides exactly', () => {
            const t = toolbar(60, {pageSize: 30});

            expect(t.getMaxPages()).toBe(2)
        });

        test('a partial last page rounds up', () => {
            const t = toolbar(61, {pageSize: 30});

            expect(t.getMaxPages()).toBe(3)
        });

        test('a page size larger than the record count is a single page', () => {
            const t = toolbar(5, {pageSize: 30});

            expect(t.getMaxPages()).toBe(1)
        });

        test('an empty store is 0 pages, since Math.ceil(0 / pageSize) is 0', () => {
            const t = toolbar(0, {pageSize: 30});

            expect(t.getMaxPages()).toBe(0)
        })
    });

    test.describe('navigation enablement at the ends', () => {
        test('on page 1 the first and previous buttons are disabled, next and last are not', () => {
            const t = toolbar(60, {pageSize: 30});

            t.updateNavigationButtons();

            expect(t.currentPage).toBe(1);
            expect(nav(t)).toEqual({first: true, prev: true, next: false, last: false})
        });

        test('on the last page next and last are disabled, first and previous are not', () => {
            const t = toolbar(60, {pageSize: 30});

            t.onLastPageButtonClick();
            t.updateNavigationButtons();

            expect(t.currentPage).toBe(2);
            expect(nav(t)).toEqual({first: false, prev: false, next: true, last: true})
        });

        /**
         * The empty store is the case the strict comparisons cannot express: `maxPages` is 0 and
         * `currentPage` is 1, so `currentPage === maxPages` is `1 === 0` and the next/last pair
         * stays ENABLED, while first/prev are disabled by the unchanged `=== 1`. Pressing last in
         * that state assigns `currentPage = 0`, one below the lowest page the first button
         * returns to.
         *
         * Recorded as-is. This is the measurement the ticket asked for, not a claim about what
         * the behaviour should be.
         */
        test('an empty store leaves next and last enabled, and last lands on page 0', () => {
            const t = toolbar(0, {pageSize: 30});

            t.updateNavigationButtons();

            expect(t.getMaxPages()).toBe(0);
            expect(t.currentPage).toBe(1);
            expect(nav(t)).toEqual({first: true, prev: true, next: false, last: false});

            t.onLastPageButtonClick();

            expect(t.currentPage, 'last assigns maxPages, which is 0 here').toBe(0)
        })
    });

    /**
     * The two guards below are unreachable from the UI, and that is deliberate rather than an
     * oversight: `updateNavigationButtons` disables next and last on the last page and first
     * and prev on the first, so a click can never arrive in either state. They are pinned at
     * the handler because the handler is what a future caller (a keyboard shortcut, a
     * programmatic page step) reaches for, and the check is what stops it walking past the
     * end. The empty-store case above is the one an operator does reach with the mouse: next
     * and last stay enabled there, so clicking last assigns a page below the first.
     */
    test.describe('handler bounds', () => {
        test('next refuses to cross the last page', () => {
            const t = toolbar(60, {pageSize: 30});

            t.onLastPageButtonClick();
            expect(t.currentPage).toBe(2);

            t.onNextPageButtonClick();

            expect(t.currentPage, 'already at maxPages, so next is a no-op').toBe(2)
        });

        test('previous refuses to cross page 1', () => {
            const t = toolbar(60, {pageSize: 30});

            expect(t.currentPage).toBe(1);

            t.onPrevPageButtonClick();

            expect(t.currentPage, 'already at page 1, so prev is a no-op').toBe(1)
        });

        test('first and last assign directly, without a bounds check', () => {
            const t = toolbar(60, {pageSize: 30});

            t.onLastPageButtonClick();
            expect(t.currentPage).toBe(2);

            t.onFirstPageButtonClick();
            expect(t.currentPage).toBe(1)
        });

        /**
         * `currentPage` is not clamped when set directly, so a value above `maxPages` survives and
         * `updateNavigationButtons` then matches neither end: the last-page comparison is strict
         * equality, so a page beyond the end disables nothing. Reached here by assignment rather
         * than through the buttons, which do bound themselves.
         *
         * Recorded as-is.
         */
        test('a currentPage beyond the end disables nothing', () => {
            const t = toolbar(60, {pageSize: 30});

            t.currentPage = 5;
            t.updateNavigationButtons();

            expect(t.getMaxPages()).toBe(2);
            expect(t.currentPage).toBe(5);
            expect(nav(t), 'neither end matches at page 5 of 2').toEqual({
                first: false, prev: false, next: false, last: false
            })
        })
    });

    test.describe('pageSize changes while on a late page', () => {
        /**
         * `afterSetPageSize` (`Paging.mjs:138`) resets `currentPage` to 1 with a silent update and
         * mirrors the value onto the store, so the page always lands inside the new range. Reading
         * the class body alone suggests the opposite: the reset is in a setter that is easy to miss
         * next to the four handlers, and without it `currentPage` would sit beyond `maxPages` and
         * disable both ends.
         */
        test('growing the page size returns to page 1, inside the new range', () => {
            const t = toolbar(60, {pageSize: 30});

            t.onLastPageButtonClick();
            expect(t.currentPage).toBe(2);

            t.pageSize = 60;
            t.updateNavigationButtons();

            expect(t.getMaxPages()).toBe(1);
            expect(t.currentPage, 'afterSetPageSize resets the page').toBe(1);
            expect(nav(t)).toEqual({first: true, prev: true, next: true, last: true})
        });

        test('shrinking the page size also returns to page 1', () => {
            const t = toolbar(60, {pageSize: 60});

            expect(t.currentPage).toBe(1);
            expect(t.getMaxPages()).toBe(1);

            t.pageSize = 10;
            t.updateNavigationButtons();

            expect(t.getMaxPages()).toBe(6);
            expect(t.currentPage).toBe(1);
            expect(nav(t)).toEqual({first: true, prev: true, next: false, last: false})
        });
    });
});
