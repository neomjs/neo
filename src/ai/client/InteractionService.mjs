import Service from './Service.mjs';

/**
 * Service for handling interaction simulation commands.
 *
 * @class Neo.ai.client.InteractionService
 * @extends Neo.ai.client.Service
 */
class InteractionService extends Service {
    static config = {
        /**
         * @member {String} className='Neo.ai.client.InteractionService'
         * @protected
         */
        className: 'Neo.ai.client.InteractionService'
    }

    /**
     * Simulates a native DOM event sequence on the client.
     *
     * @param {Object} params
     * @param {Object[]} params.events - Sequence of event config objects
     * @returns {Promise<Boolean>}
     */
    async simulateEvent({events}) {
        let me = this;

        if (!Array.isArray(events)) {
            throw new Error('InteractionService: events must be an array')
        }

        for (const event of events) {
            if (event.delay) {
                await me.timeout(event.delay)
            }

            await me.dispatch(event.targetId, event.type, event.options, event.windowId)
        }

        return true
    }

    /**
     * Helper to dispatch a single event to the correct window
     * @param {String} id
     * @param {String} type
     * @param {Object} options
     * @param {String} windowId
     * @returns {Promise<Boolean>}
     */
    async dispatch(id, type, options, windowId) {
        await Neo.Main.importAddon({name: 'EventSimulator', windowId});

        return await Neo.main.addon.EventSimulator.dispatch({
            id,
            options,
            type,
            windowId
        })
    }
}

export default Neo.setupClass(InteractionService);
