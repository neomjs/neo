import {test, expect} from '@playwright/test';

/**
 * The in-flight registry reports a scope the payload no longer has — measured on a real
 * `tab.header.Toolbar`, in a real browser.
 *
 * `Component#show()` sets `parent.updateDepth = -1` and calls `parent.update()`, because a floating
 * widget mounting into its parent needs the full tree. When that lands inside the parent's own
 * collection yield the payload widens to -1 while `getInFlightUpdateDepth` still answers with the
 * depth the cycle STARTED with. `isParentUpdating` and `hasUpdateCollision` both consult the
 * registry, so every consumer of the collision contract is answered from a stale value.
 *
 * **This file asserts registry coherence and nothing beyond it.** An earlier version described a
 * second overlapping flight and duplicate DOM as the consequence. That chain is NOT witnessed here:
 * measured with the hook disabled, the sibling write is still queued, because something further down
 * absorbs it. The duplicate-render defect was separate and separately cured. Naming a consequence a
 * test does not reach is how a label becomes a substitute for a witness.
 *
 * Reaching the window needs a SECOND cycle: `getVdomUpdatePayload` resets the depth by writing
 * `_updateDepth`, so a bar that has ever been at -1 stays there until one payload is collected.
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
     * The registry read taken from where a consumer of the collision contract actually takes it.
     *
     * A write issued while the parent is still collecting is absorbed by `mergeIntoParentUpdate`,
     * which `update()` tries BEFORE `isParentUpdating` — so the obvious placement never reaches the
     * registry at all. Issued from `beforeExecuteVdomUpdate` it lands after collection, the merge
     * declines it because the parent's `needsVdomUpdate` is already false, and the read happens at
     * the seam. Seam identified by @neo-gpt in review.
     *
     * `siblingOpenedOwn` is recorded and deliberately NOT asserted: measured, it is false with the
     * hook disabled too, so an assertion on it would pass under mutation. Recording a value this file
     * cannot discriminate on is honest; asserting it would not be.
     */
    test('the post-collection registry read carries the escalation', async ({page}) => {
        const [report] = await page.evaluate(() => Neo.worker.App.getConfigs({
            id: 'tab-header-race-viewport', keys: ['raceReport']
        }));

        expect(report.postCollection, `race report: ${JSON.stringify(report)}`).not.toBeNull();
        expect(report.postCollection.hookFired, 'beforeExecuteVdomUpdate must have fired').toBe(true);

        // The assertion that reddens without the hook (`Received: 1`).
        expect(report.postCollection.registered, 'the record must carry the escalation').toBe(-1);

        expect(
            report.postCollection,
            'recorded, not asserted — siblingOpenedOwn does not discriminate'
        ).toHaveProperty('siblingOpenedOwn')
    });

    // Two DOM arms lived here — "no element id is rendered twice" and "each tab button appears
    // exactly once" — REMOVED rather than relabelled. Both passed with the escalation hook disabled,
    // so neither witnessed anything about this defect, and the duplicate-render class they guarded
    // belongs to a separate, separately cured bug. A green arm that cannot fail is not a cheap
    // forward guard; it is a claim of coverage this file cannot honour. The invariant that DOES catch
    // that class lives on `ada/17980-duplicate-id-detector`, with a firing control.
});
