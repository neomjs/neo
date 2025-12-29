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
     * @returns {Object}
     */
    getRouteHistory(params) {
        const
            windowId = params.windowId,
            stack    = HashHistory.getStack(windowId);

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
     * @returns {Object}
     */
    setRoute(params) {
        Neo.Main.setRoute({
            value   : params.hash,
            windowId: params.windowId
        });

        return {status: 'ok', hash: params.hash}
    }
}

export default Neo.setupClass(RuntimeService);
