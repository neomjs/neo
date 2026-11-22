import DateUtil         from '../../../src/util/Date.mjs';
import ReleaseItemModel from './ReleaseItemModel.mjs';
import Store            from '../../../src/data/Store.mjs';

/**
 * @summary Store of 20 release-calendar deliverables with dates generated relative to today.
 * @class Neo.examples.board.dueDates.ReleaseItemStore
 * @extends Neo.data.Store
 */
class ReleaseItemStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.dueDates.ReleaseItemStore'
         * @protected
         */
        className: 'Neo.examples.board.dueDates.ReleaseItemStore',
        /**
         * @member {Neo.data.Model} model=ReleaseItemModel
         */
        model: ReleaseItemModel
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct({
            data: ReleaseItemStore.buildReleaseItems(),
            ...config
        })
    }

    /**
     * @summary Returns a local `YYYY-MM-DD` string shifted by `dayOffset` days from `anchor` without DST rollover.
     * @param {Number} dayOffset
     * @param {Date} [anchor=new Date()]
     * @returns {String}
     */
    static offsetIsoDate(dayOffset, anchor=new Date()) {
        const shifted = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + dayOffset, 12, 0, 0, 0);

        return DateUtil.convertToyyyymmdd(shifted)
    }

    /**
     * @summary Builds the 20-card Horizon 4.2 release calendar dataset with deadlines anchored relative to `anchor` (default today).
     * @description Five active deliverables across `Backlog`, `In progress`, and `In review` sit past their deadline
     * (`-4d` to `-1d`), two fall on today (`0d`), nine land over the next two weeks (`+1d` to `+11d`), and four completed
     * deliverables in `Shipped` carry past dates without triggering overdue alerts.
     * @param {Date} [anchor=new Date()]
     * @returns {Object[]}
     */
    static buildReleaseItems(anchor=new Date()) {
        const d = offset => ReleaseItemStore.offsetIsoDate(offset, anchor);

        return [
        // Backlog (5 cards: 1 overdue, 4 upcoming)
        {
            id         : 'rel-01',
            title      : 'Migration guide: legacy store keys',
            description: 'Document keyProperty upgrade steps and automated codemod checks.',
            status     : 'backlog',
            order      : 1000,
            area       : 'Docs',
            tags       : ['Docs', 'Breaking'],
            assignees  : ['Clio'],
            progress   : 0,
            dueDate    : d(-2)
        },
        {
            id         : 'rel-02',
            title      : 'RTL layout pass on filter bar',
            description: 'Verify logical margin and inline-border tokens under dir="rtl".',
            status     : 'backlog',
            order      : 2000,
            area       : 'UI',
            tags       : ['UI', 'RTL'],
            assignees  : ['Julia'],
            progress   : 0,
            dueDate    : d(1)
        },
        {
            id         : 'rel-03',
            title      : 'Offline cache eviction telemetry',
            description: 'Emit structured quota counters when IndexedDB trims cold chunks.',
            status     : 'backlog',
            order      : 3000,
            area       : 'Runtime',
            tags       : ['Runtime'],
            assignees  : ['Euclid'],
            progress   : 0,
            dueDate    : d(4)
        },
        {
            id         : 'rel-04',
            title      : 'Docker preview image slimming',
            description: 'Strip build-time font caches from the preview runner layer.',
            status     : 'backlog',
            order      : 4000,
            area       : 'Infra',
            tags       : ['Infra'],
            assignees  : ['Ada Lovelace'],
            progress   : 0,
            dueDate    : d(7)
        },
        {
            id         : 'rel-05',
            title      : 'Post-cut npm provenance badge',
            description: 'Verify attestation link on the package README after registry publish.',
            status     : 'backlog',
            order      : 5000,
            area       : 'Infra',
            tags       : ['Release'],
            assignees  : ['Grace Hopper'],
            progress   : 0,
            dueDate    : d(11)
        },

        // In progress (6 cards: 2 overdue, 1 today, 3 upcoming)
        {
            id         : 'rel-06',
            title      : 'OAuth token rotation audit',
            description: 'Verify refresh-token replay detection across multi-window tabs.',
            status     : 'in-progress',
            order      : 1000,
            area       : 'Security',
            tags       : ['Security', 'Blocker'],
            assignees  : ['Ada Lovelace', 'Grace Hopper'],
            progress   : 65,
            dueDate    : d(-4)
        },
        {
            id         : 'rel-07',
            title      : 'Safari WebWorker memory profile',
            description: 'Capture 30-minute heap baseline on iOS 19 and macOS Safari.',
            status     : 'in-progress',
            order      : 2000,
            area       : 'Runtime',
            tags       : ['Perf', 'Safari'],
            assignees  : ['Emmy Noether'],
            progress   : 50,
            dueDate    : d(-2)
        },
        {
            id         : 'rel-08',
            title      : 'Tarball smoke walk on fresh app',
            description: 'Pack dev tarball, install in clean workspace, and run board + gantt.',
            status     : 'in-progress',
            order      : 3000,
            area       : 'QA',
            tags       : ['QA', 'Gate'],
            assignees  : ['Sophie Germain'],
            progress   : 75,
            dueDate    : d(0)
        },
        {
            id         : 'rel-09',
            title      : 'Locale number & currency fixtures',
            description: 'Add de-DE, ja-JP, and ar-EG rounding snapshots to unit suite.',
            status     : 'in-progress',
            order      : 4000,
            area       : 'Data',
            tags       : ['i18n'],
            assignees  : ['Maryam Mirzakhani'],
            progress   : 40,
            dueDate    : d(2)
        },
        {
            id         : 'rel-10',
            title      : 'High-DPI canvas resize throttle',
            description: 'Coalesce ResizeObserver bursts to one OffscreenCanvas transfer per frame.',
            status     : 'in-progress',
            order      : 5000,
            area       : 'Runtime',
            tags       : ['Canvas'],
            assignees  : ['Vega'],
            progress   : 30,
            dueDate    : d(5)
        },
        {
            id         : 'rel-11',
            title      : 'E2E shard balance & retry guard',
            description: 'Keep all fifteen Chromium shards inside a six-minute ceiling.',
            status     : 'in-progress',
            order      : 6000,
            area       : 'QA',
            tags       : ['CI'],
            assignees  : ['Euclid'],
            progress   : 20,
            dueDate    : d(9)
        },

        // In review (5 cards: 2 overdue, 1 today, 2 upcoming)
        {
            id         : 'rel-12',
            title      : 'CSP header policy review',
            description: 'Confirm worker-src and style-src-elem directives need no unsafe-eval.',
            status     : 'review',
            order      : 1000,
            area       : 'Security',
            tags       : ['Security'],
            assignees  : ['Maryam Mirzakhani'],
            progress   : 90,
            dueDate    : d(-3)
        },
        {
            id         : 'rel-13',
            title      : 'Keyboard focus trap in modal sheets',
            description: 'Ensure Shift+Tab wraps cleanly from header close to Save button.',
            status     : 'review',
            order      : 2000,
            area       : 'A11y',
            tags       : ['A11y', 'Keyboard'],
            assignees  : ['Vega'],
            progress   : 85,
            dueDate    : d(-1)
        },
        {
            id         : 'rel-14',
            title      : 'Changelog & API diff verification',
            description: 'Cross-check public config additions against JSDoc @member types.',
            status     : 'review',
            order      : 3000,
            area       : 'Docs',
            tags       : ['Docs', 'Gate'],
            assignees  : ['Euclid', 'Clio'],
            progress   : 80,
            dueDate    : d(0)
        },
        {
            id         : 'rel-15',
            title      : 'Dark & light cover asset checksums',
            description: 'Verify paired 1280x720 covers exist before flipping hasLightCover.',
            status     : 'review',
            order      : 4000,
            area       : 'Portal',
            tags       : ['Portal'],
            assignees  : ['Emmy Noether'],
            progress   : 95,
            dueDate    : d(3)
        },
        {
            id         : 'rel-16',
            title      : 'Screen-reader live-region announcements',
            description: 'Test polite column-move announcements under VoiceOver and NVDA.',
            status     : 'review',
            order      : 5000,
            area       : 'A11y',
            tags       : ['A11y'],
            assignees  : ['Grace Hopper'],
            progress   : 90,
            dueDate    : d(6)
        },

        // Shipped (4 cards: past deadlines completed on time — never flagged overdue)
        {
            id         : 'rel-17',
            title      : 'Shared time-axis tick snapping',
            description: 'Unified 15-minute and 1-day snap math across Scheduler and Gantt.',
            status     : 'shipped',
            order      : 1000,
            area       : 'Runtime',
            tags       : ['Timeline'],
            assignees  : ['Euclid'],
            progress   : 100,
            dueDate    : d(-6)
        },
        {
            id         : 'rel-18',
            title      : 'Card editor date field binding',
            description: 'Round-trip YYYY-MM-DD edits from CardEditor onto board cards.',
            status     : 'shipped',
            order      : 2000,
            area       : 'Board',
            tags       : ['Board'],
            assignees  : ['Maryam Mirzakhani'],
            progress   : 100,
            dueDate    : d(-4)
        },
        {
            id         : 'rel-19',
            title      : 'Theme token parity check',
            description: 'Enforce matching --neo-board-* custom properties across all five themes.',
            status     : 'shipped',
            order      : 3000,
            area       : 'Themes',
            tags       : ['Themes'],
            assignees  : ['Ada Lovelace'],
            progress   : 100,
            dueDate    : d(-2)
        },
        {
            id         : 'rel-20',
            title      : 'Sitemap & llms.txt route manifest',
            description: 'Keep canonical route metadata synchronized on every deploy.',
            status     : 'shipped',
            order      : 4000,
            area       : 'SEO',
            tags       : ['SEO'],
            assignees  : ['Julia'],
            progress   : 100,
            dueDate    : d(-1)
        }
        ]
    }
}

export default Neo.setupClass(ReleaseItemStore);
