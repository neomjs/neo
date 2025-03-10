import Column   from './Base.mjs';
import NeoArray from '../../util/Array.mjs';
import VdomUtil from '../../util/VDom.mjs';

/**
 * @class Neo.grid.column.AnimatedChange
 * @extends Neo.grid.column.Base
 */
class AnimatedChange extends Column {
    static config = {
        /**
         * @member {String} className='Neo.grid.column.AnimatedChange'
         * @protected
         */
        className: 'Neo.grid.column.AnimatedChange',
        /**
         * @member {String} animationCls='neo-animated'
         */
        animationCls: 'neo-animated',
        /**
         * @member {String} type='animatedChange'
         * @protected
         */
        type: 'animatedChange'
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.parent.store.on({
            recordChange: me.onRecordChange,
            scope       : me
        })
    }

    /**
     * Override as needed for dynamic record-based animation classes
     * @param {Record} record
     * @returns {String}
     */
    getAnimationCls(record) {
        return this.animationCls
    }

    /**
     * @param {Object}         data
     * @param {Object[]}       data.fields Each field object contains the keys: name, oldValue, value
     * @param {Neo.data.Model} data.model The model instance of the changed record
     * @param {Object}         data.record
     */
    async onRecordChange({fields, record}) {
        let me     = this,
            {view} = me.parent,
            cellId, field, node;

        for (field of fields) {
            if (field.name === me.dataField) {
                // Wait for the next animation frame
                await me.timeout(20);

                cellId = view.getCellId(record, me.dataField);
                node   = VdomUtil.find(view.vdom, cellId)?.vdom;

                NeoArray.add(node.cls, me.getAnimationCls(record));

                // This will trigger a 2nd view update, after grid.View: onStoreRecordChange()
                // It is crucial to restart the keyframe based animation
                // => The previous update call will remove the last animationCls
                view.update();
                break
            }
        }
    }
}

export default Neo.setupClass(AnimatedChange);
