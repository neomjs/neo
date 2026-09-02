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
        this.constructor.instances++
    }
}

export default Neo.setupClass(LazyPane);
