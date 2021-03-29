import ArticlePreviews      from '../../store/ArticlePreviews.mjs'
import Gallery              from './Gallery.mjs'
import GalleryMainContainer from '../../../../examples/component/gallery/MainContainer.mjs';

/**
 * @class RealWorld2.view.article.GalleryContainer
 * @extends Neo.examples.component.gallery.MainContainer
 */
class GalleryContainer extends GalleryMainContainer {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld2.view.article.GalleryContainer'
         * @protected
         */
        className: 'RealWorld2.view.article.GalleryContainer',
        /**
         * @member {Object} galleryConfig
         */
        galleryConfig: {
            module     : Gallery,
            imageField : 'author.image',
            imageSource: '',
            keyProperty: 'slug',
            store      : ArticlePreviews
        }
    }}

    /**
     *
     * @param {Object} [params={}]
     * @param {Object} [opts={}]
     */
    getArticles(params={}, opts={}) {
        let me = this;

        params = {
            limit: me.gallery.maxItems,
            ...params
        };

        if (me.activeTag) {
            params.tag = me.activeTag;
        }

        me.getController().getArticles(params, opts).then(data => {
            console.log(data.json);
            me.getStore().data = data.json.articles;
        });
    }
}

Neo.applyClassConfig(GalleryContainer);

export {GalleryContainer as default};