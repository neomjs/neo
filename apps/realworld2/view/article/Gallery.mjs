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
        cls: ['rw2-article-gallery', 'neo-gallery', 'page', 'view'],
        /**
         * The image height of the gallery
         * @member {Number} imageHeight=240
         */
        imageHeight: 240,
        /**
         * The image width of the gallery
         * @member {Number} imageWidth=320
         */
        imageWidth: 320,
        /**
         * Array containing the PreviewComponent references
         * @member {Array} items=[]
         */
        items: [],
        /**
         * True to select the item inside the middle of the store items on mount
         * @member {Boolean} selectOnMount=false
         */
        selectOnMount: false
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
            cls     : ['neo-gallery-item', 'image-wrap', 'view', 'neo-transition-1000'],
            id      : me.getItemVnodeId(record[me.keyProperty]),
            tabIndex: '-1',
            style: {
                height: me.imageHeight + 'px',
                width : me.imageWidth  + 'px'
            },
            cn: [{
                cls: ['item-wrapper'],
                cn : [vdomItem.vdom]
            }],
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

    /**
     *
     * @param {Array} items
     */
    onStoreLoad(items) {
        super.onStoreLoad(items);

        setTimeout(() => {
            this.selectOnMount = true;
            this.onMounted();
        }, 200);
    }
}

Neo.applyClassConfig(Gallery);

export {Gallery as default};