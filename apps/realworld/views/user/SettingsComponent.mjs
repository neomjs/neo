import {default as Component} from '../../../../src/component/Base.mjs';
import {default as VDomUtil}  from '../../../../src/util/VDom.mjs';

/**
 * @class RealWorld.views.user.SettingsComponent
 * @extends Neo.component.Base
 */
class SettingsComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld.views.user.SettingsComponent'
         * @private
         */
        className: 'RealWorld.views.user.SettingsComponent',
        /**
         * @member {String} ntype='realworld-user-settingscomponent'
         * @private
         */
        ntype: 'realworld-user-settingscomponent',
        /**
         * @member {String} bio_=null
         */
        bio_: null,
        /**
         * @member {String[]} cls=['settings-page']
         */
        cls: ['settings-page'],
        /**
         * @member {String} email_=null
         */
        email_: null,
        /**
         * @member {String} image_=null
         */
        image_: null,
        /**
         * @member {String} userName_=null
         */
        userName_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            cn: [{
                cls: ['container', 'page'],
                cn : [{
                    cls: ['row'],
                    cn : [{
                        cls: ['col-md-6', 'offset-md-3', 'col-xs-12'],
                        cn : [{
                            tag : 'h1',
                            cls : ['text-xs-center'],
                            html: 'Your Settings'
                        }, {
                            tag: 'form',
                            cn : [{
                                tag: 'fieldset',
                                cn : [{
                                    tag: 'fieldset',
                                    cls: ['form-group'],
                                    cn : [{
                                        tag        : 'input',
                                        cls        : ['form-control'],
                                        flag       : 'image',
                                        placeholder: 'URL of profile picture',
                                        type       : 'text'
                                    }]
                                }, {
                                    tag: 'fieldset',
                                    cls: ['form-group'],
                                    cn : [{
                                        tag        : 'input',
                                        cls        : ['form-control', 'form-control-lg'],
                                        flag       : 'userName',
                                        placeholder: 'Your Name',
                                        type       : 'text'
                                    }]
                                }, {
                                    tag: 'fieldset',
                                    cls: ['form-group'],
                                    cn : [{
                                        tag        : 'textarea',
                                        cls        : ['form-control', 'form-control-lg'],
                                        flag       : 'bio',
                                        placeholder: 'Short bio about you',
                                        rows       : 8
                                    }]
                                }, {
                                    tag: 'fieldset',
                                    cls: ['form-group'],
                                    cn : [{
                                        tag        : 'input',
                                        cls        : ['form-control', 'form-control-lg'],
                                        flag       : 'email',
                                        placeholder: 'Email',
                                        type       : 'text'
                                    }]
                                }, {
                                    tag: 'fieldset',
                                    cls: ['form-group'],
                                    cn : [{
                                        tag        : 'input',
                                        cls        : ['form-control', 'form-control-lg'],
                                        flag       : 'password',
                                        placeholder: 'Password',
                                        type       : 'password'
                                    }]
                                }, {
                                    tag : 'button',
                                    cls : ['btn', 'btn-lg', 'btn-primary', 'pull-xs-right'],
                                    html: 'Update Settings'
                                }]
                            }]
                        }, {
                            tag: 'hr'
                        }, {
                            tag : 'button',
                            cls : ['btn', 'btn-outline-danger'],
                            html: 'Or click here to logout.'
                        }]
                    }]
                }]
            }]
        }
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me           = this,
            domListeners = me.domListeners;

        domListeners.push({
            click: {
                fn      : me.onLogoutButtonClick,
                delegate: '.btn-outline-danger',
                scope   : me
            }
        }, {
            click: {
                fn      : me.onSubmitButtonClick,
                delegate: '.btn-primary',
                scope   : me
            }
        });

        me.domListeners = domListeners;

        me.getController().on({
            afterSetCurrentUser: me.onCurrentUserChange,
            scope              : me
        });
    }

    /**
     * Triggered after the bio config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetBio(value, oldValue) {
        if (value) {
            let vdom = this.vdom;

            VDomUtil.getByFlag(vdom, 'bio').value = value;
            this.vdom = vdom;
        }
    }

    /**
     * Triggered after the email config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetEmail(value, oldValue) {
        if (value) {
            let vdom = this.vdom;

            VDomUtil.getByFlag(vdom, 'email').value = value;
            this.vdom = vdom;
        }
    }

    /**
     * Triggered after the image config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetImage(value, oldValue) {
        if (value) {
            let vdom = this.vdom;

            VDomUtil.getByFlag(vdom, 'image').value = value;
            this.vdom = vdom;
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
            let vdom = this.vdom;

            VDomUtil.getByFlag(vdom, 'userName').value = value;
            this.vdom = vdom;
        }
    }

    /**
     *
     * @param {Object} value
     */
    onCurrentUserChange(value) {
        console.log('onCurrentUserChange', value);

        this.bulkConfigUpdate({
            bio      : value.bio,
            email    : value.email,
            image    : value.image,
            userName : value.username
        });
    }

    /**
     *
     * @param {Object} data
     */
    onLogoutButtonClick(data) {
        this.getController().logout();
    }

    /**
     *
     * @param {Object} data
     */
    onSubmitButtonClick(data) {
        let me       = this,
            vdom     = me.vdom,
            bio      = VDomUtil.getByFlag(vdom, 'bio'),
            email    = VDomUtil.getByFlag(vdom, 'email'),
            image    = VDomUtil.getByFlag(vdom, 'image'),
            password = VDomUtil.getByFlag(vdom, 'password'),
            userName = VDomUtil.getByFlag(vdom, 'userName');

        Neo.main.DomAccess.getAttributes({
            id        : [bio.id, email.id, image.id, password.id, userName.id],
            attributes: 'value'
        }).then(data => {
            console.log(data);
        });
    }
}

Neo.applyClassConfig(SettingsComponent);

export {SettingsComponent as default};