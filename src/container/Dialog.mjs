import Base          from '../container/Panel.mjs';
import HeaderToolbar from '../dialog/header/Toolbar.mjs';
import NeoArray      from '../util/Array.mjs';

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
         * @member {Object} _vdom={tag: 'dialog', cn: []}
         */
        _vdom:
        {tag: 'dialog', cn: []}
    }

    /**
     * Triggered after the iconCls config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetIconCls(value, oldValue) {
        /* let iconNode = this.getIconNode();

        NeoArray.remove(iconNode.cls, oldValue);
        NeoArray.add(   iconNode.cls, value);

        iconNode.removeDom = !value || value === '';
        this.update(); */
    }

    /**
     * Converts the iconCls array into a string on beforeGet
     * @returns {String}
     * @protected
     */
    beforeGetIconCls() {
        let iconCls = this._iconCls;

        if (Array.isArray(iconCls)) {
            return iconCls.join(' ');
        }

        return iconCls;
    }

    /**
     * Triggered before the iconCls config gets changed. Converts the string into an array if needed.
     * @param {Array|String|null} value
     * @param {Array|String|null} oldValue
     * @returns {Array}
     * @protected
     */
    beforeSetIconCls(value, oldValue) {
        if (value && !Array.isArray(value)) {
            value = value.split(' ').filter(Boolean);
        }

        return value;
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.createHeader();
    }

    createHeader() {
        let me      = this,
            cls     = ['neo-header-toolbar', 'neo-toolbar'],
            headers = me.headers || [];

        me.headerToolbar = Neo.create({
            module   : HeaderToolbar,
            actions: [{action: 'close', iconCls: 'fa-solid fa-xmark'}],
            appName  : me.appName,
            cls,
            dock     : 'top',
            flex     : 'none',
            id       : me.getHeaderToolbarId(),
            listeners: {headerAction: me.executeHeaderAction, scope: me},
            title    : me.title,
            items: [{
                ntype: 'container',
                html: '<i class="fa-solid fa-circle-check"></i>',
                style: {height:'100%', justifyContent: 'center'}
            }],
            ...me.headerConfig
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
            close   : me.closeOrHide,
            maximize: me.maximize
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
     * Convenience shortcut
     * @returns {Object}
     */
    getIconNode() {
        return this.getVdomRoot().cn[0];
    }
}

Neo.applyClassConfig(Dialog);

export default Dialog;
