import Service       from './Service.mjs';
import WindowManager from '../../manager/Window.mjs';

const
    defaultAnchor     = Object.freeze({x: 0.5, y: 0.5}),
    defaultSteps      = 8,
    maxDurationMs     = 30000,
    maxSteps          = 120,
    minStepDurationMs = 16;

/**
 * @param {String} phase
 * @param {String} code
 * @param {String} message
 * @param {Object|null} source
 * @param {Object|null} destination
 * @returns {Object}
 */
function driveFailure(phase, code, message, source=null, destination=null) {
    return {
        cleanup : {attempted: false, succeeded: true},
        destination,
        dispatch: {down: false, moveCount: 0, up: false},
        error   : {code, message},
        observed: {ended: false, moveCount: 0, started: false},
        phase,
        released: false,
        sensor  : null,
        source,
        success : false
    }
}

/**
 * @summary Registers the JSON-RPC method prefixes owned by one InteractionService instance.
 * Keeping the mapping executable here gives the Client one registration path and unit tests one
 * side-effect-free route witness; importing the Client singleton solely to inspect its map would
 * open a real transport in every test worker.
 * @param {Object} serviceMap Mutable Client prefix map.
 * @param {InteractionService} service Owning service instance.
 * @returns {Object} The same map after registration.
 */
