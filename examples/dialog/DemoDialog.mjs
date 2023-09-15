import Dialog      from '../../src/dialog/Base.mjs';
import SelectField from '../../src/form/field/Select.mjs';
import Button      from '../../src/button/Base.mjs';

/**
 * @class Neo.examples.dialog.DemoDialog
 * @extends Neo.dialog.Base
 */
class DemoDialog extends Dialog {
    static config = {
        className: 'Neo.examples.dialog.DemoWindow',
        modal    : true,
        title    : 'My Dialog',

        wrapperStyle: {
            width : '40%'
        }
    }

    construct() {
        super.construct(...arguments);

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
                        });
                    }

                    return result;
                })()
            }
        }, {
            module : Button,
            handler: me.createDialog.bind(me),
            iconCls: 'fa fa-window-maximize',
            text   : 'Create new modal Dialog',
        }];
    }

    createDialog(data) {
        let me = this;

        data.component.disabled = true;

        me.dialog = Neo.create(DemoDialog, {
            appName            : me.appName,
            boundaryContainerId: me.boundaryContainerId,
            listeners          : {close: me.onWindowClose, scope: me},
            modal              : true
        });
    }

    onWindowClose() {
        let button = this.down({
            text: 'Create new modal Dialog'
        });

        button.disabled = false;
    }
}

Neo.applyClassConfig(DemoDialog);

export default DemoDialog;
