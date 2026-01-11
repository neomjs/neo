import Base        from '../core/Base.mjs';
import HashHistory from '../util/HashHistory.mjs';

const
    regexAmountSlashes = /\//g,
    // Regex to extract the parameter name from a single route segment (e.g., {*itemId} -> itemId)
    regexParamNameExtraction = /{(\*|\.\.\.)?([^}]+)}/,
    // Regex to match route parameters like {paramName}, {*paramName}, or {...paramName}
    regexRouteParam    = /{(\*|\.\.\.)?([^}]+)}/g;

/**
 * @class Neo.controller.Base
 * @extends Neo.core.Base
 */
class Controller extends Base {
    static config = {
        /**
         * @member {String} className='Neo.controller.Base'
         * @protected
         */
        className: 'Neo.controller.Base',
        /**
         * @member {String} ntype='controller'
         * @protected
         */
        ntype: 'controller',
        /**
         * If the URL does not contain a hash value when this controller instance is created,
         * Neo.mjs will automatically set this hash value, ensuring a default route is active.
         * @member {String|null} defaultHash=null
         */
        defaultHash: null,
        /**
         * Specifies the handler method to be invoked when no other defined route matches the URL hash.
         * This acts as a fallback for unhandled routes.
         * @member {String|null} defaultRoute=null
         */
        defaultRoute: null,
        /**
         * Internal map of compiled regular expressions for each route, used for efficient hash matching.
         * @protected
         * @member {Object} handleRoutes={}
         */
        handleRoutes: {},
        /**
         * Defines the routing rules for the controller. Keys are route patterns, and values are either
         * handler method names (String) or objects containing `handler` and optional `preHandler` method names.
         * Route patterns can include parameters like `{paramName}` and wildcards like `{*paramName}` for nested paths.
         * @example
         * routes: {
         *     '/home'                         : 'handleHomeRoute',
         *     '/users/{userId}'               : {handler: 'handleUserRoute', preHandler: 'preHandleUserRoute'},
         *     '/users/{userId}/posts/{postId}': 'handlePostRoute',
         *     '/learn/{*itemId}'              : 'onLearnRoute', // Captures nested paths like /learn/gettingstarted/Workspaces
         *     'default'                       : 'handleOtherRoutes'
         * }
         * @member {Object} routes_={}
         * @reactive
         */
        routes_: {}
    }

    /**
     * Creates a new Controller instance and registers its `onHashChange` method
     * to listen for changes in the browser's URL hash.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        HashHistory.on('change', this.onHashChange, this)
    }

    /**
     * Processes the defined routes configuration, compiling route patterns into regular expressions
     * for efficient matching and sorting them by specificity (more slashes first).
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    afterSetRoutes(value, oldValue){
        let me        = this,
            routeKeys = Object.keys(value);

         me.routes = routeKeys.sort(me.#sortRoutes).reduce((obj, key) => {
             obj[key] = value[key];
             return obj
         }, {});

        me.handleRoutes = {};

        routeKeys.forEach(key => {
            if (key.toLowerCase() === 'default'){
                me.defaultRoute = value[key]
            } else {
                me.handleRoutes[key] = new RegExp('^' + key.replace(regexRouteParam, (match, isWildcard, paramName) => {
                    if (isWildcard || paramName.startsWith('*')) {
                        return '(.*)'
                    } else {
                        return '([\\w-.]+)'
                    }
                }) + '$')
            }
        })
    }

    /**
     * @param args
     */
    destroy(...args) {
        HashHistory.un('change', this.onHashChange, this);
        super.destroy(...args)
    }

