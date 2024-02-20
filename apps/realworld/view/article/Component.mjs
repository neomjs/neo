import BaseComponent          from '../../../../src/component/Base.mjs';
import CreateCommentComponent from './CreateCommentComponent.mjs';
import NeoArray               from '../../../../src/util/Array.mjs';
import VDomUtil               from '../../../../src/util/VDom.mjs';

/**
 * @class RealWorld.view.article.Component
 * @extends Neo.component.Base
 */
class Component extends BaseComponent {
    static config = {
        /**
         * @member {String} className='RealWorld.view.article.Component'
         * @protected
         */
        className: 'RealWorld.view.article.Component',
        /**
         * @member {Object|null} author_=null
         */
        author_: null,
        /**
         * @member {String[]} baseCls=['article-page']
         */
        baseCls: ['article-page'],
        /**
         * @member {String|null} body_=null
         */
        body_: null,
        /**
         * We store the lazy loaded class here
         * @member {RealWorld.view.article.CommentComponent} commentComponent=null
         * @protected
         */
        commentComponent: null,
        /**
         * @member {RealWorld.view.article.CommentComponent[]} commentComponents=[]
         */
        commentComponents: [],
        /**
         * @member {Object[]|null} comments_=null
         */
        comments_: null,
        /**
         * @member {RealWorld.view.article.CreateCommentComponent|null} createCommentComponent=null
         */
        createCommentComponent: null,
        /**
         * @member {String|null} createdAt_=null
         */
        createdAt_: null,
        /**
         * @member {Boolean} favorited_=false
         */
        favorited_: false,
        /**
         * @member {Number|null} favoritesCount_=null
         */
        favoritesCount_: null,
        /**
         * @member {Array|null} tagList_=null
         */
        tagList_: null,
        /**
         * @member {String|null} title_=null
         */
        title_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {cls: ['banner'], cn: [
                {cls: ['container'], cn: [
                    {tag: 'h1', flag: 'title'},
                    {cls: ['article-meta'], cn: [
                        {tag: 'a', flag: 'userimage', cn: [
                            {tag: 'img'}
                        ]},
                        {cls: ['info'], cn: [
                            {tag: 'a', cls: ['author'], flag: 'username'},
                            {tag: 'span', cls: ['date'], flag: 'createdAt'}
                        ]},
                        {tag: 'button', cls: ['btn', 'btn-sm', 'btn-outline-secondary', 'follow-button'], cn: [
                            {tag: 'i', flag: 'followIcon'},
                            {vtype: 'text', flag: 'followAuthor'},
                            {vtype: 'text', flag: 'username'}
                        ]},
                        {tag: 'button', cls: ['btn', 'btn-sm', 'btn-outline-secondary', 'edit-button'], flag: 'edit-button', removeDom: true, cn: [
                            {tag: 'i', cls: ['ion-edit']},
                            {vtype: 'text', html: ' Edit Article'}
                        ]},
                        {vtype: 'text', html: '&nbsp;&nbsp;'},
                        {tag: 'button', cls: ['btn', 'btn-sm', 'btn-outline-primary', 'favorite-button'], flag: 'favorited', cn: [
                            {tag: 'i', cls: ['ion-heart']},
                            {vtype: 'text', html: '&nbsp;'},
                            {vtype: 'text'},
                            {vtype: 'text', html: ' Post '},
                            {tag: 'span', cls: ['counter'], flag: 'favoritesCount'}
                        ]},
                        {tag: 'button', cls: ['btn', 'btn-sm', 'btn-outline-danger', 'delete-button'], flag: 'delete-button', removeDom: true, cn: [
                            {tag: 'i', cls: ['ion-trash-a']},
                            {vtype: 'text', html: ' Delete Article'}
                        ]}
                    ]}
                ]}
            ]},
            {cls: ['container', 'page'], cn: [
                {cls: ['row', 'article-content'], cn: [
                    {cls: ['col-md-12'], flag: 'body', cn: []}
                ]},
                {tag: 'hr'},
                {cls: ['article-actions'], flag: 'article-actions', cn: [
                    {cls: ['article-meta'], cn: [
                        {tag: 'a', flag: 'userimage', cn: [{tag: 'img'}]},
                        {cls: ['info'], cn: [
                            {tag: 'a', cls: ['author'], flag: 'username'},
                            {tag: 'span', cls: ['date'], html: 'January 20th'}
                        ]},
                        {tag: 'button', cls: ['btn', 'btn-sm', 'btn-outline-secondary', 'follow-button'], cn: [
                            {tag: 'i', flag: 'followIcon'},
                            {vtype: 'text', flag: 'followAuthor'},
                            {vtype: 'text', flag: 'username'}
                        ]},
                        {vtype: 'text', html: '&nbsp;&nbsp;'},
                        {tag: 'button', cls: ['btn', 'btn-sm', 'btn-outline-primary', 'favorite-button'], flag: 'favorited', cn: [
                            {tag: 'i', cls: ['ion-heart']},
                            {vtype: 'text', html: '&nbsp;'},
                            {vtype: 'text'},
                            {vtype: 'text', html: ' Post '},
                            {tag: 'span', cls: ['counter'], flag: 'favoritesCount'}
                        ]}
                    ]}
                ]},
                {cls: 'row', cn: [
                    {cls: ['col-xs-12', 'col-md-8', 'offset-md-2'], flag: 'comments-section', cn: []}
                ]}
            ]}
        ]}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {click: {fn: me.onDeleteButtonClick,   delegate: '.delete-button',   scope: me}},
            {click: {fn: me.onEditButtonClick,     delegate: '.edit-button',     scope: me}},
            {click: {fn: me.onFavoriteButtonClick, delegate: '.favorite-button', scope: me}},
            {click: {fn: me.onFollowButtonClick,   delegate: '.follow-button',   scope: me}}
        ]);

        me.getController().on({
            afterSetCurrentUser: me.onCurrentUserChange,
            scope              : me
        });
    }

    /**
     *
     */
    onConstructed() {
        let me          = this,
            currentUser = me.getController().currentUser;

        me.createCommentComponent = Neo.create({
            module   : CreateCommentComponent,
            parentId : me.id,
            userImage: currentUser?.image || null
        });

        VDomUtil.getByFlag(me.vdom, 'comments-section').cn.unshift(me.createCommentComponent.vdom);
        me.update();

        super.onConstructed();
    }

    /**
     * Triggered after the author config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetAuthor(value, oldValue) {
        if (value) {
            let me   = this,
                vdom = me.vdom;

            VDomUtil.getFlags(vdom, 'followAuthor').forEach(node => {
                node.html = value.following ? ' Unfollow ' : ' Follow ';
            });

            VDomUtil.getFlags(vdom, 'followIcon').forEach(node => {
                node.cls = value.following ? ['ion-minus-round'] : ['ion-plus-round'];
            });

            VDomUtil.getFlags(vdom, 'userimage').forEach(node => {
                node.href = '#/profile/' + value.username;
                node.cn[0].src = value.image;
            });

            VDomUtil.getFlags(vdom, 'username').forEach(node => {
                node.href = '#/profile/' + value.username;
                node.html = value.username;
            });

            me.update();
            me.onCurrentUserChange();
        }
    }

    /**
     * Triggered after the body config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetBody(value, oldValue) {
        if (value) {
            Neo.main.addon.Markdown.markdownToHtml(value).then(html => {
                VDomUtil.getByFlag(this.vdom, 'body').cn[0] = {
                    cn: [{
                        tag: 'p',
                        html
                    }]
                };

                this.update();
            });
        }
    }

    /**
     * Triggered after the comments config got changed
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     * @protected
     */
    async afterSetComments(value, oldValue) {
        if (Array.isArray(value)) {
            let me        = this,
                container = VDomUtil.getByFlag(me.vdom, 'comments-section'),
                config, module;

            if (!me.commentComponent) {
                module = await import('./CommentComponent.mjs');
                me.commentComponent = module.default;
            }

            container.cn = [container.cn.shift()]; // keep the CreateCommentComponent

            value.forEach((item, index) => {
                config = {
                    author   : item.author,
                    body     : item.body,
                    commentId: item.id,
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt
                };

                if (!me.commentComponents[index]) {
                    me.commentComponents[index] = Neo.create({
                        module  : me.commentComponent,
                        parentId: me.id,
                        ...config
                    });
                } else {
                    me.commentComponents[index].set(config, true);
                }

                container.cn.push(me.commentComponents[index].vdom);
            });

            me.update();
        }
    }

    /**
     * Triggered after the createdAt config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetCreatedAt(value, oldValue) {
        if (value) {
            VDomUtil.getByFlag(this.vdom, 'createdAt').html = new Intl.DateTimeFormat('en-US', {
                day  : 'numeric',
                month: 'long',
                year : 'numeric'
            }).format(new Date(value));

            this.update();
        }
    }

    /**
     * Triggered after the favorited config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetFavorited(value, oldValue) {
        let me = this;

        VDomUtil.getFlags(me.vdom, 'favorited').forEach(node => {
            node.cn[2].html = value ? 'Unfavorite' : 'Favorite';

            NeoArray.add(node.cls, value ? 'btn-primary' : 'btn-outline-primary');
            NeoArray.remove(node.cls, value ? 'btn-outline-primary' : 'btn-primary');
        });

        me.update();

        // ignore the initial setter call
        if (Neo.isBoolean(oldValue)) {
            me.getController().favoriteArticle(me.slug, value).then(data => {
                me.favoritesCount = data.json.article.favoritesCount;
            });
        }
    }

    /**
     * Triggered after the favoritesCount config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetFavoritesCount(value, oldValue) {
        if (Neo.isNumber(value)) {
            VDomUtil.getFlags(this.vdom, 'favoritesCount').forEach(node => {
                node.html = `(${value})`;
            });

            this.update();
        }
    }

    /**
     * Triggered after the tagList config got changed
     * @param {Array} value
     * @param {Array} oldValue
     * @protected
     */
    afterSetTagList(value, oldValue) {
        let me   = this,
            body = VDomUtil.getByFlag(me.vdom, 'body'),
            tagList;

        if (Array.isArray(value) && value.length > 0) {
            tagList = {
                tag: 'ul',
                cls: ['tag-list'],
                cn : []
            };

            value.forEach(item => {
                tagList.cn.push({
                    tag : 'li',
                    cls : ['tag-default', 'tag-pill', 'tag-outline'],
                    html: item
                })
            });

            body.cn[1] = tagList;
        } else {
            if (body.cn[1]) {
                body.cn[1].removeDom = true;
            }
        }

        me.update();
    }

    /**
     * Triggered after the title config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTitle(value, oldValue) {
        VDomUtil.getByFlag(this.vdom, 'title').html = value;
        this.update();
    }

    /**
     *
     */
    onCurrentUserChange() {console.log('### onCurrentUserChange');
        let me          = this,
            currentUser = me.getController().currentUser,
            vdom        = me.vdom,
            isCurrentUser;

        if (me.author && currentUser) {
            isCurrentUser = me.author.username === currentUser.username;

            vdom.cn[0].cn[0].cn[1].cn[2].removeDom = isCurrentUser; // follow user button
            vdom.cn[0].cn[0].cn[1].cn[5].removeDom = isCurrentUser; // favorite post button

            VDomUtil.getByFlag(vdom, 'article-actions').removeDom = isCurrentUser;
            VDomUtil.getByFlag(vdom, 'delete-button')  .removeDom = !isCurrentUser;
            VDomUtil.getByFlag(vdom, 'edit-button')    .removeDom = !isCurrentUser;

            me.update();
        }
    }

    /**
     * @param {Object} data
     */
    onDeleteButtonClick(data) {
        this.getController().deleteArticle(this.slug);
    }

    /**
     * @param {Object} data
     */
    onEditButtonClick(data) {
        Neo.Main.setRoute({
            value: '/editor/' + this.slug
        });
    }

    /**
     * @param {Object} data
     */
    onFavoriteButtonClick(data) {
        this.favorited = !this.favorited;
    }

    /**
     * @param {Object} data
     */
    onFollowButtonClick(data) {
        let me = this;

        me.getController().followUser(me.author.username, !me.author.following).then(data => {
            me.author = data.json.profile;
        });
    }
}

Neo.setupClass(Component);

export default Component;
