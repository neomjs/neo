import Container              from '../../../../src/form/Container.mjs';
import Toolbar                from '../../../../src/container/Toolbar.mjs';
import {default as TextField} from '../../../../src/form/field/Text.mjs';

/**
 * @class RealWorld2.view.user.LoginFormContainer
 * @extends Neo.form.Container
 */
class LoginFormContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld2.view.user.LoginFormContainer'
         * @private
         */
        className: 'RealWorld2.view.article.FormContainer',
        /**
         * @member {Array} items
         */
        items: [{
            module       : TextField,
            labelPosition: 'inline',
            labelText    : 'Email',
            name         : 'email'
        }, {
            module       : TextField,
            labelPosition: 'inline',
            labelText    : 'Password',
            name         : 'password'
        }, {
            module: Toolbar,
            items : ['->', {
                text: 'Submit'
            }]
        }],
        /**
         * @member {Object} layout
         */
        layout: {ntype: 'base'}
    }}
}

Neo.applyClassConfig(LoginFormContainer);

export {LoginFormContainer as default};