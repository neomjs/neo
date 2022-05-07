import Button     from '../../src/button/Base.mjs';
import CheckBox   from '../../src/form/field/CheckBox.mjs';
import NeoArray   from '../../src/util/Array.mjs';
import Toolbar    from '../../src/toolbar/Base.mjs';
import DemoDialog from './DemoDialog.mjs';
import Viewport   from '../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.dialog.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'Neo.examples.dialog.MainContainer',
        autoMount: true,
        layout   : 'base',
        style    : {padding: '20px'},
        /**
         * Custom config which gets passed to the dialog
         * Either a dom node id, 'document.body' or null
         * @member {String|null} boundaryContainerId='document.body'
         */
        boundaryContainerId: 'document.body',
        /**
         * Custom config
         * @member {Neo.dialog.Base|null} dialog=null
         */
        dialog: null
    }}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            items :[{
                module : Button,
                handler: me.createDialog.bind(me),
                iconCls: 'fa fa-window-maximize',
                text   : 'Create Dialog',
            }, {
                module        : CheckBox,
                checked       : true,
                hideLabel     : true,
                hideValueLabel: false,
                listeners     : {change: me.onDragLimitChange, scope: me},
                style         : {marginLeft: '3em'},
                valueLabelText: 'Limit Drag&Drop to the document.body'
            }, '->', {
                module : Button,
                handler: me.switchTheme.bind(me),
                iconCls: 'fa fa-moon',
                text   : 'Theme Dark'
            }]
        }];
    }

    /**
     * @param {Object} data
     */
    createDialog(data) {
        let me = this;

        data.component.disabled = true;

        me.dialog = Neo.create(DemoDialog, {
            animateTargetId    : data.component.id,
            appName            : me.appName,
            boundaryContainerId: me.boundaryContainerId,
            listeners          : {close: me.onWindowClose, scope: me}
        });
    }

    /**
     * @param {Object} data
     */
    onDragLimitChange(data) {
        this.dialog.boundaryContainerId = data.value ? 'document.body' : null
    }

    /**
     *
     */
    onWindowClose() {
        let button = this.down({
            text: 'Create Dialog'
        });

        button.disabled = false;
    }

    /**
     * @param {Object} data
     */
    switchTheme(data) {
        let button     = data.component,
            buttonText = 'Theme Light',
            dialog     = this.dialog,
            iconCls    = 'fa fa-sun',
            oldTheme   = 'neo-theme-light',
            theme      = 'neo-theme-dark',
            cls;

        if (button.text === 'Theme Light') {
            buttonText = 'Theme Dark';
            iconCls    = 'fa fa-moon';
            oldTheme   = 'neo-theme-dark';
            theme      = 'neo-theme-light';
        }

        Neo.main.DomAccess.setBodyCls({
            add   : [theme],
            remove: [oldTheme]
        });

        button.set({
            iconCls: iconCls,
            text   : buttonText
        });

        if (dialog) {
            cls = dialog.cls;
            NeoArray.removeAdd(cls, oldTheme, theme);
            dialog.cls = cls;
        }
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
