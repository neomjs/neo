import {default as Component} from '../../../src/component/Base.mjs';
import NeoArray               from '../../../src/util/Array.mjs';

/**
 * @class RealWorld.views.HeaderComponent
 * @extends Neo.component.Base
 */
class HeaderComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld.views.HeaderComponent'
         * @private
         */
        className: 'RealWorld.views.HeaderComponent',
        /**
         * @member {String} ntype='realworld-headercomponent'
         * @private
         */
        ntype: 'realworld-headercomponent',
        /**
         * @member {String} activeItem_='home'
         */
        activeItem_: 'home',
        /**
         * @member {String[]} cls=['navbar navbar-light']
         */
        cls: ['navbar navbar-light'],
        /**
         * @member {Boolean} loggedIn_=false
         */
        loggedIn_: false,
        /**
         * @member {String} userName_=null
         */
        userName_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            tag: 'nav',
            cls: ['navbar navbar-light'],
            cn : [{
                cls: ['container'],
                cn : [{
                    tag : 'a',
                    cls : ['navbar-brand'],
                    href: '#/',
                    html: 'conduit'
                }, {
                    tag: 'ul',
                    cls: ['nav navbar-nav', 'pull-xs-right'],
                    cn : [{
                        tag: 'li',
                        cls: ['nav-item'],
                        cn : [{
                            tag : 'a',
                            cls : ['nav-link'],
                            href: '#/',
                            html: 'Home'
                        }]
                    }, {
                        tag      : 'li',
                        cls      : ['nav-item'],
                        removeDom: true,
                        cn: [{
                            tag : 'a',
                            cls : ['nav-link'],
                            href: '#/editor',
                            cn: [{
                                tag: 'i',
                                cls: 'ion-compose'
                            }, {
                                vtype: 'text',
                                html : '&nbsp;New Article'
                            }]
                        }]
                    }, {
                        tag      : 'li',
                        cls      : ['nav-item'],
                        removeDom: true,
                        cn : [{
                            tag : 'a',
                            cls : ['nav-link'],
                            href: '#/settings',
                            cn: [{
                                tag: 'i',
                                cls: 'ion-gear-a'
                            }, {
                                vtype: 'text',
                                html : '&nbsp;Settings'
                            }]
                        }]
                    }, {
                        tag      : 'li',
                        cls      : ['nav-item'],
                        removeDom: true,
                        cn: [{
                            tag : 'a',
                            cls : ['nav-link'],
                            href: '#/profile',
                            html: '&nbsp;Profile'
                        }]
                    }, {
                        tag: 'li',
                        cls: ['nav-item'],
                        cn : [{
                            tag : 'a',
                            cls : ['nav-link'],
                            href: '#/login',
                            html: 'Sign in'
                        }]
                    }, {
                        tag: 'li',
                        cls: ['nav-item'],
                        cn : [{
                            tag : 'a',
                            cls : ['nav-link'],
                            href: '#/register',
                            html: 'Sign up'
                        }]
                    }]
                }]
            }]
        }
    }}

    /**
     * Triggered after the activeItem config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetActiveItem(value, oldValue) {
        let me   = this,
            vdom = me.vdom;

        if (oldValue) {
            NeoArray.remove(vdom.cn[0].cn[1].cn[me.getActiveIndex(oldValue)].cn[0].cls, 'active');
        }

        NeoArray.add(vdom.cn[0].cn[1].cn[me.getActiveIndex(value)].cn[0].cls, 'active');

        me.vdom = vdom;
    }

    /**
     * Triggered after the loggedIn config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @private
     */
    afterSetLoggedIn(value, oldValue) {
        if (Neo.isBoolean(oldValue)) {
            let me   = this,
                vdom = me.vdom,
                list = vdom.cn[0].cn[1];

            list.cn[1].removeDom = !value; // editor
            list.cn[2].removeDom = !value; // settings
            list.cn[3].removeDom = !value; // profile
            list.cn[4].removeDom = value;  // login
            list.cn[5].removeDom = value;  // register

            me.vdom = vdom;
        }
    }

    /**
     * Triggered after the userName config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetUserName(value, oldValue) {
        if (value) {
            let me          = this,
                vdom        = me.vdom,
                profileLink = vdom.cn[0].cn[1].cn[3].cn[0];

            profileLink.href = '#/profile/' + value;
            profileLink.html = '&nbsp;'     + value;

            me.vdom = vdom;
        }
    }

    /**
     *
     * @param {String} value
     * @returns {Number} The target index
     */
    getActiveIndex(value) {
        switch (value) {
            case '/settings': return 2;
            case '/profile' : return 3;
            case '/login'   : return 4;
            case '/register': return 5;
        }

        if (value.includes('/editor')) {
            return 1;
        }

        // default to home
        return 0;
    }
}

Neo.applyClassConfig(HeaderComponent);

export {HeaderComponent as default};