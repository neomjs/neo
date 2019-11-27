import {default as Component}  from '../../../../src/component/Base.mjs';
import {default as VDomUtil}   from '../../../../src/util/VDom.mjs';
import {default as VNodeUtil}  from '../../../../src/util/VNode.mjs';
import {default as ArticleApi} from '../../api/Article.mjs';

/**
 * @class RealWorld.views.article.CreateComponent
 * @extends Neo.component.Base
 */
class CreateComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld.views.article.CreateComponent'
         * @private
         */
        className: 'RealWorld.views.article.CreateComponent',
        /**
         * @member {String} ntype='realworld-article-createcomponent'
         * @private
         */
        ntype: 'realworld-article-createcomponent',
        /**
         * @member {String} body_=''
         */
        body_: '',
        /**
         * @member {String[]} cls=['editor-page']
         */
        cls: ['editor-page'],
        /**
         * @member {Object[]} errors_=[]
         */
        errors_: [],
        /**
         * @member {String} description_=''
         */
        description_: '',
        /**
         * @member {String|null} slug=null
         */
        slug: null,
        /**
         * @member {String[]} tagList_=[]
         */
        tagList_: [],
        /**
         * @member {String} title_=''
         */
        title_: '',
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            cn: [{
                cls: ['container', 'page'],
                cn : [{
                    cls: ['row'],
                    cn : [{
                        cls: ['col-md-10', 'offset-md-1', 'col-xs-12'],
                        cn : [{
                            tag : 'ul',
                            flag: 'errors',
                            cls : ['error-messages']
                        }, {
                            tag: 'form',
                            cn : [{
                                tag: 'fieldset',
                                cn : [{
                                    tag: 'fieldset',
                                    cls: ['form-group'],
                                    cn : [{
                                        tag        : 'input',
                                        cls        : ['form-control', 'form-control-lg'],
                                        name       : 'title',
                                        flag       : 'title',
                                        placeholder: 'Article Title',
                                        type       : 'text'
                                    }]
                                }, {
                                    tag: 'fieldset',
                                    cls: ['form-group'],
                                    cn : [{
                                        tag        : 'input',
                                        cls        : ['form-control'],
                                        name       : 'description',
                                        flag       : 'description',
                                        placeholder: 'What\'s this article about?',
                                        type       : 'text'
                                    }]
                                }, {
                                    tag: 'fieldset',
                                    cls: ['form-group'],
                                    cn : [{
                                        tag        : 'textarea',
                                        cls        : ['form-control'],
                                        name       : 'body',
                                        flag       : 'body',
                                        placeholder: 'Write your article (in markdown)',
                                        rows       : 8
                                    }]
                                }, {
                                    tag: 'fieldset',
                                    cls: ['form-group'],
                                    cn : [{
                                        tag        : 'input',
                                        cls        : ['form-control', 'field-tags'],
                                        name       : 'tags',
                                        flag       : 'tags',
                                        placeholder: 'Enter tags',
                                        type       : 'text'
                                    }, {
                                        cls : ['tag-list'],
                                        flag: 'tag-list'
                                    }]
                                }, {
                                    tag : 'button',
                                    cls : ['btn', 'btn-lg', 'btn-primary', 'pull-xs-right'],
                                    html: 'Publish Article',
                                    type: 'button' // override the default submit type
                                }]
                            }]
                        }]
                    }]
                }]
            }]
        }
    }}

    /**
     * constructor
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me           = this,
            domListeners = me.domListeners;

        domListeners.push({
            click: {
                fn      : me.onSubmitButtonClick,
                delegate: '.btn-primary',
                scope   : me
            }
        }, {
            click: {
                fn      : me.onTagClose,
                delegate: '.ion-close-round',
                scope   : me
            }
        }, {
            keydown: {
                fn      : me.onFieldTagsKeyDown,
                delegate: '.field-tags',
                scope   : me
            }
        });

        me.domListeners = domListeners;
    }

    /**
     * Triggered after the body config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetBody(value, oldValue) {
        let vdom = this.vdom;

        VDomUtil.getByFlag(vdom, 'body').value = value;
        this.vdom = vdom;
    }

    /**
     * Triggered after the description config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetDescription(value, oldValue) {
        let vdom = this.vdom;

        VDomUtil.getByFlag(vdom, 'description').value = value;
        this.vdom = vdom;
    }

    /**
     * Triggered after the errors config got changed
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @private
     */
    afterSetErrors(value, oldValue) {
        let me   = this,
            vdom = me.vdom,
            list = VDomUtil.getByFlag(vdom, 'errors');

        list.cn = [];

        Object.entries(value || {}).forEach(([key, value]) => {
            list.cn.push({
                tag : 'li',
                html: key + ' ' + value.join(' and ')
            });
        });

        me.vdom = vdom;
    }

    /**
     * Triggered after the tagList config got changed
     * Render tag list and reset tag field value
     * @param {String[]} value
     * @param {String[]} oldValue
     */
    afterSetTagList(value, oldValue) {
        let me       = this,
            vdom     = me.vdom,
            list     = VDomUtil.getByFlag(vdom, 'tag-list'),
            tagField = VDomUtil.getByFlag(vdom, 'tags');

        list.cn        = [];
        tagField.value = null; // TODO Reset tag field value properly

        Object.entries(value || {}).forEach(([key, value]) => {
            list.cn.push({
                tag: 'span',
                cls: ['tag-default tag-pill'],
                cn : [{
                    tag         : 'i',
                    cls         : ['ion-close-round'],
                    'data-value': value,
                }, {
                    vtype: 'text',
                    html : value
                }]
            });
        });

        me.vdom = vdom;
    }

    /**
     * Triggered after the title config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetTitle(value, oldValue) {
        let vdom = this.vdom;

        VDomUtil.getByFlag(vdom, 'title').value = value;
        this.vdom = vdom;
    }

    /**
     * on field tags key down enter add tag to tag list
     * @param event
     */
    onFieldTagsKeyDown(event) {
        const me = this;

        if (event.key === 'Enter') {
            Neo.main.DomAccess.getAttributes({
                id        : event.target.id,
                attributes: 'value'
            }).then(data => {
                VNodeUtil.findChildVnode(me.vnode, {className: 'field-tags'}).vnode.attributes.value = data.value;
                me.tagList = [...me._tagList, data.value];
            });
        }
    }

    /**
     * get the form data and post the article via api
     */
    onSubmitButtonClick() {
        let me          = this,
            vdom        = me.vdom,
            body        = VDomUtil.getByFlag(vdom, 'body'),
            description = VDomUtil.getByFlag(vdom, 'description'),
            title       = VDomUtil.getByFlag(vdom, 'title'),
            ids         = [
                title.id,
                description.id,
                body.id
            ];

        Neo.main.DomAccess.getAttributes({
            id        : ids,
            attributes: 'value'
        }).then(data => {
            ArticleApi.post({
                data: JSON.stringify({
                    "article": {
                        "title"      : data[0].value,
                        "description": data[1].value,
                        "body"       : data[2].value,
                        "tagList"    : me.tagList
                    }
                }),
                slug: me.slug
            }).then(data => {
                const errors = data.json.errors;

                if (errors) {
                    me.errors = errors;
                } else {
                    Neo.Main.setRoute({
                        value: '/article/' + data.json.article.slug
                    });
                }
            });
        });
    }

    /**
     * Remove clicked tag from list
     * @param event
     */
    onTagClose(event) {
        this.tagList = this.tagList.filter(e => e !== event.target.data.value);
    }

    /**
     * Resets the value of all fields
     */
    resetForm() {
        this.bulkConfigUpdate({
            body       : '',
            description: '',
            slug       : null,
            tagList    : [],
            title      : ''
        });
    }
}

Neo.applyClassConfig(CreateComponent);

export {CreateComponent as default};