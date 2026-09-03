import {test, expect} from '@playwright/test';

/**
 * The preview overlay's own geometry, measured on a host that declares nothing but the positioning
 * context — the shape a downstream consumer arrives at by reading the docs and stopping there.
 *
 * A dock host lays out `fit`, so a preview the engine never positions is an in-flow
 * `.neo-layout-fit-item` at `flex: 1 0 100%` — a second full host width in the flex row. The host
 * then stays programmatically scrollable behind `overflow-x: hidden`, and any focus or
 * scroll-into-view aimed past the first width shifts the whole workspace out to the left. Nothing
 * scrolls it back: the preview keeps the overflow alive after the re-projection has retired the old
 * shell, so the displacement is permanent until a reload.
 *
 * **Why the fixture carries no stylesheet.** Every shipping consumer either wrote the missing rule
 * or copied it from one that had, so none of them can witness what the engine owes a host that did
 * neither. A fixture with an app sheet would pass whether or not the engine sheet positions the
 * preview, which is the failure mode this file exists to make impossible.
 *
 * **Why `scrollWidth === clientWidth` is the assertion.** It reads the CAUSE. The visible symptom is
 * a displaced shell — but a shell can be displaced for other reasons, and it can also sit correctly
 * at x=0 while the overflow quietly persists, waiting for the next focus call. The shell's position
 * is asserted too, as the consequence; the overflow is asserted as the thing that must not exist.
 *
 * @see https://github.com/neomjs/neo/issues/18142
 */

const HOST = '.dock-preview-geometry-host';

const WORKSPACE_ID = 'dock-preview-geometry-workspace';

/**
 * Reads the host's overflow state together with the preview's computed position, in one evaluate so
 * every number describes the same frame.
 * @param {Object} page
 * @returns {Promise<Object>}
 */
const readSettleState = async page => {
    const reply = await page.evaluate(data => Neo.worker.App.getConfigs(data),
        {id: WORKSPACE_ID, keys: ['dockProjectionBusy', 'dockProjectionSettles']});

    // `getConfigs` answers POSITIONALLY, in `keys` order — not as an object.
    const [busy, settles] = reply?.data ?? reply ?? [];

    return {busy, settles}
};

const readHostGeometry = page => page.evaluate(host => {
    const el      = document.querySelector(host),
          preview = el?.querySelector(':scope > .neo-dock-preview'),
          shell   = el?.querySelector(':scope > .neo-dashboard-dock-tabs, :scope > .neo-layout-fit-item');

    return {
        clientWidth : el?.clientWidth,
        hostLeft    : el?.getBoundingClientRect().left,
        position    : preview && getComputedStyle(preview).position,
        present     : !!preview,
        scrollLeft  : el?.scrollLeft,
        scrollWidth : el?.scrollWidth,
        shellLeft   : shell?.getBoundingClientRect().left,
        shellPresent: !!shell
    }
}, HOST);

const readGeometry = async page => {
    // The settle state travels WITH the geometry so a failure can be read. Before this, a red was
    // ambiguous between a mid-stage measurement and a genuine strand, and the team resolved that by
    // re-running — which destroys the log that would have settled it. Carrying `settles`/`busy` into
    // the failure output means the message itself says which one happened.
    const {busy, settles} = await readSettleState(page);

    return {...await readHostGeometry(page), projectionBusy: busy, projectionSettles: settles}
};


test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-preview-geometry/index.html');
    await page.waitForSelector('#dock-preview-geometry-workspace', {state: 'attached'});
    await expect(page.locator(`${HOST} .neo-dock-preview`)).toBeAttached({timeout: 10000});

    // Wait for the projection to SETTLE, not merely for the preview to attach. The reconciler
    // stages the next shell as a hidden sibling before retiring the old one, so for the duration of
    // that transaction the host legitimately holds two full-width shells — and `scrollWidth` is
    // then 2x `clientWidth` for a correct reason. Measuring inside that window reads a transient as
    // the defect.
    //
    // The settle signal is deliberately NOT `scrollWidth`, which is the property under test — that
    // would make the arms below vacuous, waiting for exactly what they claim to prove.
    //
    // It is no longer the host's CHILD COUNT either. That guard polled for the at-rest value of 3,
    // and 3 is the at-rest count on BOTH sides of a projection: satisfied before staging begins and
    // again after it settles. `expect.poll` returns on its first satisfying sample, so it could pass
    // pre-transaction and hand control to a measurement that then landed mid-stage. It waited for a
    // STATE the timeline visits twice rather than for the TRANSITION it means to witness — which is
    // why a red here was ambiguous between a harness race and a real regression, and why the team
    // resolved it by re-running.
    //
    // The fixture now reports the transition directly. `dockProjectionSettles` counts projections
    // that ran to completion, so it cannot be satisfied before one has; `dockProjectionBusy` closes
    // the remaining hole, since two equal counter samples could otherwise bracket a refresh that
    // started after the first and had not finished by the second. The pair describes a state that
    // exists only AFTER a projection completed and while none is running.
    await expect.poll(async () => {
        const reply = await page.evaluate(data => Neo.worker.App.getConfigs(data),
            {id: WORKSPACE_ID, keys: ['dockProjectionBusy', 'dockProjectionSettles']});

        // `getConfigs` answers POSITIONALLY, in `keys` order — not as an object. Destructuring by
        // name yields undefined for both, and the poll then never satisfies.
        const [busy, settles] = reply?.data ?? reply ?? [];

        return settles > 0 && busy === false
    }, {timeout: 10000}).toBe(true)
});

