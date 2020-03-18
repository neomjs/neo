import {default as Container}   from '../../../src/container/Base.mjs';

/**
 * @class Covid.view.FooterContainer
 * @extends Neo.container.Base
 */
class FooterContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.FooterContainer'
         * @private
         */
        className: 'Covid.view.FooterContainer',
        /**
         * @member {Number} height=20
         */
        height: 20,
        /**
         * @member {Object} layout={ntype: 'hbox', align: 'stretch'}
         */
        layout: {ntype: 'hbox'},
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            ntype: 'component'
        },
        /**
         * @member {Array} items
         */
        items: [{
            html : 'COVID-19 neo.mjs App',
            style: {padding: '20px'},
            width: 210
        }]
    }}
}

Neo.applyClassConfig(FooterContainer);

export {FooterContainer as default};