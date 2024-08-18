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
            labelWidth: 70
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : TextField,
            flex     : 'none',
            labelText: 'Field 1'
        }, {
            module   : TextField,
            flex     : 'none',
            labelText: 'Field 2'
        }],
        /**
         * @member {Object} wrapperStyle={height:'40%',width:'40%'}
         */
        wrapperStyle: {
            height: '40%',
            width : '40%'
        }
    }
}

export default Neo.setupClass(DemoDialog);
