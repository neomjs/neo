import Util from '../../core/Util.mjs';

/**
 * @summary Resolves a JSON-RPC method name to the service instance and handler that answer it.
 *
 * The pure dispatch rule behind `Neo.ai.Client#handleRequest`, kept side-effect free so the registered map
 * can be witnessed in unit tests: importing the Client singleton opens a WebSocket in every test worker.
 *
 * A method matches the FIRST registered prefix it starts with, in registration order, so one key serves a
 * family (`get_dom_event` answers `get_dom_event_listeners` and `get_dom_event_summary`). The handler is
 * the camelCase form of the full method name on that service; a prefix hit without such a handler resolves
 * to nothing rather than falling through to a later prefix.
 *
 * @param {Object} serviceMap Prefix → service instance, in registration order.
 * @param {String} method     The snake_case JSON-RPC method name.
 * @returns {{service: Object, fn: Function}|null} The owning service and its handler, or `null` when no
 *     registered prefix matches or the matched service has no handler for the name.
 */
export function resolveServiceMethod(serviceMap, method) {
    let prefix;

    for (prefix in serviceMap) {
        if (method.startsWith(prefix)) {
            const
                service = serviceMap[prefix],
                fn      = service[Util.snakeToCamel(method)];

            return typeof fn === 'function' ? {service, fn} : null
        }
    }

    return null
}
