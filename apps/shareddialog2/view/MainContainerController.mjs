import ComponentController from '../../../src/controller/Component.mjs';
import DemoDialog          from './DemoDialog.mjs';

/**
 * @class SharedDialog2.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='SharedDialog2.view.MainContainerController'
         * @protected
         */
        className: 'SharedDialog2.view.MainContainerController',
        /**
         * @member {String} ntype='maincontainer2-controller'
         * @protected
         */
        ntype: 'maincontainer2-controller'
    }}

    /**
     *
     * @param {Object} data
     */
    createDialog(data) {
        let me   = this,
            view = me.view;

        data.component.disabled = true;

        me.dialog = Neo.create(DemoDialog, {
            animateTargetId    : data.component.id,
            appName            : view.appName,
            boundaryContainerId: view.boundaryContainerId,
            listeners          : {close: me.onWindowClose, scope: me}
        });
    }

    /**
     *
     */
    onWindowClose() {
        let button = this.view.down({
            text: 'Create Dialog'
        });

        button.disabled = false;
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};