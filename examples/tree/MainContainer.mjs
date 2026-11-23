import CheckBox              from '../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../ConfigurationViewport.mjs';
import LibraryStore          from './LibraryStore.mjs';
import List                  from '../../src/list/Base.mjs';
import NumberField           from '../../src/form/field/Number.mjs';
import Panel                 from '../../src/container/Panel.mjs';
import PlaylistStore         from './PlaylistStore.mjs';
import TreeList              from '../../src/tree/List.mjs';

/**
 * @summary A tree list over a music library, above the playlist it drags into. A track dropped onto the playlist
 * joins it; with `DragZone.leafNodesOnly` off, an album or an artist brings every track it holds. The drop arrives as
 * the tree's drag zone `drop` event, with the dragged record in the zone's `data`.
 * @class Neo.examples.tree.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.tree.MainContainer'
         * @protected
         */
        className: 'Neo.examples.tree.MainContainer',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {String[]} cls=['examples-tree-library']
         * @reactive
         */
        cls: ['examples-tree-library'],
        /**
         * @member {String} componentName='Tree list'
         */
        componentName: 'Tree list',
        /**
         * @member {Number} configItemLabelWidth=100
         */
        configItemLabelWidth: 100,
        /**
         * @member {Number} configItemWidth=230
         */
        configItemWidth: 230,
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'hbox', align: 'stretch'}
    }

    /**
     * The tracks the playlist opens with, so the drop zone reads as a playlist before the first drop
     * @member {String[]} startTracks
     */
    startTracks = ['lanterns-ferry-1', 'okafor-hours-2']

    /**
     * @summary Adds the tracks of the given records to the playlist: a track itself, a folder every track it holds.
     * A track already on the playlist stays where it is.
     * @param {Neo.data.Model[]} records
     */
    addToPlaylist(records) {
        let me      = this,
            {store} = me.getReference('playlist-list'),
            tracks  = records.flatMap(record => me.getTracks(record)).filter(track => !store.get(track.id));

        if (tracks.length > 0) {
            store.add(tracks.map(track => ({
                artist  : me.getArtist(track).name,
                duration: track.duration,
                id      : track.id,
                name    : track.name
            })))
        }
    }

    /**
     * @returns {Object[]}
     */
    createConfigurationComponents() {
        let me       = this,
            treeList = me.exampleComponent;

        return [{
            module        : CheckBox,
            checked       : treeList.disableSelection,
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onConfigChange.bind(me, 'disableSelection')},
            valueLabel    : 'disableSelection'
        }, {
            module        : CheckBox,
            checked       : treeList.draggable,
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onConfigChange.bind(me, 'draggable')},
            style         : {marginTop: '10px'},
            valueLabel    : 'draggable'
        }, {
            module        : CheckBox,
            checked       : treeList.dragZone?.leafNodesOnly || false,
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onLeafNodesOnlyChange.bind(me)},
            style         : {marginTop: '10px'},
            valueLabel    : 'DragZone.leafNodesOnly'
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 1200,
            minValue : 200,
            stepSize : 5,
            value    : treeList.height,
            style    : {marginTop: '10px'}
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 1200,
            minValue : 200,
            stepSize : 5,
            style    : {marginTop: '10px'},
            value    : treeList.width
        }]
    }

    /**
     * @summary Returns the `Neo.tree.List` config over `LibraryStore` with playlist drag-and-drop configured.
     * @returns {Object}
     */
    createExampleComponent() {
        let me = this;

        return {
            module                    : TreeList,
            cls                       : ['tree-library'],
            draggable                 : true,
            height                    : 420,
            showCollapseExpandAllIcons: false,
            store                     : LibraryStore,
            width                     : 320,

            dragZoneConfig: {
                dropZoneIdentifier: {cls: ['tree-playlist-drop']},
                listeners         : {drop: me.onPlaylistDrop, scope: me}
            }
        }
    }

    /**
     * @summary The playlist under the tree, the drop zone its drag zone names.
     * @returns {Object[]}
     */
    createStageItems() {
        return [{
            module         : Panel,
            cls            : ['tree-playlist'],
            height         : 260,
            reference      : 'playlist',
            width          : 320,
            containerConfig: {cls: ['tree-playlist-drop'], droppable: true},

            headers: [{
                dock : 'top',
                items: [{ntype: 'label', reference: 'playlist-title', text: 'Playlist'}]
            }],

            items: [{
                module      : List,
                displayField: 'title',
                reference   : 'playlist-list',
                store       : PlaylistStore
            }, {
                ntype: 'label',
                cls  : ['tree-playlist-hint'],
                flex : 'none',
                text : 'Drop a track or an album here'
            }]
        }]
    }

    /**
     * @param {Neo.data.Model} record A track, an album or an artist
     * @returns {Neo.data.Model} The artist at the root of its branch
     */
    getArtist(record) {
        let {store} = this.exampleComponent;

        while (record.parentId) {
            record = store.get(record.parentId)
        }

        return record
    }

    /**
     * @param {Neo.data.Model} record
     * @returns {Neo.data.Model[]} The record itself for a track, every track below it for a folder
     */
    getTracks(record) {
        let me = this;

        return record.isLeaf ? [record] : me.exampleComponent.store.find('parentId', record.id).flatMap(child => me.getTracks(child))
    }

    /**
     * @summary Opens the playlist on its start tracks, and keeps its title on the tracks it holds.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('playlist-list').store.on('load', me.refreshPlaylistTitle, me);
        me.addToPlaylist(me.startTracks.map(id => me.exampleComponent.store.get(id)))
    }

    /**
     * @param {Object} opts
     */
    onLeafNodesOnlyChange(opts) {
        let {dragZone} = this.exampleComponent;

        if (dragZone) {
            dragZone.leafNodesOnly = opts.value
        }
    }

    /**
     * @summary Adds the dragged record's tracks. The zone keeps the record in its `data` until shortly after the drop.
     */
    onPlaylistDrop() {
        let record = this.exampleComponent.dragZone?.data?.record;

        record && this.addToPlaylist([record])
    }

    /**
     * @summary Names how many tracks the playlist holds and how long it plays.
     */
    refreshPlaylistTitle() {
        let me      = this,
            {store} = me.getReference('playlist-list'),
            seconds = 0;

        store.forEach(track => {seconds += track.duration});

        me.getReference('playlist-title').text =
            `Playlist · ${store.count} ${store.count === 1 ? 'track' : 'tracks'} · ${PlaylistStore.formatDuration(seconds)}`
    }
}

export default Neo.setupClass(MainContainer);
