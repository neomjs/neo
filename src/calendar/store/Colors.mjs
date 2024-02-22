import Color from '../model/Color.mjs';
import Store from '../../../src/data/Store.mjs';

/**
 * @class Neo.calendar.store.Colors
 * @extends Neo.data.Store
 */
class Colors extends Store {
    static config = {
        /**
         * @member {String} className='Neo.calendar.store.Colors'
         * @protected
         */
        className: 'Neo.calendar.store.Colors',
        /**
         * @member {Object[]} data
         */
        data: [
            {id: 1, name: 'red'},
            {id: 2, name: 'pink'},
            {id: 3, name: 'orange'},
            {id: 4, name: 'yellow'},
            {id: 5, name: 'green'},
            {id: 6, name: 'blue'}
        ],
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=Color
         */
        model: Color
    }
}

Neo.setupClass(Colors);

export default Colors;
