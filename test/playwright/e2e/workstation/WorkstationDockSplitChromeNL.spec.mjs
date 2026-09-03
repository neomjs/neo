import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness: docking one tab to a grid's edge must not restyle every OTHER
 * tab container in the workspace.
 *
 * Reported against the running Workstation: dragging `Priority Alert Observatory` out of its
 * group and docking it to the right of the 100k grid leaves the NEW node correctly inline while
 * every pre-existing tab container loses `ui: 'inline'` — their headers jump from the inline 32px
 * density to the standalone 48px one. The document reducer is not implicated: `Operations.splitNode`
 * detaches the item from its source and produces an exact three-node result, so this is a
 * projection-side regression and the assertions below are deliberately on RENDERED chrome.
 *
 * One invariant, engine-level rather than cosmetic: **a container's config-derived classes survive
 * a sibling's structural change.** A container that did not participate in the operation must not be
 * restyled by it. All three are pinned — `ui` (the reported 32px→48px casualty), the tab-bar position
 * class, and `plain` — because one projected `cls` replacement dropped all three, and an inline-only
 * assertion would pass a repair that restored just the visible one.
 *
 * This arm does NOT assert one active tab per container, and that is now a scope statement rather than
 * an open question. The second `pressed` tab was a separate defect — a cross-bar move published its
 * insertion but not its source removal, so the moved button's old DOM node survived and one element id
 * rendered under two bars. It is FIXED, and its guard is `WorkstationTabRestoreNL.spec.mjs`, which
 * drives a real pointer because this file's cue executor never reproduced it.
 *
 * `pressedCount` stays recorded-but-unasserted here for the same reason: this cue does not reach that
 * path, so asserting it in this file would pin nothing. Assert it in the dedicated witness instead.
 *
 * Run: NEO_AGENTOS_RUNTIME_ROOT=<abs path to neo-agent-brain> NEO_E2E_PORT=8151 \
 *      npx playwright test workstation/WorkstationDockSplitChromeNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 *
 * The runtime root is not optional: `playwright.config.e2e.mjs` ignores every neuralLink-fixture
 * spec without it, so the command selects ZERO tests and reports success.
 */

/** Rendered chrome per tab container: its three config-derived classes, header density, and forensic counts. */
const readChrome = page => page.evaluate(() => [...document.querySelectorAll('.neo-tab-header-toolbar')].filter(bar => {
    return !!bar.closest('.neo-tab-container')
}).map(bar => {
    const container = bar.closest('.neo-tab-container'),
          buttons   = [...bar.querySelectorAll('.neo-tab-header-button')],
          ids       = [...bar.querySelectorAll('[id]')].map(node => node.id);

    return {
        containerId : container?.id ?? null,
        inline      : !!container?.classList.contains('neo-tab-container-inline'),
        // The other two classes a tab container derives from its own configs. `ui` was the reported
        // casualty, but the projected `cls` replacement dropped all three, so all three are pinned:
        // a fix that restores only the visible one would pass an inline-only assertion.
        plain       : !!container?.classList.contains('neo-tab-container-plain'),
        position    : ['top', 'right', 'bottom', 'left'].find(edge => container?.classList.contains(`neo-${edge}`)) ?? null,
        headerHeight: buttons[0] ? getComputedStyle(buttons[0]).height : null,
        pressedCount: buttons.filter(button => button.classList.contains('pressed')).length,
        tabTexts    : buttons.map(button => button.textContent.trim()),
        duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index)
    }
}));

