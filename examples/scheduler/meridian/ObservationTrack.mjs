import TimelineColumn from '../../../src/timeline/Column.mjs';
import {eventBand}    from './Night.mjs';

/**
 * @summary Shows a proposed exposure on its telescope track alongside the actual bookings.
 * @class Neo.examples.scheduler.meridian.ObservationTrack
 * @extends Neo.timeline.Column
 */
class ObservationTrack extends TimelineColumn {
    static config = {
        /** @member {String} className @protected */
        className: 'Neo.examples.scheduler.meridian.ObservationTrack'
    }

    /** @summary Paints the current candidate in the same time coordinates as the committed bars.
     * @param {Object} data Native grid row render context.
     * @returns {Object} The timeline cell's VDOM.
     */
    cellRenderer(data) {
        const cell = super.cellRenderer(data), candidate = data.gridContainer.candidate;
        if (this.timeAxis) cell.cn[0].cn.unshift(eventBand(this.timeAxis));
        if (!candidate || !data.record || this.getResourceId(data.record) !== candidate.resourceId) return cell;

        const track = cell.cn[0], axis = this.timeAxis,
              left  = Math.max(0, axis.dateToOffset(candidate.start)),
              right = Math.min(axis.totalSize, axis.dateToOffset(candidate.end));
        if (right > left) track.cn.push({
            id   : `${track.id}__candidate`, cls: ['meridian-slot-preview'], 'aria-hidden': 'true',
            data : {verdict: candidate.accepted ? 'accepted' : 'denied', resource: candidate.resourceId},
            style: {position: 'absolute', left: `${left}px`, width: `${right - left}px`, pointerEvents: 'none'},
            text : 'ARC-17'
        });
        return cell
    }
}

export default Neo.setupClass(ObservationTrack);
