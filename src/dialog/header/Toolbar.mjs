import Base from '../../toolbar/Base.mjs';

/**
 * @class Neo.dialog.header.Toolbar
 * @extends Neo.toolbar.Base
 */
class Toolbar extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dialog.header.Toolbar'
         * @protected
         */
        className: 'Neo.dialog.header.Toolbar',
        /**
         * A dialog replaces `maximize` with its toggle and adds `minimize`, both dressed from its own configs
         * (`Neo.dialog.Base#getWindowActionMap`). Its `headerConfig.actionMap` replaces the entries it names and
         * keeps the others.
         * @example
         * // A close glyph of its own, with the dialog's maximize kept
         * headerConfig: {actionMap: {close: () => ({action: 'close', iconCls: 'far fa-circle-xmark'})}}
         * @member {Object} actionMap
         */
        actionMap: {
            close   : () => ({action: 'close',    iconCls: 'fas fa-xmark'}),
            maximize: () => ({action: 'maximize', iconCls: 'far fa-square'})
        },
        /**
         * You can define the action order and directly add custom actions. Leaving a name out leaves its control out.
         * @example
         * {
         *     actions: [
         *         'close',
         *         'maximize',
         *         {action: 'help', iconCls: 'far fa-circle-question'}
         *     ]
         * }
         *
         * @member {Object[]|String[]|null} actions=['maximize','close']
         */
        actions: ['maximize', 'close'],
        /**
         * @member {String|null} title=null
         */
        title_: null
    }

    /**
     * Triggered after the title config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTitle(value, oldValue) {
        this.down({flag: 'title-label'})?.set({
            hidden: !value,
            text  : value
        })
    }

    /**
     *
     */
    createItems() {
        let me      = this,
            items   = me.items || [],
            {title} = me;

        items.push({
            ntype : 'label',
            cls   : ['neo-panel-header-text', 'neo-label'],
            flag  : 'title-label',
            hidden: !title,
            text  : title
        });

        me.items = items;

        super.createItems()
    }

    /**
     * @param {Object} data
     */
    fireAction(data) {
        let {component} = data;

        this.fire('headerAction', {
            action: component.action,
            component,
            scope : this
        })
    }
}

export default Neo.setupClass(Toolbar);
