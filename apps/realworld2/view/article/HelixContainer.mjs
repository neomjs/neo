import ArticlePreviews    from '../../store/ArticlePreviews.mjs'
import Helix              from './Helix.mjs'
import HelixMainContainer from '../../../../examples/component/helix/HelixMainContainer.mjs';

/**
 * @class RealWorld2.view.article.HelixContainer
 * @extends Neo.list.Base
 */
class HelixContainer extends HelixMainContainer {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld2.view.article.HelixContainer'
         * @private
         */
        className: 'RealWorld2.view.article.HelixContainer',
        /**
         * @member {Object} helixConfig
         */
        helixConfig: {
            module     : Helix,
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
            limit: 100,
            ...params
        };

        if (me.activeTag) {
            params = {
                tag: me.activeTag,
                ...params
            };
        }

        me.getController().getArticles(params, opts).then(data => {
            console.log(data.json);
            me.getStore().data = data.json.articles;
        });
    }
}

Neo.applyClassConfig(HelixContainer);

export {HelixContainer as default};