    /**
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        let me                      = this,
            {defaultHash, windowId} = me,
            currentHash             = HashHistory.first(windowId);

        if (currentHash) {
            if (currentHash.windowId === windowId) {
                await me.onHashChange(currentHash, null)
            }
        } else {
            /*
             * worker.App: onLoadApplication() will push config.hash into the HashHistory with a 5ms delay.
             * We only want to set a default route, in case the HashHistory is empty and there is no initial
             * value that will get consumed.
             */
            !Neo.config.hash && defaultHash && Neo.Main.setRoute({value: defaultHash, windowId})
        }
    }

    /**
     * Handles changes in the browser's URL hash. It identifies the most specific matching route
     * and dispatches the corresponding handler, optionally executing a preHandler first.
     * @param {Object} value    The new hash history entry.
     * @param {Object} oldValue The previous hash history entry.
     */
    async onHashChange(value, oldValue) {
        // We only want to trigger hash changes for the same browser window (SharedWorker context)
        if (value.windowId !== this.windowId) {
            return
        }

        let me                     = this,
            {handleRoutes, routes} = me,
            routeKeys              = Object.keys(handleRoutes),
            bestMatch              = null,
            bestMatchKey           = null,
            bestMatchParams        = null;

        for (let i = 0; i < routeKeys.length; i++) {
            const key = routeKeys[i];
            const result = value.hashString.match(handleRoutes[key]);

            if (result) {
                const
                    arrayParamIds    = key.match(regexRouteParam),
                    arrayParamValues = result.splice(1, result.length - 1),
                    paramObject      = {};

                if (arrayParamIds) {
                    for (let j = 0; j < arrayParamIds.length; j++) {
                        const paramMatch = arrayParamIds[j].match(regexParamNameExtraction);

                        if (paramMatch) {
                            const paramName = paramMatch[2];
                            paramObject[paramName] = arrayParamValues[j];
                        }
                    }
                }

                // Logic to determine the best matching route:
                // 1. Prioritize routes that match a longer string (more specific match).
                // 2. If lengths are equal, prioritize routes with more slashes (deeper nesting).
                if (!bestMatch || (result[0].length > bestMatch[0].length) ||
                    (result[0].length === bestMatch[0].length && (key.match(regexAmountSlashes) || []).length > (bestMatchKey.match(regexAmountSlashes) || []).length)) {
                    bestMatch = result;
                    bestMatchKey = key;
                    bestMatchParams = paramObject;
                }
            }
        }

        if (bestMatch) {
            const route = routes[bestMatchKey];
            let handler    = null,
                preHandler = null;

            if (Neo.isString(route)) {
                handler = route
            } else if (Neo.isObject(route)) {
                handler    = route.handler;
                preHandler = route.preHandler
            }

            let responsePreHandler = true;

            value.capturedRoute = bestMatchKey;

            if (preHandler) {
                responsePreHandler = await me[preHandler]?.call(me, bestMatchParams, value, oldValue)
            }

            if (responsePreHandler) {
                await me[handler]?.call(me, bestMatchParams, value, oldValue)
            }
        } else {
            if (me.defaultRoute) {
                value.capturedRoute = me.defaultRoute;
                me[me.defaultRoute]?.(value, oldValue)
            } else {
                value.capturedRoute = null;
                me.onNoRouteFound(value, oldValue)
            }
        }
    }

    /**
     * Placeholder method invoked when no matching route is found for the current URL hash.
     * Controllers can override this to implement custom behavior for unhandled routes.
     * @param {Object} value - The current hash history entry.
     * @param {Object} oldValue - The previous hash history entry.
     */
    onNoRouteFound(value, oldValue) {

    }

    /**
     * Internal helper method to sort routes by their specificity.
     * Routes with more slashes are considered more specific and are prioritized.
     * @param {String} route1 - The first route string to compare.
     * @param {String} route2 - The second route string to compare.
     * @returns {Number} A negative value if route1 is more specific, a positive value if route2 is more specific, or 0 if they have equal specificity.
     */
    #sortRoutes(route1, route2) {
        return (route1.match(regexAmountSlashes) || []).length - (route2.match(regexAmountSlashes)|| []).length
    }
}

export default Neo.setupClass(Controller);
