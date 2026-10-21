import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/grid/issues`, neomjs/neo's own issues from a committed snapshot: every row is as tall as its
 * tallest wrapped text in all three bodies, a locked column's header menu filters by value and clears, its filter list
 * draws cleanly in both neo themes, only the sorted header announces `aria-sort`, and the snapshot's days read the
 * same in every time zone.
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

    test('fixed rows show each title and summary as one line, cut with an ellipsis (#19806)', async ({page}) => {
        const toggle = page.locator('.issues-toggle').getByText('Content-sized rows'),
              // Per visible Title/Summary cell: its distinct text lines, whether they sit inside the content box
              // vertically, and whether the text is cut
              cells  = () => page.evaluate(grid => [...document.querySelectorAll(
                  `${grid} .neo-grid-row .neo-grid-cell.issues-title, ${grid} .neo-grid-row .neo-grid-cell.issues-summary`
              )].filter(cell => {
                  const row = cell.closest('.neo-grid-row');
                  return row.style.display !== 'none' && row.dataset.recordId && !row.closest('.neo-grid-row-measure')
              }).map(cell => {
                  const range = document.createRange(), box = cell.getBoundingClientRect(), style = getComputedStyle(cell);
                  range.selectNodeContents(cell);
                  const lines = [...range.getClientRects()].filter(rect => rect.height > 0);
                  return {
                      lines : new Set(lines.map(rect => Math.round(rect.top))).size,
                      inside: lines.every(rect => rect.top >= box.top + parseFloat(style.paddingTop) - 1 &&
                                                  rect.bottom <= box.bottom - parseFloat(style.paddingBottom) + 1),
                      cut   : cell.scrollWidth > cell.clientWidth
                  }
              }), GRID),
              verdict = async () => {
                  const read = await cells();
                  return {oneLine: read.every(cell => cell.lines === 1), inside: read.every(cell => cell.inside), cut: read.some(cell => cell.cut)}
              };

        await toggle.click();
        await expect.poll(() => page.locator(`${GRID} .neo-grid-cell-text`).count()).toBe(0);
        await expect.poll(verdict).toEqual({oneLine: true, inside: true, cut: true});

        // Ticking it again restores the wrapped, measured text
        await toggle.click();
        await expect.poll(() => page.locator(`${GRID} .neo-grid-cell-text`).count()).toBeGreaterThan(0);
        expect((await cells()).some(cell => cell.lines > 1)).toBe(true)
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
    });

    test('a filtered locked column keeps its header marked while its menu is closed (#19793)', async ({page}) => {
        const menu    = page.locator('.neo-grid-column-menu'),
              wrapper = page.locator(`${GRID} .neo-grid-menu-wrapper`).filter({hasText: 'State'}),
              header  = wrapper.locator('.neo-grid-header-button'),
              trigger = wrapper.locator('.neo-grid-menu-trigger'),
              opacity = () => trigger.evaluate(node => getComputedStyle(node).opacity),
              // Off the headers with nothing focused, so only the filtered state may keep the trigger shown
              away    = async () => {
                  await page.mouse.move(800, 880);
                  await page.evaluate(() => document.activeElement?.blur());
                  expect(await wrapper.evaluate(node => node.matches(':hover, :focus-within'))).toBe(false)
              };

        // State is locked at the end, so its header lives outside the centre toolbar
        await expect(header).toHaveClass(/neo-locked-end/);
        await wrapper.hover();
        await trigger.click();
        await menu.locator('[role="option"]').filter({hasText: 'Closed'}).click();
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
        await away();
        await expect(header).toHaveClass(/neo-grid-column-filtered/);
        await expect(trigger).toHaveAttribute('aria-label', 'Filter State, active');
        await expect(trigger).toHaveText('▾');
        await expect.poll(opacity).toBe('1');

        await wrapper.hover();
        await trigger.click();
        await menu.getByRole('button', {name: 'Clear'}).click();
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
        await away();
        await expect(header).not.toHaveClass(/neo-grid-column-filtered/);
        await expect(trigger).toHaveAttribute('aria-label', 'Filter State');
        await expect.poll(opacity).toBe('0')
    });

    test('a right-click on the header arrow keeps the browser menu closed and opens the value menu (#19952)', async ({page}) => {
        const menu    = page.locator('.neo-grid-column-menu'),
              wrapper = page.locator(`${GRID} .neo-grid-menu-wrapper`).filter({hasText: 'State'}),
              trigger = wrapper.locator('.neo-grid-menu-trigger');

        // The browser's own menu is the one to keep away: it shows up unless the arrow's contextmenu event is
        // default-prevented, which the framework only does for paths carrying a registered target class.
        await page.evaluate(() => {
            window.__arrowContext = null;
            document.addEventListener('contextmenu', event => queueMicrotask(() => {
                window.__arrowContext = {prevented: event.defaultPrevented, trusted: event.isTrusted}
            }), {once: true})
        });

        await trigger.click({button: 'right'});

        await expect.poll(() => page.evaluate(() => window.__arrowContext)).toEqual({prevented: true, trusted: true});
        await expect(menu).toBeVisible()
    });

    test('only the sorted header announces its direction, through aria-sort (#19913)', async ({page}) => {
        const header = name => page.locator(GRID).getByRole('columnheader', {name, exact: true}),
              sorted = page.locator(`${GRID} [aria-sort]`);

        // The showcase opens sorted by # descending
        await expect(header('#')).toHaveAttribute('aria-sort', 'descending');
        await expect(sorted).toHaveCount(1);

        await header('Title').click();

        await expect(header('Title')).toHaveAttribute('aria-sort', 'ascending');
        await expect(header('#')).not.toHaveAttribute('aria-sort');
        await expect(sorted).toHaveCount(1)
    });

    test('the filter list draws its focus ring inside the row and its rows on the menu surface, in both themes (#19928)', async ({page}) => {
        const menu    = page.locator('.neo-grid-column-menu'),
              wrapper = page.locator(`${GRID} .neo-grid-menu-wrapper`).filter({hasText: 'State'}),
              // Each theme reports its own reading, so a failure in neo-light still shows neo-dark's
              soft    = expect.configure({soft: true}),
              // The list scrolls, so a ring reaching outside its row is clipped at the sides only, and a row that
              // paints its own colour shows as a band on the menu
              read    = () => menu.evaluate(node => {
                  const active = node.querySelector('.neo-list-item.neo-navigator-active-item'),
                        plain  = node.querySelector('.neo-list-item:not([aria-selected="true"]):not(.neo-navigator-active-item)'),
                        ring   = getComputedStyle(active),
                        paint  = item => {
                            for (let element = item; element; element = element.parentElement) {
                                const color = getComputedStyle(element).backgroundColor;
                                if (color !== 'rgba(0, 0, 0, 0)') return color
                            }
                            return null
                        };

                  return {
                      ringInside  : parseFloat(ring.outlineOffset) <= -parseFloat(ring.outlineWidth),
                      rowOnSurface: paint(plain) === getComputedStyle(node).backgroundColor
                  }
              }),
              pick    = async state => {
                  await wrapper.hover();
                  await wrapper.locator('.neo-grid-menu-trigger').click();
                  await menu.locator('[role="option"]').filter({hasText: state}).click();
                  await expect(menu.locator('.neo-navigator-active-item')).toHaveText(new RegExp(state))
              };

        await pick('Closed');
        await soft.poll(read).toEqual({ringInside: true, rowOnSurface: true});

        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
        await page.locator('.issues-theme-button').click();
        await expect(page.locator('.neo-examples-grid-issues')).toHaveClass(/neo-theme-neo-dark/);

        await pick('Duplicate');
        await soft.poll(read).toEqual({ringInside: true, rowOnSurface: true})
    });

    test('a header focused outside the centre clip brings its column along (#19955)', async ({page}) => {
        // At this width the centre region overflows, and the Area menu trigger sits past its clip
        await page.setViewportSize({width: 800, height: 600});

        const trigger = page.locator(`${GRID} .neo-grid-menu-wrapper`).filter({hasText: 'Area'}).locator('.neo-grid-menu-trigger'),
              read    = () => page.evaluate(grid => {
                  const header = [...document.querySelectorAll(`${grid} .neo-grid-header-button`)].find(node => node.textContent.trim() === 'Area'),
                        cell   = [...document.querySelectorAll(`${grid} .neo-grid-row [data-field="area"]`)]
                            .find(node => !node.closest('.neo-grid-row-measure') && node.getBoundingClientRect().width > 0),
                        toolbar   = header.closest('.neo-grid-header-toolbar'),
                        scrollbar = document.querySelector(`${grid} .neo-grid-horizontal-scrollbar`);

                  return {
                      // The header stays over its own cells, and the focus did move the centre header
                      aligned : Math.abs(header.getBoundingClientRect().left - cell.getBoundingClientRect().left) <= 1,
                      scrolled: toolbar.scrollLeft > 0,
                      synced  : toolbar.scrollLeft === scrollbar.scrollLeft
                  }
              }, GRID);

        await trigger.focus();
        await expect.poll(read).toEqual({aligned: true, scrolled: true, synced: true})
    });

    test('a value picked before the menu\'s search focus lands keeps its focus (#19961)', async ({page}) => {
        const menu    = page.locator('.neo-grid-column-menu'),
              wrapper = page.locator(`${GRID} .neo-grid-menu-wrapper`).filter({hasText: 'State'}),
              option  = menu.locator('[role="option"]').filter({hasText: 'Closed'}),
              open    = async () => {
                  await wrapper.hover();
                  await wrapper.locator('.neo-grid-menu-trigger').click();
                  await expect(option).toBeVisible()
              };

        // Without a pick, the search field takes focus
        await open();
        await expect(menu.getByLabel('Search values')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();

        // Hold the menu's focus calls on the main thread, so the pick lands first, as it does behind a busy worker
        await page.evaluate(() => {
            const DomAccess = Neo.main.DomAccess, focus = DomAccess.focus;
            window.heldFocus = [];
            DomAccess.focus = function(data) {
                if (document.getElementById(data.id)?.closest('.neo-grid-column-menu')) {
                    return new Promise(resolve => window.heldFocus.push(() => resolve(focus.call(this, data))))
                }
                return focus.call(this, data)
            }
        });

        await open();
        await option.click();
        await expect(menu.locator('.neo-navigator-active-item')).toHaveText(/Closed/);
        await expect.poll(() => page.evaluate(() => window.heldFocus.length)).toBeGreaterThan(0);

        // A release runs the held focus synchronously, so what follows reads the state after it landed
        await page.evaluate(() => window.heldFocus.forEach(release => release()));
        await expect(menu.getByLabel('Search values')).not.toBeFocused();
        await expect(menu.locator('.neo-navigator-active-item')).toHaveText(/Closed/)
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
