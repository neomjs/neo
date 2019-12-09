import {default as BaseGallery} from '../../../../src/component/Gallery.mjs';
import PreviewComponent         from './PreviewComponent.mjs';

/**
 * @class RealWorld2.view.article.Gallery
 * @extends Neo.component.Gallery
 */
class Gallery extends BaseGallery {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld2.view.article.Gallery'
         * @private
         */
        className: 'RealWorld2.view.article.Gallery',
        /**
         * @member {String[]} cls=['rw2-article-gallery', 'neo-gallery', 'page', 'view']
         */
        cls: ['rw2-article-gallery', 'neo-gallery', 'page', 'view']
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

        vdomItem = Neo.create({
            module  : PreviewComponent,
            parentId: me.id,
            ...record,
            author   : record.author.username, // todo: PreviewComponent should use an author object
            userImage: record.author.image
        });

        return {
            cls: ['surface', 'neo-helix-item'],
            id : me.getItemVnodeId(record[me.keyProperty]),
            cn : [vdomItem.vdom]
        };
    }

    /**
     *
     * @param {String} vnodeId
     * @returns {String}
     */
    getItemId(vnodeId) {
        return vnodeId.split('__')[1];
    }
}

Neo.applyClassConfig(Gallery);

export {Gallery as default};