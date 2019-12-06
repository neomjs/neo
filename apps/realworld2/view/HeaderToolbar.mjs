import Toolbar from '../../../src/container/Toolbar.mjs';

/**
 * @class RealWorld2.view.HeaderToolbar
 * @extends Neo.container.Toolbar
 */
class HeaderToolbar extends Toolbar {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld2.view.HeaderToolbar'
         * @private
         */
        className: 'RealWorld2.view.HeaderToolbar',
        /**
         * @member {Number} height=56
         */
        height: 56,

        items: [{
            text: 'conduit'
        }, '->', {
            text: 'Home'
        }, {
            text: 'New Article'
        }, {
            text: 'Settings'
        }, {
            text: 'Profile'
        }]
    }}
}

Neo.applyClassConfig(HeaderToolbar);

export {HeaderToolbar as default};