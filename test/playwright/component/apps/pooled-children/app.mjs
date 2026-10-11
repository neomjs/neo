import Component from '../../../../../src/component/Base.mjs';
import Container from '../../../../../src/container/Base.mjs';
import Viewport  from '../../../../../src/container/Viewport.mjs';

/**
 * @summary One pooled row: a container with a nested component, created ONCE and seated into the
 * pool's vdom by reference — the `list.Component` shape, never held in `items`.
 * @class Test.Playwright.Component.PooledChildren.Card
 * @extends Neo.container.Base
 */
class Card extends Container {
    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.PooledChildren.Card'
         * @protected
         */
        className: 'Test.Playwright.Component.PooledChildren.Card',
        /**
         * @member {String} ntype='pooled-children-card'
         * @protected
         */
        ntype: 'pooled-children-card',
        /**
         * @member {String[]} baseCls=['pooled-card']
         */
        baseCls: ['pooled-card'],
        /**
         * @member {Object} _vdom={tag:'li'}
         * @protected
         */
        _vdom:
        {tag: 'li'}
    }
}
Card = Neo.setupClass(Card);

/**
 * @summary The pool: renders pooled instances by reference.
 * @class Test.Playwright.Component.PooledChildren.Pool
 * @extends Neo.container.Base
 */
class Pool extends Container {
    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.PooledChildren.Pool'
         * @protected
         */
        className: 'Test.Playwright.Component.PooledChildren.Pool',
        /**
         * @member {String} ntype='pooled-children-pool'
         * @protected
         */
        ntype: 'pooled-children-pool',
        /**
         * @member {String[]} baseCls=['pool']
         */
        baseCls: ['pool'],
        /**
         * @member {Object} _vdom={tag:'ul'}
         * @protected
         */
        _vdom:
        {tag: 'ul'}
    }
}
Pool = Neo.setupClass(Pool);

/**
 * @summary Browser fixture for pooled children removed inside a covering ancestor flight: a host
 * whose own update (`updateDepth: -1`) absorbs the pool's empty render, then a refill that re-seats
 * the same instances by reference. The reactive trigger configs are the spec's cross-worker RPC;
 * `poolStateJson` mirrors the pooled instances' lifecycle flags.
 * @class Test.Playwright.Component.PooledChildren.Host
 * @extends Neo.container.Base
 */
class Host extends Container {
    static config = {
        /**
         * @member {String} className='Test.Playwright.Component.PooledChildren.Host'
         * @protected
         */
        className: 'Test.Playwright.Component.PooledChildren.Host',
        /**
         * @member {String} ntype='pooled-children-host'
         * @protected
         */
        ntype: 'pooled-children-host',
        /**
         * Spec trigger: each bump empties the pool by the pool's OWN update — the control.
         * @member {Number} clearAloneCount_=0
         * @reactive
         */
        clearAloneCount_: 0,
        /**
         * Spec trigger: each bump dirties this host silently, widens its depth to the full tree and
         * empties the pool, so the pool's render merges into the host's covering flight.
         * @member {Number} clearInsideFlightCount_=0
         * @reactive
         */
        clearInsideFlightCount_: 0,
        /**
         * @member {String[]} baseCls=['pooled-host']
         */
        baseCls: ['pooled-host'],
        /**
         * @member {String} id='pooled-host'
         */
        id: 'pooled-host',
        /**
         * Spec trigger: each bump re-seats every pooled card by reference.
         * @member {Number} refillCount_=0
         * @reactive
         */
        refillCount_: 0,
        /**
         * @member {Object[]} items
         */
        items: [
            {module: Component, cls: ['pooled-title'], text: 'Pool'},
            {module: Pool,      reference: 'pool'}
        ]
    }

    /**
     * The pooled instances, created once in {@link #onConstructed}.
     * @member {Neo.container.Base[]} cards=[]
     */
    cards = []

    /**
     * Spec-readable lifecycle mirror of the pooled instances and their nested components.
     * @returns {String}
     */
    get poolStateJson() {
        return JSON.stringify(this.cards.map(card => ({
            hasVnode    : !!card.vnode,
            innerMounted: card.getReference('inner').mounted,
            mounted     : card.mounted
        })))
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetClearAloneCount(value, oldValue) {
        if (oldValue === undefined) {
            return
        }

        const pool = this.getReference('pool');

        pool.vdom.cn = [];
        pool.update()
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetClearInsideFlightCount(value, oldValue) {
        if (oldValue === undefined) {
            return
        }

        let me   = this,
            pool = me.getReference('pool');

        // the ancestor is dirty first (a silent config change queues its own update) ...
        me.setSilent({style: {color: value % 2 ? 'blue' : 'red'}});
        me.updateDepth = -1;

        // ... so the pool's empty render merges into the ancestor's flight instead of flying alone
        pool.vdom.cn = [];
        pool.update();

        me.promiseUpdate()
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRefillCount(value, oldValue) {
        if (oldValue === undefined) {
            return
        }

        const pool = this.getReference('pool');

        pool.vdom.cn = this.cards.map(card => card.createVdomReference());
        pool.update()
    }

    /**
     * Creates the pooled cards once the pool exists and seats them by reference.
     */
    onConstructed() {
        super.onConstructed();

        let me   = this,
            pool = me.getReference('pool');

        me.cards = [0, 1, 2].map(index => Neo.create(Card, {
            appName : me.appName,
            id      : `pooled-card-${index}`,
            items   : [{module: Component, cls: ['pooled-card-inner'], reference: 'inner', text: `card-${index}`}],
            parentId: pool.id,
            windowId: me.windowId
        }));

        pool.vdom.cn = me.cards.map(card => card.createVdomReference())
    }
}
Host = Neo.setupClass(Host);

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        items : [{module: Host}]
    },
    name: 'Test.Playwright.PooledChildren'
});
