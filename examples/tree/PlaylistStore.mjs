import Store from '../../src/data/Store.mjs';

/**
 * @summary The tracks dropped into the playlist, in the order they arrived. A track's `title` is the line the playlist
 * shows: its name, its length and its artist, so a line too long for the playlist cuts the artist, not the length.
 * @class Neo.examples.tree.PlaylistStore
 * @extends Neo.data.Store
 */
class PlaylistStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.tree.PlaylistStore'
         * @protected
         */
        className: 'Neo.examples.tree.PlaylistStore',
        /**
         * @member {Object} model
         */
        model: {
            fields: [
                {name: 'artist',   type: 'String'},
                {name: 'duration', type: 'Integer', defaultValue: 0},
                {name: 'id',       type: 'String'},
                {name: 'name',     type: 'String'},
                {name: 'title',    type: 'String', calculate: data => `${data.name} · ${PlaylistStore.formatDuration(data.duration)} · ${data.artist}`}
            ]
        }
    }

    /**
     * @param {Number} seconds
     * @returns {String} The length as minutes and seconds, `3:42`
     */
    static formatDuration(seconds) {
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
    }
}

export default Neo.setupClass(PlaylistStore);
