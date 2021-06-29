import Color from '../model/Color.mjs';
import Store from '../../../src/data/Store.mjs';

/**
 * @class Neo.calendar.store.Colors
 * @extends Neo.data.Store
 */
class Colors extends Store {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.store.Colors'
         * @protected
         */
        className: 'Neo.calendar.store.Colors',
        /**
         * @member {Object[]} data=
         */
        data: [
            {id: 1, color: 'red'},
            {id: 2, color: 'pink'},
            {id: 3, color: 'yellow'}
        ],
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=Color
         */
        model: Color
    }}
}

Neo.applyClassConfig(Colors);

export {Colors as default};
