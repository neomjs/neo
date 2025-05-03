import Component from '../../../../src/component/Base.mjs';
import NeoArray  from '../../../../src/util/Array.mjs';
import VDomUtil  from '../../../../src/util/VDom.mjs';

/**
 * @class RealWorld2.view.article.PreviewComponent
 * @extends Neo.component.Base
 */
class PreviewComponent extends Component {
    static config = {
        /**
         * @member {String} className='RealWorld2.view.article.PreviewComponent'
         * @protected
         */
        className: 'RealWorld2.view.article.PreviewComponent',
        /**
         * @member {String|null} author_=null
         */
        author_: null,
        /**
         * @member {String[]} baseCls=['rw2-preview-component']
         */
        baseCls: ['rw2-preview-component'],
        /**
         * ISO 8601 timestamp
         * @member {String|null} createdAt_=null
         */
        createdAt_: null,
        /**
         * @member {String|null} description_=null
         */
        description_: null,
        /**
         * @member {Boolean} favorited_=false
         */
        favorited_: false,
        /**
         * @member {Number|null} favoritesCount_=null
         */
        favoritesCount_: null,
        /**
         * @member {String|null} slug_=null
         */
        slug_: null,
        /**
         * @member {Array|null} tagList_=null
         */
        tagList_: null,
        /**
         * @member {String|null} title_=null
         */
        title_: null,
        /**
         * @member {String|null} userImage_=null
         */
        userImage_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            cn: [{
                cls: ['article-meta'],
                cn : [{
                    tag : 'a',
                    flag: 'userImageLink',
                    cn  : [{tag: 'img'}]
                }, {
                    cls: ['info'],
                    cn : [
                        {tag: 'a',    cls: ['author'], flag: 'author'},
                        {tag: 'span', cls: ['date'],   flag: 'createdAt'}
                    ]
                }, {
                    tag: 'button',
                    cls: ['btn', 'btn-sm', 'pull-xs-right'],
                    cn : [
                        {tag  : 'i',    cls : ['fa fa-heart']},
                        {vtype: 'text', flag: 'favoritesCount'}
                    ]
                }]
            }, {
                tag : 'a',
                cls : ['preview-link'],
                flag: 'preview-link',
                cn  : [
                    {tag: 'h1',   flag: 'title'},
                    {tag: 'p',    flag: 'description'},
                    {tag: 'span', html: 'Read more...'}
                ]
            }]
        }
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners({
            click: {
                fn      : me.onFavoriteButtonClick,
                delegate: '.pull-xs-right',
                scope   : me
            }
        });
    }

    /**
     * Triggered after the author config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetAuthor(value, oldValue) {
        let node = VDomUtil.getByFlag(this.vdom, 'author'),
            href = '#/profile/' + value;

        // todo: disabled until the new profile view is ready
        //node.href = href;
        node.html = value;

        //VDomUtil.getByFlag(vdom, 'userImageLink').href = href;

        this.update();
    }

    /**
     * Triggered after the createdAt config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetCreatedAt(value, oldValue) {
        VDomUtil.getByFlag(this.vdom, 'createdAt').html = new Intl.DateTimeFormat('en-US', {
            day  : 'numeric',
            month: 'long',
            year : 'numeric'
        }).format(new Date(value));

        this.update();
    }

    /**
     * Triggered after the description config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetDescription(value, oldValue) {
        VDomUtil.getByFlag(this.vdom, 'description').html = value;
        this.update();
    }

    /**
     * Triggered after the favorited config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetFavorited(value, oldValue) {
        let me     = this,
            button = me.vdom.cn[0].cn[2];

        NeoArray.add(button.cls, value ? 'btn-primary' : 'btn-outline-primary');
        NeoArray.remove(button.cls, value ? 'btn-outline-primary' : 'btn-primary');

        me.update();

        // ignore the initial setter call
        if (Neo.isBoolean(oldValue)) {
            me.getController().favoriteArticle(me.slug, value);
        }
    }

    /**
     * Triggered after the favoritesCount config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetFavoritesCount(value, oldValue) {
        VDomUtil.getByFlag(this.vdom, 'favoritesCount').html = ' ' + value;
        this.update();
    }

    /**
     * Triggered after the slug config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetSlug(value, oldValue) {
        // todo: re-add once the new details view is in place
        // VDomUtil.getByFlag(this.vdom, 'preview-link').href = '#/article/' + value;
        // this.update();
    }

    /**
     * Triggered after the tagList config got changed
     * @param {Array} value
     * @param {Array} oldValue
     * @protected
     */
    afterSetTagList(value, oldValue) {
        let me   = this,
            vdom = me.vdom,
            tagList;

        // remove old tags if exists
        if (vdom.cn[1].cn[3]) {
            vdom.cn[1].cn.pop();
        }

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

            vdom.cn[1].cn.push(tagList);

            me.update();
        }
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
     * Triggered after the userImage config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetUserImage(value, oldValue) {
        VDomUtil.getByFlag(this.vdom, 'userImageLink').cn[0].src = value;
        this.update();
    }

    /**
     * @param {Object} data
     */
    onFavoriteButtonClick(data) {
        let me        = this,
            favorited = !me.favorited;

        me.set({
            favorited     : favorited,
            favoritesCount: favorited ? (me.favoritesCount + 1) : (me.favoritesCount - 1)
        });
    }
}

export default Neo.setupClass(PreviewComponent);
