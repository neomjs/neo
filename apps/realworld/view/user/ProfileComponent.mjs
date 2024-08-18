import Component        from '../../../../src/component/Base.mjs';
import NeoArray         from '../../../../src/util/Array.mjs';
import PreviewComponent from '../article/PreviewComponent.mjs';
import VDomUtil         from '../../../../src/util/VDom.mjs';

/**
 * @class RealWorld.view.user.ProfileComponent
 * @extends Neo.component.Base
 */
class ProfileComponent extends Component {
    static config = {
        /**
         * @member {String} className='RealWorld.view.user.ProfileComponent'
         * @protected
         */
        className: 'RealWorld.view.user.ProfileComponent',
        /**
         * @member {Object[]|null} articlePreviews_=null
         */
        articlePreviews_: null,
        /**
         * @member {String[]} baseCls=['profile-page']
         */
        baseCls: ['profile-page'],
        /**
         * @member {String|null} bio_=null
         */
        bio_: null,
        /**
         * @member {Number} countArticles_=5
         */
        countArticles_: 5,
        /**
         * @member {Boolean|null} following_=null
         */
        following_: null,
        /**
         * @member {String|null} image_=null
         */
        image_: null,
        /**
         * @member {Boolean} myProfile_=false
         */
        myProfile_: false,
        /**
         * @member {RealWorld.view.article.PreviewComponent[]} previewComponents=[]
         */
        previewComponents: [],
        /**
         * @member {String|null} username_=null
         */
        username_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {cls: ['user-info'], cn: [
                {cls: ['container'], cn: [
                    {cls: ['row'], cn: [
                        {cls: ['col-xs-12', 'col-md-10', 'offset-md-1'], cn: [
                            {tag: 'img', cls: ['user-img'], flag: 'image'},
                            {tag: 'h4', flag: 'username'},
                            {tag: 'p', flag: 'bio'},
                            {tag: 'button', cls: ['btn', 'btn-sm', 'btn-outline-secondary', 'action-btn', 'follow-button'], flag: 'following', cn: [
                                {tag: 'i', cls: ['ion-plus-round']},
                                {vtype: 'text'},
                                {vtype: 'text'}
                            ]},
                            {tag: 'a', cls: ['btn', 'btn-sm', 'btn-outline-secondary', 'action-btn'], flag: 'edit-profile', href: '#/settings', removeDom: true, cn: [
                                {tag: 'i', cls: ['ion-gear-a']},
                                {vtype: 'text', html: ' Edit Profile Settings'}
                            ]}
                        ]}
                    ]}
                ]}
            ]},
            {cls: ['container'], cn: [
                {cls: ['row'], cn: [
                    {cls: ['col-xs-12', 'col-md-10', 'offset-md-1'], flag: 'feed-container', cn: [
                        {cls: ['articles-toggle'], cn: [
                            {tag: 'ul', cls: ['nav', 'nav-pills', 'outline-active'], flag: 'feed-header', cn: [
                                {tag: 'li', cls: ['nav-item'], cn: [
                                    {tag: 'a', cls: ['nav-link', 'prevent-click', 'active'], href: '', html: 'My Articles'}
                                ]},
                                {tag: 'li', cls: ['nav-item'], cn: [
                                    {tag: 'a', cls: ['nav-link', 'prevent-click'], href: '', html: 'Favorited Articles'}
                                ]}
                            ]}
                        ]}
                    ]}
                ]}
            ]}
        ]}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        Neo.main.DomEvents.registerPreventDefaultTargets({
            name: 'click',
            cls : 'prevent-click'
        });

        let me = this;

        me.addDomListeners([
            {click: {fn: me.onFollowButtonClick, delegate: '.follow-button', scope: me}},
            {click: {fn: me.onNavLinkClick,      delegate: '.nav-link',      scope: me}}
        ]);

        me.getController().on({
            afterSetCurrentUser: me.onCurrentUserChange,
            scope              : me
        });
    }

    /**
     * Triggered after the articlePreviews config got changed
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     * @protected
     */
    afterSetArticlePreviews(value, oldValue) {
        let me        = this,
            container = VDomUtil.getByFlag(me.vdom, 'feed-container'),
            config;

        container.cn = [container.cn.shift()];

        if (Array.isArray(value)) {
            value.forEach((item, index) => {
                config = {
                    author        : item.author.username,
                    createdAt     : item.createdAt,
                    description   : item.description,
                    favorited     : item.favorited,
                    favoritesCount: item.favoritesCount,
                    slug          : item.slug,
                    tagList       : item.tagList,
                    title         : item.title,
                    userImage     : item.author.image
                };

                if (!me.previewComponents[index]) {
                    me.previewComponents[index] = Neo.create({
                        module  : PreviewComponent,
                        parentId: me.id,
                        ...config
                    });
                } else {
                    me.previewComponents[index].set(config, true);
                }

                container.cn.push(me.previewComponents[index].vdom);
            });
        }

        me.update();
    }

    /**
     * Triggered after the bio config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetBio(value, oldValue) {
        if (value) {
            VDomUtil.getByFlag(this.vdom, 'bio').html = value;
            this.update();
        }
    }

    /**
     * Triggered after the following config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetFollowing(value, oldValue) {
        if (Neo.isBoolean(value)) {
            let node = VDomUtil.getByFlag(this.vdom, 'following');

            // tobiu: did not see this one in the specs, but the react & vue app do it
            NeoArray.remove(node.cls, value ? 'btn-outline-secondary' : 'btn-secondary');
            NeoArray.add(node.cls, value ? 'btn-secondary' : 'btn-outline-secondary');

            node.cn[0].cls  = [value ? 'ion-minus-round' : 'ion-plus-round'];
            node.cn[1].html = value ? ' Unfollow ' : ' Follow ';
            this.update();
        }
    }

    /**
     * Triggered after the image config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetImage(value, oldValue) {
        VDomUtil.getByFlag(this.vdom, 'image').src = value;
        this.update();
    }

    /**
     * Triggered after the myProfile config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMyProfile(value, oldValue) {console.log('afterSetMyProfile', value);
        if (Neo.isBoolean(oldValue)) {
            let vdom = this.vdom;

            VDomUtil.getByFlag(vdom, 'edit-profile').removeDom = !value;
            VDomUtil.getByFlag(vdom, 'following')   .removeDom = value;
            this.update();
        }
    }

    /**
     * Triggered after the username config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetUsername(value, oldValue) {
        let vdom = this.vdom;

        VDomUtil.getByFlag(vdom, 'following').cn[2].html = value;
        VDomUtil.getByFlag(vdom, 'username').html = value;
        this.update();
    }

    /**
     * @param {Object} params
     */
    getArticles(params) {
        this.getController().getArticles(params).then(data => {
            this.articlePreviews = data.json.articles;
        });
    }

    /**
     * @param {Object} value
     */
    onCurrentUserChange(value) {console.log('onCurrentUserChange', value);
        this.myProfile = this.username === value?.username;
    }

    /**
     * @param {Object} data
     */
    onFollowButtonClick(data) {
        let me = this;

        me.getController().followUser(me.username, !me.following).then(data => {
            me.following = data.json.profile.following;
        });
    }

    /**
     * @param {Object} data
     */
    onNavLinkClick(data) {
        let me         = this,
            el         = VDomUtil.findVdomChild(me.vdom, data.path[0].id),
            feedHeader = VDomUtil.getByFlag(me.vdom, 'feed-header'),
            params     = {};

        if (!el.vdom.cls.includes('disabled')) {
            switch(el.vdom.html) {
                case 'Favorited Articles':
                    params = {
                        favorited: me.username
                    };
                    break;
                case 'My Articles':
                    params = {
                        author: me.username
                    };
                    break;
            }

            feedHeader.cn.forEach(item => {
                NeoArray[item.id === el.parentNode.id ? 'add' : 'remove'](item.cn[0].cls, 'active');
            });

            me.update();

            me.getArticles({
                ...params,
                limit : me.countArticles,
                offset: 0
            });
        }
    }

    /**
     * @param {Object} configs
     */
    updateContent(configs) {
        let me       = this,
            username = configs.username;

        me.set({
            bio      : configs.bio,
            following: configs.following,
            image    : configs.image,
            myProfile: configs.myProfile,
            username : username
        }).then(() => {
            me.getArticles({
                author: username,
                limit : me.countArticles,
                offset: 0
            });
        });
    }
}

export default Neo.setupClass(ProfileComponent);
