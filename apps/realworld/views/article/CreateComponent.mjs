import {default as Component} from '../../../../src/component/Base.mjs';

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
         * @member {String[]} cls=['editor-page']
         */
        cls: ['editor-page'],
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
                                        placeholder: 'What\'s this article about?',
                                        type       : 'text'
                                    }]
                                }, {
                                    tag: 'fieldset',
                                    cls: ['form-group'],
                                    cn : [{
                                        tag        : 'textarea',
                                        cls        : ['form-control'],
                                        name       : 'content',
                                        placeholder: 'Write your article (in markdown)'
                                    }]
                                }, {
                                    tag: 'fieldset',
                                    cls: ['form-group'],
                                    cn : [{
                                        tag        : 'input',
                                        cls        : ['form-control'],
                                        name       : 'tags',
                                        placeholder: 'Enter tags',
                                        type       : 'text'
                                    }, {
                                        cls: ['tag-list']
                                    }]
                                }, {
                                    tag : 'button',
                                    cls : ['btn', 'btn-lg', 'btn-primary', 'pull-xs-right'],
                                    html: 'Publish Article'
                                }]
                            }]
                        }]
                    }]
                }]
            }]
        }
    }}
}

Neo.applyClassConfig(CreateComponent);

export {CreateComponent as default};