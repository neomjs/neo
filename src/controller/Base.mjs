import CoreBase from '../core/Base.mjs';
import HashHistory from '../util/HashHistory.mjs';

const
    amountSlashesRegex = /\//g,
    routeParamRegex = /{[^\s/]+}/g

/**
 * @class Neo.controller.Base
 * @extends Neo.core.Base
 */
class Base extends CoreBase {
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
         * @member {String} defaultRoute=undefined
         */
        defaultRoute: null,
        /**
         * @member {Object} handleRoutes={}
         */
        handleRoutes: {},
        /**
         * @example
         * routes: {
         *     '/home'                         : 'handleHomeRoute',
         *     '/users/{userId}'               : {handler: 'handleUserRoute', preHandler: 'preHandleUserRoute'},
         *     '/users/{userId}/posts/{postId}': 'handlePostRoute',
         *     'default'                       : 'handleOtherRoutes'
         * }
         * @member {Object} routes={}
         */
        routes_: {}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        HashHistory.on('change', this.onHashChange, this)
    }

    /**
    * Triggered after the routes config got changed
    * @param {Object} value
    * @param {Object} oldValue
    * @protected
    */
    afterSetRoutes(value, oldValue) {
        let me = this,
            routeKeys = Object.keys(value);

        me.routes = routeKeys.sort(me.#sortRoutes).reduce((obj, key) => {
            obj[key] = value[key];
            return obj
        }, {});

        me.handleRoutes = {};

        routeKeys.forEach(key => {
            if (key.toLowerCase() === 'default') {
                me.defaultRoute = value[key]
            } else {
                me.handleRoutes[key] = new RegExp(key.replace(routeParamRegex, '([\\w-]+)') + '$')
            }
        })
    }

    /**
     * @param args
     */
    destroy(...args) {
        HashHistory.un('change', this.onHashChange, this);

        super.destroy(...args);
    }

    /**
     *
     */
    onConstructed() {
        let currentHash = HashHistory.first();

        currentHash && this.onHashChange(currentHash, null)
    }

    /**
     * Placeholder method which gets triggered when the hash inside the browser url changes
     * @param {Object} value
     * @param {Object} oldValue
     */
    async onHashChange(value, oldValue) {
        let me = this,
            hasRouteBeenFound = false,
            handleRoutes = me.handleRoutes,
            routeKeys = Object.keys(handleRoutes),
            routes = me.routes,
            handler, preHandler, responsePreHandler, result, route, paramObject,
            key, counter = 0, routeKeysLength = routeKeys.length;

        while (routeKeysLength > 0 && counter < routeKeysLength && !hasRouteBeenFound) {
            key = routeKeys[counter];
            handler = null;
            preHandler = null;
            responsePreHandler = null;
            paramObject = {};
            result = value.hashString.match(handleRoutes[key]);

            if (result) {
                const
                    arrayParamIds = key.match(routeParamRegex),
                    arrayParamValues = result.splice(1, result.length - 1);

                if (arrayParamIds && arrayParamIds.length !== arrayParamValues.length) {
                    throw 'Number of IDs and number of Values do not match';
                }

                for (let i = 0; arrayParamIds && i < arrayParamIds.length; i++) {
                    paramObject[arrayParamIds[i].substring(1, arrayParamIds[i].length - 1)] = arrayParamValues[i];
                }

                route = routes[key];

                if (Neo.isString(route)) {
                    handler = route;
                    responsePreHandler = true;
                } else if (Neo.isObject(route)) {
                    handler = route.handler;
                    preHandler = route.preHandler;
                }

                hasRouteBeenFound = true;

            }
            counter++;
        } 

        // execute
        if (hasRouteBeenFound) {
            if (preHandler) {
                responsePreHandler = await me[preHandler]?.call(me, paramObject, value, oldValue);
            } else {
                responsePreHandler = true;
            }

            if (responsePreHandler) {
                await me[handler]?.call(me, paramObject, value, oldValue)
            }
        }

        if (routeKeys.length > 0 && !hasRouteBeenFound) {
            if (me.defaultRoute) {
                me[me.defaultRoute]?.(value, oldValue)
            } else {
                me.onNoRouteFound(value, oldValue)
            }
        }
    }

    /**
     * Placeholder method which gets triggered when an invalid route is called
     * @param {Object} value
     * @param {Object} oldValue
     */
    onNoRouteFound(value, oldValue) {

    }

    /**
     * Internal helper method to sort routes by their amount of slashes
     * @param {String} route1
     * @param {String} route2
     * @returns {Number}
     */
    #sortRoutes(route1, route2) {
        return route1.match(amountSlashesRegex).length - route2.match(amountSlashesRegex).length
    }
}

Neo.applyClassConfig(Base);

export default Base;
