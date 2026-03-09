import Component from '../../../component/Base.mjs';
import NeoArray  from '../../../util/Array.mjs';

/**
 * @class Neo.grid.column.component.Tree
 * @extends Neo.component.Base
 */
class Tree extends Component {
    static config = {
        /**
         * @member {String} className='Neo.grid.column.component.Tree'
         * @protected
         */
        className: 'Neo.grid.column.component.Tree',
        /**
         * @member {String} ntype='grid-column-component-tree'
         * @protected
         */
        ntype: 'grid-column-component-tree',
        /**
         * @member {String[]} baseCls=['neo-grid-tree-cell']
         * @protected
         */
        baseCls: ['neo-grid-tree-cell'],
        /**
         * @member {Number} depth_=0
         * @reactive
         */
        depth_: 0,
        /**
         * @member {Boolean} expanded_=false
         * @reactive
         */
        expanded_: false,
        /**
         * @member {Boolean} isLeaf_=false
         * @reactive
         */
        isLeaf_: false,
        /**
         * @member {Object} record_=null
         * @reactive
         */
        record_: null,
        /**
         * @member {String|Number|null} value_=null
         * @reactive
         */
        value_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {cls: ['neo-tree-indent']},
            {cls: ['neo-tree-toggle']},
            {cls: ['neo-tree-content']}
        ]}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners({
            click   : me.onToggleClick,
            delegate: '.neo-tree-toggle'
        });
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetDepth(value, oldValue) {
        if (value !== undefined) {
            let me    = this,
                vdom  = me.vdom,
                style = vdom.style || {};

            style['--tree-depth'] = value;
            vdom.style = style;
            me.update();
        }
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetExpanded(value, oldValue) {
        if (value !== undefined) {
            this.updateState();
        }
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetIsLeaf(value, oldValue) {
        if (value !== undefined) {
            this.updateState();
        }
    }

    /**
     * @param {String|Number|null} value
     * @param {String|Number|null} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        if (value !== undefined) {
            let me   = this,
                vdom = me.vdom;

            vdom.cn[2].html = value;
            me.update();
        }
    }

    /**
     * @param {Object} data
     */
    onToggleClick(data) {
        let me            = this,
            gridContainer = me.up('grid-container'),
            store         = gridContainer?.store,
            record        = me.record;

        if (!me.isLeaf && store && record) {
            if (me.expanded) {
                store.collapse(record);
                gridContainer.fire('collapse', {record});
            } else {
                store.expand(record);
                gridContainer.fire('expand', {record});
            }
        }
    }

    /**
     * Updates the VDOM toggle classes based on isLeaf and expanded state
     */
    updateState() {
        let me   = this,
            vdom = me.vdom,
            cls  = vdom.cn[1].cls || [];

        NeoArray.remove(cls, ['is-collapsed', 'is-expanded', 'is-leaf']);

        if (me.isLeaf) {
            cls.push('is-leaf');
        } else if (me.expanded) {
            cls.push('is-expanded');
        } else {
            cls.push('is-collapsed');
        }

        vdom.cn[1].cls = cls;
        me.update();
    }
}

export default Neo.setupClass(Tree);