import Container   from '../../../../src/container/Base.mjs';
import GlassGrid   from './GlassGrid.mjs';
import MailMessage from './MailMessage.mjs';
import RowModel    from '../../../../src/selection/grid/RowModel.mjs';
import Store       from '../../../../src/data/Store.mjs';

const receivedFormat = new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'});

/**
 * @summary The Mail app: the inbox in a grid beside a reading pane that shows the selected message. The window opens
 * on the newest message.
 * @class WebDesktop.view.apps.Mail
 * @extends Neo.container.Base
 */
class Mail extends Container {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.apps.Mail'
         * @protected
         */
        className: 'WebDesktop.view.apps.Mail',
        /**
         * @member {String[]} cls=['webdesktop-mail']
         */
        cls: ['webdesktop-mail'],
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module    : GlassGrid,
            cls       : ['webdesktop-mail-inbox'],
            flex      : 1.4,
            reference : 'inbox',
            viewConfig: {selectionModel: {module: RowModel}},
            columns   : [
                {dataField: 'from',     text: 'From',     width: 140},
                {dataField: 'subject',  text: 'Subject',  flex : 1},
                {dataField: 'received', text: 'Received', width: 104, renderer: ({value}) => receivedFormat.format(value)}
            ],
            /**
             * The inbox, invented for the demo, newest first
             * @member {Object} store
             */
            store: {
                module: Store,
                model : {
                    fields: [
                        {name: 'body',     type: 'String'},
                        {name: 'from',     type: 'String'},
                        {name: 'id',       type: 'Integer'},
                        {name: 'received', type: 'Date'},
                        {name: 'subject',  type: 'String'}
                    ]
                },
                data   : [
                    {id: 1, from: 'Sam Rivera',   received: '2026-11-18T09:41:00Z', subject: 'Launch checklist for Monday',
                        body: 'Morning! I put the launch checklist into Documents, next to the release notes.\n\nCould you look at the last three items before lunch? The screenshots for the examples page still need a second pair of eyes.\n\nThanks, Sam'},
                    {id: 2, from: 'Robin Chen',   received: '2026-11-18T08:15:00Z', subject: 'Guest access to the help pages',
                        body: 'Hi Alex,\n\nthanks for the guest account. I can open Help, and the guide answered my first two questions.\n\nIs there a way to see the calendar too, or is that for the team only?\n\nRobin'},
                    {id: 3, from: 'Build Server', received: '2026-11-18T06:02:00Z', subject: 'Nightly build passed',
                        body: 'All 1,551 checks passed on dev.\n\nDuration: 14 minutes. No new warnings.'},
                    {id: 4, from: 'Taylor Reed',  received: '2026-11-17T17:30:00Z', subject: 'My account is suspended?',
                        body: 'Hello,\n\nI tried to sign in this afternoon and the desktop shows no apps at all. Did something change with my permissions?\n\nBest, Taylor'},
                    {id: 5, from: 'Sam Rivera',   received: '2026-11-17T14:05:00Z', subject: 'Portraits for the team page',
                        body: 'The portraits for the team page are in the Photos app now. The arrow keys move through them.\n\nSam'},
                    {id: 6, from: 'Calendar',     received: '2026-11-17T09:00:00Z', subject: 'Design review on Wednesday',
                        body: 'Design review, Wednesday 10:00 to 11:00.\n\nAgenda: the desktop demo, the window glyphs and the taskbar clock.'},
                    {id: 7, from: 'Mia Okafor',   received: '2026-11-16T19:22:00Z', subject: 'Playlist for the release party',
                        body: 'I started a playlist for Monday evening. It is in Music; add whatever you like, but no more than two songs each!\n\nMia'},
                    {id: 8, from: 'Reports',      received: '2026-11-16T07:00:00Z', subject: 'Weekly usage report',
                        body: 'This week: 1,204 sessions, 312 new accounts and 18 support questions.\n\nOpen the Reports app for the figures per team.'},
                    {id: 9, from: 'Sam Rivera',   received: '2026-11-15T11:48:00Z', subject: 'Re: Recycle bin',
                        body: 'Found it: the old pricing sheet was in the recycle bin. I restored it, so it is back in Documents.\n\nSam'},
                    {id: 10, from: 'Help Desk',   received: '2026-11-14T15:30:00Z', subject: 'Welcome to the desktop',
                        body: 'Welcome! Every app you open here runs in its own window. Drag a window by its title bar, and use the taskbar to switch between them.\n\nThe Help app has the full guide.'}
                ]
            }
        }, {
            module   : MailMessage,
            flex     : 1,
            reference: 'reader'
        }]
    }

    /**
     * Shows the selected message in the reading pane, and opens on the newest one once the inbox has its rows.
     */
    onConstructed() {
        super.onConstructed();

        let me      = this,
            inbox   = me.getReference('inbox'),
            {store} = inbox;

        inbox.view.selectionModel.on({selectionChange: me.onSelectionChange, scope: me});
        store.on({load: me.onInboxLoad, once: true, scope: me})
    }

    /**
     * Selects the newest message and shows it. A grid selects by record id; `selectRow()` fires no
     * `selectionChange`, so the reading pane takes the record here.
     */
    onInboxLoad() {
        let me     = this,
            {view} = me.getReference('inbox'),
            record = view.store.getAt(0);

        view.selectionModel.selectRow(view.getRecordId(record));
        me.getReference('reader').message = record
    }

    /**
     * @param {Object}            data
     * @param {Neo.data.Record[]} data.records
     */
    onSelectionChange({records}) {
        this.getReference('reader').message = records[0] || null
    }
}

export default Neo.setupClass(Mail);
