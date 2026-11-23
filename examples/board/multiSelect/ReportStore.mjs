import ReportModel from './ReportModel.mjs';
import Store       from '../../../src/data/Store.mjs';

const
    // Severity → its tag and the card accent. S4 keeps the theme's plain card.
    severities = {
        S1: {color: '#e5484d', tag: 'S1 · critical'},
        S2: {color: '#f5a524', tag: 'S2 · major'},
        S3: {color: '#3e8ed0', tag: 'S3 · minor'},
        S4: {color: null,      tag: 'S4 · trivial'}
    },
    // The inbox in arrival order: [title, severity, area]
    reports = [
        ['Checkout total ignores a second discount code',          'S2', 'Checkout'],
        ['Search returns nothing for quoted phrases',              'S2', 'Search'],
        ['Password reset link expires after one minute',           'S1', 'Login'],
        ['CSV export drops rows with a comma in the name',         'S2', 'Export'],
        ['Push notification opens the wrong order',                'S3', 'Notifications'],
        ['Dark mode leaves the date picker white',                 'S4', 'Settings'],
        ['Card payment spins forever after a 3-D Secure cancel',   'S1', 'Checkout'],
        ['Suggestions flicker while typing fast',                  'S3', 'Search'],
        ['"Remember me" logs out after a browser restart',         'S2', 'Login'],
        ['PDF invoice applies the wrong VAT rate for Austria',     'S2', 'Export'],
        ['The weekly digest arrives twice on Mondays',             'S3', 'Notifications'],
        ['Switching the language empties the cart',                'S2', 'Settings'],
        ['Apple Pay button missing on iPad',                       'S3', 'Checkout'],
        ['Typo in the empty-results message',                      'S4', 'Search'],
        ['Two-factor field rejects a pasted code',                 'S3', 'Login'],
        ['Export stays disabled after a filter is cleared',        'S3', 'Export'],
        ['Mute setting is lost on reload',                         'S3', 'Notifications'],
        ['Photos over 4 MB fail to upload without a message',      'S3', 'Settings'],
        ['Confirmation page fails for gift card orders',           'S1', 'Checkout'],
        ['Filters reset on the browser\'s Back button',            'S2', 'Search'],
        ['Single sign-on loops forever in Safari',                 'S1', 'Login'],
        ['Excel export writes dates as plain numbers',             'S3', 'Export'],
        ['Badge counts notifications already read',                'S4', 'Notifications'],
        ['Reminders ignore the time zone setting',                 'S3', 'Settings'],
        ['Shipping estimate shows yesterday\'s date',              'S3', 'Checkout'],
        ['Sort by price puts free items last',                     'S4', 'Search'],
        ['Session warning opens behind the dialog',                'S4', 'Login'],
        ['Export file name uses the server\'s time zone',          'S4', 'Export'],
        ['Desktop alerts fire while the tab has focus',            'S4', 'Notifications'],
        ['Save button in Settings has no focus ring',              'S4', 'Settings'],
        ['Coupon field accepts expired codes',                     'S2', 'Checkout'],
        ['Results highlight the wrong word',                       'S3', 'Search'],
        ['Locked-out message names an old support address',       'S3', 'Login'],
        ['Scheduled export runs an hour late after the DST switch', 'S2', 'Export'],
        ['Unsubscribe link fails in German emails',                'S2', 'Notifications'],
        ['Avatar crop handles drift on high-density screens',      'S4', 'Settings'],
        ['Cart badge lags one item behind',                        'S3', 'Checkout'],
        ['Search box loses focus when results arrive',             'S3', 'Search'],
        ['Google sign-in button misaligned on phones',             'S4', 'Login'],
        ['JSON export escapes emoji twice',                        'S4', 'Export']
    ];

/**
 * @summary The triage board's 40 bug reports, all in the Inbox, the same set on every load.
 * @description Each report keeps its arrival position as its id (`1041` is the oldest), so a witness can name a card
 * before the page opens. `order` stays unset: the board numbers the column when it loads, in arrival order.
 * @class Neo.examples.board.multiSelect.ReportStore
 * @extends Neo.data.Store
 */
class ReportStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.multiSelect.ReportStore'
         * @protected
         */
        className: 'Neo.examples.board.multiSelect.ReportStore',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=ReportModel
         */
        model: ReportModel
    }

    /**
     * @summary Seeds the reports once, unless records were passed in.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        if (!me.items?.length) {
            me.add(me.generateData())
        }
    }

    /**
     * @summary Builds the 40 reports from the arrival list: severity sets the first tag and the accent, area the second.
     * @returns {Object[]}
     */
    generateData() {
        return reports.map(([title, severity, area], index) => ({
            id    : 1041 + index,
            title,
            status: 'inbox',
            severity,
            area,
            tags  : [severities[severity].tag, area],
            color : severities[severity].color
        }))
    }
}

export default Neo.setupClass(ReportStore);
