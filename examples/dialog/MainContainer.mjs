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
    static config = {
        /**
         * @member {String} className='Neo.examples.dialog.MainContainer'
         * @protected
         */
        className: 'Neo.examples.dialog.MainContainer',
        /**
         * We are not using a container layout here
         * @member {String} layout='base'
         */
        layout: 'base',
        /**
         * @member {Object} style={padding:'20px'}
         */
        style: {padding: '20px'},
        /**
         * @member {Object[]} items
         */
        items: [{
            html : [
                '<h3>The dialog is invoked from the "Create Dialog" button</h3>',
                '<h1>Hide it by pressing the ESCAPE key. The button will be refocused</h1>'
            ].join('')
        }, {
            module: Toolbar,
            items : [{
                module   : Button,
                handler  : 'up.createDialog',
                iconCls  : 'fa fa-window-maximize',
                reference: 'create-dialog-button',
                text     : 'Create Dialog',
            }, {
                module        : CheckBox,
                checked       : true,
                hideLabel     : true,
                hideValueLabel: false,
                listeners     : {change: 'up.onBoundaryContainerIdChange'},
                style         : {marginLeft: '3em'},
                valueLabelText: 'Limit Drag&Drop to the document.body'
            }, {
                module        : CheckBox,
                checked       : true,
                hideLabel     : true,
                hideValueLabel: false,
                listeners     : {change: 'up.onConfigChange'},
                style         : {marginLeft: '3em'},
                targetConfig  : 'animated',
                valueLabelText: 'Animated'
            }, {
                module        : CheckBox,
                checked       : true,
                hideLabel     : true,
                hideValueLabel: false,
                listeners     : {change: 'up.onConfigChange'},
                style         : {marginLeft: '1em'},
                targetConfig  : 'modal',
                valueLabelText: 'Modal'
            }, '->', {
                module : Button,
                handler: 'up.switchTheme',
                iconCls: 'fa fa-moon',
                text   : 'Theme Dark'
            }]
        }]
    }

    /**
     * Custom class field which gets passed to the dialog. Either a dom node id, 'document.body' or null
     * @member {String|null} boundaryContainerId='document.body'
     */
    boundaryContainerId = 'document.body'
    /**
     * Custom class field to store the created dialog.Base instance
     * @member {Neo.dialog.Base|null} dialog=null
     */
    dialog = null

    /**
     * @param {Object} data
     */
    createDialog(data) {
        let me                                       = this,
            button                                   = data.component,
            {appName, boundaryContainerId, windowId} = me;

        button.disabled = true;

        me.dialog = Neo.create(DemoDialog, {
            animated               : me.down({valueLabelText: 'Animated'}).checked,
            appName,
            boundaryContainerId,
            listeners              : {close: me.onWindowClose, scope: me},
            modal                  : me.down({valueLabelText: 'Modal'}).checked,
            trapFocus              : true,
            optionalAnimateTargetId: button.id,
            title                  : 'Dialog 1',
            windowId
        })
    }

    /**
     * @param {Object} opts
     */
    onBoundaryContainerIdChange(opts) {
        let me                  = this,
            {dialog}            = me,
            boundaryContainerId = opts.value ? 'document.body' : null;

        me.boundaryContainerId = boundaryContainerId

        if (dialog) {
            dialog.boundaryContainerId = boundaryContainerId
        }
    }

    /**
     * @param {Object} opts
     */
    onConfigChange(opts) {
        if (this.dialog) {
            this.dialog[opts.component.targetConfig] = opts.value
        }
    }

    /**
     *
     */
    onWindowClose() {
        this.getReference('create-dialog-button').disabled = false
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
            iconCls,
            text: buttonText
        });

        if (dialog) {
            cls = dialog.cls;
            NeoArray.removeAdd(cls, oldTheme, theme);
            dialog.cls = cls
        }
    }
}

export default Neo.setupClass(MainContainer);
