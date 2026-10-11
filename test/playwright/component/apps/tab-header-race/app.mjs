import Button       from '../../../../../src/button/Base.mjs';
import Neo          from '../../../../../src/Neo.mjs';
import TabContainer from '../../../../../src/tab/Container.mjs';
import VDomUpdate   from '../../../../../src/manager/VDomUpdate.mjs';
import Viewport     from '../../../../../src/container/Viewport.mjs';

/**
 * Drives a mid-flight update-depth escalation against a REAL tab header toolbar, in a real browser.
 *
 * `Component#show()` sets `parent.updateDepth = -1` and calls `parent.update()`, because a floating
 * widget mounting into its parent needs the full tree. When that lands inside the parent's own
 * collection yield the payload widens, and until this lane the in-flight registry still reported the
 * depth the cycle STARTED with — so `isParentUpdating` and `hasUpdateCollision`, which both read the
 * registry, answered every caller from a scope the payload no longer had.
 *
 * What that incoherence causes downstream is NOT asserted by this harness. A second overlapping
 * flight was hypothesised and measured not to occur.
 *
 * The sequence runs inside the App worker rather than being driven from the page: the window is a
 * single macrotask wide and every page-to-worker call is a round trip far longer than that.
 *
 * The report is a declared config so the spec can refuse a verdict it never observed. A run that
 * never entered the window would otherwise be green for the same reason a fixed one is.
 */
class RaceViewport extends Viewport {
    static config = {
        className: 'Test.TabHeaderRace.Viewport',
        ntype    : 'tab-header-race-viewport',

        /**
         * Set once the sequence has finished, whether or not it entered the window.
         * @member {Boolean} raceComplete_=false
         */
        raceComplete_: false,
        /**
         * @member {Object|null} raceReport_=null
         */
        raceReport_: null
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted?.(value, oldValue);
        value && !oldValue && this.runRace()
    }

    async runRace() {
        try {
            await this.driveRace()
        } catch (error) {
            this.raceReport  = {windowEntered: false, error: error.message};
            this.raceComplete = true
        }
    }

    async driveRace() {
        const me     = this,
              tabs   = Neo.getComponent('race-tab-container'),
              tabBar = tabs.getTabBar();

        await me.timeout(400);

        // Capture the real tab buttons before the action joins the bar. Their ids are minted by
        // tab.Container, not taken from `tabButtonConfig`, so naming them here would be a guess.
        const [, tabBeta] = tabBar.items;

        // A header action that starts hidden. Becoming visible runs Component#show().
        const action = Neo.create(Button, {
            appName : tabBar.appName,
            id      : 'race-header-action',
            hideMode: 'removeDom',
            hidden  : true,
            iconCls : 'fa fa-lock',
            windowId: tabBar.windowId
        });

        tabBar.add(action);
        await me.timeout(300);

        // Drain one cycle. `getVdomUpdatePayload` resets the depth by writing `_updateDepth`, so a
        // bar that has ever been at -1 stays there until one payload is collected — without this
        // the second cycle would open at -1 and there would be no disagreement to create.
        tabBar.updateDepth = 1;
        tabBar.update();
        await me.timeout(250);

        // Open the second cycle and step into it.
        tabBar.update();

        for (let i = 0; i < 60 && !tabBar.isVdomUpdating; i++) {
            await me.timeout(0)
        }

        const registeredBefore = VDomUpdate.getInFlightUpdateDepth(tabBar.id) ?? null,
              windowEntered    = tabBar.isVdomUpdating && registeredBefore === 1;

        let escalation = null;

        if (windowEntered) {
            action.hidden = false;                                  // the real Component#show()

            // Sampled HERE, not after the settle. `getVdomUpdatePayload` resets the depth once the
            // payload is collected, so a reading taken after the cycle reports the config default
            // and would call a broken build healthy.
            escalation = {
                live      : tabBar.updateDepth,
                registered: VDomUpdate.getInFlightUpdateDepth(tabBar.id) ?? null
            };

            tabBeta.text = 'Beta changed'                           // the sibling write
        }

        await me.timeout(600);

        // ---------------------------------------------------------------------------------------
        // The behavioural half: does a sibling actually OPEN a second flight?
        //
        // The write above is absorbed before it can answer that. `update()` tries
        // `mergeIntoParentUpdate` BEFORE `isParentUpdating`, and a write issued while the parent is
        // still collecting is merged — so it never reaches the collision check at all. That is why
        // the sibling arm was removed from the unit spec: it passed with the hook disabled.
        //
        // `beforeExecuteVdomUpdate` fires AFTER collection and immediately before dispatch. A write
        // issued there finds the parent's `needsVdomUpdate` already false, so the merge declines it
        // and it falls through to `isParentUpdating` — the seam itself. Without the hook the registry
        // still reads 1, `hasUpdateCollision(1, 1)` is false, and the action opens its own flight
        // over a subtree the parent is about to insert. With the hook it reads -1 and is queued.
        //
        // Seam identified by @neo-gpt in review; the merge-before-collision ordering is why the
        // obvious placement could never have shown it.
        // ---------------------------------------------------------------------------------------
        let postCollection = null;

        if (windowEntered) {
            const hiddenAction = Neo.create(Button, {
                appName : tabBar.appName,
                id      : 'race-post-collection-action',
                hideMode: 'removeDom',
                hidden  : true,
                iconCls : 'fa fa-thumbtack',
                windowId: tabBar.windowId
            });

            tabBar.add(hiddenAction);
            await me.timeout(300);

            // Drain again so the next cycle opens at the default depth rather than at -1.
            tabBar.updateDepth = 1;
            tabBar.update();
            await me.timeout(250);

            let fired = false;

            tabBar.beforeExecuteVdomUpdate = function() {
                if (fired) return;
                fired = true;

                hiddenAction.hidden = false;   // escalates the bar to -1, post-collection
                hiddenAction.update();         // the write that must reach isParentUpdating

                postCollection = {
                    registered      : VDomUpdate.getInFlightUpdateDepth(tabBar.id) ?? null,
                    siblingOpenedOwn: hiddenAction.isVdomUpdating === true
                }
            };

            tabBar.update();
            await me.timeout(700);

            delete tabBar.beforeExecuteVdomUpdate;

            postCollection &&= {...postCollection, hookFired: fired}
        }

        me.raceReport = {
            windowEntered,
            registeredBefore,
            escalation,
            postCollection,
            tabButtonIds: tabBar.items.map(item => item.id)
        };

        me.raceComplete = true
    }
}

RaceViewport = Neo.setupClass(RaceViewport);

export const onStart = () => Neo.app({
    mainView: {
        module: RaceViewport,
        id    : 'tab-header-race-viewport',

        items: [{
            module     : TabContainer,
            activeIndex: 0,
            height     : 300,
            id         : 'race-tab-container',
            width      : 600,

            items: [
                {module: Button, id: 'race-body-alpha', text: 'Alpha body', tabButtonConfig: {id: 'race-tab-alpha', text: 'Alpha'}},
                {module: Button, id: 'race-body-beta',  text: 'Beta body',  tabButtonConfig: {id: 'race-tab-beta',  text: 'Beta'}}
            ]
        }]
    },

    name: 'Test.Playwright.TabHeaderRace'
});
