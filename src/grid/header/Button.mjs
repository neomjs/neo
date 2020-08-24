import {default as BaseButton} from '../../button.Base.mjs';

/**
 * @class Neo.grid.header.Button
 * @extends Neo.button.Base
 */
class Button extends BaseButton {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.grid.header.Button'
         * @protected
         */
        className: 'Neo.grid.header.Button',
        /**
         * @member {String} ntype='grid-header-button'
         * @protected
         */
        ntype: 'grid-header-button',
        /**
         * @member {Array} cls=['neo-grid-header-button']
         */
        cls: ['neo-grid-header-button']
    }}
}

Neo.applyClassConfig(Button);

export {Button as default};