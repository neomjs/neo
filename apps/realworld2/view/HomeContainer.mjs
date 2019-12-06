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
            height: 170,
            vdom  : {
                cls: ['banner'],
                cn : [{
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