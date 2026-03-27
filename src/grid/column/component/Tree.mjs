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
         * @member {Boolean} collapsed_=true
         * @reactive
         */
        collapsed_: true,
        /**
         * @member {Number} depth_=0
         * @reactive
         */
        depth_: 0,
        /**
         * @member {Boolean} hasError_=false
         * @reactive
         */
        hasError_: false,
        /**
         * @member {Boolean} isLastChild_=false
         * @reactive
         */
        isLastChild_: false,
        /**
         * @member {Boolean} isLeaf_=true
         * @reactive
         */
        isLeaf_: true,
        /**
         * @member {Boolean} isNodeLoading_=false
         * @reactive
         */
        isNodeLoading_: false,
        /**
         * @member {Boolean} showHelperLines_=false
         * @reactive
         */
        showHelperLines_: false,
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
        })
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetCollapsed(value, oldValue) {
        this.updateIconCls()
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetDepth(value, oldValue) {
        let me   = this,
            vdom = me.vdom;

        vdom.style = vdom.style || {};
        vdom.style['--tree-depth'] = value;
        me.update()
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetHasError(value, oldValue) {
        this.updateIconCls()
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetIsLastChild(value, oldValue) {
        this.toggleCls('is-last-child', value)
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetIsLeaf(value, oldValue) {
        this.updateIconCls()
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetIsNodeLoading(value, oldValue) {
        this.updateIconCls()
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowHelperLines(value, oldValue) {
        this.toggleCls('show-helper-lines', value)
    }

    /**
     * @param {String|Number|null} value
     * @param {String|Number|null} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        let me = this;

        me.vdom.cn[2].html = value;
        me.update()
    }

    /**
     * @param {Object} data
     */
    onToggleClick(data) {
        let me            = this,
            gridContainer = me.parent?.gridContainer,
            store         = gridContainer?.store,
            record        = me.record;

        if (gridContainer && !me.isLeaf && store && record) {
            if (me.collapsed) {
                store.expand(record);
                gridContainer.fire('expand', {record})
            } else {
                store.collapse(record);
                gridContainer.fire('collapse', {record})
            }
        }
    }

    /**
     * Updates the CSS classes for the toggle icon based on node state
     * @protected
     */
    updateIconCls() {
        let me   = this,
            vdom = me.vdom,
            cls  = vdom.cn[1].cls || [];

        NeoArray.remove(cls, ['has-error', 'is-collapsed', 'is-expanded', 'is-leaf', 'is-loading']);

        if (me.isNodeLoading) {
            NeoArray.add(cls, 'is-loading')
        } else if (me.hasError) {
            NeoArray.add(cls, 'has-error')
        } else if (me.isLeaf) {
            NeoArray.add(cls, 'is-leaf')
        } else if (me.collapsed) {
            NeoArray.add(cls, 'is-collapsed')
        } else {
            NeoArray.add(cls, 'is-expanded')
        }

        vdom.cn[1].cls = cls;
        me.update()
    }
}

export default Neo.setupClass(Tree);
