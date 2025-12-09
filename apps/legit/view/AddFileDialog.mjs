import Button        from '../../../src/button/Base.mjs';
import Dialog        from '../../../src/dialog/Base.mjs';
import FormContainer from '../../../src/form/Container.mjs';
import TextField     from '../../../src/form/field/Text.mjs';
import Toolbar       from '../../../src/toolbar/Base.mjs';

/**
 * @class Legit.view.AddFileDialog
 * @extends Neo.dialog.Base
 */
class AddFileDialog extends Dialog {
    static config = {
        /**
         * @member {String} className='Legit.view.Dialog'
         * @protected
         */
        className: 'Legit.view.Dialog',
        /**
         * @member {String} closeAction='hide'
         */
        closeAction: 'hide',
        /**
         * @member {Boolean} modal=true
         */
        modal: true,
        /**
         * @member {Boolean} resizable=false
         */
        resizable: false,
        /**
         * @member {String} title='Edit User'
         * @reactive
         */
        title: 'New File',
        /*
         * @member {Object} layout={ntype:'fit'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: FormContainer,
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module    : TextField,
                labelText : 'File Path',
                labelWidth: 80,
                reference : 'filename',
                value     : 'myFile'
            }]
        }, {
            module: Toolbar,
            flex  : 'none',
            items : ['->', {
                module : Button,
                handler: 'onAddFileDialogSave',
                height : 30,
                iconCls: 'fa fa-cloud-upload',
                text   : 'Save'
            }]
        }]
    }
}

export default Neo.setupClass(AddFileDialog);
