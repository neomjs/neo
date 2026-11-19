import Button               from '../../../../src/button/Base.mjs';
import Container            from '../../../../src/container/Base.mjs';
import MessagesConversation from './MessagesConversation.mjs';
import MessagesThreadList   from './MessagesThreadList.mjs';
import Store                from '../../../../src/data/Store.mjs';
import TextField            from '../../../../src/form/field/Text.mjs';

/**
 * @summary The Messages app: conversations on the left, the open one on the right with a composer below it. Sending
 * adds a message record to the conversation's store, so the new bubble is the store's, not a hand-built node.
 * @class WebDesktop.view.apps.Messages
 * @extends Neo.container.Base
 */
class Messages extends Container {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.apps.Messages'
         * @protected
         */
        className: 'WebDesktop.view.apps.Messages',
        /**
         * @member {String[]} cls=['webdesktop-messages']
         */
        cls: ['webdesktop-messages'],
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : MessagesThreadList,
            flex     : 'none',
            reference: 'threads',
            store    : {
                module: Store,
                model : {
                    fields: [
                        {name: 'color',    type: 'String'},
                        {name: 'id',       type: 'Integer'},
                        {name: 'initials', type: 'String'},
                        {name: 'last',     type: 'String'},
                        {name: 'name',     type: 'String'}
                    ]
                },
                data: [
                    {id: 1, name: 'Sam Rivera',  initials: 'SR', color: '#0ea5e9', last: 'See you at the review!'},
                    {id: 2, name: 'Design team', initials: 'DT', color: '#a855f7', last: 'The new glyphs look sharp.'},
                    {id: 3, name: 'Robin Chen',  initials: 'RC', color: '#14b8a6', last: 'Thanks, that worked.'},
                    {id: 4, name: 'Mia Okafor',  initials: 'MO', color: '#f97316', last: 'Two songs each, no more.'}
                ]
            }
        }, {
            module: Container,
            cls   : ['webdesktop-messages-chat'],
            flex  : 1,
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module   : MessagesConversation,
                flex     : 1,
                reference: 'conversation',
                store    : {
                    module : Store,
                    filters: [{property: 'threadId', value: 1}],
                    model  : {
                        fields: [
                            {name: 'id',       type: 'Integer'},
                            {name: 'mine',     type: 'Boolean'},
                            {name: 'sent',     type: 'Date'},
                            {name: 'text',     type: 'String'},
                            {name: 'threadId', type: 'Integer'}
                        ]
                    },
                    data: [
                        {id:  1, threadId: 1, mine: false, sent: '2026-11-18T08:58:00Z', text: 'Morning! Did you see the launch checklist?'},
                        {id:  2, threadId: 1, mine: true,  sent: '2026-11-18T09:02:00Z', text: 'Just opened it. Three items left before lunch.'},
                        {id:  3, threadId: 1, mine: false, sent: '2026-11-18T09:03:00Z', text: 'Perfect. The screenshots are the big one.'},
                        {id:  4, threadId: 1, mine: true,  sent: '2026-11-18T09:05:00Z', text: 'I will take them after the design review.'},
                        {id:  5, threadId: 1, mine: false, sent: '2026-11-18T09:06:00Z', text: 'See you at the review!'},
                        {id:  6, threadId: 2, mine: false, sent: '2026-11-17T16:20:00Z', text: 'We put the window buttons on one glyph set.'},
                        {id:  7, threadId: 2, mine: true,  sent: '2026-11-17T16:31:00Z', text: 'Sized to the title? Then the bar finally lines up.'},
                        {id:  8, threadId: 2, mine: false, sent: '2026-11-17T16:33:00Z', text: 'The new glyphs look sharp.'},
                        {id:  9, threadId: 3, mine: false, sent: '2026-11-18T08:20:00Z', text: 'The guest account only shows Help. Is that right?'},
                        {id: 10, threadId: 3, mine: true,  sent: '2026-11-18T08:24:00Z', text: 'Yes, guests start with Help. I granted you Calendar too.'},
                        {id: 11, threadId: 3, mine: false, sent: '2026-11-18T08:26:00Z', text: 'Thanks, that worked.'},
                        {id: 12, threadId: 4, mine: false, sent: '2026-11-16T19:10:00Z', text: 'Playlist for Monday is in Music.'},
                        {id: 13, threadId: 4, mine: true,  sent: '2026-11-16T19:14:00Z', text: 'Adding two of mine now.'},
                        {id: 14, threadId: 4, mine: false, sent: '2026-11-16T19:15:00Z', text: 'Two songs each, no more.'}
                    ]
                }
            }, {
                module: Container,
                cls   : ['webdesktop-messages-composer'],
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'center'},
                items : [{
                    module         : TextField,
                    flex           : 1,
                    hideLabel      : true,
                    placeholderText: 'Write a message',
                    reference      : 'composer'
                }, {
                    module : Button,
                    handler: 'up.onSend',
                    iconCls: 'fas fa-paper-plane',
                    text   : 'Send'
                }]
            }]
        }]
    }

    /**
     * Opens a conversation when its thread gets selected, opens on the first one once the threads have their items,
     * and sends on Enter in the composer.
     */
    onConstructed() {
        super.onConstructed();

        let me      = this,
            threads = me.getReference('threads'),
            {store} = threads;

        me.getReference('composer').keys = {Enter: 'onSend', scope: me.id};

        threads.selectionModel.on({selectionChange: me.onThreadSelectionChange, scope: me});
        store.on({load: () => threads.selectionModel.select(store.getAt(0)), once: true, scope: me})
    }

    /**
     * Adds the composer's text to the open conversation as the account's own message, and makes it the thread's last
     * line. The store stamps the new message's key.
     */
    onSend() {
        let me       = this,
            composer = me.getReference('composer'),
            {store}  = me.getReference('conversation'),
            text     = composer.value?.trim(),
            threadId = store.getFilter('threadId').value;

        if (text) {
            store.add({mine: true, sent: new Date(), text, threadId});
            me.getReference('threads').store.get(threadId).last = text;
            composer.value = ''
        }
    }

    /**
     * @param {Object}            data
     * @param {Neo.data.Record[]} data.records
     */
    onThreadSelectionChange({records}) {
        let [thread] = records;

        if (thread) {
            this.getReference('conversation').store.getFilter('threadId').value = thread.id
        }
    }
}

export default Neo.setupClass(Messages);
