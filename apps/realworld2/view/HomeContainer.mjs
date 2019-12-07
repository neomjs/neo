import {default as Container}    from '../../../src/container/Base.mjs';
import PreviewList               from './article/PreviewList.mjs';
import {default as TabContainer} from '../../../src/tab/Container.mjs';

/**
 * @class RealWorld2.view.HomeContainer
 * @extends Neo.container.Base
 */
class HomeContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld2.view.HomeContainer'
         * @private
         */
        className: 'RealWorld2.view.HomeContainer',
        /**
         * @member {String[]} cls=['rw2-home-container']
         */
        cls: ['rw2-home-container'],
        /**
         * @member {Object} layout={ntype: 'vbox', align: 'stretch'}
         */
        layout: {
            ntype: 'vbox',
            align: 'stretch'
        },
        /**
         * @member {Array} items
         */
        items: [{
            ntype : 'component',
            cls   : ['banner'],
            height: 170,
            vdom  : {
                cn: [{
                    cls: ['container'],
                    cn : [{
                        tag : 'h1',
                        cls : ['logo-font'],
                        html: 'conduit v2'
                    }, {
                        tag : 'p',
                        html: 'A place to share your knowledge.'
                    }]
                }]
            }
        }, {
            module     : TabContainer,
            activeIndex: 1,
            flex       : 1,

            items: [{
                ntype : 'component',
                cls   : ['neo-examples-tab-component'],
                style : {padding: '20px'},
                vdom  : {innerHTML: 'todo'},

                tabButtonConfig: {
                    iconCls: 'fa fa-user-ninja',
                    text   : 'Your Feed'
                }
            }, {
                module: PreviewList,

                tabButtonConfig: {
                    iconCls: 'fa fa-globe-europe',
                    text   : 'Global Feed'
                }
            }]
        }]
    }}

    /**
     *
     * @param {Object} [params={}]
     * @param {Object} [opts={}]
     */
    getArticles(params={}, opts={}) {
        let me = this;

        if (me.activeTag) {
            params = {
                tag: me.activeTag,
                ...params
            };
        }

        me.getController().getArticles(params, opts).then(data => {
            console.log(data.json);

            // todo: create an easier way to access the store
            me.items[1].getCardContainer().items[1].store.data = data.json.articles;
        });
    }
}

Neo.applyClassConfig(HomeContainer);

export {HomeContainer as default};