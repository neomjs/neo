import Button                          from '../../../src/button/Base.mjs';
import Component                       from '../../../src/component/Base.mjs';
import Container                       from '../../../src/container/Base.mjs';
import GridContainer                   from '../../../src/grid/Container.mjs';
import MainStore, {createSeededRandom} from './MainStore.mjs';
import Viewport                        from '../../../src/container/Viewport.mjs';

const TICK_DELTAS = [250, 500, -150, 350, 250, -200, 400];

/**
 * @summary Demonstrates all fourteen non-tree built-in grid column types on one 32-row open-source maintainer
 * sponsorship and activity sheet, with live seeded ticks on `animatedCurrency` and `animatedChange`.
 *
 * Columns are ordered and sized so the `640 × 360` catalog cover frames the first four types (`index`, `githubUser`,
 * `countryFlag`, `sparkline`) flush at `640 px`, the `1440 × 900` desktop opening frame lands nine types flush at
 * `1440 px` with the `+$250` `component` button beside `animatedCurrency`, and `390 × 844` phone viewports scroll
 * smoothly across all fourteen columns without locked-region gutters.
 * @class Neo.examples.grid.cellTypes.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.cellTypes.MainContainer'
         * @protected
         */
        className: 'Neo.examples.grid.cellTypes.MainContainer',
        /**
         * @member {String[]} cls=['neo-examples-grid-cell-types']
         */
        cls: ['neo-examples-grid-cell-types'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['cell-types-toolbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module  : Component,
                flex    : 1,
                minWidth: 0,
                vdom    : {cn: [
                    {cls: ['cell-types-title'], text: 'Built-in cell types'},
                    {cls: ['cell-types-instruction'], text: 'Watch values tick live, click +$250 on a row, or scroll across all 14 column types.'}
                ]}
            }, {
                module: Container,
                cls   : ['cell-types-actions'],
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'center'},
                items : [{
                    module   : Button,
                    cls      : ['cell-types-feed-button'],
                    handler  : 'up.onFeedButtonClick',
                    iconCls  : 'fa-solid fa-pause',
                    reference: 'feedButton',
                    text     : 'Pause feed',
                    ui       : 'ghost'
                }, {
                    module   : Button,
                    cls      : ['cell-types-reset-button'],
                    handler  : 'up.onResetButtonClick',
                    iconCls  : 'fa-solid fa-rotate-left',
                    reference: 'resetButton',
                    text     : 'Reset',
                    ui       : 'ghost'
                }, {
                    module   : Button,
                    cls      : ['cell-types-theme-button'],
                    handler  : 'up.onThemeButtonClick',
                    iconCls  : 'fa-solid fa-moon',
                    reference: 'themeButton',
                    text     : 'Dark theme',
                    tooltip  : 'Switch between the light and dark theme',
                    ui       : 'ghost'
                }]
            }]
        }, {
            module   : GridContainer,
            flex     : 1,
            reference: 'grid',
            rowHeight: 48,
            store    : MainStore,

            columns: [
                {type: 'index',            dataField: 'id',            text: '# · index',                  width: 96,  cellAlign: 'right'},
                {type: 'githubUser',       dataField: 'login',         text: 'Maintainer · githubUser',    width: 196},
                {type: 'countryFlag',      dataField: 'countryCode',   text: 'Country · countryFlag',      width: 176, contentField: 'location'},
                {type: 'sparkline',        dataField: 'trend',         text: 'Trend · sparkline',          width: 172, defaults: {usePulse: false, useTransition: false}},
                {type: 'animatedCurrency', dataField: 'pledged',       text: 'Pledged · animatedCurrency', width: 216, cellAlign: 'right', compareField: 'lastDelta', currency: 'USD'},
                {
                    type     : 'component',
                    cellAlign: 'center',
                    dataField: 'actionLabel',
                    text     : 'Back · component',
                    width    : 156,
                    defaults : {
                        module : Button,
                        cls    : ['cell-types-sponsor-button'],
                        handler: 'up.onSponsorButtonClick',
                        ui     : 'ghost'
                    },
                    component: ({value}) => ({text: value})
                },
                {type: 'progress',         dataField: 'goalPercent',   text: 'Funded · progress',          width: 164},
                {type: 'currency',         dataField: 'annualGoal',    text: 'Goal · currency',            width: 144, cellAlign: 'right', currency: 'USD'},
                {type: 'icon',             dataField: 'tierIcon',      text: 'Tier · icon',                width: 120, cellAlign: 'center'},
                {type: 'animatedChange',   dataField: 'recentCommits', text: 'Commits · animatedChange',   width: 212, cellAlign: 'right'},
                {type: 'iconLink',         dataField: 'topRepoUrl',    text: 'Repo · iconLink',            width: 156, cellIconCls: 'fa-brands fa-github', labelField: 'topRepoStars'},
                {type: 'linkedin',         dataField: 'linkedin',      text: 'Profile · linkedin',         width: 156, cellAlign: 'center'},
                {type: 'githubOrgs',       dataField: 'organizations', text: 'Orgs · githubOrgs',          width: 164},
                {type: 'column',           dataField: 'ecosystem',     text: 'Stack · column',             width: 160}
            ]
        }, {
            module: Component,
            cls   : ['cell-types-footer'],
            flex  : 'none',
            tag   : 'footer',
            text  : 'Names, avatars, flags, trends, orgs and links are public GitHub and LinkedIn profile data; pledges, goals, funded %, commits and tiers are generated for this demo.'
        }]
    }

    /**
     * @member {Boolean} #feedPaused=false
     * @private
     */
    #feedPaused = false
    /**
     * @member {Function} #feedRandom=createSeededRandom(0x21187feed)
     * @private
     */
    #feedRandom = createSeededRandom(0x21187feed)
    /**
     * @member {Number|null} #feedStartTimer=null
     * @private
     */
    #feedStartTimer = null
    /**
     * @member {Number|null} #feedTimer=null
     * @private
     */
    #feedTimer = null

    /** @summary Starts the live seeded feed after the initial static frame settles and syncs the theme button. */
    onConstructed() {
        super.onConstructed();
        this.syncThemeButton();
        this.scheduleFeed()
    }

    /** @summary Clears timers on teardown so worker intervals never leak past component destruction. */
    destroy(...args) {
        this.stopFeedTimers();
        super.destroy(...args)
    }

    /**
     * @summary Applies one sponsorship delta to a maintainer record, updating `pledged`, `lastDelta`, `goalPercent`,
     * and `recentCommits` in a single record mutation so `animatedCurrency`, `animatedChange`, and `progress` update together.
     * @param {Neo.data.Record} record
     * @param {Number} delta
     * @param {Number} [commitStep=1]
     */
    applySponsorshipTick(record, delta, commitStep = 1) {
        record.set({
            lastDelta    : delta,
            pledged      : Math.max(1000, record.pledged + delta),
            recentCommits: record.recentCommits + commitStep
        })
    }

    /** @summary Toggles the live sponsorship and commit feed on and off. */
    onFeedButtonClick() {
        this.#feedPaused = !this.#feedPaused;

        if (this.#feedPaused) {
            this.stopFeedTimers()
        } else {
            this.tickFeed();
            this.scheduleFeed(1200)
        }

        this.getReference('feedButton').set({
            iconCls: this.#feedPaused ? 'fa-solid fa-play' : 'fa-solid fa-pause',
            text   : this.#feedPaused ? 'Resume feed' : 'Pause feed'
        })
    }

    /** @summary Restores initial seeded values, clears active sorters and header sort state, and restarts the deterministic feed. */
    onResetButtonClick() {
        const store = this.getReference('grid').store;

        this.stopFeedTimers();
        this.#feedPaused = false;
        this.#feedRandom = createSeededRandom(0x21187feed);

        store.resetDirectory();

        this.getReference('feedButton').set({
            iconCls: 'fa-solid fa-pause',
            text   : 'Pause feed'
        });

        this.scheduleFeed()
    }

    /**
     * @summary Handles a click on a row's `Back · component` button (`+$250`).
     * @param {Object} data
     */
    onSponsorButtonClick({component}) {
        if (component?.record) {
            this.applySponsorshipTick(component.record, 250, 1)
        }
    }

    /**
     * @summary Switches between `neo-theme-neo-light` and `neo-theme-neo-dark` with a pointer view transition.
     * @param {Object} [data]
     * @returns {Promise<void>}
     */
    async onThemeButtonClick(data) {
        await Neo.main.DomAccess.startViewTransition({
            delay   : 100,
            reveal  : {x: data?.clientX, y: data?.clientY},
            windowId: this.windowId
        }).catch(() => {});

        this.theme = this.getTheme() === 'neo-theme-neo-dark' ? 'neo-theme-neo-light' : 'neo-theme-neo-dark';
        this.syncThemeButton()
    }

    /**
     * @summary Starts the periodic feed after an initial settle delay so the opening frame and cover capture are deterministic.
     * @param {Number} [initialDelay=1600]
     */
    scheduleFeed(initialDelay = 1600) {
        this.stopFeedTimers();

        this.#feedStartTimer = setTimeout(() => {
            this.#feedStartTimer = null;
            if (this.#feedPaused || this.isDestroyed) return;
            this.tickFeed();
            this.#feedTimer = setInterval(() => {
                if (!this.#feedPaused && !this.isDestroyed) {
                    this.tickFeed()
                }
            }, 1400)
        }, initialDelay)
    }

    /** @summary Clears pending start and interval handles. */
    stopFeedTimers() {
        if (this.#feedStartTimer !== null) {
            clearTimeout(this.#feedStartTimer);
            this.#feedStartTimer = null
        }

        if (this.#feedTimer !== null) {
            clearInterval(this.#feedTimer);
            this.#feedTimer = null
        }
    }

    /** @summary Labels the theme button with the skin its next click will select. */
    syncThemeButton() {
        const dark = this.getTheme() === 'neo-theme-neo-dark';

        this.getReference('themeButton').set({
            iconCls: dark ? 'fa-solid fa-sun' : 'fa-solid fa-moon',
            text   : dark ? 'Light theme' : 'Dark theme'
        })
    }

    /** @summary Advances two visible rows per tick using the seeded PRNG so visitors watch live cell animations immediately. */
    tickFeed() {
        const
            store = this.getReference('grid')?.store,
            limit = Math.min(10, store?.getCount?.() || 0);

        if (!limit) return;

        const
            firstIndex  = Math.floor(this.#feedRandom() * limit),
            secondIndex = (firstIndex + 1 + Math.floor(this.#feedRandom() * Math.max(1, limit - 1))) % limit,
            firstDelta  = TICK_DELTAS[Math.floor(this.#feedRandom() * TICK_DELTAS.length)],
            secondDelta = TICK_DELTAS[Math.floor(this.#feedRandom() * TICK_DELTAS.length)];

        this.applySponsorshipTick(store.getAt(firstIndex),  firstDelta,  1 + Math.floor(this.#feedRandom() * 3));
        this.applySponsorshipTick(store.getAt(secondIndex), secondDelta, 1 + Math.floor(this.#feedRandom() * 3))
    }
}

export default Neo.setupClass(MainContainer);
