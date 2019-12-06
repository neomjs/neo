import {default as Container} from '../../../src/container/Base.mjs';

/**
 * @class RealWorld2.view.HeaderContainer
 * @extends Neo.container.Base
 */
class HeaderContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld2.view.HeaderContainer'
         * @private
         */
        className: 'RealWorld2.view.HeaderContainer',
        /**
         * @member {Number} height=100
         */
        height: 100
    }}
}

Neo.applyClassConfig(HeaderContainer);

export {HeaderContainer as default};