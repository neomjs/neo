import ComposeView from './ComposeView.mjs';
import Dialog      from '../../../src/dialog/Base.mjs';
import Provider    from '../../../src/state/Provider.mjs';

/**
 * @summary Lazily created, retained host for one functional draft and its window-independent state.
 * @class Email.view.ComposeDialog
 * @extends Neo.dialog.Base
 */
class ComposeDialog extends Dialog {
    static config = {
        /** @member {String} className='Email.view.ComposeDialog' */
        className: 'Email.view.ComposeDialog',
        /** @member {Boolean} autoInitVnode=false */
        autoInitVnode: false,
        /** @member {Boolean} autoMount=false */
        autoMount: false,
        /** @member {String} closeAction='hide' */
        closeAction: 'hide',
        /** @member {String[]} cls=['email-compose-dialog'] */
        cls: ['email-compose-dialog'],
        /** @member {Object} containerConfig */
        containerConfig: {layout: 'fit'},
        /** @member {Boolean} draggable=false */
        draggable: false,
        /** @member {Object} headerConfig */
        headerConfig: {
            actions: [{action: 'popout', iconCls: 'fas fa-up-right-from-square', text: 'Open in window'}, 'maximize', 'close']
        },
        /** @member {Number} height=460 */
        height: 460,
        /** @member {Object[]} items */
        items: [{module: ComposeView, reference: 'draft'}],
        /** @member {String} reference='compose' */
        reference: 'compose',
        /** @member {Boolean} resizable=false */
        resizable: false,
        /** @member {Object} stateProvider */
        stateProvider: {module: Provider, data: {to: '', subject: '', body: ''}},
        /** @member {String} title='New message' */
        title: 'New message',
        /** @member {Number} width=560 */
        width: 560
    }

    /**
     * @summary Keeps the Dashboard as the first-render owner; Dialog's null-target hook enables auto-mount by default.
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetAnimateTargetId(value, oldValue) {
        super.afterSetAnimateTargetId(value, oldValue);
        this.autoMount = false;
        this.autoInitVnode = false
    }
}

export default Neo.setupClass(ComposeDialog);
