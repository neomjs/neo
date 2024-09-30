import Button   from '../../src/button/Base.mjs';
import ComboBox from '../../src/form/field/ComboBox.mjs';
import Dialog   from '../../src/dialog/Base.mjs';

/**
 * @class Neo.examples.dialog.DemoDialog
 * @extends Neo.dialog.Base
 */
class DemoDialog extends Dialog {
    static config = {
        /**
         * @member {String} className='Neo.examples.dialog.DemoDialog'
         * @protected
         */
        className: 'Neo.examples.dialog.DemoDialog',
        /**
         * Custom config to dynamically enable / disable the animateTargetId
         * @member {Boolean} animated_=true
         */
        animated_: true,
        /**
         * @member {Object} containerConfig
         */
        containerConfig: {
            style: {
                padding: '1em'
            }
        },
        /**
         * Custom config to show the current dialog number
         * @member {Number} index=1
         */
        index: 1,
        /**
         * @member {Boolean} modal=true
         */
        modal: true,
        /**
         * Custom config used by animated_
         * @member {String|null} optionalAnimateTargetId=null
         */
        optionalAnimateTargetId: null,
        /**
         * @member {Object} wrapperStyle
         */
        wrapperStyle: {
            width : '40%'
        }
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module    : ComboBox,
            labelText : 'Select',
            labelWidth: 80,

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
            reference: 'create-dialog-button',
            style    : {marginTop: '3em'},
            text     : 'Create Dialog ' + (me.index + 1),
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
        let me        = this,
            button    = data.component,
            nextIndex = me.index + 1;

        button.disabled = true;

        me.dialog = Neo.create(DemoDialog, {
            animated               : me.animated,
            appName                : me.appName,
            boundaryContainerId    : me.boundaryContainerId,
            index                  : nextIndex,
            listeners              : {close: me.onWindowClose, scope: me},
            modal                  : me.app.mainView.down({valueLabelText: 'Modal'}).checked,
            trapFocus              : true,
            optionalAnimateTargetId: button.id,
            style                  : {left: me.getOffset(), top: me.getOffset()},
            title                  : 'Dialog ' + nextIndex,
            windowId               : me.windowId
        })
    }

    /**
     * We want new dialogs to have a random left & top offset between -100px & 100px,
     * to ensure they are not at the exact same position.
     * @returns {String}
     */
    getOffset() {
        let offset = Math.floor(Math.random() * 200 - 100);
        return `calc(50% + ${offset}px)`
    }

    /**
     *
     */
    onWindowClose() {
        this.getReference('create-dialog-button').disabled = false
    }
}

export default Neo.setupClass(DemoDialog);
