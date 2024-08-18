import CoreBase    from '../core/Base.mjs';
import HashHistory from '../util/HashHistory.mjs';

const
    amountSlashesRegex = /\//g,
    routeParamRegex    = /{[^\s/]+}/g

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
         * If the URL does not contain a hash value when creating this controller instance,
         * neo will set this hash value for us.
         * @member {String|null} defaultHash=null
         */
        defaultHash: null,
        /**
         * @member {String|null} defaultRoute=null
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
         * @member {Object} routes_={}
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
                me.handleRoutes[key] = new RegExp(key.replace(routeParamRegex, '([\\w-.]+)')+'$')
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
     *
     */
    async onConstructed() {
        let me                      = this,
            {defaultHash, windowId} = me,
            currentHash             = HashHistory.first(windowId);

        // get outside the construction chain => a related cmp & vm has to be constructed too
        await me.timeout(1);

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
     * Placeholder method which gets triggered when the hash inside the browser url changes
     * @param {Object} value
     * @param {Object} oldValue
     */
    async onHashChange(value, oldValue) {
        // We only want to trigger hash changes for the same browser window (SharedWorker context)
        if (value.windowId !== this.windowId) {
            return
        }

        let me                     = this,
            counter                = 0,
            hasRouteBeenFound      = false,
            {handleRoutes, routes} = me,
            routeKeys              = Object.keys(handleRoutes),
            routeKeysLength        = routeKeys.length,
            arrayParamIds, arrayParamValues, handler, key, paramObject, preHandler, responsePreHandler, result, route;

        while (routeKeysLength > 0 && counter < routeKeysLength && !hasRouteBeenFound) {
            key                = routeKeys[counter];
            handler            = null;
            preHandler         = null;
            responsePreHandler = null;
            paramObject        = {};
            result             = value.hashString.match(handleRoutes[key]);

            if (result) {
                arrayParamIds    = key.match(routeParamRegex);
                arrayParamValues = result.splice(1, result.length - 1);

                if (arrayParamIds && arrayParamIds.length !== arrayParamValues.length) {
                    throw 'Number of IDs and number of Values do not match'
                }

                for (let i = 0; arrayParamIds && i < arrayParamIds.length; i++) {
                    paramObject[arrayParamIds[i].substring(1, arrayParamIds[i].length - 1)] = arrayParamValues[i]
                }

                route = routes[key];

                if (Neo.isString(route)) {
                    handler            = route;
                    responsePreHandler = true
                } else if (Neo.isObject(route)) {
                    handler    = route.handler;
                    preHandler = route.preHandler
                }

                hasRouteBeenFound = true
            }

            counter++
        }

        // execute
        if (hasRouteBeenFound) {
            if (preHandler) {
                responsePreHandler = await me[preHandler]?.call(me, paramObject, value, oldValue)
            } else {
                responsePreHandler = true
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
        return (route1.match(amountSlashesRegex) || []).length - (route2.match(amountSlashesRegex)|| []).length
    }
}

export default Neo.setupClass(Base);
