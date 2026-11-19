import Button    from '../../../../src/button/Base.mjs';
import Container from '../../../../src/container/Base.mjs';
import GlassGrid from './GlassGrid.mjs';
import Label     from '../../../../src/component/Label.mjs';
import RowModel  from '../../../../src/selection/grid/RowModel.mjs';
import Store     from '../../../../src/data/Store.mjs';
import Toolbar   from '../../../../src/toolbar/Base.mjs';

const formatTime = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * @summary The Music app: the library's tracks in a grid, and a now-playing bar for the selected track. The window
 * opens on the first track, paused.
 * @class WebDesktop.view.apps.Music
 * @extends Neo.container.Base
 */
class Music extends Container {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.apps.Music'
         * @protected
         */
        className: 'WebDesktop.view.apps.Music',
        /**
         * @member {String[]} cls=['webdesktop-music']
         */
        cls: ['webdesktop-music'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module    : GlassGrid,
            cls       : ['webdesktop-music-library'],
            flex      : 1,
            reference : 'library',
            viewConfig: {selectionModel: {module: RowModel}},
            columns   : [
                {dataField: 'id',       text: '#',      width: 52},
                {dataField: 'title',    text: 'Title',  flex : 3},
                {dataField: 'artist',   text: 'Artist', flex : 2},
                {dataField: 'album',    text: 'Album',  flex : 2},
                {dataField: 'duration', text: 'Time',   width: 76, renderer: ({value}) => formatTime(value)}
            ],
            /**
             * The library, invented for the demo
             * @member {Object} store
             */
            store: {
                module: Store,
                model : {
                    fields: [
                        {name: 'album',    type: 'String'},
                        {name: 'artist',   type: 'String'},
                        {name: 'duration', type: 'Integer'},
                        {name: 'id',       type: 'Integer'},
                        {name: 'title',    type: 'String'}
                    ]
                },
                data: [
                    {id:  1, title: 'Morning Over Harbour Street', artist: 'The Lantern Years', album: 'Low Tide Postcards', duration: 214},
                    {id:  2, title: 'Paper Boats',                 artist: 'The Lantern Years', album: 'Low Tide Postcards', duration: 187},
                    {id:  3, title: 'Glasshouse',                  artist: 'The Lantern Years', album: 'Low Tide Postcards', duration: 245},
                    {id:  4, title: 'Signal Fires',                artist: 'Mira Okafor',       album: 'Northern Lines',     duration: 198},
                    {id:  5, title: 'Twelve Floors Up',            artist: 'Mira Okafor',       album: 'Northern Lines',     duration: 231},
                    {id:  6, title: 'Last Tram Home',              artist: 'Mira Okafor',       album: 'Northern Lines',     duration: 266},
                    {id:  7, title: 'Copper Sky',                  artist: 'Delta Fernweh',     album: 'Long Exposure',      duration: 302},
                    {id:  8, title: 'Slow Orbit',                  artist: 'Delta Fernweh',     album: 'Long Exposure',      duration: 279},
                    {id:  9, title: 'Static and Rain',             artist: 'Delta Fernweh',     album: 'Long Exposure',      duration: 193},
                    {id: 10, title: 'Afterglow Avenue',            artist: 'Delta Fernweh',     album: 'Long Exposure',      duration: 247},
                    {id: 11, title: 'Window Seat',                 artist: 'Juno Halvorsen',    album: 'Window Seat',        duration: 221},
                    {id: 12, title: 'The Long Way Round',          artist: 'Juno Halvorsen',    album: 'Window Seat',        duration: 288}
                ]
            }
        }, {
            module: Toolbar,
            cls   : ['webdesktop-music-now-playing'],
            flex  : 'none',
            items : [{
                module   : Button,
                handler  : 'up.onPlayButtonClick',
                iconCls  : 'fas fa-play',
                reference: 'play-button',
                vdom     : {'aria-label': 'Play'}
            }, {
                module   : Label,
                cls      : ['webdesktop-music-track'],
                reference: 'track',
                text     : ''
            }, '->', {
                module   : Label,
                cls      : ['webdesktop-music-duration'],
                reference: 'duration',
                text     : ''
            }]
        }]
    }

    /**
     * True while the bar shows the selected track as playing
     * @member {Boolean} #playing=false
     * @private
     */
    #playing = false

    /**
     * Shows the selected track in the now-playing bar, and opens on the first one once the library has its rows.
     */
    onConstructed() {
        super.onConstructed();

        let me      = this,
            library = me.getReference('library'),
            {store} = library;

        library.view.selectionModel.on({selectionChange: me.onSelectionChange, scope: me});
        store.on({load: me.onLibraryLoad, once: true, scope: me})
    }

    /**
     * Selects the first track and shows it. A grid selects by record id; `selectRow()` fires no `selectionChange`, so
     * the bar takes the track here.
     */
    onLibraryLoad() {
        let me     = this,
            {view} = me.getReference('library'),
            track  = view.store.getAt(0);

        view.selectionModel.selectRow(view.getRecordId(track));
        me.showTrack(track)
    }

    /**
     * Toggles between playing and paused. The demo ships no audio, so the bar shows the state only.
     */
    onPlayButtonClick() {
        let me      = this,
            button  = me.getReference('play-button'),
            playing = me.#playing = !me.#playing;

        // The icon change renders the button, and with it the label
        button.vdom['aria-label'] = playing ? 'Pause' : 'Play';
        button.iconCls            = playing ? 'fas fa-pause' : 'fas fa-play'
    }

    /**
     * @param {Object}            data
     * @param {Neo.data.Record[]} data.records
     */
    onSelectionChange({records}) {
        records[0] && this.showTrack(records[0])
    }

    /**
     * Shows a track in the now-playing bar
     * @param {Neo.data.Record} track
     */
    showTrack(track) {
        let me = this;

        me.getReference('track').text    = `${track.title} · ${track.artist}`;
        me.getReference('duration').text = formatTime(track.duration)
    }
}

export default Neo.setupClass(Music);
