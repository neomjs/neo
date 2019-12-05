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
         * @member {String[]} cls=['card', 'comment-form']
         */
        cls: ['card', 'comment-form'],
        /**
         * @member {String|null} userImage_=null
         */
        userImage_: null,
        /**
         * @member {String|null} userName_=null
         */
        userName_: null,
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
                    src: 'https://static.productionready.io/images/smiley-cyrus.jpg' // https://github.com/gothinkster/realworld/issues/442
                }, {
                    vtype: 'text',
                    html : '&nbsp;'
                }, {
                    tag : 'span',
                    cls : ['comment-author']
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

        me.getController().on({
            afterSetCurrentUser: me.onCurrentUserChange,
            scope              : me
        });
    }

    /**
     * Triggered after the userImage config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetUserImage(value, oldValue) {
        if (value) {
            let vdom = this.vdom;

            vdom.cn[1].cn[0].src = value;
            this.vdom = vdom;
        }
    }

    /**
     * Triggered after the userName config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetUserName(value, oldValue) {
        if (value) {
            let vdom = this.vdom;

            vdom.cn[1].cn[2].html = value;
            this.vdom = vdom;
        }
    }

    /**
     *
     * @returns {String}
     */
    getInputElId() {
        return this.id + '__input';
    }

    /**
     *
     * @param {Object} value
     */
    onCurrentUserChange(value) {
        this.bulkConfigUpdate({
            userImage: value.image,
            userName : value.username
        });
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
            me.getController().postComment({
                data: JSON.stringify({
                    comment: {
                        body: data.value
                    }
                })
            }).then(data => {
                let vdom = me.vdom;

                vdom.cn[0].cn[0].value = ''; // reset the textarea value
                me.vdom = vdom;
            });
        });
    }
}

Neo.applyClassConfig(CreateCommentComponent);

export {CreateCommentComponent as default};