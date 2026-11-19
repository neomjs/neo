import Split from './Split.mjs';

/**
 * A split button that opens its menu from the trigger button. button.Split does this for any split button
 * with a menu, so this class adds no behavior and keeps the 'menu-button' ntype.
 * @class Neo.button.Menu
 * @extends Neo.button.Split
 */
class Menu extends Split {
    static config = {
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
    }
}

export default Neo.setupClass(Menu);
