import Dashboard           from '../../../src/dashboard/Container.mjs';
import DetailView          from './DetailView.mjs';
import EmailsStore         from '../store/Emails.mjs';
import MainView            from './MainView.mjs';
import Panel               from '../../../src/container/Panel.mjs';
import Provider            from '../../../src/state/Provider.mjs';
import WorkspaceController from './WorkspaceController.mjs';

/**
 * @summary Owns inbox and retained detail/draft hosts; Dashboard owns native transfer and return.
 * Functional bodies never conditionally own a host that can move to another window.
 * @class Email.view.WorkspaceContainer
 * @extends Neo.dashboard.Container
 */
class WorkspaceContainer extends Dashboard {
    static config = {
        /** @member {String} className='Email.view.WorkspaceContainer' */
        className: 'Email.view.WorkspaceContainer',
        /** @member {String[]} cls=['email-workspace'] */
        cls: ['email-workspace'],
        /** @member {Object} controller */
        controller: {module: WorkspaceController},
        /** @member {Boolean} dragResortable=false */
        dragResortable: false,
        /** @member {Object} layout */
        layout: {ntype: 'hbox', align: 'stretch'},
        /** @member {Function} popupUrl */
        popupUrl: () => `${Neo.config.environment === 'development' ? '' : Neo.config.environment + '/'}apps/email/index.html`,
        /** @member {Object} stateProvider */
        stateProvider: {module: Provider, stores: {emails: {module: EmailsStore}}},
        /** @member {Object[]} items */
        items: [{
            module: MainView
        }, {
            module         : Panel,
            cls            : ['email-detail-panel'],
            containerConfig: {layout: 'fit'},
            flex           : 1,
            reference      : 'detail',
            stateProvider  : {module: Provider, data: {email: null}},
            headers        : [{
                dock : 'top',
                items: [{
                    ntype: 'label', text: 'Message', flex: 1
                }, {
                    ntype    : 'button',
                    bind     : {disabled: data => !data.email},
                    reference: 'detailPopout',
                    text     : 'Open in window'
                }]
            }],
            items: [{module: DetailView, bind: {email: 'email'}, reference: 'reader'}]
        }]
    }

    /**
     * @summary A closed origin cannot receive later popup events; popup-owned content stays alive.
     */
    destroy() {
        Neo.currentWorker.un({connect: this.onWindowConnect, disconnect: this.onWindowDisconnect, scope: this});
        super.destroy()
    }

    /**
     * @summary Adapts controls after Dashboard transfers the retained host into a native popup.
     * @param {Object} data
     */
    async onWindowConnect(data) {
        await super.onWindowConnect(data);

        if (!this.isDestroyed) {
            this.controller.syncWindowControls()
        }
    }

    /**
     * @summary Restores source controls after Dashboard has reinserted the same retained host.
     * @param {Object} data
     */
    async onWindowDisconnect(data) {
        await super.onWindowDisconnect(data);

        if (!this.isDestroyed) {
            this.controller.syncWindowControls()
        }
    }
}

export default Neo.setupClass(WorkspaceContainer);
