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
             * @member {Object} _vdom
             */
            _vdom: {}
        }
    }
}

Neo.applyClassConfig(CreateCommentComponent);

export {CreateCommentComponent as default};