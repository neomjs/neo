import {default as Container} from '../../../src/container/Base.mjs';

/**
 * @class Covid.view.HeaderContainer
 * @extends Neo.container.Base
 */
class HeaderContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.HeaderContainer'
         * @private
         */
        className: 'Covid.view.HeaderContainer',
        /**
         * @member {Number} height=70
         */
        height: 70,
        /**
         * @member {Object} layout={ntype: 'vbox', align: 'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Array} items
         */
        items: [{
            ntype: 'component',
            html : 'COVID-19 neo.mjs App',
            style: {padding: '20px'}
        }]
    }}
}

Neo.applyClassConfig(HeaderContainer);

export {HeaderContainer as default};