import Component from '../../../../../src/component/Base.mjs';

/**
 * @summary The lazily loaded rail pane: nothing in the fixture's boot graph imports this file, so
 * its class registration in the Neo namespace is the load witness, and its construction count is
 * the identity witness (one instance across dismiss / re-reveal).
 * @class Test.Playwright.Component.DockLazyRail.LazyPane
 * @extends Neo.component.Base
 */
class LazyPane extends Component {
    /**
     * Constructions of this class — read through the fixture workspace's `lazyPaneInstances`.
     * @member {Number} instances=0
     * @static
     */
    static instances = 0

    /**
     * One captured call site per construction, in order — read through the fixture workspace's
     * `lazyPaneConstructionTrail`.
     *
     * A count says a second construction happened; it cannot say who caused it. Two callers may
     * legitimately load this pane (`layout.Card#afterSetActiveIndex` on activation, and
     * `container.Base#insert` when the inserted index is already active), so the identity of the
     * second one is the whole diagnostic — and #18275's window only opens on a loaded CI runner,
     * where nobody is attached to inspect it. Capturing the site at construction is what lets the
     * next natural occurrence name its own cause instead of leaving it to be deduced from a tally.
     * @member {String[]} constructionTrail=[]
     * @static
     */
    static constructionTrail = []

    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.DockLazyRail.LazyPane'
         * @protected
         */
        className: 'Test.Playwright.Component.DockLazyRail.LazyPane',
        /**
         * @member {String} ntype='dock-lazy-rail-pane'
         * @protected
         */
        ntype: 'dock-lazy-rail-pane',
        /**
         * @member {String[]} baseCls=['dock-lazy-rail-pane']
         */
        baseCls: ['dock-lazy-rail-pane']
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let sCfg = this.constructor;

        sCfg.instances++;
        // The frames above `construct` are the caller chain that reached `Neo.create`, which is the
        // only thing that distinguishes an activation-driven load from an insert-driven one.
        sCfg.constructionTrail.push(new Error(`construction #${sCfg.instances}`).stack)
    }
}

export default Neo.setupClass(LazyPane);
