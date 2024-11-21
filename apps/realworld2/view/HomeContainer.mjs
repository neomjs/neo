import Container        from '../../../src/container/Base.mjs';
import PreviewList      from './article/PreviewList.mjs';
import TabContainer     from '../../../src/tab/Container.mjs';
import TagListComponent from './article/TagListComponent.mjs';

/**
 * @class RealWorld2.view.HomeContainer
 * @extends Neo.container.Base
 */
class HomeContainer extends Container {
    static config = {
        /**
         * @member {String} className='RealWorld2.view.HomeContainer'
         * @protected
         */
        className: 'RealWorld2.view.HomeContainer',
        /**
         * @member {String[]} baseCls=['rw2-home-container','neo-container']
         */
        baseCls: ['rw2-home-container', 'neo-container'],
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
            module: Container,
            cls   : ['neo-container', 'center', 'container'],
            flex  : 1,
            layout: {ntype: 'hbox', align: 'stretch'},
            items: [{
                module     : TabContainer,
                activeIndex: 1,
                flex       : 3,

                items: [{
                    ntype : 'component',
                    cls   : ['neo-examples-tab-component'],
                    header: {iconCls: 'fa fa-user-ninja', text: 'Your Feed'},
                    style : {padding: '20px'},
                    vdom  : {innerHTML: 'todo'}
                }, {
                    module: PreviewList,
                    header: {iconCls: 'fa fa-globe-europe', text: 'Global Feed'}
                }]
            }, {
                module: TagListComponent,
                flex  : 1
            }]
        }]
    }

    /**
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
            me.items[1].items[0].getCardContainer().items[1].store.data = data.json.articles;
        });
    }

    getTagList() {
        return this.down({module: TagListComponent});
    }
}

export default Neo.setupClass(HomeContainer);
