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
        className: 'RealWorld2.view.user.LoginFormContainer',
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            style: {
                maxWidth: '500px'
            }
        },
        /**
         * @member {Array|null} items
         */
        items: null,
        /**
         * @member {Object} layout
         */
        layout: {ntype: 'base'}
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me = this;

        me.items = [{
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
                handler     : me.onLoginButtonClick,
                handlerScope: me,
                text        : 'Submit'
            }],
            style: {
                maxWidth: '500px',
                padding : 0
            }
        }];
    }

    /**
     *
     */
    onLoginButtonClick() {
        let values = this.getValues();

        console.log(values);
        console.log(this.isValid());
    }
}

Neo.applyClassConfig(LoginFormContainer);

export {LoginFormContainer as default};