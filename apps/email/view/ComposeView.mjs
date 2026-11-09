import TextField         from '../../../src/form/field/Text.mjs';
import TextAreaField     from '../../../src/form/field/TextArea.mjs';
import {defineComponent} from '../../../src/functional/_export.mjs';

/**
 * @summary Functional draft fields bound to their retained Dialog's state provider.
 * @class Email.view.ComposeView
 * @extends Neo.functional.component.Base
 */
export default defineComponent({
    config: {
        className: 'Email.view.ComposeView',
        cls      : ['email-compose-view']
    },

    /**
     * @summary Renders one live draft, independent of its current browser render target.
     * @returns {Object}
     */
    createVdom() {
        return {
            cn: [{
                module       : TextField,
                bind         : {value: {key: 'to', twoWay: true}},
                labelText    : 'To',
                labelPosition: 'top',
                labelWidth   : 80,
                reference    : 'draftTo',
                width        : '100%'
            }, {
                module       : TextField,
                bind         : {value: {key: 'subject', twoWay: true}},
                labelText    : 'Subject',
                labelPosition: 'top',
                labelWidth   : 80,
                reference    : 'draftSubject',
                width        : '100%'
            }, {
                module      : TextAreaField,
                bind        : {value: {key: 'body', twoWay: true}},
                cls         : ['email-draft-body'],
                labelText   : 'Message',
                reference   : 'draftBody',
                height      : '100%',
                width       : '100%',
                wrapperStyle: {flex: 1, minHeight: 0}
            }, {
                cls : ['email-demo-note'],
                tag : 'p',
                text: 'Demo draft — kept while these windows stay open. No email is sent.'
            }]
        }
    }
});
