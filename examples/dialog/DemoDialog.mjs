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

        wrapperStyle: {
            width : '40%'
        },

        items : [{
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
        }]
    }
}

Neo.applyClassConfig(DemoDialog);

export default DemoDialog;
