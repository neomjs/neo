import {test, expect} from '../../fixtures.mjs';

/**
 * The `+1 pulse` row action must increment the Pulse cell of ITS OWN row, for every visible row.
 *
 * Operator report from the 100k Matrix pane: the action works for the first handful of rows and
 * silently does nothing for the rest of the visible area. Nothing errors — the click lands, the
 * button paints its press, and the counter three columns to the left simply does not move.
 *
 * **Why this is read by record id and not by row position.** The grid is buffered: rows are pooled
 * DOM nodes recycled across records, so "row 7" is not a stable subject. Every assertion below pairs
 * a button with the Pulse cell of the SAME `data-record-id`, which is the only pairing that survives
 * recycling — and it is also the pairing the defect is suspected to break.
 *
 * The action column is a `component` column whose handler closes over `record` at component-creation
 * time (`ScalePane.mjs`), so a recycled cell can keep a handler bound to the record it was first
 * built for. That is a hypothesis; this spec only establishes the SYMPTOM, deliberately, so the
 * mechanism can be falsified separately without rewriting the witness.
 *
 * @see https://github.com/neomjs/neo/issues/18186
 */

// Scoped to the SCALE pane, not `.neo-grid-container`: the Workstation renders two grids and the
// feed matches first. A bare container selector read the feed's name column and reported every row
// as failing — a red for the wrong reason, which is worse than a green.
const GRID = '.workstation-scale-pane';

/**
 * Reads every rendered row of the scale grid as `{recordId, pulse}`, paired by identity.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object[]>}
 */
const readRows = page => page.evaluate(grid => {
    const container = document.querySelector(grid);

    if (!container) return [];

    // The Pulse column index is DERIVED from the header, never hardcoded. The grid has eight
    // columns (#, Work item, State, Throughput, Pulse, Load, Living signal, Action) and a guessed
    // index silently reads a neighbour — a name column never increments, so the spec reports every
    // row as broken and looks like a perfect witness while measuring nothing.
    const headers = [...container.querySelectorAll('.neo-grid-header-button')]
              .map(node => (node.textContent || '').trim()),
          pulseIndex = headers.indexOf('Pulse');

    return [...container.querySelectorAll('.neo-grid-row')].map(row => {
        const cells = [...row.querySelectorAll('.neo-grid-cell')];

        return {
            hasAction: !!row.querySelector('.workstation-row-action'),
            pulse    : pulseIndex > -1 ? (cells[pulseIndex]?.textContent || '').trim() : null,
            pulseIndex,
            recordId : row.dataset?.recordId ?? row.getAttribute('data-record-id')
        }
    }).filter(entry => entry.recordId && entry.hasAction)
}, GRID);

test.describe('Workstation 100k Matrix — a row action acts on its own row (Neural Link)', () => {
    test('every visible +1 pulse increments the Pulse cell of its own record, not only the first rows', async ({page}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector(`${GRID} .neo-grid-row`, {state: 'visible', timeout: 30000});

        // Non-vacuity: the defect is about rows BEYOND the first few, so a grid that rendered only a
        // handful would make this pass while proving nothing about the reported case.
        const before = await readRows(page);

        expect(before.length, 'the matrix must render enough rows to reach the reported failure')
            .toBeGreaterThan(8);

        // The column mapping is itself a non-vacuity guard: reading a neighbouring column would
        // report every row as failing and read exactly like a successful witness.
        expect(before[0].pulseIndex, 'the Pulse column must be resolvable by its header')
            .toBeGreaterThan(-1);
        expect(before[0].pulse, 'and it must hold a number, not a name').toMatch(/^\d/);

        const failures = [];

        for (const {recordId, pulse} of before) {
            const row = page.locator(`${GRID} .neo-grid-row[data-record-id="${recordId}"]`);

            // `dispatchEvent`, not `click`. The Matrix animates continuously — a 10/sec feed, an
            // animated counter and live sparklines — so an ordinary click times out on actionability,
            // and `force: true` merely skips that check while still clicking the COORDINATES
            // resolved a moment earlier, which the moving grid has since given to another row.
            // Dispatching on the element itself is the only coordinate-free path to the handler.
            await row.locator('.workstation-row-action').dispatchEvent('click');

            let after = pulse;

            // Poll rather than read once: the Pulse column animates its change, so a single read can
            // land mid-transition and report a stale value for a row that DID increment. The poll is
            // wrapped because a row that never changes is the defect under test — it must be
            // recorded and the sweep continued, not thrown as an abort on the first bad row.
            try {
                await expect.poll(async () => {
                    after = (await readRows(page)).find(entry => entry.recordId === recordId)?.pulse ?? pulse;

                    return after
                }, {timeout: 3000}).not.toBe(pulse)
            } catch {
                // unchanged within the window — captured below as a failure for this record
            }

            const digits   = value => Number(String(value).replace(/[^\d-]/g, '')),
                  expected = digits(pulse) + 1;

            digits(after) !== expected && failures.push({recordId, before: pulse, after})
        }

        expect(failures, `rows whose own Pulse cell did not increment: ${JSON.stringify(failures)}`)
            .toEqual([])
    })
});
