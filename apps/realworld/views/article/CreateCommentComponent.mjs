import {default as Component} from '../../../../src/component/Base.mjs';

/**
 * @class RealWorld.views.article.CreateCommentComponent
 * @extends Neo.component.Base
 */
class CreateCommentComponent extends Component {
    static getConfig() {
        return {
            /**
             * @member {String} className='RealWorld.views.article.CreateCommentComponent'
             * @private
             */
            className: 'RealWorld.views.article.CreateCommentComponent',
            /**
             * @member {String} ntype='realworld-article-createcommentcomponent'
             * @private
             */
            ntype: 'realworld-article-createcommentcomponent',
            /**
             * @member {String[]} cls=['card', 'comment-form']
             */
            cls: ['card', 'comment-form'],
            /**
             * @member {Object} _vdom
             */
            _vdom: {
                tag: 'form',
                cn : [{
                    cls: ['card-block'],
                    cn : [{
                        tag        : 'textarea',
                        cls        : ['form-control'],
                        placeholder: 'Write a comment...',
                        rows       : 3
                    }]
                }, {
                    cls: ['card-footer'],
                    cn : [{
                        tag: 'img',
                        cls: ['comment-author-img'],
                        src: 'http://i.imgur.com/Qr71crq.jpg'
                    }, {
                        tag : 'button',
                        cls : ['btn', 'btn-sm', 'btn-primary'],
                        html: 'Post Comment',
                        type: 'button' // override the default submit type
                    }]
                }]
            }
        }
    }
}

Neo.applyClassConfig(CreateCommentComponent);

export {CreateCommentComponent as default};