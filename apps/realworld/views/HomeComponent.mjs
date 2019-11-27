import {default as Component} from '../../../src/component/Base.mjs';
import NeoArray               from '../../../src/util/Array.mjs';
import PreviewComponent       from './article/PreviewComponent.mjs';
import TagListComponent       from './article/TagListComponent.mjs';
import {default as VDomUtil}  from '../../../src/util/VDom.mjs';

/**
 * @class RealWorld.views.HomeComponent
 * @extends Neo.component.Base
 */
class HomeComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld.views.HomeComponent'
         * @private
         */
        className: 'RealWorld.views.HomeComponent',
        /**
         * @member {String} ntype='realworld-homecomponent'
         * @private
         */
        ntype: 'realworld-homecomponent',
        /**
         * @member {Object[]|null} articlePreviews_=null
         */
        articlePreviews_: null,
        /**
         * @member {String[]} cls=['home-page']
         */
        cls: ['home-page'],
        /**
         * @member {Number} countArticles_=10
         */
        countArticles_: 10,
        /**
         * @member {Number} countArticles_=10
         */
        currentPage_: 1,
        /**
         * @member {Object[]} feeds_
         */
        feeds_: [
            {name: 'Your Feed',   disabled: true},
            {name: 'Global Feed', active  : true}
        ],
        /**
         * @member {Boolean} loggedIn_=false
         */
        loggedIn_: false,
        /**
         * @member {Number} pageSize_=10
         */
        pageSize_: 10,
        /**
         * @member {RealWorld.views.article.PreviewComponent[]} previewComponents=[]
         */
        previewComponents: [],
        /**
         * @member {RealWorld.views.article.TagListComponent|null} tagList_=null
         */
        tagList_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            cn: [{
                cls: ['banner'],
                cn : [{
                    cls: ['container'],
                    cn : [{
                        tag : 'h1',
                        cls : ['logo-font'],
                        html: 'conduit'
                    }, {
                        tag : 'p',
                        html: 'A place to share your knowledge.'
                    }]
                }]
            }, {
                cls: ['container', 'page'],
                cn : [{
                    cls: ['row'],
                    cn : [{
                        cls: ['col-md-9'],
                        cn : [{
                            cls: ['feed-toggle'],
                            cn : [{
                                tag : 'ul',
                                cls : ['nav', 'nav-pills', 'outline-active'],
                                flag: 'feed-header',
                                cn  : []
                            }]
                        }, {
                            tag: 'nav',
                            cn : [{
                                tag : 'ul',
                                cls : ['pagination'],
                                flag: 'pagination'
                            }]
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

        Neo.main.DomEvents.registerPreventDefaultTargets({
            name: 'click',
            cls : 'prevent-click'
        });

        let me           = this,
            domListeners = me.domListeners;

        domListeners.push({
            click: {
                fn      : me.onNavLinkClick,
                delegate: '.nav-link',
                scope   : me
            }
        }, {
            click: {
                fn      : me.onPageNavLinkClick,
                delegate: '.page-link',
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
     *
     */
    onConstructed() {
        super.onConstructed();

        let me   = this,
            vdom = me.vdom;

        me.tagList = Neo.create({
            module  : TagListComponent,
            parentId: me.id,

            listeners: {
                tagChange: me.onTagChange,
                scope    : me
            }
        });

        vdom.cn[1].cn[0].cn.push(me.tagList.vdom);

        me.vdom = vdom;
    }

    /**
     * Triggered after the articlePreviews config got changed
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     * @private
     */
    afterSetArticlePreviews(value, oldValue) {
        let me        = this,
            container = me.getContainer(),
            footer    = container.cn.pop(),
            vdom      = me.vdom,
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
                    me.previewComponents[index].bulkConfigUpdate(config, true); // hint: try this call with false and compare the delta updates
                }

                container.cn.push(me.previewComponents[index].vdom);
            });
        }

        container.cn.push(footer);

        me.vdom = vdom;
    }

    /**
     * Triggered after the countArticles config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @private
     */
    afterSetCountArticles(value, oldValue) {
        let me          = this,
            vdom        = me.vdom,
            pagination  = VDomUtil.getByFlag(vdom, 'pagination'),
            pageSize    = me.pageSize,
            countPages  = Math.ceil(value / pageSize),
            currentPage = me.currentPage,
            i           = 1,
            cls;

        if (countPages < 2) {
            // todo: hide the paging bbar
        } else {
            pagination.cn = [];

            for (; i <= countPages; i++) {
                cls = ['page-item'];

                if (i === currentPage) {
                    cls.push('active');
                }

                pagination.cn.push({
                    tag: 'li',
                    cls: cls,
                    cn : [{
                        tag : 'a',
                        cls : ['page-link', 'prevent-click'],
                        id  : me.getNavLinkVdomId(i),
                        href: '',
                        html: i
                    }]
                });
            }
        }

        me.vdom = vdom;
    }

    /**
     * Triggered after the currentPage config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @private
     */
    afterSetCurrentPage(value, oldValue) {
        let me   = this,
            vdom = me.vdom,
            node, oldNode;

        if (me.mounted) {
            node    = VDomUtil.findVdomChild(vdom, me.getNavLinkVdomId(value)).parentNode;
            oldNode = VDomUtil.findVdomChild(vdom, me.getNavLinkVdomId(oldValue)).parentNode;

            NeoArray.add(node.cls, 'active');
            NeoArray.remove(oldNode.cls, 'active');

            me.vdom = vdom;

            me.getController().articlesOffset = (value - 1) * me.pageSize;

            Neo.main.DomAccess.windowScrollTo({});
        }
    }

    /**
     * Triggered after the feeds config got changed
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @private
     */
    afterSetFeeds(value, oldValue) {
        let me         = this,
            vdom       = me.vdom,
            feedHeader = VDomUtil.getByFlag(vdom, 'feed-header'),
            cls;

        feedHeader.cn = [];

        value.forEach((item, index) => {
            cls = ['prevent-click', 'nav-link'];

            if (item.active)   {cls.push('active');}
            if (item.disabled) {cls.push('disabled');}

            feedHeader.cn.push({
                tag: 'li',
                cls: ['nav-item'],
                id : me.id + '__nav-item_' + index,
                cn : [{
                    tag: 'a',
                    cls: cls,
                    href: '',
                    html: item.name,
                    id  : me.id + '__nav-item-link_' + index,
                }]
            });
        });
    }

    /**
     * Triggered after the loggedIn config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @private
     */
    afterSetLoggedIn(value, oldValue) {
        let me      = this,
            vdom    = me.vdom,
            navItem = VDomUtil.findVdomChild(vdom, me.id + '__nav-item-link_0').vdom;

        NeoArray[value ? 'remove' : 'add'](navItem.cls, 'disabled');
        me.vdom = vdom;
    }

    /**
     * todo
     * Triggered after the pageSize config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @private
     */
    afterSetPageSize(value, oldValue) {
        let me = this,
            i  = 0;

        console.log('afterSetPageSize', value);

        for (; i < value; i++) {

        }
    }

    /**
     * Creates an article id using the view id as a prefix
     * @returns {String} itemId
     */
    getArticleId(id) {
        return this.id + '__' + id;
    }

    /**
     *
     * @return {Object} vdom
     */
    getContainer() {
        let el = VDomUtil.findVdomChild(this.vdom, {cls: 'col-md-9'});
        return el && el.vdom;
    }

    /**
     *
     * @param {String} nodeId
     * @returns {Number}
     */
    getNavLinkId(nodeId) {
        return parseInt(nodeId.split('__')[1]);
    }

    /**
     *
     * @param {Number|String} id
     * @returns {String}
     */
    getNavLinkVdomId(id) {
        return this.id + '__' + id;
    }

    /**
     *
     * @param {Object} data
     */
    onNavLinkClick(data) {
        let me         = this,
            vdom       = me.vdom,
            el         = VDomUtil.findVdomChild(vdom, data.path[0].id),
            feedHeader = VDomUtil.getByFlag(vdom, 'feed-header'),
            opts;

        if (!el.vdom.cls.includes('disabled')) {
            switch(el.vdom.html) {
                case 'Global Feed':
                    opts = {};
                    break;
                case 'Your Feed':
                    opts = {}; // todo
                    break;
                default: // tag
                    opts = {
                        tag: el.vdom.html.substring(2) // remove the '# '
                    };
                    break;
            }

            feedHeader.cn.forEach(item => {
                NeoArray[item.id === el.parentNode.id ? 'add' : 'remove'](item.cn[0].cls, 'active');
            });

            me.vdom = vdom;

            me.getController().getArticles(opts);
        }
    }

    /**
     *
     * @param {Object} value
     */
    onCurrentUserChange(value) {
        console.log('onCurrentUserChange', value);
        this.loggedIn = !!value;
    }

    /**
     *
     * @param {Object} data
     */
    onPageNavLinkClick(data) {
        this.currentPage = this.getNavLinkId(data.path[0].id);
    }

    /**
     *
     * @param {Object} opts
     * @param {String|null} opts.oldValue
     * @param {String|null} opts.value
     */
    onTagChange(opts) {
        let me    = this,
            feeds = me.feeds,
            name  = '# ' + opts.value;

        feeds.forEach(item => {
            item.active = false;
        });

        if (feeds.length < 3) {
            feeds.push({
                active: true,
                name  : name
            });
        } else {
            Object.assign(feeds[2], {
                active: true,
                name  : name
            });
        }

        me.feeds = feeds;

        me.getController().getArticles({
            tag: opts.value
        });
    }
}

Neo.applyClassConfig(HomeComponent);

export {HomeComponent as default};