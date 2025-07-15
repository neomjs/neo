import {defineComponent} from '../../../src/functional/_export.mjs';
import Button              from '../../../src/button/Base.mjs';
import TextField           from '../../../src/form/field/Text.mjs';
import TextAreaField       from '../../../src/form/field/TextArea.mjs';

export default defineComponent({
    config: {
        className: 'Email.view.ComposeView'
    },
    createVdom({onClose}) {
        const overlayStyle = {
            position: 'absolute',
            top     : '50%',
            left    : '50%',
            transform: 'translate(-50%, -50%)',
            width   : '600px',
            padding : '20px',
            border  : '1px solid #ccc',
            backgroundColor: '#fff',
            boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
            zIndex  : 1000
        };

        const fieldStyle = {
            marginBottom: '10px'
        };

        return {
            style: overlayStyle,
            cn: [{
                module: TextField,
                id    : 'compose-to',
                label : 'To:',
                style : fieldStyle,
                width : '100%'
            }, {
                module: TextField,
                id    : 'compose-subject',
                label : 'Subject:',
                style : fieldStyle,
                width : '100%'
            }, {
                module: TextAreaField,
                id    : 'compose-body',
                label : 'Body:',
                height: 200,
                style : fieldStyle,
                width : '100%'
            }, {
                module: Button,
                id    : 'compose-close-button',
                text  : 'Close',
                listeners: {
                    click: onClose
                }
            }]
        }
    }
});
