import HashHistory from '../../util/HashHistory.mjs';
import Service     from './Service.mjs';

/**
 * Handles runtime environment related Neural Link requests.
 * @class Neo.ai.client.RuntimeService
 * @extends Neo.ai.client.Service
 */
class RuntimeService extends Service {
    static config = {
        /**
         * @member {String} className='Neo.ai.client.RuntimeService'
         * @protected
         */
        className: 'Neo.ai.client.RuntimeService'
    }

    /**
     * @param {Object} params
     * @returns {Object}
     */
    getDragState(params) {
        const dragCoordinator = Neo.manager?.DragCoordinator;

        if (dragCoordinator) {
            return {
                activeTargetZone: dragCoordinator.activeTargetZone ? {
                    id       : dragCoordinator.activeTargetZone.id,
                    sortGroup: dragCoordinator.activeTargetZone.sortGroup,
                    windowId : dragCoordinator.activeTargetZone.windowId
                } : null,
                sortZones: Array.from(dragCoordinator.sortZones.entries()).map(([group, map]) => ({
                    group,
                    windows: Array.from(map.keys())
                }))
            }
        }

        return {};
    }

    /**
     * @param {Object} params
     * @param {Number} [params.windowId]
     * @returns {Object}
     */
    getRouteHistory({windowId}) {
        const stack = HashHistory.getStack(windowId);

        return {
            count   : stack.length,
            history : stack,
            windowId: windowId || null
        }
    }

    /**
     * @param {Object} params
     * @returns {Object}
     */
    getWindowInfo(params) {
        const windowManager = Neo.manager?.Window;

        if (windowManager) {
            return {
                windows: windowManager.items.map(win => ({
                    id       : win.id,
                    appName  : win.appName,
                    chrome   : win.chrome,
                    innerRect: win.innerRect,
                    outerRect: win.outerRect
                }))
            }
        }

        return {windows: []};
    }

    /**
     * @param {Object} params
     * @returns {Object}
     */
    reloadPage(params) {
        Neo.Main.reloadWindow();
        return {status: 'reloading'};
    }

    /**
     * @param {Object} params
     * @param {String} params.hash
     * @param {Number} [params.windowId]
     * @returns {Object}
     */
    setRoute({hash, windowId}) {
        Neo.Main.setRoute({
            value: hash,
            windowId
        });

        return {status: 'ok', hash}
    }
}

export default Neo.setupClass(RuntimeService);
