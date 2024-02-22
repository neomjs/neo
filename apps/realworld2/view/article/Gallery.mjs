import BaseGallery      from '../../../../src/component/Gallery.mjs';
import PreviewComponent from './PreviewComponent.mjs';

/**
 * @class RealWorld2.view.article.Gallery
 * @extends Neo.component.Gallery
 */
class Gallery extends BaseGallery {
    static config = {
        /**
         * @member {String} className='RealWorld2.view.article.Gallery'
         * @protected
         */
        className: 'RealWorld2.view.article.Gallery',
        /**
         * @member {String[]} baseCls=['rw2-article-gallery','neo-gallery','page','view']
         */
        baseCls: ['rw2-article-gallery', 'neo-gallery', 'page', 'view'],
        /**
         * The item height of the gallery
         * @member {Number} itemHeight=240
         */
        itemHeight: 240,
        /**
         * The item width of the gallery
         * @member {Number} itemWidth=320
         */
        itemWidth: 320,
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
    }

    /**
     * Override this method to get different item-markups
     * @param {Object} vdomItem
     * @param {Object} record
     * @param {Number} index
     * @returns {Object} vdomItem
     */
    createItem(vdomItem, record, index) {
        let me = this;

        if (!me.items[index]) {
            me.items[index] = vdomItem = Neo.create({
                module   : PreviewComponent,
                parentId : me.id,
                ...record,
                author   : record.author.username, // todo: PreviewComponent should use an author object
                userImage: record.author.image
            });
        } else {
            vdomItem.set({
                ...record,
                author   : record.author.username,
                userImage: record.author.image
            }, true); // silent update
        }

        return {
            cls     : ['neo-gallery-item', 'image-wrap', 'view', 'neo-transition-1000'],
            id      : me.getItemVnodeId(record[me.keyProperty]),
            tabIndex: '-1',
            style: {
                height: me.itemHeight + 'px',
                width : me.itemWidth  + 'px'
            },
            cn: [{
                cls: ['item-wrapper'],
                cn : [vdomItem.vdom]
            }],
        };
    }

    /**
     * @param {String} vnodeId
     * @returns {String}
     */
    getItemId(vnodeId) {
        return vnodeId.split('__')[1];
    }

    /**
     * @param {Array} items
     */
    onStoreLoad(items) {
        super.onStoreLoad(items);

        setTimeout(() => {
            this.selectOnMount = true;
            this.afterSetMounted(true, false);
        }, 200);
    }
}

Neo.setupClass(Gallery);

export default Gallery;
