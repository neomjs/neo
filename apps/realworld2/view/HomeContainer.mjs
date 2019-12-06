import {default as Container} from '../../../src/container/Base.mjs';

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
                        html: 'conduit'
                    }, {
                        tag : 'p',
                        html: 'A place to share your knowledge.'
                    }]
                }]
            }
        }, {
            module: Container,
            flex  : 1,
            style: {
                backgroundColor: '#ddd'
            }
        }]
    }}
}

Neo.applyClassConfig(HomeContainer);

export {HomeContainer as default};