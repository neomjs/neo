import {defineComponent} from '../../../src/functional/_export.mjs';

/**
 * @summary Functional message reader bound to the retained detail Panel's selected email.
 * @class Email.view.DetailView
 * @extends Neo.functional.component.Base
 */
export default defineComponent({
    config: {
        className: 'Email.view.DetailView',
        cls      : ['email-detail-view'],
        /**
         * @member {Email.model.Email|null} email_=null
         * @reactive
         */
        email_: null
    },

    /**
     * @summary Uses text nodes for message content, including selection changes in a popup.
     * @param {Object} config
     * @param {Email.model.Email|null} config.email
     * @returns {Object}
     */
    createVdom({email}) {
        return {
            cn: email ? [{
                tag: 'h1', text: email.title
            }, {
                tag: 'p', text: `From: ${email.sender}`
            }, {
                tag: 'p', text: `To: ${email.recipients.join(', ')}`
            }, {
                tag: 'p', text: email.dateSent
            }, {
                cls: ['email-message-content'], text: email.content
            }] : [{
                tag: 'p', text: 'Select an email to read'
            }]
        }
    }
});
