import ArticlePreviews    from '../../store/ArticlePreviews.mjs'
import Helix              from './Helix.mjs'
import HelixMainContainer from '../../../../examples/component/helix/HelixMainContainer.mjs';

/**
 * @class RealWorld2.view.article.HelixContainer
 * @extends Neo.examples.component.helix.HelixMainContainer
 */
class HelixContainer extends HelixMainContainer {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld2.view.article.HelixContainer'
         * @protected
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
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me = this;

        // disable maxItems for now
        me.items[1].items[10].disabled = true;

        me.items[1].items[12] = {
            ntype       : 'button',
            text        : 'Sort by date',
            listeners   : {},
            style       : {margin: '20px', marginBottom: '10px'},
            domListeners: {
                click: data => {
                    me.getStore().sort({property: 'createdAt', direction: 'DESC'});
                    console.log(me.getStore().items[0]);
                }
            }
        };

        me.items[1].items[13] = {
            ntype       : 'button',
            text        : 'Sort by title',
            listeners   : {},
            style       : {margin: '20px', marginTop: 0},
            domListeners: {
                click: data => {
                    me.getStore().sort({property: 'title', direction: 'ASC'});
                    console.log(me.getStore().items[0]);
                }
            }
        };
    }

    /**
     *
     * @param {Object} [params={}]
     * @param {Object} [opts={}]
     */
    getArticles(params={}, opts={}) {
        let me = this;

        params = {
            limit: me.helix.maxItems,
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

Neo.applyClassConfig(HelixContainer);

export {HelixContainer as default};