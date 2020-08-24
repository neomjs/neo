import Split from './Split.mjs';

/**
 * Show a menu when clicking on the SplitButton
 * @class Neo.button.Menu
 * @extends Neo.button.Split
 */
class Menu extends Split {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.button.Menu'
         * @protected
         */
        className: 'Neo.button.Menu',
        /**
         * @member {String} ntype='menu-button'
         * @protected
         */
        ntype: 'menu-button'
    }}

    /**
     *
     * @param {Object} data
     */
    splitButtonHandler(data) {
        // todo: Show the menu
    }
}

Neo.applyClassConfig(Menu);

export {Menu as default};