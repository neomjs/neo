import {API_URL, LOCAL_STORAGE_KEY} from './config.mjs';
import {default as CoreBase}        from '../../../src/core/Base.mjs';

/**
 * @class RealWorld.api.Base
 * @extends Neo.core.Base
 */
class Base extends CoreBase {
    static getStaticConfig() {return {
        /**
         * True automatically applies the core/Observable.mjs mixin
         * @member {Boolean} observable=true
         * @static
         */
        observable: true
    }}

    static getConfig() {return {
        /**
         * @member {String} className='RealWorld.api.Base'
         * @private
         */
        className: 'RealWorld.api.Base',
        /**
         * @member {Object|null} defaultHeaders=null
         */
        defaultHeaders: null,
        /**
         * @member {Boolean} isReady=false
         */
        isReady: false,
        /**
         * @member {String} resource=''
         */
        resource: ''
    }}

    onConstructed() {
        super.onConstructed();

        const me = this;

        if (!Base.initialTokenRequestSent) {
            Base.initialTokenRequestSent = true;

            Neo.Main.readLocalStorageItem({
                key: LOCAL_STORAGE_KEY
            }).then(data => {
                const token = data.value;

                if (token) {
                    Base.token = token;
                }

                me.onReady(token);
                Base.fire('ready', token);
            });
        } else {
            Base.on({
                ready: me.onReady,
                scope: me
            });
        }
    }

    /**
     *
     * @param {Object} [opts={}]
     * @param {Object} [opts.data]
     * @param {Object} [opts.params]
     * @param {String} [opts.resource]
     * @param {String} [opts.slug]
     * @returns {Promise<any>}
     */
    get(opts={}) {
        console.log(opts);

        return Neo.Xhr.promiseJson({
            data   : opts.data,
            method : 'GET',
            params : opts.params,
            url    : API_URL + (opts.resource || this.resource) + (opts.slug ? '/' + opts.slug : ''),

            headers: {
                ...this.defaultHeaders || {},
                'Content-Type'    : 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        }).catch(error => {
            console.log('RealWorld.api.Base:get()', error);
        });
    }

    /**
     * Placeholder method which gets triggered once the token is fetched from the local storage
     * @param {String|null} token
     */
    onReady(token) {
        let me = this;

        if (token) {
            me.defaultHeaders = me.defaultHeaders || {};
            me.defaultHeaders['Authorization'] = 'Token ' + token;
        }

        me.isReady = true;
        me.fire('ready', token);
    }

    /**
     *
     * @param {Object} [opts={}]
     * @param {Object} [opts.data]
     * @param {Object} [opts.params]
     * @param {String} [opts.resource]
     * @param {String} [opts.slug]
     * @returns {Promise<any>}
     */
    post(opts={}) {
        console.log(opts);

        return Neo.Xhr.promiseJson({
            data   : opts.data,
            method : 'POST',
            params : opts.params,
            url    : API_URL + (opts.resource || this.resource) + (opts.slug ? '/' + opts.slug : ''),

            headers: {
                ...this.defaultHeaders || {},
                'Content-Type'    : 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        }).catch(error => {
            console.log('RealWorld.api.Base:post()', error);
        });
    }
}

Base.initialTokenRequestSent = false;
Base.token                   = null;

Neo.applyClassConfig(Base);

export {Base as default};