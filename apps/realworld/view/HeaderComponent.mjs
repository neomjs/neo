import Component from '../../../src/component/Base.mjs';
import NeoArray  from '../../../src/util/Array.mjs';

/**
 * @class RealWorld.view.HeaderComponent
 * @extends Neo.component.Base
 */
class HeaderComponent extends Component {
    static config = {
        /**
         * @member {String} className='RealWorld.view.HeaderComponent'
         * @protected
         */
        className: 'RealWorld.view.HeaderComponent',
        /**
         * @member {String} activeItem_='home'
         * @reactive
         */
        activeItem_: 'home',
        /**
         * @member {String[]} baseCls=['navbar','navbar-light']
         */
        baseCls: ['navbar', 'navbar-light'],
        /**
         * @member {Boolean} loggedIn_=false
         * @reactive
         */
        loggedIn_: false,
        /**
         * @member {String|null} userImage_=null
         * @reactive
         */
        userImage_:null,
        /**
         * @member {String|null} userName_=null
         * @reactive
         */
        userName_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'nav', cls: ['navbar navbar-light'], cn: [
            {cls: ['container'], cn: [
                {tag: 'a',  cls: ['navbar-brand'], href: '#/', text: 'conduit'},
                {tag: 'ul', cls: ['nav navbar-nav', 'pull-xs-right'], cn: [
                    {tag: 'li', cls: ['nav-item'], cn: [
                        {tag: 'a', cls: ['nav-link'], href: '#/', text: 'Home'}
                    ]},
                    {tag: 'li', cls: ['nav-item'], removeDom: true, cn: [
                        {tag: 'a', cls: ['nav-link'], href: '#/editor', cn: [
                            {tag: 'i', cls: 'ion-compose'},
                            {vtype: 'text', text: '&nbsp;New Article'}
                        ]}
                    ]},
                    {tag: 'li', cls: ['nav-item'], removeDom: true, cn: [
                        {tag: 'a', cls: ['nav-link'], href: '#/settings', cn: [
                            {tag: 'i', cls: 'ion-gear-a'},
                            {vtype: 'text', text: '&nbsp;Settings'}
                        ]}
                    ]},
                    {tag: 'li', cls: ['nav-item'], removeDom: true, cn: [
                        {tag: 'a', cls : ['nav-link'], href: '#/profile', cn: [
                            {tag: 'img', cls: ['user-pic']},
                            {vtype: 'text', text: ' Profile'}
                        ]}
                    ]},
                    {tag: 'li', cls: ['nav-item'], cn: [
                        {tag : 'a', cls : ['nav-link'], href: '#/login', text: 'Sign in'}
                    ]},
                    {tag: 'li', cls: ['nav-item'], cn: [
                        {tag: 'a', cls : ['nav-link'], href: '#/register', text: 'Sign up'}
                    ]}
                ]}
            ]}
        ]}
    }

    /**
     * Triggered after the activeItem config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetActiveItem(value, oldValue) {
        let me   = this,
            vdom = me.vdom;

        if (oldValue) {
            NeoArray.remove(vdom.cn[0].cn[1].cn[me.getActiveIndex(oldValue)].cn[0].cls, 'active');
        }

        NeoArray.add(vdom.cn[0].cn[1].cn[me.getActiveIndex(value)].cn[0].cls, 'active');

        me.update();
    }

    /**
     * Triggered after the loggedIn config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetLoggedIn(value, oldValue) {
        if (Neo.isBoolean(oldValue)) {
            let me   = this,
                list = me.vdom.cn[0].cn[1];

            list.cn[1].removeDom = !value; // editor
            list.cn[2].removeDom = !value; // settings
            list.cn[3].removeDom = !value; // profile
            list.cn[4].removeDom = value;  // login
            list.cn[5].removeDom = value;  // register

            me.update();
        }
    }

    /**
     * Triggered after the userImage config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetUserImage(value, oldValue) {
        let me          = this,
            profileLink = me.vdom.cn[0].cn[1].cn[3].cn[0];

        profileLink.cn[0].removeDom = !value;
        profileLink.cn[0].src       = value;

        me.update();
    }

    /**
     * Triggered after the userName config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetUserName(value, oldValue) {
        if (value) {
            let me          = this,
                profileLink = me.vdom.cn[0].cn[1].cn[3].cn[0];

            profileLink.href = '#/profile/' + value;
            profileLink.cn[1].text = ' ' + value;

            me.update();
        }
    }

    /**
     * @param {String} value
     * @returns {Number} The target index
     */
    getActiveIndex(value) {
        switch (value) {
            case '/settings': return 2;
            case '/login'   : return 4;
            case '/register': return 5;
        }

        if (value.includes('/editor')) {
            return 1;
        }

        if (value.includes('/profile')) {
            return 3;
        }

        // default to home
        return 0;
    }
}

export default Neo.setupClass(HeaderComponent);
