import {API_URL, LOCAL_STORAGE_KEY} from './config.mjs';
import CoreBase                     from '../../../src/core/Base.mjs';

/**
 * @class RealWorld.api.Base
 * @extends Neo.core.Base
 */
class Base extends CoreBase {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true
    /**
     * @member {String|null} token=null
     * @protected
     * @static
     */
    static token = null

    static config = {
        /**
         * @member {String} className='RealWorld.api.Base'
         * @protected
         */
        className: 'RealWorld.api.Base',
        /**
         * @member {Object|null} defaultHeaders=null
         */
        defaultHeaders: null,
        /**
         * @member {Boolean} isReady=false
         * @reactive
         */
        isReady: false,
        /**
         * @member {String} resource=''
         */
        resource: '/'
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();
        this.afterConstructed();
    }

    /**
     * The class extensions Article, Favorite, Profile, Tag, User are singletons
     * and get directly imported into the MainContainer(Controller)
     * => their creation happens before the app is constructed
     * => Neo.apps['RealWorld'] does most likely not exist yet.
     */
    afterConstructed() {
        let me  = this,
            app = Neo.appsByName?.['RealWorld']?.[0];

        if (!app) {
            me.timeout(100).then(() => {
                me.afterConstructed()
            })
        } else {
            if (app.vnodeInitialized) {
                me.onAppRendered()
            } else {
                app.on('vnodeInitialized',me.onAppRendered, me)
            }
        }
    }

    /**
     *
     */
    onAppRendered() {
        const me = this;

        // Every API singleton waits for the same stored-token read: the first rendered one starts it
        Base.tokenPromise ??= Neo.main.addon.LocalStorage.readLocalStorageItem({key: LOCAL_STORAGE_KEY})
            .then(data => {
                Base.token   = data.value || null;
                Base.isReady = true;
                return Base.token
            });

        Base.tokenPromise.then(token => me.onReady(token))
    }

    /**
     * @param {Object} [opts={}]
     * @param {Object} [opts.data]
     * @param {Object} [opts.params]
     * @param {String} [opts.resource]
     * @param {String} [opts.slug]
     * @param {String} [opts.url]
     * @returns {String} url
     */
    createUrl(opts) {
        if (opts.url) {
            return API_URL + opts.url;
        }

        return API_URL + (opts.resource || this.resource) + (opts.slug ? '/' + opts.slug : '')
    }

    /**
     * @param {Object} [opts={}]
     * @param {Object} [opts.data]
     * @param {Object} [opts.params]
     * @param {String} [opts.resource]
     * @param {String} [opts.slug]
     * @returns {Promise<any>}
     */
    delete(opts={}) {
        // console.log('delete', opts);

        return Neo.Xhr.promiseJson({
            data   : opts.data,
            method : 'DELETE',
            params : opts.params,
            url    : this.createUrl(opts),

            headers: {
                ...this.defaultHeaders,
                'Content-Type'    : 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        }).catch(error => {
            console.log('RealWorld.api.Base:get()', error)
        })
    }

    /**
     * @param {Object} [opts={}]
     * @param {Object} [opts.data]
     * @param {Object} [opts.params]
     * @param {String} [opts.resource]
     * @param {String} [opts.slug]
     * @returns {Promise<any>}
     */
    get(opts={}) {
        // console.log('get', opts);

        return Neo.Xhr.promiseJson({
            data   : opts.data,
            method : 'GET',
            params : opts.params,
            url    : this.createUrl(opts),

            headers: {
                ...this.defaultHeaders,
                'Content-Type'    : 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        }).catch(error => {
            console.log('RealWorld.api.Base:get()', error)
        })
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
        me.fire('ready', token)
    }

    /**
     * @param {Object} [opts={}]
     * @param {Object} [opts.data]
     * @param {Object} [opts.params]
     * @param {String} [opts.resource]
     * @param {String} [opts.slug]
     * @returns {Promise<any>}
     */
    post(opts={}) {
        const params = opts.params;
        delete opts.params;

        return Neo.Xhr.promiseJson({
            data   : opts.data,
            method : 'POST',
            params,
            url    : this.createUrl(opts),

            headers: {
                ...this.defaultHeaders,
                'Content-Type'    : 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        }).catch(error => {
            console.log('RealWorld.api.Base:post()', error);
        })
    }

    /**
     * @param {Object} [opts={}]
     * @param {Object} [opts.data]
     * @param {Object} [opts.params]
     * @param {String} [opts.resource]
     * @param {String} [opts.slug]
     * @returns {Promise<any>}
     */
    put(opts={}) {
        // console.log('put', opts);

        const params = opts.params;
        delete opts.params;

        return Neo.Xhr.promiseJson({
            data   : opts.data,
            method : 'PUT',
            params,
            url    : this.createUrl(opts),

            headers: {
                ...this.defaultHeaders,
                'Content-Type'    : 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        }).catch(error => {
            console.log('RealWorld.api.Base:put()', error)
        })
    }
}

Base.token        = null;
Base.tokenPromise = null;

export default Neo.setupClass(Base);
