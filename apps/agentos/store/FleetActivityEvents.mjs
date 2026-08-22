import FleetActivityEventModel from '../model/FleetActivityEvent.mjs';
import Store                   from '../../../src/data/Store.mjs';

/**
 * @class AgentOS.store.FleetActivityEvents
 * @extends Neo.data.Store
 *
 * @summary Provider-owned append-only activity history keyed by producer identity.
 *
 * A fleet poll is a bounded recent page, not an authoritative full snapshot. Missing rows therefore
 * remain retained; rows with known ids update in place and new ids join. The local ring evicts only
 * after {@link #maxRecords} and counts every eviction. This keeps source counts distinct from local
 * retention while giving {@link Neo.list.Buffered} one stable Store across pane projections.
 */
class FleetActivityEvents extends Store {
    static config = {
        /**
         * @member {String} className='AgentOS.store.FleetActivityEvents'
         * @protected
         */
        className: 'AgentOS.store.FleetActivityEvents',
        /**
         * @member {String} keyProperty='eventId'
         */
        keyProperty: 'eventId',
        /**
         * The retained-history bound. Large enough for the ticket's 500-event witness while still
         * making memory pressure explicit and finite.
         * @member {Number} maxRecords_=1000
         * @reactive
         */
        maxRecords_: 1000,
        /**
         * @member {Neo.data.Model} model=FleetActivityEventModel
         * @reactive
         */
        model: FleetActivityEventModel,
        /**
         * Newest first; event id is the deterministic tie-breaker for equal timestamps.
         * @member {Object[]} sorters
         * @reactive
         */
        sorters: [{property: 'occurredAt', direction: 'DESC'}, {property: 'eventId', direction: 'ASC'}]
    }

    /**
     * Events evicted by this Store's local retention ring over its lifetime.
     * @member {Number} droppedCount=0
     * @readonly
     */
    droppedCount = 0

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @returns {Number}
     * @protected
     */
    beforeSetMaxRecords(value, oldValue) {
        return Number.isInteger(value) && value > 0 ? value : (oldValue ?? 1000)
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetMaxRecords(value, oldValue) {
        if (this.isConstructed) {
            this.trimRetention()
        }
    }

    /**
     * @summary Reconciles one bounded producer page without interpreting omission as deletion.
     *
     * The entire page validates before mutation. Missing or duplicate `eventId` values reject the
     * page, leaving retained truth untouched. Known records update in place; new records join in one
     * collection transaction, then the oldest tail is evicted at the local bound.
     * @param {Object[]} events
     * @param {Object} [options={}]
     * @param {Boolean} [options.replace=false] Replace the honestly-labelled sample on first live admission.
     * @returns {{added: Number, dropped: Number, retained: Number, newEventIds: String[]}}
     */
    ingestSnapshot(events = [], {replace = false} = {}) {
        if (!Array.isArray(events)) {
            throw new TypeError('[FleetActivityEvents] snapshot must be an array')
        }

        const seen = new Set();

        events.forEach(event => {
            const eventId = typeof event?.eventId === 'string' ? event.eventId.trim() : '';

            if (!eventId) {
                throw new TypeError('[FleetActivityEvents] every event requires a producer-owned eventId')
            }
            if (seen.has(eventId)) {
                throw new TypeError(`[FleetActivityEvents] duplicate eventId "${eventId}" in one snapshot`)
            }

            seen.add(eventId)
        });

        const me           = this,
              joiners      = [],
              newEventIds  = [],
              beforeDrop   = me.droppedCount,
              wasSuspended = me.suspendEvents;

        me.suspendEvents = true;

        try {
            events.forEach(event => {
                const record = me.get(event.eventId);

                if (record) {
                    record.set(event)
                } else {
                    joiners.push(event);
                    newEventIds.push(event.eventId)
                }
            });

            if (replace) {
                const staleIds = me.items
                    .filter(record => !seen.has(record.eventId))
                    .map(record => record.eventId);

                staleIds.length > 0 && me.remove(staleIds)
            }

            joiners.length > 0 && me.add(joiners);
            me.trimRetention()
        } finally {
            me.suspendEvents = wasSuspended;

            if (!wasSuspended) {
                me.fire('load', {items: me.items, total: me.count})
            }
        }

        return {
            added   : joiners.length,
            dropped : me.droppedCount - beforeDrop,
            retained: me.count,
            newEventIds
        }
    }

    /**
     * @summary Evicts the oldest sorted tail at the local bound and records the retention loss.
     * @returns {Number} Number evicted by this call.
     * @protected
     */
    trimRetention() {
        const excess = Math.max(0, this.count - this.maxRecords);

        if (excess > 0) {
            const ids = this.items.slice(-excess).map(record => record.eventId);

            this.remove(ids);
            this.droppedCount += excess
        }

        return excess
    }
}

export default Neo.setupClass(FleetActivityEvents);