test.describe('Workstation — docking a tab to a grid edge leaves every other header alone', () => {
    test('the split keeps every container\'s config-derived chrome workspace-wide', async ({page, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host',            {timeout: 60000});
        await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});
        await page.waitForFunction(() => {
            const host = document.querySelector('.workstation-dock-host');

            return host?.getBoundingClientRect().height > 300
        }, {timeout: 60000});
        await page.waitForTimeout(1200);

        const app        = await neuralLink.connectToApp('Workstation'),
              workspaces = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(wsId, 'the workstation Workspace must exist in the App Worker').toBeTruthy();

        const before = await readChrome(page);

        // Non-vacuity: the regression is "inline is LOST", so the arm proves nothing unless every
        // container starts inline. A future default flip must red here, not silently pass below.
        expect(before.length, 'the workspace must project several tab containers').toBeGreaterThan(2);
        expect(
            before.filter(entry => !entry.inline || !entry.plain || !entry.position)
                .map(entry => ({id: entry.containerId, inline: entry.inline, plain: entry.plain, position: entry.position})),
            `precondition: every container starts with all three config-derived classes — ${JSON.stringify(before)}`
        ).toEqual([]);

        const topology = (await app.getDockTopology(wsId)).document;

        expect(topology.nodes['heavy-tabs']?.items, 'precondition: alerts starts in heavy-tabs').toContain('alerts');

        // The reported gesture: drag `alerts` out of its group and dock it to the RIGHT of the grid.
        // The cue executor requires two distinct foreign zones AND two distinct placement kinds, so
        // the first dwell is a pass-through over another node; the LAST dwell is what the terminal
        // commits, and that one is the reported drop.
        const result = await app.callMethod(wsId, 'executeCue', [{
            type        : 'cross-zone-showcase',
            itemId      : 'alerts',
            sourceNodeId: 'heavy-tabs',
            terminal    : 'commit',
            // `edge-bottom` rather than the reported `edge-right`: the cross-zone candidate set does
            // not offer a right edge on this node, and inventing one would test the harness. Both
            // reduce through the same `Operations.splitNode` against the grid's node — the structural
            // change under test is the new sibling split, not which side it lands on.
            dwells      : [
                {targetNodeId: 'right-bottom-tabs', placementKind: 'tab-into'},
                {targetNodeId: 'scale-tabs',        placementKind: 'edge-bottom'}
            ],
            options: {dwellDelay: 700, moveDelay: 24, moveSteps: 18, showCursor: true}
        }]);

        const receipt = JSON.stringify(result);

        expect(result?.errors ?? ['<no errors array>'], `cue errors must be empty: ${receipt}`).toEqual([]);
        expect(result?.applied, `the terminal commit must apply the previewed operation: ${receipt}`).toBe(true);

        await page.waitForTimeout(600);

        const after = (await app.getDockTopology(wsId)).document;

        // The document half is expected to be correct — `Operations.splitNode` detaches the item —
        // so this is the control that isolates the failure to the projection rather than the model.
        expect(after.nodes['heavy-tabs']?.items, 'the model detaches alerts from its source').not.toContain('alerts');

        const chrome = await readChrome(page);

        // Engine truth beside the rendered class: if `ui` still reads 'inline' while the class is
        // gone, the defect is class application; if `ui` itself is null, something cleared the
        // config. Asserting only the DOM would leave that ambiguous.
        const instances = await app.findInstances({ntype: 'tab-container'}, ['id', 'ui']),
              uiConfigs = (Array.isArray(instances) ? instances : [instances])
                  .map(entry => ({id: entry?.properties?.id ?? entry?.id, ui: entry?.properties?.ui ?? null}));

        // Positive control: a null `ui` only means something cleared it if the read can see the
        // containers at all. Without this, a read that resolves nothing is indistinguishable from
        // the defect — which is exactly what a DOM-id lookup did here before this arm existed.
        expect(
            uiConfigs.length,
            `the ui read must resolve the projected containers — ${JSON.stringify(instances)}`
        ).toBeGreaterThanOrEqual(chrome.length);

        expect(
            uiConfigs.filter(entry => entry.ui !== 'inline'),
            `every dock tab container must still hold ui:'inline' in the App Worker — ${JSON.stringify(uiConfigs)}`
        ).toEqual([]);

        // All three config-derived classes, not just the one the operator could see. `ui` produced
        // the visible 32px→48px jump; `plain` and the position class were dropped by the same
        // replacement and would have stayed lost behind an inline-only assertion.
        expect(
            chrome.filter(entry => !entry.inline || !entry.plain || !entry.position)
                .map(entry => ({id: entry.containerId, inline: entry.inline, plain: entry.plain, position: entry.position, h: entry.headerHeight})),
            `every container keeps its config-derived classes after the split — ${JSON.stringify(chrome)}`
        ).toEqual([]);

        // Matched by container id, not by index: the split adds a node, so the two lists differ in
        // length and a positional compare would fail on the new container rather than on a defect.
        const positionBefore = new Map(before.map(entry => [entry.containerId, entry.position]));

        expect(
            chrome.filter(entry => positionBefore.has(entry.containerId))
                .filter(entry => entry.position !== positionBefore.get(entry.containerId))
                .map(entry => ({id: entry.containerId, was: positionBefore.get(entry.containerId), now: entry.position})),
            'a retained container keeps its position class VALUE, not merely some position class'
        ).toEqual([]);

        // The second-pressed-tab defect that used to be described here is FIXED: a cross-bar move
        // published its insertion but not its source removal, so the moved button's old node survived
        // and one element id rendered under two bars. Its guard is `WorkstationTabRestoreNL.spec.mjs`.
        // `pressedCount` still is not asserted in THIS file, because this cue never reproduced that
        // path — the observation that `getTabButtons()` could not see the stale node was in fact the
        // tell, since the node had no component left in the source bar at all. The duplicate-id check
        // below stays: it is scoped WITHIN one bar, and the fixed defect duplicated ACROSS bars, so it
        // was never able to see it.
        expect(
            chrome.filter(entry => entry.duplicateIds.length).map(entry => ({id: entry.containerId, dupes: entry.duplicateIds})),
            `no header may render a duplicate DOM id — ${JSON.stringify(chrome)}`
        ).toEqual([])
    })
});
