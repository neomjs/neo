import Component from '../../../src/controller/Component.mjs';
import NeoArray  from '../../../src/util/Array.mjs';

/**
 * @class Neo.examples.model.multiWindow.ViewportController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.model.multiWindow.ViewportController'
         * @protected
         */
        className: 'Neo.examples.model.multiWindow.ViewportController',
        /**
         * @member {String[]} connectedApps=[]
         */
        connectedApps: []
    }}

    /**
     * The App worker will receive connect & disconnect events inside the SharedWorkers context
     */
    constructor(config) {
        super(config);

        let me = this;

        Neo.currentWorker.on({
            connect   : me.onAppConnect,
            disconnect: me.onAppDisconnect,
            scope     : me
        });
    }

    /**
     *
     * @param {Object} data
     * @param {String} data.appName
     */
    onAppConnect(data) {
        let me   = this,
            name = data.appName;

        console.log('onAppConnect', data);

        NeoArray.add(me.connectedApps, name);

        if (me.connectedApps.length === 1) {
            import(
                /* webpackChunkName: 'examples/model/multiWindow/MainContainer' */
                './MainContainer.mjs'
                ).then(module => {
                me.component.add({
                    module: module.default
                });
            });
        }
    }

    /**
     *
     * @param {Object} data
     * @param {String} data.appName
     */
    onAppDisconnect(data) {
        let me   = this,
            name = data.appName;

        NeoArray.remove(me.connectedApps, name);

        console.log('onAppDisconnect', data);
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};