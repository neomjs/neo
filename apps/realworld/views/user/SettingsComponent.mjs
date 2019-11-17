import {default as Component} from '../../../../src/component/Base.mjs';

/**
 * @class RealWorld.views.user.SettingsComponent
 * @extends Neo.component.Base
 */
class SettingsComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld.views.user.SettingsComponent'
         * @private
         */
        className: 'RealWorld.views.user.SettingsComponent',
        /**
         * @member {String} ntype='realworld-user-settingscomponent'
         * @private
         */
        ntype: 'realworld-user-settingscomponent',
        /**
         * @member {String[]} cls=['settings-page']
         */
        cls: ['settings-page'],
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            cn: [{
                cls: ['container', 'page'],
                cn : [{
                    cls: ['row'],
                    cn : [{
                        cls: ['col-md-6', 'offset-md-3', 'col-xs-12'],
                        cn : [{
                            tag : 'h1',
                            cls : ['text-xs-center'],
                            html: 'Your Settings'
                        }, {
                            tag: 'form',
                            cn : [{
                                tag: 'fieldset',
                                cn : [{
                                    tag: 'fieldset',
                                    cls: ['form-group'],
                                    cn : [{
                                        tag        : 'input',
                                        cls        : ['form-control'],
                                        placeholder: 'URL of profile picture',
                                        type       : 'text'
                                    }]
                                }, {
                                    tag: 'fieldset',
                                    cls: ['form-group'],
                                    cn : [{
                                        tag        : 'input',
                                        cls        : ['form-control', 'form-control-lg'],
                                        placeholder: 'Your Name',
                                        type       : 'text'
                                    }]
                                }, {
                                    tag: 'fieldset',
                                    cls: ['form-group'],
                                    cn : [{
                                        tag        : 'textarea',
                                        cls        : ['form-control', 'form-control-lg'],
                                        placeholder: 'Short bio about you',
                                        rows       : 8
                                    }]
                                }, {
                                    tag: 'fieldset',
                                    cls: ['form-group'],
                                    cn : [{
                                        tag        : 'input',
                                        cls        : ['form-control', 'form-control-lg'],
                                        placeholder: 'Email',
                                        type       : 'text'
                                    }]
                                }, {
                                    tag: 'fieldset',
                                    cls: ['form-group'],
                                    cn : [{
                                        tag        : 'input',
                                        cls        : ['form-control', 'form-control-lg'],
                                        placeholder: 'Password',
                                        type       : 'password'
                                    }]
                                }, {
                                    tag : 'button',
                                    cls : ['btn', 'btn-lg', 'btn-primary', 'pull-xs-right'],
                                    html: 'Update Settings'
                                }]
                            }]
                        }]
                    }]
                }]
            }]
        }
    }}
}

Neo.applyClassConfig(SettingsComponent);

export {SettingsComponent as default};