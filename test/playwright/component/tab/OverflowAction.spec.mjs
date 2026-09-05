import {test, expect} from '@playwright/test';

const TAB_ID = 'overflow-action-tab-container';

let componentId = null;

/**
 * Creates a real TabContainer whose Overflow plugin contributes into a host/close action rail.
 * @param {Object} page
 * @returns {Promise<String>}
 */
async function createTabContainer(page) {
    const result = await page.evaluate(async id => {
        const loaded = await Neo.worker.App.loadModule({path: '../tab/plugin/Overflow.mjs'});

        if (!loaded.success) {
            throw new Error(`Overflow module load failed: ${loaded.error?.message}`)
        }

        return Neo.worker.App.createNeoInstance({
            activeIndex  : 0,
            height       : 240,
            headerActions: [{
                action     : 'host-action',
                iconCls    : 'fa fa-star',
                showOnFocus: false
            }, {
                action     : 'close',
                iconCls    : 'fa fa-times',
                showOnFocus: false
            }],
            headerToolbar: {
                plugins: [{ntype: 'plugin-tab-overflow', projectAsAction: true}]
            },
            id,
            importPath: '../tab/Container.mjs',
            items     : Array.from({length: 8}, (_, index) => ({
                header: {text: `Tab ${index + 1}`},
                ntype : 'component',
                text  : `Content ${index + 1}`
            })),
            ntype   : 'tab-container',
            parentId: 'component-test-viewport',
            width   : 380
        })
    }, TAB_ID);

    if (!result.success) {
        throw new Error(`TabContainer creation failed: ${result.error.message}`)
    }

    return result.id
}

/**
 * Creates a TabContainer whose rail carries one focus-gated action between two persistent ones.
 * @param {Object} page
 * @returns {Promise<String>}
 */
async function createGatedTabContainer(page) {
    return page.evaluate(async id => {
        const result = await Neo.worker.App.createNeoInstance({
            activeIndex  : 0,
            height       : 240,
            headerActions: [{
                action     : 'host-action',
                iconCls    : 'fa fa-star',
                showOnFocus: false
            }, {
                // Focus-gated: the subject of the arms using this fixture.
                action : 'gated-action',
                iconCls: 'fa fa-thumbtack'
            }, {
                action     : 'close',
                iconCls    : 'fa fa-times',
                showOnFocus: false
            }],
            headerToolbar: {plugins: [{ntype: 'plugin-tab-overflow', projectAsAction: true}]},
            id,
            importPath   : '../tab/Container.mjs',
            items        : Array.from({length: 8}, (_, index) => ({
                header: {text: `Tab ${index + 1}`},
                ntype : 'component',
                text  : `Content ${index + 1}`
            })),
            ntype   : 'tab-container',
            parentId: 'component-test-viewport',
            width   : 380
        });

        if (!result.success) {
            throw new Error(`gated TabContainer creation failed: ${result.error.message}`)
        }

        return result.id
    }, TAB_ID)
}

/** Returns the action-root ids in rendered toolbar order. */
const actionIds = toolbar => toolbar.locator(':scope > .neo-toolbar-action')
    .evaluateAll(nodes => nodes.map(node => node.id));

/** Replaces consumer actions through the public TabContainer config path. */
const replaceHeaderActions = (page, suffix) => page.evaluate(({id, suffix}) =>
    Neo.worker.App.setConfigs({
        id,
        headerActions: [{
            action     : `host-${suffix}`,
            iconCls    : 'fa fa-bolt',
            showOnFocus: false
        }, {
            action     : 'close',
            iconCls    : 'fa fa-times',
            showOnFocus: false
        }]
    }), {id: TAB_ID, suffix});

