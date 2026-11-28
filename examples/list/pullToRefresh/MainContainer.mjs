import Buffered      from '../../../src/list/Buffered.mjs';
import Button        from '../../../src/button/Base.mjs';
import Container     from '../../../src/container/Base.mjs';
import Label         from '../../../src/component/Label.mjs';
import PullToRefresh from '../../../src/list/plugin/PullToRefresh.mjs';
import ThemeSwitcher from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar       from '../../../src/toolbar/Base.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

const sections = ['North trail', 'The marsh', 'Creek bridge', 'South trail', 'Willow grove', 'West meadow'],
      notesUrl = new URL('./resources/notes.json', import.meta.url);

/**
 * @summary Reloads a scrolling field-note feed from either its touch gesture or its Refresh button.
 * @class Neo.examples.list.pullToRefresh.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /** @member {String} className='Neo.examples.list.pullToRefresh.MainContainer' */
        className: 'Neo.examples.list.pullToRefresh.MainContainer',
        /** @member {Object[]} items The app bar, update count and feed with its floating indicator. */
        items: [{
            module: Toolbar,
            cls   : ['neo-pull-refresh-example-toolbar'],
            flex  : 'none',
            items : [{
                module: Label,
                text  : 'Field notes',
                cls   : ['neo-pull-refresh-example-title']
            }, '->', {
                module: ThemeSwitcher,
                ui    : 'secondary'
            }, {
                module   : Button,
                handler  : 'up.refreshFeed',
                reference: 'refreshButton',
                text     : 'Refresh',
                ui       : 'secondary'
            }]
        }, {
            module   : Label,
            cls      : ['neo-pull-refresh-example-count'],
            flex     : 'none',
            id       : 'pull-refresh-count',
            reference: 'count',
            role     : 'status',
            text     : 'Refreshed 0 times'
        }, {
            module: Container,
            cls   : ['neo-pull-refresh-example-body'],
            flex  : 1,
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module      : Buffered,
                displayField: 'title',
                flex        : 1,
                id          : 'pull-refresh-feed',
                itemHeight  : 50,
                listeners   : {refresh: 'up.onRefresh'},
                plugins     : [{module: PullToRefresh}],
                reference   : 'feed',
                store       : {
                    data       : Array.from({length: 30}, (_, i) => ({
                        id   : String(i + 1),
                        title: `${sections[i % sections.length]} · Note ${i + 1}`
                    })),
                    keyProperty: 'id',
                    model      : {fields: [{name: 'id', type: 'String'}, {name: 'title', type: 'String'}]}
                }
            }, {
                module   : Label,
                cls      : ['neo-pull-refresh-example-indicator'],
                hidden   : true,
                id       : 'pull-refresh-indicator',
                reference: 'indicator',
                role     : 'status',
                text     : 'Pull to refresh'
            }]
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }

    /** @member {Number} refreshCount=0 */
    refreshCount = 0

    /** @summary Keeps the ordinary button and indicator in sync with the list plugin. */
    onConstructed() {
        super.onConstructed();

        const plugin = this.getRefreshPlugin();

        this.observeConfig(plugin, 'distance', () => this.syncIndicator());
        this.observeConfig(plugin, 'refreshing', () => this.syncIndicator())
    }

    /**
     * @summary Finds the refresh command on the feed.
     * @returns {Neo.list.plugin.PullToRefresh}
     * @protected
     */
    getRefreshPlugin() {
        return this.getReference('feed').getPlugin('plugin-list-pull-to-refresh')
    }

    /**
     * @summary Gives the button and keyboard activation the same command as the pull.
     * @returns {Promise<Boolean>}
     */
    refreshFeed() {
        return this.getRefreshPlugin().refresh()
    }

    /**
     * @summary Holds the refresh indicator while the feed's request is in flight.
     * @param {Object} data
     * @param {Function} data.waitUntil
     */
    onRefresh({waitUntil}) {
        waitUntil(this.loadNotes())
    }

    /** @summary Reads the latest field notes and replaces the feed's records. */
    async loadNotes() {
        const response = await fetch(notesUrl, {cache: 'no-store'});

        if (!response.ok) {
            throw new Error(`Field notes returned ${response.status}`)
        }

        const notes = await response.json();

        if (!this.isDestroyed) {
            this.getReference('feed').store.setData(notes);
            const count = ++this.refreshCount;
            this.getReference('count').text = `Refreshed ${count} ${count === 1 ? 'time' : 'times'}`
        }
    }

    /** @summary Paints bounded finger travel without moving the scroll host. */
    syncIndicator() {
        const {distance, refreshing, threshold} = this.getRefreshPlugin();

        this.getReference('indicator').set({
            hidden: distance === 0,
            style : {transform: `translate(-50%, ${distance}px)`},
            text  : refreshing ? 'Refreshing…' : distance >= threshold ? 'Release to refresh' : 'Pull to refresh'
        });

        this.getReference('refreshButton').disabled = refreshing
    }
}

export default Neo.setupClass(MainContainer);
