import List from '../../../src/list/Base.mjs';

/**
 * @summary The places along the walk. A row shows its category's icon and the place's name, says what the place is
 * below the name, and ends with how far away it is.
 * @class Neo.examples.sheet.base.PlaceList
 * @extends Neo.list.Base
 */
class PlaceList extends List {
    static config = {
        /**
         * @member {String} className='Neo.examples.sheet.base.PlaceList'
         * @protected
         */
        className: 'Neo.examples.sheet.base.PlaceList'
    }

    /**
     * @param {Record} record
     * @returns {Object}
     */
    createItemContent(record) {
        return {
            cn: [
                {tag: 'span', 'aria-hidden': 'true', cls: ['neo-sheet-example-place-icon', ...record.iconCls.split(' ')]},
                {tag: 'span', cls: ['neo-sheet-example-place-name'],     text: record.name},
                {tag: 'span', cls: ['neo-sheet-example-place-category'], text: record.category},
                {tag: 'span', cls: ['neo-sheet-example-place-distance'], text: record.distanceText}
            ]
        }
    }
}

export default Neo.setupClass(PlaceList);