test.describe('Neo.tab.plugin.Overflow — toolbar action projection', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        componentId = await createTabContainer(page);
        await page.waitForSelector(`#${componentId}`, {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        if (componentId) {
            await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
            componentId = null
        }
    });

    test('renders first, outside focus gating, with measured non-overlap and ordinary menu activation', async ({page}) => {
        const errors = [];

        page.on('pageerror', error => errors.push(String(error?.message || error)));

        const root    = page.locator(`#${TAB_ID}`),
              toolbar = root.locator(':scope > .neo-tab-header-toolbar'),
              control = toolbar.getByRole('button', {name: 'More tabs', exact: true}),
              host    = toolbar.getByRole('button', {name: 'host action', exact: true}),
              close   = toolbar.getByRole('button', {name: 'close', exact: true});

        // Every wait below carries its own budget AND its own sentence, because this arm's CI failures
        // arrive as a bare `(30.0s)` with no assertion and therefore name nothing. The cause of that
        // silence is arithmetic: the config declares no `timeout`, so Playwright's 30s default applies,
        // and the arm's original waits were 10s + 10s + 10s — the ceiling exactly. Whichever wait
        // stretched, the TEST died before that wait could exhaust its own budget and speak. The two
        // `.click()` calls were worse: no override at all, so they inherited whatever remained.
        //
        // The budgets here sum to 24s. That headroom is the whole mechanism: while the sum stays under
        // the ceiling, a single stretched wait is guaranteed to exhaust its OWN budget first and name
        // itself, which is the property the original 10+10+10 destroyed.
        //
        // They are deliberately loose rather than tight. Locally this arm completes in ~410ms total —
        // the fastest of the five here, 12/12 under `--repeat-each` — so every budget below is 7-20x
        // the observed cost. Tightening them further would attribute a failure more precisely at the
        // risk of turning a rare CI flake into a frequent red, which trades a diagnosis problem for a
        // worse one. `control` keeps the largest share because it is the only wait exposed to cold
        // boot.
        //
        // This does NOT claim to fix the stretch. It is not reproducible off-CI and remains
        // unexplained; what changes is that the next CI failure reports which waiter did not resolve
        // instead of dying anonymously at the ceiling.
        await expect(control, 'overflow control renders (cold boot)').toBeVisible({timeout: 8000});
        await expect(host, 'host action renders').toBeVisible({timeout: 2000});
        await expect(close, 'close action renders').toBeVisible({timeout: 2000});
        await expect(control).not.toHaveClass(/neo-toolbar-action-context-inactive/);
        await expect(control).not.toHaveAttribute('aria-hidden');
        await expect(page.locator('body > .neo-tab-overflow-control')).toHaveCount(0);

        const ids = await actionIds(toolbar);

        expect(ids[0], 'Overflow owns the first action slot').toBe(await control.getAttribute('id'));
        expect(ids.at(-1), 'close remains the final action').toBe(await close.getAttribute('id'));

        const visibleTabs = toolbar.locator(':scope > .neo-tab-header-button:visible'),
              lastTab     = visibleTabs.last(),
              tabBox      = await lastTab.boundingBox(),
              controlBox  = await control.boundingBox();

        expect(tabBox.x + tabBox.width,
            'the visible tab partition ends before the measured contribution').toBeLessThanOrEqual(controlBox.x + 1);

        // A click waits for actionability — visible, stable, receives events — and an unbounded one on
        // a surface that keeps re-rendering hangs until the test ceiling with nothing to report. That
        // is the shape this arm kept failing in, so both clicks are bounded and named.
        await control.click({timeout: 3000});

        const menuItem = page.locator('.neo-tab-overflow-menu:visible .neo-list-item').first();

        await expect(menuItem, 'overflow menu opens with at least one item').toBeVisible({timeout: 3000});

        const selected = (await menuItem.innerText()).trim();

        await menuItem.click({timeout: 3000});
        await expect(toolbar.locator('.neo-tab-header-button.pressed:visible').filter({hasText: selected}),
            `menu activation presses the "${selected}" tab`).toHaveCount(1, {timeout: 3000});
        expect(errors).toEqual([])
    });

    test('preserves one instance across visible and all-fit consumer action replacements', async ({page}) => {
        const root    = page.locator(`#${TAB_ID}`),
              toolbar = root.locator(':scope > .neo-tab-header-toolbar'),
              control = toolbar.getByRole('button', {name: 'More tabs', exact: true});

        await expect(control).toBeVisible({timeout: 10000});

        const controlId = await control.getAttribute('id');

        await replaceHeaderActions(page, 'visible');
        await expect(toolbar.getByRole('button', {name: 'host visible', exact: true})).toBeVisible();
        expect((await actionIds(toolbar))[0]).toBe(controlId);
        await expect(toolbar.locator(`#${controlId}`)).toHaveCount(1);

        await page.evaluate(id => Neo.worker.App.setConfigs({id, width: 1200}), TAB_ID);
        await expect(toolbar.locator(`#${controlId}`), 'all-fit hides the contribution from DOM')
            .toHaveCount(0, {timeout: 10000});

        await replaceHeaderActions(page, 'hidden');
        await expect(toolbar.getByRole('button', {name: 'host hidden', exact: true})).toBeVisible();

        await page.evaluate(id => Neo.worker.App.setConfigs({id, width: 380}), TAB_ID);

        const restored = toolbar.locator(`#${controlId}`);

        await expect(restored, 'the pre-overflow contribution instance returns after replacement')
            .toBeVisible({timeout: 10000});
        await expect(toolbar.locator('.neo-tab-overflow-control')).toHaveCount(1);

        const ids = await actionIds(toolbar);

        expect(ids[0]).toBe(controlId);
        expect(ids.at(-1)).toBe(await toolbar.getByRole('button', {name: 'close', exact: true}).getAttribute('id'));

        await restored.click();

        const menuItem = page.locator('.neo-tab-overflow-menu:visible .neo-list-item').first();

        await expect(menuItem, 'the recovered contribution keeps its ordinary menu route')
            .toBeVisible({timeout: 10000});

        const selected = (await menuItem.innerText()).trim();

        await menuItem.click();
        await expect(toolbar.locator('.neo-tab-header-button.pressed:visible').filter({hasText: selected}),
            'selection still activates through activeIndex after the hidden replacement').toHaveCount(1)
    });

    test('the restored split settles once — no pass re-applies a superseded extent', async ({page}) => {
        const root    = page.locator(`#${TAB_ID}`),
              toolbar = root.locator(':scope > .neo-tab-header-toolbar'),
              control = toolbar.getByRole('button', {name: 'More tabs', exact: true});

        await expect(control).toBeVisible({timeout: 10000});

        const controlId = await control.getAttribute('id');

        await replaceHeaderActions(page, 'visible');
        await expect(toolbar.getByRole('button', {name: 'host visible', exact: true})).toBeVisible();

        await page.evaluate(id => Neo.worker.App.setConfigs({id, width: 1200}), TAB_ID);
        await expect(toolbar.locator(`#${controlId}`), 'all-fit hides the contribution from DOM')
            .toHaveCount(0, {timeout: 10000});

        await replaceHeaderActions(page, 'hidden');
        await expect(toolbar.getByRole('button', {name: 'host hidden', exact: true})).toBeVisible();

        await page.evaluate(id => Neo.worker.App.setConfigs({id, width: 380}), TAB_ID);

        // A retrying assertion cannot witness a transient — it polls until the contribution returns and
        // then stops looking, which is why the sibling arm above races this defect instead of pinning it.
        // So sample from the moment the width is set, WITHOUT waiting for the restore first: record every
        // distinct state of the action group, then assert against the recorded sequence. Waiting for the
        // contribution before sampling would let the flap happen inside the wait and go unrecorded.
        const states = [];

        for (let i = 0; i < 80; i++) {
            const ids = (await actionIds(toolbar)).join(',');

            states.at(-1) !== ids && states.push(ids);
            await page.waitForTimeout(25)
        }

        const restoredAt = states.findIndex(state => state.split(',').includes(controlId));

        expect(restoredAt, 'the contribution returns after the narrow resize').toBeGreaterThan(-1);

        // Once it is back it must STAY back. A later state without it means a projection pass applied a
        // verdict measured against the superseded (wide) extent, taking the contribution out of the DOM
        // and the overflowing tabs back into it — a state that reads as coherent because it is one.
        const afterRestore = states.slice(restoredAt);

        expect(afterRestore.filter(state => !state.split(',').includes(controlId)),
            'no pass re-applies a superseded extent once the contribution is restored').toEqual([]);
        expect(afterRestore.at(-1).split(',')[0], 'the contribution holds the first action slot')
            .toBe(controlId)
    });

    test('a withdrawn focus-gated action contributes no extent to the partition', async ({page}) => {
        // The other arms in this file use `showOnFocus: false` throughout, so none of them exercise
        // the plugin against a withdrawn action. This one does: a gated action has no DOM node while
        // withdrawn, and the plugin must therefore EXCLUDE it from measurement rather than measure
        // it. This measurement reads each rect's POSITION as well as its size — a missing or all-zero
        // rect places the action cluster at offset 0 and consumes the whole strip, collapsing every
        // tab into the overflow menu.
        await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);

        // This arm is the only one that replaces the shared `beforeEach` container, and it reuses the
        // same id. Resolving the worker-side destroy does NOT mean the DOM is gone: the removal travels
        // to main as a separate message, so re-creating immediately can mount the new header while the
        // old one is still attached. Two toolbars then answer to one id and the strict-mode locators
        // below abort on arity — and the orphan outlives the test, because the App Worker is shared, so
        // the casualty surfaces in whatever spec runs next. Await the detach; it is the actual barrier.
        await page.waitForSelector(`#${TAB_ID}`, {state: 'detached'});

        componentId = await createGatedTabContainer(page);

        await page.waitForSelector(`#${componentId}`, {state: 'attached'});

        const root      = page.locator(`#${TAB_ID}`),
              toolbar   = root.locator(':scope > .neo-tab-header-toolbar'),
              control   = toolbar.getByRole('button', {name: 'More tabs', exact: true}),
              gated     = toolbar.locator(':scope > .neo-toolbar-action:has(.fa-thumbtack)'),
              tabs      = toolbar.locator(':scope > .neo-tab-header-button'),
              toolbarId = await toolbar.getAttribute('id'),
              setGate   = visible => page.evaluate(
                  ({id, visible}) => Neo.worker.App.setConfigs({id, contextualActionsVisible: visible}),
                  {id: toolbarId, visible}
              );

        // A standalone container holds no focus, so a gated action is absent from the first paint.
        // Revealing it once is the read that proves the fixture projected it at all.
        await setGate(true);
        await expect(gated, 'the gated action is projected').toHaveCount(1);
        await expect(control, 'precondition: the strip overflows, so a partition exists to lose')
            .toBeVisible({timeout: 10000});

        // The withdrawn state is pinned through the SAME reactive config the focus wiring writes
        // (`toolbar.Base#contextualActionsVisible`), rather than by moving real focus. A standalone
        // container has no focus subject holding focus, so driving the config is what makes the
        // state deterministic here — and it is the identical state, not a proxy for it.
        await setGate(false);
        await expect(gated, 'the action is withdrawn: no node at all').toHaveCount(0);

        // Force a re-partition WHILE the action is collapsed. Toggling the gate alone does not
        // re-measure, and the all-zero-rect defect only surfaces on a measurement pass: without
        // this the arm passes whether or not the plugin excludes collapsed actions, which is the
        // vacuity this control exists to remove.
        await page.evaluate(id => Neo.worker.App.setConfigs({id, width: 1200}), TAB_ID);
        await expect(toolbar.locator('.neo-tab-overflow-control'), 'all-fit retires the contribution')
            .toHaveCount(0, {timeout: 10000});
        await page.evaluate(id => Neo.worker.App.setConfigs({id, width: 380}), TAB_ID);

        // Withdrawn: no node at all, so it cannot be measured into the strip extent. (`boundingBox()`
        // auto-waits for an element and would time out here; the count is the honest read.)
        await expect(gated, 'a withdrawn action occupies no space: it has no node').toHaveCount(0);

        // The partition stays usable. This is the assertion that reds when the plugin measures the
        // collapsed action's all-zero rect: the cluster is then placed at offset 0, the strip reads
        // as fully consumed, and every non-active tab is driven into the menu.
        await expect(control, 'the overflow control is contributed').toHaveCount(1);
        expect(await tabs.count(), 'direct tabs remain reachable without opening the menu')
            .toBeGreaterThan(1);

        const directTabs = await tabs.count();

        // Revealing it must not break the invariants the other arms protect.
        await setGate(true);
        await expect(gated, 'the reveal exposes the gated action').not.toHaveClass(/neo-toolbar-action-context-inactive/);
        expect(await gated.boundingBox(), 'and revealing it gives it a box').not.toBeNull();

        await expect(control, 'the overflow control survives the reveal').toHaveCount(1);
        await expect(toolbar.locator(':scope > .neo-tab-header-button.pressed'),
            'exactly one tab stays active across the reveal').toHaveCount(1);
        expect(await tabs.count(), 'the reveal may repartition, but never empties the strip')
            .toBeGreaterThan(0);
        expect(directTabs, 'precondition sanity: the withdrawn state had a real partition to lose')
            .toBeGreaterThan(1)
    });

    /**
     * The collapse used to be one (0,2,0) engine rule, `display: none` on the inactive class, and
     * any viewport-scoped consumer rule on `.neo-toolbar-action` outranked it silently — ghost
     * verbs reserving space on every resting rail. The invariant is now DOM absence on the retained
     * instance, so the falsifier is consumer CSS at the weights that actually shipped: the second
     * occurrence's (0,5,0) hit-area rule, the minimal viewport-scoped (0,3,0) shape, and the
     * `!important` a consumer reaches for next.
     */
    test('consumer CSS of any weight cannot resurrect a withdrawn action', async ({page}) => {
        await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
        await page.waitForSelector(`#${TAB_ID}`, {state: 'detached'});

        componentId = await createGatedTabContainer(page);
        await page.waitForSelector(`#${componentId}`, {state: 'attached'});

        const root      = page.locator(`#${TAB_ID}`),
              toolbar   = root.locator(':scope > .neo-tab-header-toolbar'),
              host      = toolbar.locator(':scope > .neo-toolbar-action:has(.fa-star)'),
              gated     = toolbar.locator(':scope > .neo-toolbar-action:has(.fa-thumbtack)'),
              control   = toolbar.getByRole('button', {name: 'More tabs', exact: true}),
              tabs      = toolbar.locator(':scope > .neo-tab-header-button'),
              toolbarId = await toolbar.getAttribute('id'),
              setGate   = visible => page.evaluate(
                  ({id, visible}) => Neo.worker.App.setConfigs({id, contextualActionsVisible: visible}),
                  {id: toolbarId, visible}
              ),
              display   = locator => locator.evaluate(node => getComputedStyle(node).display);

        // Author-origin and last in source order: every tie a class rule could enter, these win.
        await page.addStyleTag({content: `
            .neo-viewport .neo-tab-container .neo-tab-header-toolbar .neo-button.neo-toolbar-action { display: inline-flex; min-width: 24px; }
            .neo-viewport .neo-toolbar .neo-toolbar-action { display: inline-flex; }
            .neo-toolbar-action { display: flex !important; }
        `});

        // Positive control: the consumer stylesheet is live on the actions that ARE offered.
        expect(await display(host), 'the consumer rule paints the persistent action').toBe('flex');

        await setGate(true);
        await expect(gated).toHaveCount(1);

        const revealedId = await gated.getAttribute('id');

        expect(await display(gated), 'and the revealed gated action alike').toBe('flex');

        await setGate(false);

        // The invariant: no node, so no rule can give it a box. `toBeHidden` would also pass for a
        // node the stylesheet had resurrected but pushed off-screen; count is the honest read.
        await expect(gated, 'withdrawn under (0,5,0), (0,3,0) and !important consumer rules').toHaveCount(0);

        // The partition keeps its direct tabs while the strip is re-measured against the resting rail.
        await page.evaluate(id => Neo.worker.App.setConfigs({id, width: 1200}), TAB_ID);
        await expect(toolbar.locator('.neo-tab-overflow-control')).toHaveCount(0, {timeout: 10000});
        await page.evaluate(id => Neo.worker.App.setConfigs({id, width: 380}), TAB_ID);
        await expect(control, 'the overflow control is contributed').toHaveCount(1);
        expect(await tabs.count(), 'direct tabs remain reachable').toBeGreaterThan(1);

        // Reveal restores the same instance: same node id, same accessible name, consumer paint applied.
        await setGate(true);
        await expect(gated).toHaveCount(1);
        expect(await gated.getAttribute('id'), 'the retained instance came back, not a replacement').toBe(revealedId);
        await expect(gated).toHaveAttribute('aria-label', 'gated action');
        expect(await display(gated)).toBe('flex')
    })
});