test.describe('the settle guard survives a FAILED projection', () => {
    // Found in review: the first version set `dockProjectionBusy` in `beforeRefreshDockWorkspace`
    // and cleared it in `afterRefreshDockWorkspace`, which LATCHES. `refreshDockWorkspace` returns
    // early on the projection-failure path — deliberately, since `afterRefreshDockWorkspace`
    // consumers read `result` as a completed projection — so the only clear never ran and the guard
    // could never satisfy again. Every arm would then die on a 10s poll timeout, which reads as a
    // hang rather than as a failed projection: the very ambiguity this file exists to remove,
    // reintroduced one layer up.
    //
    // The fixture brackets the whole refresh in `finally` instead of pairing two hooks, so the
    // clear cannot be skipped by ANY exit — the early return, the destroyed guard, or a throw.
    test('a projection that throws leaves the guard satisfiable', async ({page}) => {
        await page.goto('test/playwright/component/apps/dock-preview-geometry/index.html');
        await page.waitForSelector(`#${WORKSPACE_ID}`, {state: 'attached'});
        await expect.poll(async () => (await readSettleState(page)).busy, {timeout: 10000}).toBe(false);

        // Arm one failing projection, then commit a real document change to trigger a refresh.
        await page.evaluate(id => Neo.worker.App.setConfigs({id, failNextProjection: true}), WORKSPACE_ID);
        await page.evaluate(id => Neo.worker.App.setConfigs({
            id, applyOperationJson: JSON.stringify({operation: 'setActiveItem', tabsNodeId: 'root', itemId: 'aside'})
        }), WORKSPACE_ID);

        // The assertion is the ABSENCE of a latch, so it must be given time to latch if it can.
        await page.waitForTimeout(1200);

        expect((await readSettleState(page)).busy, 'a failed projection must not latch the guard').toBe(false)
    })
});

test.describe('Neo.dashboard.dock.interaction.Preview — the overlay carries its own geometry (#18142)', () => {
    test('a host that declares only position:relative gets no overflow from the preview', async ({page}) => {
        const geometry = await readGeometry(page);

        // Non-vacuity first: with no preview and no shell every assertion below is trivially true,
        // and this fixture would report a pass for an engine sheet that positions nothing.
        expect(geometry.present,      'the preview overlay must exist for this to measure anything').toBe(true);
        expect(geometry.shellPresent, 'the projected shell must exist for the same reason').toBe(true);
        expect(geometry.clientWidth,  'the host must have laid out').toBeGreaterThan(0);

        // AC-4: name the state this measurement was taken in. A red below now means a STRANDED
        // shell or an in-flow preview — never "measured too early", because a projection has
        // completed and none is running. Asserting it here puts that fact in the failure output.
        expect(geometry.projectionSettles, 'at least one projection has completed').toBeGreaterThan(0);
        expect(geometry.projectionBusy, 'and none is in flight — so a red below is a real defect, not a race').toBe(false);

        expect(geometry.position, 'the engine sheet positions the preview root').toBe('absolute');

        // The cause. An in-flow preview adds a full host width to the flex row; an absolute one
        // adds none, so the host has no overflow to be scrolled into.
        expect(geometry.scrollWidth, 'the preview must not make the fit host scrollable')
            .toBe(geometry.clientWidth);

        // The consequence, asserted separately: a host that cannot scroll cannot strand its shell.
        expect(geometry.scrollLeft, 'the host rests unscrolled').toBe(0);
        expect(Math.abs(geometry.shellLeft - geometry.hostLeft),
            'the shell sits at the host\'s left edge').toBeLessThanOrEqual(1)
    });

    test('a scroll forced onto the host cannot survive, because there is nowhere to scroll to', async ({page}) => {
        // The defect was never the scroll itself — the reconciler legitimately stages two shells for
        // a few frames, so a transient scroll is expected. It was that the preview kept the overflow
        // alive afterwards, so the scroll had somewhere to persist. Driving one directly is the
        // sharper witness: with the overlay out of the flow the host clamps straight back to 0.
        const settled = await page.evaluate(host => {
            const el = document.querySelector(host);

            el.scrollLeft = 5000;

            return {attempted: 5000, scrollLeft: el.scrollLeft, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth}
        }, HOST);

        expect(settled.scrollWidth, 'still no overflow after the attempt').toBe(settled.clientWidth);
        expect(settled.scrollLeft,  'the host clamps back to its only valid scroll position').toBe(0)
    })
});
