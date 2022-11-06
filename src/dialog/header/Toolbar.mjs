import Base from '../../toolbar/Base.mjs';

/**
 * @class Neo.dialog.header.Toolbar
 * @extends Neo.toolbar.Base
 */
class Toolbar extends Base {
    /**
     * @member {Object} actionMap
     */
    actionMap = {
        close   : () => {return {action: 'close',    iconCls: 'far fa-window-close'}},
        maximize: () => {return {action: 'maximize', iconCls: 'far fa-window-maximize'}}
    }
    /**
     * @member {String[]|null} actions=['close','maximize']
     */
    actions = ['close', 'maximize']

    static getConfig() {return {
        /**
         * @member {String} className='Neo.dialog.header.Toolbar'
         * @protected
         */
        className: 'Neo.dialog.header.Toolbar',
        /**
         * @member {String} title='Dialog Title'
         */
        title_: 'Dialog Title'
    }}

    /**
     *
     */
    createItems() {
        let me      = this,
            handler = me.fireAction.bind(me),
            items   = me.items || [];

        me.title && items.push({
            ntype: 'label',
            cls  : ['neo-panel-header-text', 'neo-label'],
            flag : 'title-label',
            text : me.title
        });

        if (me.actions) {
            items.push('->');

            me.actions.forEach(action => {
                items.push({
                    handler,
                    ...me.actionMap[action]()
                })
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
