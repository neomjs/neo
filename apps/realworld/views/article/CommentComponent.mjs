import {default as Component} from '../../../../src/component/Base.mjs';

/**
 * @class RealWorld.views.article.CommentComponent
 * @extends Neo.component.Base
 */
class CommentComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld.views.article.CommentComponent'
         * @private
         */
        className: 'RealWorld.views.article.CommentComponent',
        /**
         * @member {String} ntype='realworld-article-commentcomponent'
         * @private
         */
        ntype: 'realworld-article-commentcomponent',
        /**
         * @member {Object|null} author_=null
         */
        author_: null,
        /**
         * @member {String|null} body_=null
         */
        body_: null,
        /**
         * @member {String[]} cls=['card']
         */
        cls: ['card'],
        /**
         * @member {Number|null} commentId=null
         */
        commentId: null,
        /**
         * @member {String|null} createdAt_=null
         */
        createdAt_: null,
        /**
         * Not in use
         * @member {String|null} updatedAt=null
         */
        updatedAt: null,
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            cn: [{
                cls: ['card-block'],
                cn : [{
                    tag: 'p',
                    cls: ['card-text']
                }]
            }, {
                cls: ['card-footer'],
                cn : [{
                    tag : 'a',
                    cls : ['comment-author'],
                    href: '',
                    cn  : [{
                        tag: 'img',
                        cls: ['comment-author-img']
                    }]
                }, {
                    vtype: 'text',
                    html : '&nbsp;'
                }, {
                    tag : 'a',
                    cls : ['comment-author'],
                    href: ''
                }, {
                    tag : 'span',
                    cls : ['date-posted']
                }, {
                    tag: 'span',
                    cls: ['mod-options'],
                    cn : [
                        {tag: 'i', cls: ['ion-edit']},
                        {tag: 'i', cls: ['ion-trash-a']},
                    ]
                }]
            }]
        }
    }}

    /**
     * Triggered after the author config got changed
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @private
     */
    afterSetAuthor(value, oldValue) {
        if (value) {
            let vdom = this.vdom;

            vdom.cn[1].cn[0].cn[0].src = value.image;
            vdom.cn[1].cn[2].html      = value.username;
            this.vdom = vdom;
        }
    }

    /**
     * Triggered after the body config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @private
     */
    afterSetBody(value, oldValue) {
        if (value) {
            let vdom = this.vdom;

            vdom.cn[0].cn[0].html = value;
            this.vdom = vdom;
        }
    }

    /**
     * Triggered after the createdAt config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @private
     */
    afterSetCreatedAt(value, oldValue) {
        if (value) {
            let vdom = this.vdom;

            vdom.cn[1].cn[3].html = new Intl.DateTimeFormat('en-US', {
                day  : 'numeric',
                month: 'long',
                year : 'numeric'
            }).format(new Date(value));

            this.vdom = vdom;
        }
    }
}

Neo.applyClassConfig(CommentComponent);

export {CommentComponent as default};