import {test, expect} from '@playwright/test';

/**
 * The invariant, measured directly: no two mounted DOM nodes may share an id.
 *
 * The duplication this file watches for is currently reported by whichever `DockReload` arm happens
 * to be executing when the race lands — @neo-opus-grace measured the failing arm varying run to run
 * on one SHA, never twice the same, always exactly one. So every existing red is a *symptom* report
 * from an arm that was only passing by, and no arm-specific hypothesis can hold.
 *
 * This arm asserts the property instead. It does not care which activation triggers the race, which
 * action set doubles, or which spec is running: two nodes answering to one id is a corrupt document,
 * full stop. That makes it deterministic where the symptom reports are probabilistic, and it stays
 * true across the v13.2 rename because it names no dock class at all.
 *
 * **It is a detector, not a fix, and it cannot be validated by a green run.** The per-run rate is
 * well under 100% — one head cleared the whole suite while `dev` was reproducing — so a single green
 * here means nothing on its own. What CAN be validated is the detector: the control below seeds a
 * duplicate id and requires it to fail. An instrument that has never been seen to fire is not
 * evidence of anything.
 *
 * The seam it serves is the mid-flight update-depth escalation; the cure for the duplication itself
 * lives in the VDOM compute layer, not here.
 */

/** Every id carried by a mounted element, with its occurrence count. */
const duplicateIds = page => page.evaluate(() => {
    const seen = new Map();

    for (const el of document.querySelectorAll('[id]')) {
        seen.set(el.id, (seen.get(el.id) || 0) + 1)
    }

    return [...seen.entries()]
        .filter(([, count]) => count > 1)
        .map(([id, count]) => ({id, count}))
});

test.describe('dock — no two mounted nodes share an id', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/dock-maximize/index.html');
        await page.waitForSelector('#dock-maximize-workspace', {state: 'attached'});
        await page.waitForSelector('.neo-tab-header-button',   {state: 'visible'})
    });

    test('CONTROL: the detector fires on a seeded duplicate', async ({page}) => {
        // Without this the suite could report a permanent green from a detector that never looks at
        // anything. Seeded on a real mounted node so the query path under test is the one exercised.
        const seeded = await page.evaluate(() => {
            const original = document.querySelector('.neo-tab-header-button');

            if (!original?.id) return null;

            const clone = original.cloneNode(true);

            original.parentNode.appendChild(clone);

            return original.id
        });

        expect(seeded, 'a mounted tab button with an id must exist to seed against').toBeTruthy();

        const duplicates = await duplicateIds(page);

        expect(duplicates.map(entry => entry.id)).toContain(seeded);

        // Leave the document clean for the arms below — Playwright reuses the page within a file.
        await page.reload();
        await page.waitForSelector('.neo-tab-header-button', {state: 'visible'})
    });

    test('activations across three tab groups leave every id unique', async ({page}) => {
        const buttons = page.locator('.neo-tab-header-button');

        // Non-vacuity: a green from a workspace with nothing to activate witnesses nothing.
        const count = await buttons.count();

        expect(count, 'the harness must project real tab buttons').toBeGreaterThan(2);

        const before = await duplicateIds(page);

        expect(before, `the document is already corrupt at rest: ${JSON.stringify(before)}`).toEqual([]);

        // Every activation re-derives per-item action visibility, and that path reaches
        // Component#show()/hide() — which escalates the bar's updateDepth mid-reconcile. Cycling
        // rather than clicking once, because the window opens roughly once per page lifecycle and a
        // single activation may simply not be the one that lands on it.
        for (let pass = 0; pass < 3; pass++) {
            for (let i = 0; i < count; i++) {
                const button = buttons.nth(i);

                if (await button.isVisible() && await button.isEnabled()) {
                    await button.click({trial: false, force: true});
                    await page.waitForTimeout(120);

                    const duplicates = await duplicateIds(page);

                    expect(
                        duplicates,
                        `pass ${pass}, button ${i}: ${JSON.stringify(duplicates)}`
                    ).toEqual([])
                }
            }
        }
    })
});
