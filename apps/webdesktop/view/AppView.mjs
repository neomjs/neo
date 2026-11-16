import Component from '../../../src/component/Base.mjs';

/**
 * @summary The content of an app window: the app, the permission that grants it, and who is signed in.
 *
 * Both values arrive through bindings: `app` from the window's own state provider, `account` from the desktop's
 * provider that the window's provider names as its parent.
 * @class WebDesktop.view.AppView
 * @extends Neo.component.Base
 */
class AppView extends Component {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.AppView'
         * @protected
         */
        className: 'WebDesktop.view.AppView',
        /**
         * @member {WebDesktop.model.Account|null} account_=null
         * @reactive
         */
        account_: null,
        /**
         * @member {WebDesktop.model.App|null} app_=null
         * @reactive
         */
        app_: null,
        /**
         * @member {String[]} baseCls=['webdesktop-app-view']
         * @protected
         */
        baseCls: ['webdesktop-app-view']
    }

    /**
     * Triggered after the account config got changed
     * @param {WebDesktop.model.Account|null} value
     * @param {WebDesktop.model.Account|null} oldValue
     * @protected
     */
    afterSetAccount(value, oldValue) {
        oldValue !== undefined && this.renderCard()
    }

    /**
     * Triggered after the app config got changed
     * @param {WebDesktop.model.App|null} value
     * @param {WebDesktop.model.App|null} oldValue
     * @protected
     */
    afterSetApp(value, oldValue) {
        this.renderCard()
    }

    /**
     * Renders the app's card from the current `app` and `account`.
     */
    renderCard() {
        let me             = this,
            {account, app} = me;

        me.vdom.cn = app ? [{
            cls  : ['webdesktop-app-icon'],
            style: {'--webdesktop-app-color': app.color},
            cn   : [{tag: 'i', cls: app.iconCls.split(' ')}]
        }, {
            tag : 'h2',
            text: app.text
        }, {
            tag : 'p',
            text: app.description
        }, {
            cls: ['webdesktop-app-grant'],
            cn : [
                {tag: 'i', cls: ['fas', 'fa-key']},
                {text: `Granted by ${app.permission}${account ? ` to ${account.name}` : ''}`}
            ]
        }] : [];

        me.update()
    }
}

export default Neo.setupClass(AppView);
