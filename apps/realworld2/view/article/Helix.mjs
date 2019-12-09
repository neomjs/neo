import {default as BaseHelix} from '../../../../src/component/Helix.mjs';
import PreviewComponent       from './PreviewComponent.mjs';

/**
 * @class RealWorld2.view.article.Helix
 * @extends Neo.list.Base
 */
class Helix extends BaseHelix {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld2.view.article.Helix'
         * @private
         */
        className: 'RealWorld2.view.article.Helix'
    }}

    /**
     * Override this method to get different item-markups
     * @param {Object} vdomItem
     * @param {Object} record
     * @param {Number} index
     * @returns {Object} vdomItem
     */
    createItem(vdomItem, record, index) {
        let me = this;

        console.log('createItem');

        vdomItem.id = me.getItemVnodeId(record[me.keyProperty]);

        vdomItem.cn[0].id  = me.getItemVnodeId(record[me.keyProperty]) + '_img';
        vdomItem.cn[0].src = me.imageSource + Neo.ns(me.imageField, false, record);

        return vdomItem;
    }
}

Neo.applyClassConfig(Helix);

export {Helix as default};