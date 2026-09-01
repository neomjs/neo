import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness: a tab dragged out of its group must not be restored into the header
 * it left.
 *
 * Reported by @tobiu against the running Workstation: *"look at the 2 active tabs => it is in fact the
 * header i dragged left, getting restored."* The appearance is exactly that. The mechanism, measured,
 * is one level down:
 *
 * The App Worker moves the component correctly — `getTabButtons()` on the SOURCE toolbar no longer
 * lists the dragged item — but the item's OLD DOM node is never removed. So a single element id is
 * rendered under two headers at once, and the stale node keeps the `pressed` class it had when it left.
 * Nothing is restored and no second component exists; the document simply holds a duplicate id.
 *
 * That distinction decides where a fix belongs: not in the sort zone's restore path and not in the
 * dock model, but in the projection delta that moves a retained button between owners.
 *
 * **Why this uses a real pointer rather than the cue executor.** `Workspace#executeCue`'s
 * `cross-zone-showcase` drives the same dock operation and does NOT reproduce this — the existing
 * `WorkstationDockSplitChromeNL` arm reports `pressedCount: 1` on every container through that path.
 * Whatever restores the button lives on the pointer drag-end path, so a scripted commit is the wrong
 * instrument: it would report green against a live defect. This arm therefore drives `page.mouse`.
 *
 * The assertion is on **item occupancy across containers**, not on `pressedCount` alone. A count tells
 * you a header has two active tabs; it cannot tell you which item is duplicated, and the report is
 * specifically that the DRAGGED item is in two places at once.
 *
 * **The release timing is the reproduction, and it is diagnostic.** Dwelling ~400ms at the drop point
 * before releasing reproduces roughly 1 run in 10; releasing immediately on arrival reproduces 10 in
 * 10. The defect is therefore a race that a settling pause mostly closes, which is why it reads as an
 * occasional rendering glitch in manual use and why no scripted arm has ever caught it. Do not add a
 * settle wait before `mouse.up()` here — it would turn this guard back into a coin flip.
 *
 * Run: NEO_AGENTOS_RUNTIME_ROOT=<abs path to neo-agent-brain> NEO_E2E_PORT=8151 \
 *      npx playwright test workstation/WorkstationTabRestoreNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 *
 * The runtime root is not optional: `playwright.config.e2e.mjs` ignores every neuralLink-fixture
 * spec without it, so the command selects ZERO tests and reports success.
 */

/** Rendered tab occupancy per container: which labels each header shows, and which read as active. */
const readTabs = page => page.evaluate(() => [...document.querySelectorAll('.neo-tab-header-toolbar')]
    // The DRAG PROXY also carries `.neo-tab-header-toolbar` — that is its whole point, it is a detached
    // clone of a tab header. Counting it makes the proxy's own button look like a third container holding
    // the subject, which is a defect in the instrument, not in the product.
    .filter(bar => !bar.classList.contains('neo-dragproxy') && !bar.closest('.neo-dragproxy'))
    .map(bar => {
    const container = bar.closest('[class*="neo-tab-container"]'),
          buttons   = [...bar.querySelectorAll('.neo-tab-header-button')];

    return {
        // The BAR's own id, so engine-side per-bar readings can be joined to this row by identity
        // rather than by list position. Pairing two independently ordered lists by index is how a
        // discrepancy gets attributed to the wrong bar.
        barId      : bar.id ?? null,
        containerId: container?.id ?? null,
        pressed    : buttons.filter(button => button.classList.contains('pressed')).map(button => button.textContent.trim()),
        tabTexts   : buttons.map(button => button.textContent.trim()),
        // The discriminator between the two candidate mechanisms. If the leftover button is VISIBLE,
        // something un-hid a component that was on its way out (the drag-end visibility restore). If it
        // is present but hidden, nothing restored it — it was simply never retired, and the fix belongs
        // at the cross-zone terminal instead. A text-only census cannot tell these apart.
        visible    : buttons.filter(button => button.getBoundingClientRect().width > 0)
            .map(button => button.textContent.trim()),
        // WITHIN-bar duplicates only, and that limit is the point: this reported empty while the real
        // duplication was ACROSS two bars, so the census answered a narrower question than the one
        // being asked. Kept because a within-bar repeat is a distinct failure worth seeing, but the
        // cross-bar join below is what actually catches this defect.
        duplicateIds: (ids => ids.filter((id, index) => ids.indexOf(id) !== index))(buttons.map(b => b.id)),
        // Per-button identity, so the SAME node id appearing under two different bars is detectable.
        // A within-bar duplicate check cannot see that, and it is the difference between one subtree
        // applied in two places and a stale node left behind by a move.
        buttonIds  : buttons.map(button => ({id: button.id, text: button.textContent.trim()}))
    }
}));

