import Base from '../../core/Base.mjs';

/**
 * @summary Connected-cluster greedy interval packer for overlapping timeline bars and calendar events.
 * @description Sweeps intervals sorted by `startDate ASC, endDate DESC` to assign each item a collision-free
 * `{item, lane, laneCount}` tuple without mutating the caller's input array. Partitions items into connected
 * overlap clusters (`nextStart >= clusterMaxEnd`) so each independent cluster receives its own tight
 * `laneCount` denominator. Also attaches a `.byItem` `Map` on the returned array for $O(1)$ record lookup.
 * @class Neo.timeline.util.IntervalPacker
 * @extends Neo.core.Base
 */
class IntervalPacker extends Base {
    static config = {
        /**
         * @member {String} className='Neo.timeline.util.IntervalPacker'
         * @protected
         */
        className: 'Neo.timeline.util.IntervalPacker',
        /**
         * Default end-date property name on packed items.
         * @member {String} endField='endDate'
         */
        endField: 'endDate',
        /**
         * Default start-date property name on packed items.
         * @member {String} startField='startDate'
         */
        startField: 'startDate'
    }

    /**
     * @summary Packs overlapping intervals into collision-free lanes per connected overlap cluster.
     * @param {Object[]} items Records or interval objects (order is preserved in the returned array)
     * @param {Object} [options={}]
     * @param {String} [options.startField='startDate'] Property name for interval start
     * @param {String} [options.endField='endDate'] Property name for interval end
     * @returns {Object[]} Packed entries; the array's `byItem` Map indexes them by input item.
     */
    static pack(items, options={}) {
        const
            results    = [],
            byItem     = new Map(),
            startField = options.startField || 'startDate',
            endField   = options.endField   || 'endDate';

        Object.defineProperty(results, 'byItem', {
            value     : byItem,
            enumerable: false
        });

        if (!Array.isArray(items) || items.length === 0) {
            return results
        }

        const entries = items.map((item, inputIndex) => {
            const
                rawStart = item?.[startField],
                rawEnd   = item?.[endField],
                startMs  = rawStart instanceof Date ? rawStart.getTime() : new Date(rawStart).getTime(),
                endMs    = rawEnd   instanceof Date ? rawEnd.getTime()   : new Date(rawEnd).getTime();

            return {
                item,
                inputIndex,
                startMs  : Number.isFinite(startMs) ? startMs : 0,
                endMs    : Number.isFinite(endMs)   ? Math.max(startMs, endMs) : (Number.isFinite(startMs) ? startMs : 0),
                lane     : 0,
                laneCount: 1
            }
        });

        // Sort working copy by startMs ASC, then longer/later endMs DESC, then original inputIndex ASC
        const sorted = [...entries].sort((a, b) =>
            (a.startMs - b.startMs) ||
            (b.endMs - a.endMs)     ||
            (a.inputIndex - b.inputIndex)
        );

        let cluster       = [],
            laneEndTimes  = [],
            clusterMaxEnd = -Infinity;

        const flushCluster = () => {
            if (cluster.length === 0) {
                return
            }
            const laneCount = Math.max(1, laneEndTimes.length);
            for (const entry of cluster) {
                entry.laneCount = laneCount
            }
            cluster      = [];
            laneEndTimes = [];
            clusterMaxEnd = -Infinity
        };

        for (const entry of sorted) {
            // A positive-width cluster closes when the next interval starts at or after clusterMaxEnd.
            // Zero-duration milestones at the exact boundary of an active positive interval after its end also close.
            if (cluster.length > 0 && entry.startMs >= clusterMaxEnd && (entry.startMs > clusterMaxEnd || clusterMaxEnd > cluster[0].startMs)) {
                flushCluster()
            }

            let assignedLane = -1;

            for (let lane = 0; lane < laneEndTimes.length; lane++) {
                // Zero-duration milestones occupy their instant, so two milestones at the same timestamp take distinct lanes
                const canReuse = entry.startMs === entry.endMs
                    ? laneEndTimes[lane] < entry.startMs
                    : laneEndTimes[lane] <= entry.startMs;

                if (canReuse) {
                    assignedLane = lane;
                    break
                }
            }

            if (assignedLane === -1) {
                assignedLane = laneEndTimes.length;
                laneEndTimes.push(entry.endMs)
            } else {
                laneEndTimes[assignedLane] = entry.endMs
            }

            entry.lane = assignedLane;
            cluster.push(entry);

            if (entry.endMs > clusterMaxEnd) {
                clusterMaxEnd = entry.endMs
            }
        }

        flushCluster();

        for (const entry of entries) {
            const packed = {
                item     : entry.item,
                lane     : entry.lane,
                laneCount: entry.laneCount
            };
            results.push(packed);
            byItem.set(entry.item, packed)
        }

        return results
    }

    /**
     * @summary Instance delegate for `IntervalPacker.pack(items, options)`.
     * @param {Object[]} items
     * @param {Object} [options={}]
     * @returns {Object[]} Packed entries; the array's `byItem` Map indexes them by input item.
     */
    pack(items, options={}) {
        return this.constructor.pack(items, {
            startField: this.startField,
            endField  : this.endField,
            ...options
        })
    }
}

export default Neo.setupClass(IntervalPacker);