export function registerInteractionServiceMethods(serviceMap, service) {
    return Object.assign(serviceMap, {
        drive_drag    : service,
        simulate_event: service
    })
}

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
        let me      = this,
            success = true;

        if (!Array.isArray(events)) {
            throw new Error('InteractionService: events must be an array')
        }

        for (const event of events) {
            if (event.delay) {
                await me.timeout(event.delay)
            }

            const dispatched = await me.dispatch({
                id      : event.targetId,
                options : event.options,
                type    : event.type,
                windowId: event.windowId
            });

            success = dispatched && success
        }

        return success
    }

    /**
     * @summary Reads one window's current Main-realm geometry with a finite inner-viewport origin.
     *
     * The Window manager is the cross-window projection, but an ordinary dedicated-worker window
     * can connect before publishing a geometry record. Atomic automation needs live geometry at
     * execution time anyway, so the owning Main realm is the authority and the manager's shared
     * calculator keeps browser-chrome normalization identical to the projection path.
     * @param {String} windowId
     * @returns {Promise<Object>}
     * @protected
     */
    async resolveWindow(windowId) {
        if (typeof windowId !== 'string' || !windowId) {
            throw new Error('windowId must be a non-empty string')
        }

        const
            windowData = await Neo.Main.getWindowData({windowId}),
            geometry   = windowData ? WindowManager.calculateGeometry(windowData) : null;

        if (!geometry?.innerRect || !Number.isFinite(geometry.innerRect.x) || !Number.isFinite(geometry.innerRect.y)) {
            throw new Error(`window '${windowId}' has no live inner-viewport geometry`)
        }

        return {id: windowId, ...geometry}
    }

    /**
     * @summary Reads one target's visual viewport rect from its owning Main realm.
     * @param {String} targetId
     * @param {String} windowId
     * @returns {Promise<Object>}
     * @protected
     */
    async resolveDomRect(targetId, windowId) {
        const rect = await Neo.main.DomAccess.getBoundingClientRect({id: targetId, windowId});

        if (
            !rect || !Number.isFinite(rect.x) || !Number.isFinite(rect.y) ||
            !Number.isFinite(rect.width) || !Number.isFinite(rect.height) ||
            rect.width <= 0 || rect.height <= 0
        ) {
            throw new Error(`target '${targetId}' in window '${windowId}' has no finite rendered rectangle`)
        }

        return rect
    }

    /**
     * @summary Validates one normalized node anchor.
     * @param {Object|null} anchor
     * @returns {{x:Number,y:Number}}
     * @protected
     */
    normalizeAnchor(anchor) {
        anchor ??= defaultAnchor;

        if (
            !Neo.isObject(anchor) || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) ||
            anchor.x < 0 || anchor.x > 1 || anchor.y < 0 || anchor.y > 1
        ) {
            throw new Error('anchor must contain finite x/y values in [0,1]')
        }

        return {x: anchor.x, y: anchor.y}
    }

    /**
     * @summary Converts a target-window local point into both global screen and source-event client
     * coordinates. Destination windows provide geometry only; every event still routes to source Main.
     * @param {Object} options
     * @param {Number} options.clientX
     * @param {Number} options.clientY
     * @param {Object} options.sourceWindow
     * @param {String} options.windowId
     * @returns {Promise<Object>}
     * @protected
     */
    async resolvePoint({clientX, clientY, sourceWindow, targetId, windowId}) {
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
            throw new Error('target-local clientX/clientY must be finite')
        }

        const
            targetWindow = windowId === sourceWindow.id ? sourceWindow : await this.resolveWindow(windowId),
            screen       = {
                x: targetWindow.innerRect.x + clientX,
                y: targetWindow.innerRect.y + clientY
            };

        return {
            screen,
            sourceEventClient: {
                x: screen.x - sourceWindow.innerRect.x,
                y: screen.y - sourceWindow.innerRect.y
            },
            targetClient: {x: clientX, y: clientY},
            ...(targetId ? {targetId} : {}),
            windowId
        }
    }

    /**
     * @summary Resolves one DOM node descriptor at its normalized visual anchor.
     * @param {Object} descriptor
     * @param {Object} sourceWindow
     * @returns {Promise<Object>}
     * @protected
     */
    async resolveNodePoint({anchor, targetId, windowId}, sourceWindow) {
        if (typeof targetId !== 'string' || !targetId || typeof windowId !== 'string' || !windowId) {
            throw new Error('node mode requires non-empty targetId and windowId')
        }

        const
            normalized = this.normalizeAnchor(anchor),
            rect       = await this.resolveDomRect(targetId, windowId);

        return this.resolvePoint({
            clientX: rect.x + rect.width  * normalized.x,
            clientY: rect.y + rect.height * normalized.y,
            sourceWindow,
            targetId,
            windowId
        })
    }

    /**
     * @summary Resolves one destination/waypoint descriptor through exactly one declared mode.
     * @param {Object} descriptor
     * @param {Object} source
     * @param {Object} sourceWindow
     * @param {Boolean} allowDelta
     * @returns {Promise<Object>}
     * @protected
     */
    async resolveDescriptor(descriptor, source, sourceWindow, allowDelta=true) {
        if (!Neo.isObject(descriptor)) {
            throw new Error('destination and waypoints must be objects')
        }

        if (Object.hasOwn(descriptor, 'screenX') || Object.hasOwn(descriptor, 'screenY')) {
            throw new Error('caller-supplied screen coordinates are not accepted; Engine derives them from window geometry')
        }

        const
            nodeMode  = Object.hasOwn(descriptor, 'targetId'),
            pointMode = Object.hasOwn(descriptor, 'clientX') || Object.hasOwn(descriptor, 'clientY'),
            deltaMode = Object.hasOwn(descriptor, 'deltaX') || Object.hasOwn(descriptor, 'deltaY'),
            modeCount = Number(nodeMode) + Number(pointMode) + Number(deltaMode);

        if (modeCount !== 1 || (deltaMode && !allowDelta)) {
            throw new Error(`descriptor requires exactly one ${allowDelta ? 'node, point, or delta' : 'node or point'} mode`)
        }

        if (nodeMode) {
            return this.resolveNodePoint(descriptor, sourceWindow)
        }

        if (pointMode) {
            if (typeof descriptor.windowId !== 'string' || !descriptor.windowId) {
                throw new Error('point mode requires windowId')
            }

            return this.resolvePoint({...descriptor, sourceWindow})
        }

        if (!Number.isFinite(descriptor.deltaX) || !Number.isFinite(descriptor.deltaY)) {
            throw new Error('delta mode requires finite deltaX/deltaY')
        }

        return this.resolvePoint({
            clientX : source.targetClient.x + descriptor.deltaX,
            clientY : source.targetClient.y + descriptor.deltaY,
            sourceWindow,
            windowId: source.windowId
        })
    }

    /**
     * @summary Resolves and executes one whole physical drag while preserving Engine/Brain ownership:
     * App validates and resolves geometry, source Main drives and observes the atomic Mouse lifecycle.
     * Every expected refusal returns a typed failure receipt rather than throwing metadata the current
     * JSON-RPC path cannot preserve.
     * @param {Object} request
     * @returns {Promise<Object>}
     */
    async driveDrag({destination, durationMs, source, steps=defaultSteps, waypoints=[]}={}) {
        let resolvedSource      = null,
            resolvedDestination = null,
            executionStarted    = false;

        try {
            if (!Neo.isObject(source)) {
                throw new Error('source is required')
            }

            if (!Number.isInteger(steps) || steps < 1 || steps > maxSteps) {
                throw new Error(`steps must be an integer in [1,${maxSteps}]`)
            }

            durationMs ??= Math.max(160, steps * 20);

            if (!Number.isFinite(durationMs) || durationMs < steps * minStepDurationMs || durationMs > maxDurationMs) {
                throw new Error(`durationMs must be between steps * ${minStepDurationMs} and ${maxDurationMs}`)
            }

            if (!Array.isArray(waypoints)) {
                throw new Error('waypoints must be an array')
            }

            const sourceWindow = await this.resolveWindow(source.windowId);

            resolvedSource      = await this.resolveNodePoint(source, sourceWindow);
            resolvedDestination = await this.resolveDescriptor(destination, resolvedSource, sourceWindow, true);

            const resolvedWaypoints = [];

            for (const waypoint of waypoints) {
                resolvedWaypoints.push(await this.resolveDescriptor(waypoint, resolvedSource, sourceWindow, false))
            }

            await Neo.Main.importAddon({name: 'DragDrop', windowId: source.windowId});
            await Neo.Main.importAddon({name: 'EventSimulator', windowId: source.windowId});

            executionStarted = true;

            const outcome = await Neo.main.addon.EventSimulator.driveDrag({
                destination: resolvedDestination,
                durationMs,
                path       : [...resolvedWaypoints, resolvedDestination],
                source     : resolvedSource,
                steps,
                windowId   : source.windowId
            });

            return Neo.isObject(outcome) ? outcome :
                driveFailure('dispatch', 'INVALID_DRIVE_RESPONSE', 'source Main returned no structured drive receipt', resolvedSource, resolvedDestination)
        } catch (error) {
            return driveFailure(
                executionStarted ? 'dispatch' : 'resolution',
                executionStarted ? 'DRIVE_RPC_FAILED' : 'DRIVE_RESOLUTION_FAILED',
                error?.message || String(error),
                resolvedSource,
                resolvedDestination
            )
        }
    }

    /**
     * Helper to dispatch a single event to the correct window
     * @param {Object} data
     * @param {String} data.id
     * @param {Object} data.options
     * @param {String} data.type
     * @param {String} data.windowId
     * @returns {Promise<Boolean>}
     */
    async dispatch({id, options, type, windowId}) {
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
