import Scheduler        from '../../../src/scheduler/Container.mjs';
import ObservationTrack from './ObservationTrack.mjs';

const utcTime = date => date.toISOString().slice(11, 16);

/**
 * @summary The telescopes' live observing schedule. The row hit and its time axis locate proposed exposures;
 * only the desk commits an admitted change to the night's shared plan.
 * @class Neo.examples.scheduler.meridian.ObservationScheduler
 * @extends Neo.scheduler.Container
 */
class ObservationScheduler extends Scheduler {
    static config = {
        /** @member {String} className @protected */
        className: 'Neo.examples.scheduler.meridian.ObservationScheduler',
        /** @member {String[]} cls */
        cls: ['meridian-scheduler'],
        /** @member {Number} minimumDuration */
        minimumDuration: 1,
        /** @member {Object|null} planningController Owns bookings and their dependent tasks. */
        planningController: null,
        /** @member {Boolean} resizableBars Integration times belong to the requested program. */
        resizableBars: false,
        /** @member {Object[]} resourceColumns */
        resourceColumns: [{dataField: 'name', text: 'Telescope', width: 132, locked: 'start'}],
        /** @member {Number} rowHeight */
        rowHeight: 48,
        /** @member {String} timelineText */
        timelineText: 'Observing time · UTC',
        /** @member {Function} minorFormatter */
        minorFormatter: tick => utcTime(tick.date),
        /** @member {Function} barRenderer */
        barRenderer({barKey}, {vdom}) {
            vdom.cls.push('meridian-booking');
            vdom.data.booking = String(barKey);
            return vdom
        }
    }

    /** @member {Object|null} candidate The proposed span; it is never added to the event store. */
    candidate = null

    /** @summary Installs the renderer that can draw a proposed span on a resource row. @returns {Function} */
    getTimelineColumnClass() { return ObservationTrack }

    /** @summary Reads an owned resource and snapped UTC time from the actual pointer hit on a rendered track.
     * A locked resource label or another widget's row is not a time slot.
     * @param {Object} data Pointer sensor event in the source viewport.
     * @returns {{resourceId: String, startDate: Date}|null}
     */
    slotAtPointer(data) {
        const path        = data.targetPath || data.path || [],
              {trackNode} = this.extractBarTarget(path),
              row         = trackNode && this.resolveRowTarget(data);
        if (!row || !Number.isFinite(trackNode.rect?.left) || !Number.isFinite(data.clientX)) return null;

        const axis = this.timeAxis, offset = data.clientX - trackNode.rect.left;
        if (offset < 0 || offset >= axis.totalSize) return null;
        return {resourceId: row.resourceId, startDate: axis.snap(axis.offsetToDate(offset))}
    }

    /** @summary Shows the same proposed span for a pointer or keyboard comparison, leaving the event store untouched.
     * @param {Object} slot Telescope and snapped start time.
     * @param {Boolean} accepted Whether this slot meets the night's constraints.
     * @param {Number} [durationMinutes=4] Requested exposure duration.
     */
    showCandidate(slot, accepted, durationMinutes=4) {
        const {resourceId, startDate} = slot, start = +startDate,
              end                     = start + durationMinutes * 60000, old = this.candidate;
        if (old?.resourceId === resourceId && old.start === start && old.end === end && old.accepted === accepted) return;
        this.candidate = {resourceId, start, end, accepted};
        this.timelineColumn?.refreshMountedRows()
    }

    /** @summary Removes the speculative span from the telescope tracks. */
    clearCandidate() {
        if (this.candidate) {
            this.candidate = null;
            this.timelineColumn?.refreshMountedRows()
        }
    }

    /** @summary Routes native pointer, keyboard and editor changes through the same booking authority as a card drop.
     * @param {Object|String} eventIdOrRecord Event record, id or single-object scheduler request.
     * @param {Object} [changes] Proposed event edits.
     * @param {Object} [meta] Native gesture metadata.
     * @returns {Object|null} The accepted updates or null if refused.
     */
    moveEvent(eventIdOrRecord, changes={}, meta={}) {
        ({eventIdOrRecord, changes, meta} = this.normalizeMoveEventArgs(eventIdOrRecord, changes, meta, arguments.length));
        const record = this.resolveEventRecord(eventIdOrRecord);
        if (!record || !this.planningController) return null;
        if (record.id !== 'arc17' && record.id !== 'mosaic') {
            this.planningController.notice('This calibration is reserved for the night.');
            return null
        }
        return this.planningController.editBooking(record, changes, meta)
    }
}

export default Neo.setupClass(ObservationScheduler);
