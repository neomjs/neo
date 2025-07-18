import Button            from '../../../src/button/Base.mjs';
import TextField         from '../../../src/form/field/Text.mjs';
import TextAreaField     from '../../../src/form/field/TextArea.mjs';
import {defineComponent} from '../../../src/functional/_export.mjs';

export default defineComponent({
    config: {
        className: 'Email.view.ComposeView',
        cls      : ['email-compose-view']
    },
    createVdom({onClose}) {
        const fieldStyle = {
            marginBottom: '10px'
        };

        return {
            cn: [{
                module    : TextField,
                id        : 'compose-to',
                labelText : 'To:',
                labelWidth: 80,
                style     : fieldStyle
            }, {
                module    : TextField,
                id        : 'compose-subject',
                labelText : 'Subject:',
                labelWidth: 80,
                style     : fieldStyle
            }, {
                module   : TextAreaField,
                id       : 'compose-body',
                labelText: 'Body:',
                height   : 200,
                style    : fieldStyle
            }, {
                module : Button,
                handler: onClose,
                id     : 'compose-close-button',
                style  : {alignSelf: 'flex-end'},
                text   : 'Close'
            }]
        }
    }
});
