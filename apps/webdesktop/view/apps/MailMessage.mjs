import Component from '../../../../src/component/Base.mjs';

const dateFormat = new Intl.DateTimeFormat('en-GB', {dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC'});

/**
 * @summary The Mail app's reading pane: the selected message's subject, sender, date and body.
 * @class WebDesktop.view.apps.MailMessage
 * @extends Neo.component.Base
 */
class MailMessage extends Component {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.apps.MailMessage'
         * @protected
         */
        className: 'WebDesktop.view.apps.MailMessage',
        /**
         * @member {String[]} baseCls=['webdesktop-mail-message']
         * @protected
         */
        baseCls: ['webdesktop-mail-message'],
        /**
         * The message record to show, null shows the empty pane
         * @member {Neo.data.Record|null} message_=null
         * @reactive
         */
        message_: null
    }

    /**
     * Triggered after the message config got changed
     * @param {Neo.data.Record|null} value
     * @param {Neo.data.Record|null} oldValue
     * @protected
     */
    afterSetMessage(value, oldValue) {
        let me = this;

        me.vdom.cn = value ? [{
            tag : 'h2',
            text: value.subject
        }, {
            cls: ['webdesktop-mail-meta'],
            cn : [
                {tag: 'span', cls: ['webdesktop-mail-from'], text: value.from},
                {tag: 'span', text: dateFormat.format(value.received)}
            ]
        }, ...value.body.split('\n\n').map(text => ({tag: 'p', text}))] : [{
            tag : 'p',
            cls : ['webdesktop-mail-empty'],
            text: 'Select a message to read it.'
        }];

        me.update()
    }
}

export default Neo.setupClass(MailMessage);
