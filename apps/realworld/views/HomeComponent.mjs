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
         * @member {Number} pageSize_=10
         */
        pageSize_: 10,
        /**
         * @member {RealWorld.views.article.PreviewComponent[]} previewComponents_=[]
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
                                tag: 'ul',
                                cls: ['nav', 'nav-pills', 'outline-active'],
                                cn : [{
                                    tag: 'li',
                                    cls: ['nav-item'],
                                    cn : [{
                                        tag: 'a',
                                        cls: ['nav-link', 'disabled'],
                                        href: '',
                                        html: 'Your Feed'
                                    }]
                                }, {
                                    tag: 'li',
                                    cls: ['nav-item'],
                                    cn : [{
                                        tag: 'a',
                                        cls: ['nav-link', 'active'],
                                        href: '',
                                        html: 'Global Feed'
                                    }]
                                }]
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

        let me           = this,
            domListeners = me.domListeners;

        domListeners.push({
            click: {
                fn      : me.onPageNavLinkClick,
                delegate: '.page-link',
                scope   : me
            }
        });

        me.domListeners = domListeners;
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
                tagChange: me.onTagChange
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
                        cls : ['page-link'],
                        id  : me.getNavLinkVdomId(i),
                        // href: '', // todo: the styling is based on an existing href attribute, we would need an e.preventDefault() call to add it
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
    onPageNavLinkClick(data) {
        this.currentPage = this.getNavLinkId(data.path[0].id);
    }

    onTagChange(value, oldValue) {
        console.log('onTagChange', value);
    }
}

Neo.applyClassConfig(HomeComponent);

export {HomeComponent as default};