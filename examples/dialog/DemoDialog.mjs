import Button      from '../../src/button/Base.mjs';
import Dialog      from '../../src/dialog/Base.mjs';
import SelectField from '../../src/form/field/Select.mjs';

/**
 * @class Neo.examples.dialog.DemoDialog
 * @extends Neo.dialog.Base
 */
class DemoDialog extends Dialog {
    static config = {
        className: 'Neo.examples.dialog.DemoWindow',
        modal    : true,
        title    : 'My Dialog',

        /**
         * Custom config to dynamically enable / disable the animateTargetId
         * @member {Boolean} animated_=true
         */
        animated_: true,
        /**
         * Custom config used by animated_
         * @member {String|null} optionalAnimateTargetId=null
         */
        optionalAnimateTargetId: null,

        wrapperStyle: {
            width : '40%'
        }
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        const me = this;

        me.items = [{
            module   : SelectField,
            labelText: 'Select',

            store: {
                data: (() => {
                    const result = [];

                    for (let i = 0; i < 20; i++) {
                        result.push({
                            id   : i,
                            name : `Option ${i + 1}`
                        })
                    }

                    return result
                })()
            }
        }, {
            module   : Button,
            handler  : me.createDialog.bind(me),
            iconCls  : 'fa fa-window-maximize',
            reference: 'create-second-dialog-button',
            text     : 'Create new modal Dialog',
        }]
    }

    /**
     * Triggered after the animated config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetAnimated(value, oldValue) {
        let me = this;

        me.animateTargetId = value ? me.optionalAnimateTargetId : null;

        if (me.dialog) {
            me.dialog.animated = value
        }
    }

    /**
     * Triggered after the modal config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetModal(value, oldValue) {
        super.afterSetModal(value, oldValue);

        if (this.dialog) {
            this.dialog.modal = value
        }
    }

    /**
     * @param {Object} data
     */
    createDialog(data) {
        let me     = this,
            button = data.component;

        button.disabled = true;

        me.dialog = Neo.create(DemoDialog, {
            animated               : me.animated,
            appName                : me.appName,
            boundaryContainerId    : me.boundaryContainerId,
            listeners              : {close: me.onWindowClose, scope: me},
            modal                  : me.app.mainView.down({valueLabelText: 'Modal'}).checked,
            optionalAnimateTargetId: button.id,
            title                  : 'Second Dialog'
        })
    }

    /**
     *
     */
    onWindowClose() {
        this.getReference('create-second-dialog-button').disabled = false
    }
}

Neo.applyClassConfig(DemoDialog);

export default DemoDialog;
