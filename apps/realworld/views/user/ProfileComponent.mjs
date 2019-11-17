import {default as Component} from '../../../../src/component/Base.mjs';
import {default as VDomUtil}  from '../../../../src/util/VDom.mjs';

/**
 * @class RealWorld.views.user.ProfileComponent
 * @extends Neo.component.Base
 */
class ProfileComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld.views.user.ProfileComponent'
         * @private
         */
        className: 'RealWorld.views.user.ProfileComponent',
        /**
         * @member {String} ntype='realworld-user-profilecomponent'
         * @private
         */
        ntype: 'realworld-user-profilecomponent',
        /**
         * @member {String|null} bio_=null
         */
        bio_: null,
        /**
         * @member {String[]} cls=['profile-page']
         */
        cls: ['profile-page'],
        /**
         * @member {Boolean|null} following_=null
         */
        following_: null,
        /**
         * @member {String|null} image_=null
         */
        image_: null,
        /**
         * @member {String|null} username_=null
         */
        username_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            cn: [{
                cls: ['user-info'],
                cn : [{
                    cls: ['container'],
                    cn : [{
                        cls: ['row'],
                        cn : [{
                            cls: ['col-xs-12', 'col-md-10', 'offset-md-1'],
                            cn : [{
                                tag : 'img',
                                cls : ['user-img'],
                                flag: 'image'
                            }, {
                                tag : 'h4',
                                flag: 'username'
                            }, {
                                tag : 'p',
                                flag: 'bio'
                            }, {
                                tag : 'button',
                                cls : ['btn', 'btn-sm', 'btn-outline-secondary', 'action-btn'],
                                flag: 'following',
                                cn  : [{
                                    tag: 'i',
                                    cls: ['ion-plus-round']
                                }, {
                                    vtype: 'text'
                                }, {
                                    vtype: 'text'
                                }]
                            }]
                        }]
                    }]
                }]
            }, {
                cls: ['container'],
                cn : [{
                    cls: ['row'],
                    cn : [{
                        cls: ['col-xs-12', 'col-md-10', 'offset-md-1'],
                        cn : [{
                            cls: ['articles-toggle'],
                            cn : [{
                                tag: 'ul',
                                cls: ['nav', 'nav-pills', 'outline-active'],
                                cn : [{
                                    tag: 'li',
                                    cls: ['nav-item'],
                                    cn : [{
                                        tag: 'a',
                                        cls: ['nav-link', 'active'],
                                        href: '',
                                        html: 'My Articles'
                                    }]
                                }, {
                                    tag: 'li',
                                    cls: ['nav-item'],
                                    cn : [{
                                        tag: 'a',
                                        cls: ['nav-link'],
                                        href: '',
                                        html: 'Favorited Articles'
                                    }]
                                }]
                            }]
                        }]
                    }]
                }]
            }]
        }
    }}

    /**
     * Tiggered after the bio config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetBio(value, oldValue) {
        if (value) {
            let vdom = this.vdom;

            VDomUtil.getByFlag(vdom, 'bio').html = value;
            this.vdom = vdom;
        }
    }

    /**
     * Tiggered after the following config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @private
     */
    afterSetFollowing(value, oldValue) {
        if (Neo.isBoolean(value)) {console.log('following', value);
            let vdom = this.vdom,
                node = VDomUtil.getByFlag(vdom, 'following');

            node.cn[0].cls  = [value ? 'ion-minus-round' : 'ion-plus-round'];
            node.cn[1].html = value ? ' Unfollow ' : ' Follow ';
            this.vdom = vdom;
        }
    }

    /**
     * Tiggered after the image config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetImage(value, oldValue) {
        let vdom = this.vdom;

        VDomUtil.getByFlag(vdom, 'image').src = value;
        this.vdom = vdom;
    }

    /**
     * Tiggered after the username config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetUsername(value, oldValue) {
        let vdom = this.vdom;

        VDomUtil.getByFlag(vdom, 'following').cn[2].html = value;
        VDomUtil.getByFlag(vdom, 'username').html = value;
        this.vdom = vdom;
    }

    /**
     *
     * @param {Object} data
     */
    update(data) {
        let me   = this,
            vdom = me.vdom;

        me.silentVdomUpdate = true;

        Object.assign(me, {
            bio      : data.bio,
            following: data.following,
            image    : data.image,
            username : data.username
        });

        me.silentVdomUpdate = false;
        me.vdom = vdom;
    }
}

Neo.applyClassConfig(ProfileComponent);

export {ProfileComponent as default};