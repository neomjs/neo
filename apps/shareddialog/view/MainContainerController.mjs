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
     */
    onConstructed() {
        super.onConstructed();

        const me = this;

        me.view.on({
            connect   : me.onAppConnect,
            disconnect: me.onAppDisconnect,
            scope     : me
        });
    }

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
     * @returns {Neo.button.Base}
     */
    getSecondWindowButton() {
        return this.view.down({iconCls: 'fa fa-window-restore'});
    }

    /**
     *
     * @param {String} name
     */
    onAppConnect(name) {
        let me   = this,
            view = me.view;

        if (name === 'SharedDialog2') {
            me.getSecondWindowButton().disabled = true;
        }
    }

    /**
     *
     * @param {String} name
     */
    onAppDisconnect(name) {
        let me   = this,
            view = me.view;

        if (name === 'SharedDialog2') {
            me.getSecondWindowButton().disabled = false;
        }
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
    openSecondWindow(data) {
        console.log('openSecondWindow');
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