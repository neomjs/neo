import Base          from '../container/Panel.mjs';
import NeoArray      from '../util/Array.mjs';
import HeaderToolbar from '../dialog/header/Toolbar.mjs';

/**
 * Lightweight implementation using the dialog tag.
 * See: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog
 * @class Neo.container.Dialog
 * @extends Neo.container.Panel
 */
class Dialog extends Base {
    static config = {
        /**
         * @member {String} className='Neo.container.Dialog'
         * @protected
         */
        className: 'Neo.container.Dialog',
        /**
         * @member {String} ntype='container-dialog'
         * @protected
         */
        ntype: 'container-dialog',
        /**
        * @member {String[]} baseCls=['container-dialog']
        * @protected
        */
        baseCls: ['neo-container-dialog', 'neo-panel', 'neo-container'],
        /**
         * @member {Object} headerConfig=null
         */
        headerConfig: null,
        /**
         * @member {Neo.toolbar.Base|null} headerToolbar=null
         */
        headerToolbar: null,
        /**
         * The CSS class to use for an icon, e.g. 'fa fa-home'
         * @member {String|null} [iconCls_=null]
         */
        iconCls_: null,
        /**
         * @member {Object[]} items
         */
        items: [],
        /**
         * @member {String} title=null
         */
        title_: null,
        /**
         * @member {Object} _vdom={tag: 'dialog', cn: []}
         */
        _vdom:
        {tag: 'dialog', cn: []}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.createHeader();
    }

    /**
     * Triggered after the iconCls config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetIconCls(value, oldValue) {
        if (!this.headers) { return }
        let iconNode    = this.headers.down({flag: 'dialog-header-icon'}),
            iconNodeCls = [...iconNode.cls];

        NeoArray.remove(iconNodeCls, oldValue);
        NeoArray.add(   iconNodeCls, value);

        iconNode.cls = iconNodeCls;

        iconNode.removeDom = !value || value === '';
        this.update();
    } 

    /**
     * Triggered after the title config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTitle(value, oldValue) {
        this.headerToolbar?.set({
            title: value
        });
    }

    /**
     * close the dialog in main thread
     */
    close() {
        let me = this;

        Neo.main.addon.Dialog.close({
            id: me.id,
            appName: me.appName
        });
    }

    /**
     * @protected
     */
    createHeader() {
        let me               = this,
            cls              = ['neo-header-toolbar', 'neo-toolbar'],
            headers          = me.headers || [],
            headerConfigCopy = {...me.headerConfig};
        delete headerConfigCopy.items;

        me.headerToolbar = Neo.create({
            module   : HeaderToolbar,
            actions  : [{action: 'close', iconCls: 'fa-solid fa-xmark'}],
            appName  : me.appName,
            cls,
            dock     : 'top',
            flex     : 'none',
            id       : me.getHeaderToolbarId(),
            listeners: {headerAction: me.executeHeaderAction, scope: me},
            items    : [{
                cls: me.iconCls,
                flag     : 'dialog-header-icon',
            }, {
                ntype : 'label',
                cls   : ['neo-panel-header-text', 'neo-label'],
                flag  : 'title-label',
                hidden: !me.title,
                text  : me.title
            }, ...me.headerConfig.items || []],
            
            ...headerConfigCopy
        });

        headers.unshift(me.headerToolbar);

        me.headers = headers;
    }

    /**
     * {Object} data
     */
    executeHeaderAction(data) {
        let me = this,

        map = {
            close: me.close
        };

        map[data.action]?.call(me, data);

        me.fire('headerAction', {
            dialog: me,
            ...data
        })
    }

    /**
     * Returns the id of the header toolbar
     * @returns {String}
     */
    getHeaderToolbarId() {
        return this.id + '-header-toolbar';
    }

    /**
     * Shows the dialog (with / without Modal) in main thread
     * @param {Boolean} modal
     */
    async show(modal = true) {
        let me = this;
        await Neo.timeout(20);

        Neo.main.addon.Dialog[modal ? 'showModal': 'show']({
            id: me.id,
            appName: me.appName
        });
    }
}

Neo.applyClassConfig(Dialog);

export default Dialog;
