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
        actions: ['close', 'maximize'],
        /**
         * @member {String} title='Dialog Title'
         */
        title_: 'Dialog Title'
    }}

    /**
     *
     */
    createCustomAction() {
        // todo
        return {action: 'info', handler: this.fireAction, iconCls: 'fa-regular fa-circle-question'};
    }

    /**
     *
     */
    createItems() {
        let me      = this,
            handler = me.fireAction.bind(me),
            items   = me.items || [],

        map = {
            close   : () => {return {action: 'close',    handler, iconCls: 'far fa-window-close'}},
            maximize: () => {return {action: 'maximize', handler, iconCls: 'far fa-window-maximize'}},
            default : () => me.createCustomAction()
        };

        me.title && items.push({
            ntype: 'label',
            cls  : ['neo-panel-header-text', 'neo-label'],
            flag : 'title-label',
            text : me.title
        });

        if (me.actions) {
            items.push('->');

            me.actions.forEach(action => {
                action = map[action] || map['default'];
                items.push(action());
            })
        }

        me.items = items;

        super.createItems();
    }

    /**
     * @param {Object} data
     */
    fireAction(data) {
        let button = data.component;

        this.fire('headerAction', {
            action: button.action,
            button,
            scope : this
        })
    }
}

Neo.applyClassConfig(Toolbar);

export default Toolbar;
