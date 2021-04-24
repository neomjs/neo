import Component from '../../../src/controller/Component.mjs';

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
         * @member {String[]|null} connectedApps=null
         */
        connectedApps: null
    }}

    /**
     *
     * @param config
     */
    constructor(config) {
        super(config);

        let me = this;

        if (!me.connectedApps) {
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
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};