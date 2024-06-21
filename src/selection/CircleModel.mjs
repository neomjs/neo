import Model from './Model.mjs';

/**
 * @class Neo.selection.CircleModel
 * @extends Neo.selection.Model
 */
class CircleModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.selection.CircleModel'
         * @protected
         */
        className: 'Neo.selection.CircleModel',
        /**
         * @member {String} ntype='selection-circlemodel'
         * @protected
         */
        ntype: 'selection-circlemodel'
    }

    /**
     * @param {Object} data
     */
    onKeyDownLeft(data) {
        this.onNavKey(data, -1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownRight(data) {
        this.onNavKey(data, 1)
    }

    /**
     * @param {Object} data
     * @param {Number} step
     */
    onNavKey(data, step) {
        let me       = this,
            item     = data.path[0],
            {view}   = me,
            {store}  = view,
            maxIndex = Math.min(store.getCount(), view.maxItems) - 1,
            index, itemId, recordId;

        if (item.cls.includes('neo-circle-item')) {
            recordId = parseInt(view.getItemRecordId(item.id));
            index    = store.indexOf(recordId) + step;

                 if (index < 0)        {index = maxIndex}
            else if (index > maxIndex) {index = 0}
        } else {
            index = 0
        }

        itemId = view.getItemId(index);

        me.select(itemId);
        view.focus(itemId)
    }

    /**
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        let {id, view} = this;

        view.keys?._keys.push(
            {fn: 'onKeyDownLeft'  ,key: 'Down'  ,scope: id},
            {fn: 'onKeyDownLeft'  ,key: 'Left'  ,scope: id},
            {fn: 'onKeyDownRight' ,key: 'Right' ,scope: id},
            {fn: 'onKeyDownRight' ,key: 'Up'    ,scope: id}
        )
    }

    /**
     *
     */
    unregister() {
        let {id, view} = this;

        view.keys?.removeKeys([
            {fn: 'onKeyDownLeft'  ,key: 'Down'  ,scope: id},
            {fn: 'onKeyDownLeft'  ,key: 'Left'  ,scope: id},
            {fn: 'onKeyDownRight' ,key: 'Right' ,scope: id},
            {fn: 'onKeyDownRight' ,key: 'Up'    ,scope: id}
        ]);

        super.unregister()
    }
}

Neo.setupClass(CircleModel);

export default CircleModel;
