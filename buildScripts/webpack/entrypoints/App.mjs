import Neo             from '../../../src/Neo.mjs';
import * as core       from '../../../src/core/_export.mjs';
import DomEventManager from '../../../src/manager/DomEvent.mjs';
import Instance        from '../../../src/manager/Instance.mjs';
import Application     from '../../../src/controller/Application.mjs';
import HashHistory     from '../../../src/util/HashHistory.mjs';
import Worker          from '../../../src/worker/Worker.mjs';

/**
 * FireFox breaks when including dynamic imports, even in case they are inside unreachable code.
 * Use the real App worker for builds and remove this file once this one is resolved.
 * https://gitlab.com/tobiu/neoteric/issues/138
 */
class App extends Worker {
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

        let me = this;
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
     *
     */
    onGlobalDomListenersMounted() {
        DomEventManager.globalDomListenersMounted = true;
    }

    /**
     * Every URL hash-change will create a post message in main and end up here first.
     * @param {Object} data parsed key-value pairs for each hash value
     */
    onHashChange(data) {
        HashHistory.push(data.hash);
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
            me.vdomRemotesRegistered === me.countVdomRemotes
        ) {
            if (!Neo.config.isExperimental) {
                Neo.onStart();
            } else {
                // todo: FF breaks here, even if the code is not reachable

                /*import(
                     webpackIgnore: true
                    '../../' + me.data.path).then((module) => {
                        Neo.onStart();
                    }
                );*/
            }
        }
    }

    /**
     * Each registered remote method will trigger this receiver
     * @param {Object} remote
     */
    onRemoteRegistered(remote) {
        let me = this;

        switch(remote.origin) {
            case 'data':
                me.dataRemotesRegistered++;
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