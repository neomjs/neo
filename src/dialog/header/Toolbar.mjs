import Base from '../../toolbar/Base.mjs';

/**
 * @class Neo.dialog.header.Toolbar
 * @extends Neo.toolbar.Base
 */
class Toolbar extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.dialog.header.Toolbar'
         * @protected
         */
        className: 'Neo.dialog.header.Toolbar',
        /**
         * @member {String[]|null} actions=['close','maximize']
         */
        actions: ['close', 'maximize', 'foo']
    }}

    /**
     *
     */
    createCustomAction() {
        // todo
        return {flag: 'info-button', iconCls: 'fa-regular fa-circle-question'};
    }

    /**
     *
     */
    createItems() {
        let me    = this,
            items = me.items || [],

        map = {
            close   : () => {return {flag: 'close-button',    iconCls: 'far fa-window-close'}},
            maximize: () => {return {flag: 'maximize-button', iconCls: 'far fa-window-maximize'}},
            default : () => me.createCustomAction()
        };

        if (me.actions) {
            items.push('->');

            me.actions.forEach(action => {
                action = map[action] || map['default'];
                items.push(action());
            })
        }

        me.items = items;
        console.log(me.actions, me.items);

        super.createItems();
    }
}

Neo.applyClassConfig(Toolbar);

export default Toolbar;
