import List     from '../../../src/list/Base.mjs';
import SortZone from '../../../src/draggable/list/SortZone.mjs';

const segments = [
    {id: 'guest', title: 'The night-shift interview', source: 'Remote line', duration: 120},
    {id: 'film',  title: 'Night Service',             source: 'Recorded film', duration: 90}
];

/**
 * @summary The upcoming segments in transmission order. A drop and the alternate cue button
 * both commit through the same SortZone and its ordered store.
 * @class Neo.examples.list.onAir.Rundown
 * @extends Neo.list.Base
 */
class Rundown extends List {
    static config = {
        className       : 'Neo.examples.list.onAir.Rundown',
        baseCls         : ['air-list', 'neo-list'],
        disableSelection: true,
        draggable       : true,
        dragZoneConfig  : {module: SortZone, dragProxyConfig: {cls: ['air-list', 'neo-list']}},
        store           : {
            model  : {fields: [{name: 'id'}, {name: 'title'}, {name: 'source'}, {name: 'duration', type: 'Integer'}, {name: 'order', type: 'Integer'}]},
            sorters: [{property: 'order', reapplyOnRecordChange: true}]
        }
    }

    /** @summary Restores fresh records in the original transmission order for a new rehearsal. */
    resetSegments() {
        this.store.clear();
        this.store.add(segments.map((segment, order) => ({...segment, order})))
    }

    /**
     * @summary Renders the segment's current position, source and fixed running time.
     * @param {Neo.data.Record} record
     * @param {Number} index
     * @returns {Object[]}
     */
    createItemContent(record, index) {
        return [
            {tag: 'span', cls: ['air-grip'], 'aria-hidden': 'true', text: '⠿'},
            {tag: 'span', cls: ['air-order'], text: String(index + 1).padStart(2, '0')},
            {tag: 'span', cls: ['air-row-label'], cn: [
                {tag: 'strong', text: record.title}, {tag: 'small', text: record.source}
            ]},
            {tag: 'span', cls: ['air-duration'], text: new Date(record.duration * 1000).toISOString().slice(14, 19)}
        ]
    }
}

export default Neo.setupClass(Rundown);
