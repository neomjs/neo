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
         * @member {String[]} cls=['card']
         */
        cls: ['card'],
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            cn: [{
                cls: ['card-block'],
                cn : [{
                    tag : 'p',
                    cls : ['card-text'],
                    html: 'With supporting text below as a natural lead-in to additional content.'
                }]
            }, {
                cls: ['card-footer'],
                cn : [{
                    tag : 'a',
                    cls : ['comment-author'],
                    href: '',
                    cn  : [{
                        tag: 'img',
                        cls: ['comment-author-img'],
                        src: 'http://i.imgur.com/Qr71crq.jpg'
                    }]
                }, {
                    vtype: 'text',
                    html : '&nbsp;'
                }, {
                    tag : 'a',
                    cls : ['comment-author'],
                    href: '',
                    html: 'Jacob Schmidt'
                }, {
                    tag : 'span',
                    cls : ['date-posted'],
                    html: 'Dec 29th'
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
}

Neo.applyClassConfig(CommentComponent);

export {CommentComponent as default};