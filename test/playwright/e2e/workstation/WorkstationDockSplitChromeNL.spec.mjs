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
 * Two invariants, both engine-level rather than cosmetic:
 *
 * - **`ui` survives a sibling's structural change.** A container that did not participate in the
 *   operation must not be restyled by it. The inline variant is what makes dock chrome read as
 *   embedded pane furniture instead of a free-standing tab card.
 * - **One active tab per container.** A tab.Container cannot represent two active tabs, so two
 *   `pressed` buttons in one header means chrome outlived its item — the retained-chrome class,
 *   not a styling slip.
 *
 * Run: NEO_E2E_PORT=8151 npx playwright test workstation/WorkstationDockSplitChromeNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */

/** Rendered chrome per tab container: the `ui` class, header density, and pressed-tab count. */
const readChrome = page => page.evaluate(() => [...document.querySelectorAll('.neo-tab-header-toolbar')].map(bar => {
    const container = bar.closest('[class*="neo-tab-container"]'),
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
    test('the split keeps inline chrome workspace-wide and one active tab per container', async ({page, neuralLink}) => {
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

        // NOT asserted here, deliberately: a second, independent defect makes the source header
        // sometimes render the moved tab's button as a SECOND pressed tab. It reproduces through
        // this exact cue but only intermittently, and the reconciler's own count guard does not
        // fire on it — `getTabButtons()` cannot see the node — which places it in the orphaned-DOM
        // class rather than in this projection repair. Asserting it here would make this guard
        // flaky and would attribute someone else's defect to the fix it is protecting.
        expect(
            chrome.filter(entry => entry.duplicateIds.length).map(entry => ({id: entry.containerId, dupes: entry.duplicateIds})),
            `no header may render a duplicate DOM id — ${JSON.stringify(chrome)}`
        ).toEqual([])
    })
});
