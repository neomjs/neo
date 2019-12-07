import {default as Container}    from '../../../src/container/Base.mjs';
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
            module: TabContainer,
            flex  : 1,

            itemDefaults: {
                ntype : 'component',
                cls   : ['neo-examples-tab-component'],
                style : {padding: '20px'},
            },

            items: [{
                tabButtonConfig: {
                    iconCls: 'fa fa-home',
                    text   : 'Your Feed'
                },
                vdom: {innerHTML: 'Welcome to your new Neo App.'}
            }, {
                tabButtonConfig: {
                    iconCls: 'fa fa-play-circle',
                    text   : 'Global Feed'
                },
                vdom: {innerHTML: 'Have fun creating something awesome!'}
            }]
        }]
    }}
}

Neo.applyClassConfig(HomeContainer);

export {HomeContainer as default};