import {default as Component} from '../../../../src/component/Base.mjs';

/**
 * @class RealWorld.views.article.CreateCommentComponent
 * @extends Neo.component.Base
 */
class CreateCommentComponent extends Component {
    static getConfig() {return {
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
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me           = this,
            domListeners = me.domListeners,
            vdom         = me.vdom;

        domListeners.push({
            click: {
                fn      : me.onSubmitButtonClick,
                delegate: '.btn-primary',
                scope   : me
            }
        });

        me.domListeners = domListeners;

        vdom.cn[0].cn[0].id = me.getInputElId();
        me.vdom = vdom;
    }

    getInputElId() {
        return this.id + '__input';
    }

    /**
     *
     * @param {Object} data
     */
    onSubmitButtonClick(data) {
        let me = this;

        // read the input values from the main thread
        // we could register an oninput event to this view as well and store the changes
        Neo.main.DomAccess.getAttributes({
            id        : me.getInputElId(),
            attributes: 'value'
        }).then(data => {
            console.log(data);
        });
    }
}

Neo.applyClassConfig(CreateCommentComponent);

export {CreateCommentComponent as default};