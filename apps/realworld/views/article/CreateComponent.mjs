import {default as Component} from '../../../../src/component/Base.mjs';
import {default as VDomUtil} from "../../../../src/util/VDom.mjs";
import {default as ArticleApi} from '../../api/Article.mjs';

/**
 * @class RealWorld.views.article.CreateComponent
 * @extends Neo.component.Base
 */
class CreateComponent extends Component {
    static getConfig() {
        return {
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
             * @member {String[]} cls=['editor-page']
             */
            cls: ['editor-page'],
            /**
             * @member {Object[]} errors_=[]
             */
            errors_: [],
            /**
             * @member {Object} _vdom
             */
            _vdom: {
                cn: [{
                    cls: ['container', 'page'],
                    cn: [{
                        cls: ['row'],
                        cn: [{
                            cls: ['col-md-10', 'offset-md-1', 'col-xs-12'],
                            cn: [{
                                tag: 'ul',
                                flag: 'errors',
                                cls: ['error-messages']
                            }, {
                                tag: 'form',
                                cn: [{
                                    tag: 'fieldset',
                                    cn: [{
                                        tag: 'fieldset',
                                        cls: ['form-group'],
                                        cn: [{
                                            tag: 'input',
                                            cls: ['form-control', 'form-control-lg'],
                                            name: 'title',
                                            flag: 'title',
                                            placeholder: 'Article Title',
                                            type: 'text'
                                        }]
                                    }, {
                                        tag: 'fieldset',
                                        cls: ['form-group'],
                                        cn: [{
                                            tag: 'input',
                                            cls: ['form-control'],
                                            name: 'description',
                                            flag: 'description',
                                            placeholder: 'What\'s this article about?',
                                            type: 'text'
                                        }]
                                    }, {
                                        tag: 'fieldset',
                                        cls: ['form-group'],
                                        cn: [{
                                            tag: 'textarea',
                                            cls: ['form-control'],
                                            name: 'content',
                                            flag: 'content',
                                            placeholder: 'Write your article (in markdown)'
                                        }]
                                    }, {
                                        tag: 'fieldset',
                                        cls: ['form-group'],
                                        cn: [{
                                            tag: 'input',
                                            cls: ['form-control'],
                                            name: 'tags',
                                            flag: 'tags',
                                            placeholder: 'Enter tags',
                                            type: 'text'
                                        }, {
                                            cls: ['tag-list']
                                        }]
                                    }, {
                                        tag: 'button',
                                        cls: ['btn', 'btn-lg', 'btn-primary', 'pull-xs-right'],
                                        html: 'Publish Article',
                                        type: 'button' // override the default submit type
                                    }]
                                }]
                            }]
                        }]
                    }]
                }]
            }
        }
    }

    /**
     * constructor
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me = this,
            domListeners = me.domListeners;

        domListeners.push({
            click: {
                fn: me.onSubmitButtonClick,
                delegate: '.btn-primary',
                scope: me
            }
        });

        me.domListeners = domListeners;
    }

    /**
     * get the form data and post the article via api
     */
    onSubmitButtonClick() {
        let me = this,
            vdom = this.vdom,
            title = VDomUtil.getByFlag(vdom, 'title'),
            description = VDomUtil.getByFlag(vdom, 'description'),
            content = VDomUtil.getByFlag(vdom, 'content'),
            tags = VDomUtil.getByFlag(vdom, 'tags'),
            ids = [
                title.id,
                description.id,
                content.id,
                tags.id
            ];

        Neo.main.DomAccess.getAttributes({
            id: ids,
            attributes: 'value'
        }).then(data => {

            ArticleApi.post({
                data: JSON.stringify({
                    "article": {
                        "title": data[0].value,
                        "description": data[1].value,
                        "body": data[2].value,
                        "tagList": [data[3].value]
                    }
                }),
                slug: ''
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
     * Triggered after the errors config got changed
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @private
     */
    afterSetErrors(value, oldValue) {
        let me = this,
            vdom = me.vdom,
            list = VDomUtil.getByFlag(vdom, 'errors');

        list.cn = [];

        Object.entries(value || {}).forEach(([key, value]) => {
            list.cn.push({
                tag: 'li',
                html: key + ' ' + value.join(' and ')
            });
        });

        me.vdom = vdom;
    }
}

Neo.applyClassConfig(CreateComponent);

export {CreateComponent as default};
