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
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    afterSetRecord(value, oldValue) {
        if (value) {
            let me   = this,
                vdom = me.vdom,
                cls  = vdom.cn[1].cls || [];

            vdom.style = vdom.style || {};
            vdom.style['--tree-depth'] = value.depth || 0;

            NeoArray.remove(cls, ['is-collapsed', 'is-expanded', 'is-leaf']);

            if (value.isLeaf) {
                cls.push('is-leaf');
            } else if (value.collapsed === false) { // Assuming Record/Model maps expanded to collapsed false
                cls.push('is-expanded');
            } else {
                cls.push('is-collapsed');
            }

            vdom.cn[1].cls = cls;
            me.update();
        }
    }

    /**
     * @param {String|Number|null} value
     * @param {String|Number|null} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        let me = this;

        me.vdom.cn[2].html = value;
        me.update();
    }

    /**
     * @param {Object} data
     */
    onToggleClick(data) {
        let me            = this,
            gridContainer = me.parent?.gridContainer,
            store         = gridContainer?.store,
            record        = me.record;

        if (gridContainer && !record.isLeaf && store) {
            if (record.collapsed) {
                store.expand(record);
                gridContainer.fire('expand', {record});
            } else {
                store.collapse(record);
                gridContainer.fire('collapse', {record});
            }
        }
    }
}

export default Neo.setupClass(Tree);
