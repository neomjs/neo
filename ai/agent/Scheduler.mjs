import Base from '../../src/core/Base.mjs';

/**
 * A priority queue for managing agent events.
 * Ensures critical system events are processed before user input or telemetry.
 *
 * @class Neo.ai.agent.Scheduler
 * @extends Neo.core.Base
 */
class Scheduler extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.agent.Scheduler'
         * @protected
         */
        className: 'Neo.ai.agent.Scheduler',
        /**
         * Defines the priority levels and their processing order.
         * @member {String[]} levels=['critical','high','normal','low']
         */
        levels: ['critical', 'high', 'normal', 'low']
    }

    /**
     * Internal storage for queues.
     * @member {Object} queues
     * @protected
     */
    queues = {
        critical: [],
        high    : [],
        normal  : [],
        low     : []
    }

    /**
     * Adds an event to the scheduler.
     * @param {Object} event
     * @param {String} event.type - Event type (e.g., 'system:error', 'user:input')
     * @param {String} [event.priority='normal'] - Priority level
     * @param {*} [event.data] - Payload
     */
    add(event) {
        const priority = event.priority || this.determinePriority(event.type);
        
        // Ensure priority is set on the stored event for downstream visibility
        event.priority = priority;

        if (!this.queues[priority]) {
            console.warn(`[Scheduler] Unknown priority '${priority}' for event '${event.type}'. Defaulting to 'normal'.`);
            this.queues.normal.push(event);
        } else {
            this.queues[priority].push(event);
        }
    }

    /**
     * Retrieves and removes the next highest priority event.
     * @returns {Object|null} The event or null if empty.
     */
    next() {
        for (const level of this.levels) {
            if (this.queues[level].length > 0) {
                return this.queues[level].shift();
            }
        }
        return null;
    }

    /**
     * Checks if there are any pending events.
     * @returns {Boolean}
     */
    isEmpty() {
        return this.levels.every(level => this.queues[level].length === 0);
    }

    /**
     * Heuristic to determine priority from event type if not specified.
     * @param {String} type
     * @returns {String}
     */
    determinePriority(type) {
        if (type.includes('error')     || type.includes('crash'))  return 'critical';
        if (type.includes('user')      || type.includes('prompt')) return 'high';
        if (type.includes('telemetry') || type.includes('log'))    return 'low';
        return 'normal';
    }
}

export default Neo.setupClass(Scheduler);
