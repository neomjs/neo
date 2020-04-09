import Neo             from '../Neo.mjs';
import Base            from './Base.mjs';
import * as core       from '../core/_export.mjs';
import DomEventManager from '../manager/DomEvent.mjs';
import Instance        from '../manager/Instance.mjs';
import Application     from '../controller/Application.mjs';
import HashHistory     from '../util/HashHistory.mjs';

/**
 * The App worker contains most parts of the framework as well as all apps which get created.
 * See the tutorials for further infos.
 * @class Neo.worker.App
 * @extends Neo.worker.Base
 * @singleton
 */
class App extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.worker.App'
         * @private
         */
        className: 'Neo.worker.App',
        /**
         * @member {String} ntype='app-worker'
         * @private
         */
        ntype: 'app-worker',
        /**
         * @member {Object|null} data=null
         * @private
         */
        data: null,
        /**
         * @member {Number} dataRemotesRegistered=0
         * @private
         */
        dataRemotesRegistered: 0,
        /**
         * @member {Number} mainRemotesRegistered=0
         * @private
         */
        mainRemotesRegistered: 0,
        /**
         * @member {Boolean} singleton=true
         * @private
         */
        singleton: true,
        /**
         * @member {Number} vdomRemotesRegistered=0
         * @private
         */
        vdomRemotesRegistered: 0,
        /**
         * @member {String} workerId='app'
         * @private
         */
        workerId: 'app',
        /**
         * todo: App needs to know how many singletons have remotes registered here to ensure a correct starting point
         * @member {Number} countDataRemotes=2
         * @private
         */
        countDataRemotes: 2,
        /**
         * todo: App needs to know how many singletons have remotes registered here to ensure a correct starting point
         * @member {Number} countMainRemotes=4
         * @private
         */
        countMainRemotes: 4,
        /**
         * todo: App needs to know how many singletons have remotes registered here to ensure a correct starting point
         * @member {Number} countVdomRemotes=1
         * @private
         */
        countVdomRemotes: 1
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        const me = this;

        me.on('remoteregistered', me.onRemoteRegistered, me);
    }

    /**
     * Every dom event will get forwarded as a worker message from main and ends up here first
     * @param {Object} data useful event properties, differs for different event types. See Neo.main.DomEvents.
     */
    onDomEvent(data) {
        DomEventManager.fire(data);
    }

    /**
     * Every URL hash-change will create a post message in main and end up here first.
     * @param {Object} data parsed key-value pairs for each hash value
     */
    onHashChange(data) {
        HashHistory.push(data.hash, data.hashString);
    }

    /**
     * The starting point for apps
     * @param {Object} data
     */
    onLoadApplication(data) {
        let me = this;

        if (data) {
            me.data = data;
            Neo.config.resourcesPath = data.resourcesPath;
        }

        if (
            me.dataRemotesRegistered === me.countDataRemotes &&
            me.mainRemotesRegistered === me.countMainRemotes &&
            me.vdomRemotesRegistered === me.countVdomRemotes
        ) {
            if (!Neo.config.isExperimental) {
                Neo.onStart();

                if (Neo.config.hash) {
                    HashHistory.push(Neo.config.hash, Neo.config.hashString);
                }
            } else {
                import(
                    /* webpackIgnore: true */
                    `../../${me.data.path}`).then(module => {
                        Neo.onStart();

                        if (Neo.config.hash) {
                            HashHistory.push(Neo.config.hash, Neo.config.hashString);
                        }
                    }
                );
            }
        }
    }

    /**
     * todo: https://github.com/neomjs/neo/issues/442
     * Each registered remote method will trigger this receiver
     * @param {Object} remote
     */
    onRemoteRegistered(remote) {
        let me = this;

        switch(remote.origin) {
            case 'data':
                me.dataRemotesRegistered++;
                break;
            case 'main':
                me.mainRemotesRegistered++;
                break;
            case 'vdom':
                me.vdomRemotesRegistered++;
                break;
        }

        me.onLoadApplication();
    }
}

Neo.applyClassConfig(App);

let instance = Neo.create(App);

Neo.applyToGlobalNs(instance);

export default instance;