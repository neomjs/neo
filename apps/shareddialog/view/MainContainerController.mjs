import ComponentController from '../../../src/controller/Component.mjs';
import DemoDialog          from './DemoDialog.mjs';

/**
 * @class SharedDialog.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='SharedDialog.view.MainContainerController'
         * @protected
         */
        className: 'SharedDialog.view.MainContainerController',
        /**
         * @member {String} ntype='maincontainer-controller'
         * @protected
         */
        ntype: 'maincontainer-controller'
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

    /**
     *
     * @param {Object} data
     */
    switchTheme(data) {
        let button     = data.component,
            buttonText = 'Theme Light',
            iconCls    = 'fa fa-sun',
            oldTheme   = 'neo-theme-light',
            theme      = 'neo-theme-dark';

        if (button.text === 'Theme Light') {
            buttonText = 'Theme Dark';
            iconCls    = 'fa fa-moon';
            oldTheme   = 'neo-theme-dark';
            theme      = 'neo-theme-light';
        }

        Neo.main.DomAccess.setBodyCls({
            add   : [theme],
            remove: [oldTheme]
        });

        button.set({
            iconCls: iconCls,
            text   : buttonText
        });
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};