import ComponentController from '../../../src/controller/Component.mjs';
import NeoArray            from '../../../src/util/Array.mjs';
import StateProvider       from '../../../src/state/Provider.mjs';

/**
 * @class Neo.examples.stateProvider.multiWindow.ViewportController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    /**
     * @member {String[]} connectedApps=[]
     */
    connectedApps = []
    /**
     * @member {Neo.state.Provider|null} mainStateProvider=null
     */
    mainStateProvider = null

    static config = {
        /**
         * @member {String} className='Neo.examples.stateProvider.multiWindow.ViewportController'
         * @protected
         */
        className: 'Neo.examples.stateProvider.multiWindow.ViewportController'
    }

    /**
     * The App worker will receive connect & disconnect events inside the SharedWorkers context
     */
    construct(config) {
        super.construct(config);

        let me = this;

        Neo.currentWorker.on({
            connect   : me.onAppConnect,
            disconnect: me.onAppDisconnect,
            scope     : me
        })
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     */
    onAppConnect(data) {
        let me   = this,
            name = data.appName,
            stateProvider, view;

        console.log('onAppConnect', data);

        NeoArray.add(me.connectedApps, name);

        if (!me.mainStateProvider) {
            stateProvider = {
                data: {
                    user: {
                        firstname: 'Tobias',
                        lastname : 'Uhlig'
                    }
                }
            };
        } else {
            stateProvider = {
                parent: me.mainStateProvider
            };
        }

        import('../multiWindow/MainContainer.mjs').then(module => {
            view = Neo.apps[name].mainView.add({
                module: module.default,
                stateProvider
            });

            if (!me.mainStateProvider) {
                me.mainStateProvider = view.stateProvider
            }
        })
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     */
    onAppDisconnect(data) {
        let me   = this,
            name = data.appName;

        NeoArray.remove(me.connectedApps, name);

        console.log('onAppDisconnect', data)
    }
}

export default Neo.setupClass(MainContainerController);
