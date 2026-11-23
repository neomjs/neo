import List from '../../../../src/list/Base.mjs';

const timeFormat = new Intl.DateTimeFormat('en-GB', {timeStyle: 'short', timeZone: 'UTC'});

/**
 * @summary The Messages app's open conversation: one bubble per message, the account's own on the right. The bound
 * store holds every conversation's messages; its `threadId` filter keeps the open one.
 * @class WebDesktop.view.apps.MessagesConversation
 * @extends Neo.list.Base
 */
class MessagesConversation extends List {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.apps.MessagesConversation'
         * @protected
         */
        className: 'WebDesktop.view.apps.MessagesConversation',
        /**
         * @member {String[]} baseCls=['webdesktop-messages-conversation','neo-list']
         * @protected
         */
        baseCls: ['webdesktop-messages-conversation', 'neo-list'],
        /**
         * @member {Boolean} disableSelection=true
         */
        disableSelection: true
    }

    /**
     * @param {Neo.data.Record} record
     * @returns {Object}
     */
    createItemContent(record) {
        return {
            cls: ['webdesktop-messages-bubble', record.mine ? 'webdesktop-messages-mine' : 'webdesktop-messages-theirs'],
            cn : [
                {cls: ['webdesktop-messages-text'], text: record.text},
                {cls: ['webdesktop-messages-time'], text: timeFormat.format(record.sent)}
            ]
        }
    }
}

export default Neo.setupClass(MessagesConversation);
