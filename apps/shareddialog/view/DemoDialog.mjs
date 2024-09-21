import Dialog    from '../../../src/dialog/Base.mjs';
import TextField from '../../../src/form/field/Text.mjs';

/**
 * @class SharedDialog.view.DemoDialog
 * @extends Neo.dialog.Base
 */
class DemoDialog extends Dialog {
    static config = {
        /**
         * @member {String} className='SharedDialog.view.DemoDialog'
         * @protected
         */
        className: 'SharedDialog.view.DemoDialog',
        /**
         * @member {String} title='Drag me across Windows!'
         */
        title: 'Drag me across Windows!',
        /**
         * @member {Object} containerConfig={style:padding:'20px}}
         */
        containerConfig: {
            style: {
                padding: '20px'
            }
        },
        /**
         * @member {Object} itemDefaults={labelWidth:70}
         */
        itemDefaults: {
            flex      : 'none',
            labelWidth: 70
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : TextField,
            labelText: 'Field 1'
        }, {
            module   : TextField,
            labelText: 'Field 2'
        }]
    }
}

export default Neo.setupClass(DemoDialog);
