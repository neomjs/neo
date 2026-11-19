import List     from '../../../src/list/Base.mjs';
import SortZone from '../../../src/draggable/list/SortZone.mjs';

/**
 * @summary The team wall: a wrapping grid of portrait cards, each with its place. A card moves by drag.
 * @class Neo.examples.list.reorder.PersonList
 * @extends Neo.list.Base
 */
class PersonList extends List {
    static config = {
        /**
         * @member {String} className='Neo.examples.list.reorder.PersonList'
         * @protected
         */
        className: 'Neo.examples.list.reorder.PersonList',
        /**
         * @member {String[]} baseCls=['neo-reorder-wall','neo-list']
         * @protected
         */
        baseCls: ['neo-reorder-wall', 'neo-list'],
        /**
         * A card is moved, not chosen
         * @member {Boolean} disableSelection=true
         */
        disableSelection: true,
        /**
         * @member {Boolean} draggable=true
         */
        draggable: true,
        /**
         * Cards sit in rows, so the left and right halves of a card decide before or after
         * @member {Object} dragZoneConfig
         */
        dragZoneConfig: {
            module         : SortZone,
            dragProxyConfig: {cls: ['neo-list', 'neo-reorder-wall']},
            sortDirection  : 'horizontal'
        }
    }

    /**
     * @param {Object} record
     * @param {Number} index
     * @returns {Object[]}
     */
    createItemContent(record, index) {
        return [
            {tag: 'img', alt: '', src: `${Neo.config.resourcesPath}examples/${record.image}`},
            {cls: ['neo-reorder-name'],  text: `${record.firstname} ${record.lastname}`},
            {cls: ['neo-reorder-place'], text: index + 1}
        ]
    }
}

export default Neo.setupClass(PersonList);
