import GridContainer from '../../../src/grid/Container.mjs';
import Store         from '../../../src/data/Store.mjs';

/**
 * @summary The Music app: the library's tracks in a grid, over a store of track records.
 * @class Neo.examples.desktop.basic.Music
 * @extends Neo.grid.Container
 */
class Music extends GridContainer {
    static config = {
        /**
         * @member {String} className='Neo.examples.desktop.basic.Music'
         * @protected
         */
        className: 'Neo.examples.desktop.basic.Music',
        /**
         * @member {String[]} cls=['desktop-basic-music']
         */
        cls: ['desktop-basic-music'],
        /**
         * @member {Object[]} columns
         */
        columns: [
            {dataField: 'id',       text: '#',      width: 56},
            {dataField: 'title',    text: 'Title',  flex : 3},
            {dataField: 'artist',   text: 'Artist', flex : 2},
            {dataField: 'album',    text: 'Album',  flex : 2},
            {dataField: 'duration', text: 'Time',   width: 96, renderer: ({value}) => `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`}
        ],
        /**
         * The library, invented for the example
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
    }
}

export default Neo.setupClass(Music);
