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
        close   : () => ({action: 'close',    iconCls: 'far fa-window-close'}),
        maximize: () => ({action: 'maximize', iconCls: 'far fa-window-maximize'})
    }
    /**
     * @member {String[]|null} actions=['maximize','close']
     */
    actions = ['maximize', 'close']

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
     * Triggered after the title config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTitle(value, oldValue) {
        if (oldValue) {
            this.down({flag: 'title-label'}).text = value;
        }
    }

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
        let component = data.component;

        this.fire('headerAction', {
            action: component.action,
            component,
            scope : this
        })
    }
}

Neo.applyClassConfig(Toolbar);

export default Toolbar;