test.describe('Workstation — a tab dragged out of its group is not restored into the source header', () => {
    test('the dragged item occupies exactly one container after a real pointer drop', async ({page, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host',                {timeout: 60000});
        await page.waitForSelector('.neo-tab-header-button.neo-draggable',  {timeout: 60000});
        await page.waitForFunction(() => {
            const host = document.querySelector('.workstation-dock-host');

            return host?.getBoundingClientRect().height > 300
        }, {timeout: 60000});

        // Readiness by predicate, not by clock: the gesture needs THIS subject's button rendered with a
        // real box, and the workspace's other headers projected. A fixed wait either overshoots on a
        // fast host or, worse, under-waits on a slow one and drags a button whose rect is still stale.
        await page.waitForFunction(subject => {
            const bars    = [...document.querySelectorAll('.neo-tab-header-toolbar')],
                  buttons = bars.flatMap(bar => [...bar.querySelectorAll('.neo-tab-header-button')]),
                  target  = buttons.find(button => button.textContent.trim() === subject);

            // `neo-draggable` on THE SUBJECT is the armed-sensor signal. Waiting only for a box was the
            // mistake an earlier revision made: the button paints before its sort zone is wired, so the
            // gesture started against unarmed chrome and the drop committed nothing — which the
            // non-vacuity guard then reported, correctly, as a test defect rather than a product one.
            return bars.length > 2 && !!target
                && target.getBoundingClientRect().width > 0
                && target.classList.contains('neo-draggable')
        }, 'Priority Alert Observatory', {timeout: 60000});

        const app        = await neuralLink.connectToApp('Workstation'),
              workspaces = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(wsId, 'the workstation Workspace must exist in the App Worker').toBeTruthy();

        // Workspace-level settle, read from the engine rather than inferred from the DOM: every `tabs`
        // node in the COMMITTED document must have a rendered header. That is what "the projection has
        // caught up" means, and it is the condition the drop needs in order to resolve a target zone.
        // DOM-only readiness is not sufficient — a button can paint, and even be draggable, while the
        // workspace is still projecting, and the release then commits nothing.
        await expect.poll(async () => {
            const doc       = (await app.getDockTopology(wsId)).document,
                  tabsNodes = Object.values(doc?.nodes || {}).filter(node => node.type === 'tabs').length,
                  bars      = await page.locator('.neo-tab-header-toolbar').count();

            return tabsNodes > 0 && bars === tabsNodes
        }, {message: 'every committed tabs node must have a rendered header before the gesture', timeout: 60000})
            .toBe(true);


        const before = await readTabs(page),
              // The dragged subject: the operator's own. Resolved from rendered text rather than a node
              // id, because the defect is about which header RENDERS it.
              subject = 'Priority Alert Observatory',
              origin  = before.find(entry => entry.tabTexts.includes(subject));

        expect(origin, `precondition: some container must render "${subject}" — ${JSON.stringify(before)}`).toBeTruthy();

        // Non-vacuity: the defect is "the source keeps it too", so the arm proves nothing unless the
        // subject starts in exactly ONE container. A fixture that already duplicated it would make the
        // post-drop assertion unfalsifiable.
        expect(
            before.filter(entry => entry.tabTexts.includes(subject)).map(entry => entry.containerId),
            `precondition: "${subject}" must start in exactly one container — ${JSON.stringify(before)}`
        ).toHaveLength(1);

        const tab = page.locator('.neo-tab-header-button', {hasText: subject}).first(),
              box = await tab.boundingBox();

        expect(box, 'the subject tab must be rendered before the gesture').toBeTruthy();

        // The reported gesture: drag it LEFT, out over the grid, and release there. A real pointer,
        // stepped past the sensor's start distance — a single jump can coalesce into one move event and
        // never arm the drag at all, which would leave this asserting against a gesture that never began.
        // The EDGE region, not the centre. A centre release is a `tab-into` — the item joins the grid's
        // own tab set, no node is created, and the source stays clean. The reported gesture docked to
        // the side, which reduces through `Operations.splitNode` and produces a NEW sibling node. Only
        // that path reproduces, so the drop coordinate is load-bearing rather than incidental.
        const grid  = await page.locator('.neo-grid-container, .neo-grid-body').first().boundingBox(),
              dropX = grid ? grid.x + grid.width * 0.92 : box.x - 400,
              dropY = grid ? grid.y + grid.height / 2   : box.y + 300;

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2 + 20, {steps: 8});
        await page.mouse.move(dropX, dropY, {steps: 24});
        await page.mouse.up();

        // Settle on projection STABILITY, which is the only predicate that is both semantic and neutral.
        //
        // "Wait until the source is clean" would mask the defect — that is the thing under test. "Wait
        // until the re-home renders" resolves too early: the insertion paints before the source removal
        // is published, so the snapshot catches an intermediate state and the non-vacuity guard fires on
        // a gesture that did commit. Waiting for the rendered occupancy to stop changing settles on
        // whatever the truth is: clean if the removal lands, duplicated if it never does.
        // Settle across ENGINE ROUND-TRIPS, not rAF frames and not a duration.
        //
        // Three predicates were tried and each failed for an instructive reason. "Wait for the source to
        // be clean" masks the defect under test. "Wait for the re-home to render" resolves while the
        // transaction is still mid-flight. "Wait for three quiet rAF frames" resolves instantly, because
        // the PRE-drop state is already quiet — quiescence cannot distinguish settled-after from
        // not-started — and even gated behind the re-home it is too short, since the source removal
        // publishes several frames after the target paints.
        //
        // A `getDockTopology` call is a round-trip to the App Worker, so it is a genuine synchronisation
        // point. Requiring the committed document AND the rendered occupancy to be identical across
        // three consecutive round-trips gives real settle time derived from the engine rather than
        // guessed. It stays neutral: it never asks the source to be clean, so a surviving stale node
        // reaches the assertions instead of hanging the wait.
        let quiet = 0, previous = null;

        // The proxy is torn down on its own schedule after release. Its presence is unrelated to whether
        // the source removal published, so waiting for it is not a wait on the thing under test.
        await page.waitForSelector('.neo-dragproxy', {state: 'detached', timeout: 30000});

        for (let attempt = 0; attempt < 60 && quiet < 3; attempt++) {
            const doc      = (await app.getDockTopology(wsId)).document,
                  rendered = await readTabs(page),
                  sample   = JSON.stringify({
                      doc      : Object.entries(doc?.nodes || {})
                          .filter(([, node]) => node.type === 'tabs')
                          .map(([nodeId, node]) => [nodeId, [...(node.items || [])].sort()])
                          .sort(),
                      occupancy: rendered.map(entry => [entry.barId, [...entry.tabTexts].sort()]).sort()
                  });

            quiet    = sample === previous ? quiet + 1 : 0;
            previous = sample
        }

        expect(quiet, 'the projection must reach a settled state the arm can measure').toBeGreaterThanOrEqual(3);

        const after   = await readTabs(page),
              holders = after.filter(entry => entry.tabTexts.includes(subject));

        // NON-VACUITY, and the assertion this arm most needs. Every check below is satisfied by a
        // gesture that did nothing at all: if the release was a no-op the item never left its header,
        // occupancy stays at one, and the arm reports green against an untested code path. So prove the
        // move committed BEFORE trusting the occupancy result.
        // Order-INDEPENDENT: an earlier revision asserted `holders[0] !== origin`, but `holders` is in
        // DOM order, so with the defect present (both containers holding the subject) the origin could
        // sort first and the guard then misreported a committed drag as "committed nothing". Ask whether
        // the subject renders anywhere OTHER than its origin, which is the actual question.
        expect(
            holders.map(entry => entry.containerId).filter(id => id !== origin.containerId),
            `the drag must actually re-home the item — it renders only in its origin container ${origin.containerId}, so this gesture committed nothing and the assertions below prove nothing`
        ).not.toEqual([]);

        // Engine truth for the SOURCE container specifically. The DOM says its header still renders the
        // re-homed item; this asks the App Worker whether that button is a live child of the source's
        // toolbar or an orphaned node the projection left behind. The two have different fixes, and no
        // DOM census can tell them apart.
        const bars    = await app.findInstances({ntype: 'tab-header-toolbar'}, ['id']),
              barIds  = (Array.isArray(bars) ? bars : [bars]).map(entry => entry?.properties?.id ?? entry?.id),
              barRows = [];

        for (const barId of barIds.filter(Boolean)) {
            // `getTabButtons()` is the toolbar's OWN semantic tab predicate — the same one the
            // reconciler's arity guard consults. If it reports one button while the DOM renders two, the
            // extra node is outside the toolbar's tab set entirely, and the fix is a retirement problem
            // rather than a sort-index problem.
            const tabIds    = await app.callMethod(barId, 'getTabButtons', []).catch(() => null),
                  actionIds = await app.callMethod(barId, 'getActionItems', []).catch(() => null);

            barRows.push({
                actions: Array.isArray(actionIds) ? actionIds.length : actionIds,
                barId,
                tabs   : Array.isArray(tabIds) ? tabIds.length : tabIds
            })
        }

        console.log('[18025] engine per-bar semantic sets:', JSON.stringify(barRows));

        // The outlier bar, raw. A count told us the sets disagree; only the members say WHY — whether
        // those are repeats of one item, other containers' tabs, or stale buttons from the gesture.
        const outlier = barRows.find(row => row.tabs > (after.find(e => e.barId === row.barId)?.tabTexts.length ?? 0));

        if (outlier) {
            const raw = await app.callMethod(outlier.barId, 'getTabButtons', []).catch(error => ({error: String(error)}));

            const compact = (Array.isArray(raw) ? raw : []).map(button => ({
                hidden   : button.hidden,
                id       : button.id,
                mounted  : button.mounted,
                parentId : button.parentId,
                pressed  : (button.cls || []).includes('pressed'),
                removeDom: button.vdom?.removeDom ?? false,
                text     : button.vdom?.cn?.find(node => (node.cls || []).includes('neo-button-text'))?.text
            }));

            console.log('[18025] OUTLIER', outlier.barId, JSON.stringify(compact))
        }
        console.log('[18025] joined by barId:', JSON.stringify(after.map(e => ({
            bar      : e.barId,
            container: e.containerId,
            domTabs  : e.tabTexts,
            engine   : barRows.find(row => row.barId === e.barId) ?? '<no engine row for this bar>'
        }))));
        console.log('[18025] engine bars with no DOM row:', JSON.stringify(
            barRows.filter(row => !after.some(e => e.barId === row.barId))));

        // CROSS-BAR identity: is the leftover the same DOM node as the one under the new container, or
        // a distinct stale one? Same id in two bars means one subtree rendered twice; distinct ids mean
        // the old node was never removed. Different fixes, and a per-bar census cannot separate them.
        const idIndex = {};

        after.forEach(entry => entry.buttonIds.forEach(({id, text}) => {
            (idIndex[id] ??= {bars: [], text}).bars.push(entry.barId)
        }));

        console.log('[18025] node ids present in MORE THAN ONE bar:', JSON.stringify(
            Object.entries(idIndex).filter(([, v]) => v.bars.length > 1)
                .map(([id, v]) => ({bars: v.bars, id, text: v.text}))));
        console.log('[18025] every node rendering the subject:', JSON.stringify(
            Object.entries(idIndex).filter(([, v]) => v.text === subject)
                .map(([id, v]) => ({bars: v.bars, id}))));

        // The engine-truth control: if the document also lists the item twice the defect is in the
        // model, not the drag-end restore. Asserting only the DOM would leave that ambiguous.
        const document     = (await app.getDockTopology(wsId)).document,
              modelHolders = Object.entries(document.nodes || {})
                  .filter(([, node]) => node.type === 'tabs' && (node.items || []).includes('alerts'))
                  .map(([nodeId]) => nodeId);

        expect(
            modelHolders.length,
            `the committed document must hold the item in exactly one tabs node — ${JSON.stringify(modelHolders)}`
        ).toBe(1);

        expect(
            holders.map(entry => ({id: entry.containerId, tabs: entry.tabTexts})),
            `"${subject}" must render in exactly one container after the drop — ${JSON.stringify(after)}`
        ).toHaveLength(1);

        expect(
            after.filter(entry => entry.pressed.length > 1).map(entry => ({id: entry.containerId, pressed: entry.pressed})),
            `no header may render two active tabs — ${JSON.stringify(after)}`
        ).toEqual([]);

        // The mechanism assertion, and the one a per-bar census cannot make. The engine moved the
        // component correctly — `getTabButtons()` on the source no longer lists it — but its OLD DOM
        // node survives, so one element id is rendered under two bars at once. That is a duplicate id
        // in the document, not a second component.
        expect(
            Object.entries(idIndex).filter(([, entry]) => entry.bars.length > 1)
                .map(([id, entry]) => ({bars: entry.bars, id, text: entry.text})),
            'no tab button node may render under more than one header — a moved component must not leave its old node behind'
        ).toEqual([])
    })
});
