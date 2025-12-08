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
                module   : TextField,
                labelText: 'File Path'
            }]
        }, {

        }]
    }
}

export default Neo.setupClass(AddFileDialog);
