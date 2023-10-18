import CoreBase    from '../core/Base.mjs';
import HashHistory from '../util/HashHistory.mjs';

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
         * @member {Object} routes={}
         */
        routes: {},

        /**
         * @member {Object} handleRoutes={}
         */
        handleRoutes: {},

        /**
         * @member {String} defaultRoute=undefined
         */
        defaultRoute: null

    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        const me = this;

        const functionSort = (a,b) => { 
            const usedRegex = new RegExp("/", "g");
            return a.match(usedRegex).length - b.match(usedRegex).length;
        }
        const ordered = Object.keys(me.routes).sort(functionSort).reduce(
            (obj, key) => { 
              obj[key] = me.routes[key]; 
              return obj;
            }, 
            {}
          );
    

        me.handleRoutes = {};
        if (Object.keys(me.routes).length > 0) {
            Object.keys(me.routes).forEach(key => {
                if (key.toLowerCase() === 'default'){
                    me.defaultRoute = me.routes[key];
                } else {
                    me.handleRoutes[key] = new RegExp(key.replace(/{[^\s/]+}/g, '([\\w-]+)')+'$');
                }

            });
        }

        HashHistory.on('change', me.onHashChange, me);
    }

    /**
     * @param args
     */
    destroy(...args) {
        HashHistory.un('change', this.onHashChange, this);

        super.destroy(...args);
    }

    /**
     * Placeholder method which gets triggered when an invalid route is called
     * @param {Object} value
     * @param {Object} oldValue
     */
    onNoRouteFound(value, oldValue) {

    }

    /**
     * Placeholder method which gets triggered when the hash inside the browser url changes
     * @param {Object} value
     * @param {Object} oldValue
     */
    onHashChange(value, oldValue) {

        const me = this;
        let hasRouteBeenFound = false;
        Object.keys(me.handleRoutes).forEach( key => {
            let preHandler = undefined;
            let executeHandler = undefined;
            let responsePreHandler = undefined;

            const result = value.hashString.match(me.handleRoutes[key]);
            if (result){
                const target = me.routes[key];
                if (Neo.isString(target)){
                    executeHandler = this.routes[key];
                    responsePreHandler = true;
                }
                if (Neo.isObject(target)){
                    executeHandler = this.routes[key].handler;
                    preHandler = this.routes[key].preHandler;
                    responsePreHandler = preHandler ? me[preHandler]?.call(this, value, oldValue, result.splice(1,result.length - 1)) : true;
                }

                hasRouteBeenFound = true;

                if (responsePreHandler) {
                    this[executeHandler]?.call(this, value, oldValue, result.splice(1,result.length - 1));
                } else {
                    console.warn('No preHandler defined for routes -> todo it better');
                }
                return false;

            }
            return true;
        });

        if (Object.keys(me.handleRoutes).length > 0 && !hasRouteBeenFound) {
            if (me.defaultRoute) {
                this[me.defaultRoute]?.call(this, value, oldValue);
            } else {
                this.onNoRouteFound(value, oldValue);
            }
        }
    }

    /**
     *
     */
    onConstructed() {
        let currentHash = HashHistory.first();

        currentHash && this.onHashChange(currentHash, null);
    }



}

Neo.applyClassConfig(Base);

export default Base;
