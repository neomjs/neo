import {test, expect} from '@playwright/test';

/**
 * The DOM-level consequence of a depth escalation arriving mid-flight, on a real tab header toolbar.
 *
 * `Component#show()` sets `parent.updateDepth = -1` and calls `parent.update()`, because a floating
 * widget mounting into its parent needs the full tree. When that lands inside the parent's own
 * collection yield, the payload widens but the in-flight registry still reports the depth the cycle
 * started with — so a sibling write is told the scopes are disjoint, opens a second flight, and the
 * parent's dense tree carries that sibling's subtree too. One subtree, two batches, applied twice
 * with IDENTICAL element ids.
 *
 * That signature is what CI reported on the dock reload-action lane: `resolved to 2 elements`,
 * and a strip rendering `Alpha, Beta, Beta`. It was mitigated consumer-side by serializing every bar
 * write onto the refresh's settled tail; the engine hazard stayed live for any toolbar or tab
 * consumer that writes during projection.
 *
 * **This arm asserts on ids, not on counts of a class.** A duplicated subtree is only a defect
 * because two elements answer to one id; counting buttons would also fire for a legitimate extra
 * action and would miss a duplicate that happened to replace one.
 */
test.describe('tab header toolbar — a depth escalation arriving mid-flight', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/tab-header-race/index.html');
        await page.waitForSelector('#race-tab-container', {state: 'attached'});

        await expect.poll(
            // Array form: `getConfigs` answers a key LIST with a list, and a single-string key with
            // a shape this poll compared wrongly — a mismatch that reads as "the harness never
            // finished" for twenty seconds rather than as an instrument error.
            () => page.evaluate(async () => (await Neo.worker.App.getConfigs({
                id: 'tab-header-race-viewport', keys: ['raceComplete']
            }))[0]),
            {message: 'the harness must finish its race sequence', timeout: 20000}
        ).toBe(true)
    });

    test('the window under test is actually entered', async ({page}) => {
        const [report] = await page.evaluate(() => Neo.worker.App.getConfigs({
            id: 'tab-header-race-viewport', keys: ['raceReport']
        }));

        // Non-vacuity. If the bar was already at -1 when the cycle opened there is no disagreement
        // to create, and every assertion in the sibling arm would pass for the wrong reason.
        expect(report.windowEntered, `race report: ${JSON.stringify(report)}`).toBe(true);
        expect(report.registeredBefore, 'the cycle must open at the default scope').toBe(1);

        // show() must still widen the payload to the full tree. Narrowing this is the regression
        // this suite exists to forbid, not the bug it exists to fix.
        expect(report.escalation.live, 'show() must still escalate the payload scope').toBe(-1);

        // ...and the collision check must see the same scope the payload will be built from.
        expect(report.escalation.registered, 'the registry must track the escalation').toBe(-1)
    });

    /**
     * FORWARD GUARDS, NOT RED-FIRST EVIDENCE. Both arms below pass with the escalation hook
     * disabled, because this harness proves the *mechanism* and does not reproduce the original
     * DOM symptom: the sibling write is absorbed by `mergeIntoParentUpdate` before it can open the
     * second flight, and the duplication CI saw needed the dock's own composition.
     *
     * They are kept because a future duplication would trip them, and dropped-in silence would be
     * worse. They are NOT the proof that this lane fixed anything — the mechanism arm above is,
     * and it is the only one here that reddens when the hook is removed.
     */
    test('no element id is rendered twice', async ({page}) => {
        const duplicates = await page.evaluate(() => {
            const seen = new Map();

            for (const el of document.querySelectorAll('[id]')) {
                seen.set(el.id, (seen.get(el.id) || 0) + 1)
            }

            return [...seen.entries()].filter(([, count]) => count > 1).map(([id, count]) => ({id, count}))
        });

        expect(duplicates, `duplicated ids: ${JSON.stringify(duplicates)}`).toEqual([])
    });

    test('each tab button appears exactly once in the strip', async ({page}) => {
        const [{tabButtonIds}] = await page.evaluate(() => Neo.worker.App.getConfigs({
            id: 'tab-header-race-viewport', keys: ['raceReport']
        }));

        expect(tabButtonIds.length, 'two tabs plus the shown action').toBe(3);

        for (const id of tabButtonIds) {
            await expect(page.locator(`#${id}`), `bar item ${id}`).toHaveCount(1)
        }
    })
});
