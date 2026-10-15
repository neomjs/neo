import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/grid/issues`, neomjs/neo's own issues from a committed snapshot: every row is as tall as its
 * tallest wrapped text in all three bodies, a locked column's header menu filters by value and clears, and the
 * snapshot's days read the same in every time zone.
 *
 * The oracle is the browser's layout, as in `ContentSizedRowsExample`: a row needs its tallest `.neo-grid-cell-text`
 * plus the cell's padding and borders. The example loads its snapshot from neomjs/pages through the GitHub CDN; the
 * spec serves eight issues of the same shape in its place, so a run needs no network. Author avatars come from
 * github.com; the spec answers them with a 404, so each author shows an initial.
 */
const APP      = 'examples/grid/issues/index.html',
      GRID     = '.issues-grid',
      SNAPSHOT = 'https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/data/neo_issues.json',
      long     = 'The grid measures each wrapped cell before its row mounts, so the row grows to its tallest text. ',
      // One-line and multi-line texts, every state, and calendar days in UTC, as the snapshot holds them
      issues   = [
          {id: 108, title: 'Content-sized rows keep the row you are reading still while the rows around it are measured', summary: long.repeat(2), type: 'Feature', area: 'Grid',  state: 'Open',        author: 'neo-opus-ada',   created: '2026-10-15', comments: 4},
          {id: 107, title: 'Header menus count values',                    summary: 'Counts follow the other filters.',                 type: 'Bug',     area: 'Core',  state: 'Closed',      author: 'neo-gpt',        created: '2026-10-14', comments: 2},
          {id: 106, title: 'Document the release path',                    summary: long,                                               type: 'Task',    area: 'Docs',  state: 'Closed',      author: 'neo-opus-grace', created: '2026-10-12', comments: 0},
          {id: 105, title: 'Locked columns align with the center region',  summary: long.repeat(3),                                     type: 'Epic',    area: 'Grid',  state: 'Not planned', author: 'neo-opus-vega',  created: '2026-10-03', comments: 7},
          {id: 104, title: 'Release path, filed twice',                    summary: 'Tracked elsewhere.',                               type: 'Task',    area: 'Build', state: 'Duplicate',   author: 'neo-gpt-emmy',   created: '2026-09-30', comments: 1},
          {id: 103, title: 'A store refilled mid-update keeps its rows',   summary: long,                                               type: 'Bug',     area: 'Core',  state: 'Closed',      author: 'neo-fable',      created: '2026-09-21', comments: 3},
          {id: 102, title: 'Dark theme for the examples',                  summary: 'Every example follows the theme switch.',          type: 'Feature', area: 'Docs',  state: 'Open',        author: 'neo-gpt-sophie', created: '2026-09-18', comments: 0},
          {id: 101, title: 'A grid sizes each row to its tallest wrapped cell across its locked and center bodies', summary: long, type: 'Feature', area: 'Grid', state: 'Closed', author: 'neo-opus-ada', created: '2026-09-14', comments: 5}
      ];

/**
 * Opens the showcase on the issues above, with every avatar answered by a 404.
 * @param {import('@playwright/test').Page} page
 */
async function openShowcase(page) {
    await page.route('https://github.com/**', route => route.fulfill({status: 404}));
    // The store appends its paging parameters (`?page=1&pageSize=0`), so the pattern ends in a wildcard
    await page.route(`${SNAPSHOT}*`, route => route.fulfill({json: issues}));
    await page.goto(APP)
}

/**
 * Per rendered record: its row height in each body, the height its wrapped texts need, and its State label.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{heights: Number[], natural: Number, state: String|null}[]>}
 */
async function readRows(page) {
    return page.evaluate(grid => {
        const rows = new Map();

        document.querySelectorAll(`${grid} .neo-grid-body`).forEach(body => {
            body.querySelectorAll('.neo-grid-row').forEach(row => {
                // A row of the visible pool, not one the grid renders hidden to measure ahead
                if (row.style.display === 'none' || !row.dataset.recordId || row.closest('.neo-grid-row-measure')) {
                    return
                }

                const entry = rows.get(row.dataset.recordId) ?? {heights: [], natural: 0, state: null},
                      state = row.querySelector('[data-field="state"]');

                entry.heights.push(Math.round(row.getBoundingClientRect().height));

                row.querySelectorAll('.neo-grid-cell-text').forEach(text => {
                    const style  = getComputedStyle(text.closest('.neo-grid-cell')),
                          chrome = ['padding-top', 'padding-bottom', 'border-top-width', 'border-bottom-width']
                              .reduce((sum, property) => sum + parseFloat(style.getPropertyValue(property)), 0);

                    entry.natural = Math.max(entry.natural, Math.ceil(text.getBoundingClientRect().height + chrome))
                });

                if (state) {
                    entry.state = state.textContent.trim()
                }

                rows.set(row.dataset.recordId, entry)
            })
        });

        return [...rows.values()]
    }, GRID)
}

test.describe('Grid issues showcase', () => {
    test.beforeEach(async ({page}) => {
        await page.setViewportSize({width: 1600, height: 900});
        await openShowcase(page);
        await expect(page.locator(`${GRID} .neo-grid-body .neo-grid-row`).first()).toBeVisible({timeout: 30000})
    });

    test('every row fits its tallest wrapped text, alike in all three bodies, in both themes', async ({page}) => {
        const verdict = async () => {
            const rows    = await readRows(page),
                  heights = rows.map(row => row.heights[0]);

            return {
                aligned: rows.every(row => row.heights.length === 3 && new Set(row.heights).size === 1),
                fits   : rows.every(row => row.heights[0] >= row.natural - 1),
                // A long summary or title makes its row taller than a one-line row
                varied : Math.max(...heights) > Math.min(...heights)
            }
        };

        await expect.poll(verdict, {timeout: 20000}).toEqual({aligned: true, fits: true, varied: true});

        await page.locator('.issues-theme-button').click();
        await expect(page.locator('.neo-examples-grid-issues')).toHaveClass(/neo-theme-neo-dark/);
        await expect.poll(verdict, {timeout: 20000}).toEqual({aligned: true, fits: true, varied: true})
    });

    test('the State menu filters by value and clears', async ({page}) => {
        const all     = [...new Set(issues.map(issue => issue.state))].sort(),
              closed  = issues.filter(issue => issue.state === 'Closed').length,
              menu    = page.locator('.neo-grid-column-menu'),
              wrapper = page.locator(`${GRID} .neo-grid-menu-wrapper`).filter({hasText: 'State'}),
              states  = async () => [...new Set((await readRows(page)).map(row => row.state))].sort();

        await expect.poll(states).toEqual(all);

        await wrapper.hover();
        await wrapper.locator('.neo-grid-menu-trigger').click();
        await expect(menu.locator('[role="option"]')).toHaveCount(all.length);
        await expect(menu.locator('[role="option"]').filter({hasText: 'Closed'})).toHaveAttribute('aria-label', `Closed, ${closed} matches`);

        await menu.locator('[role="option"]').filter({hasText: 'Closed'}).click();
        await expect.poll(states).toEqual(['Closed']);

        await menu.getByRole('button', {name: 'Clear'}).click();
        await expect.poll(states).toEqual(all)
    })
});

// Los Angeles reads a UTC midnight as the previous evening. UTC is the positive control: there the day holds either way.
for (const timezoneId of ['America/Los_Angeles', 'UTC']) test.describe(`Grid issues showcase in ${timezoneId}`, () => {
    test.use({timezoneId});

    test('the snapshot\'s days read as their calendar days', async ({page}) => {
        const days   = issues.map(issue => issue.created).sort(),
              newest = issues.reduce((a, b) => b.id > a.id ? b : a),
              day    = new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric', timeZone: 'UTC'}),
              range  = new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'});

        await openShowcase(page);

        await expect(page.locator('.issues-heading-subtitle')).toHaveText(
            `${issues.length} issues opened from ${range.format(new Date(days[0]))} to ${range.format(new Date(days[days.length - 1]))}`,
            {timeout: 30000}
        );
        // A row's `data-record-id` is the record's internal id, so the issue number finds it through its `#` cell
        await expect.poll(() => page.evaluate(({grid, id}) => {
            const idCell   = [...document.querySelectorAll(`${grid} [data-field="id"]`)].find(cell => cell.textContent.trim() === id),
                  recordId = idCell?.closest('.neo-grid-row').dataset.recordId;

            return recordId && document.querySelector(`${grid} .neo-grid-row[data-record-id="${recordId}"] [data-field="created"]`)?.textContent.trim()
        }, {grid: GRID, id: String(newest.id)})).toBe(day.format(new Date(newest.created)))
    })
});
