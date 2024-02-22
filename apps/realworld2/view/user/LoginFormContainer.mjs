import Container     from '../../../../src/form/Container.mjs';
import PasswordField from '../../../../src/form/field/Password.mjs';
import TextField     from '../../../../src/form/field/Text.mjs';
import Toolbar       from '../../../../src/toolbar/Base.mjs';

/**
 * @class RealWorld2.view.user.LoginFormContainer
 * @extends Neo.form.Container
 */
class LoginFormContainer extends Container {
    static config = {
        /**
         * @member {String} className='RealWorld2.view.user.LoginFormContainer'
         * @protected
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
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module       : TextField,
            labelPosition: 'inline',
            labelText    : 'Email',
            name         : 'email',
            required     : true
        }, {
            module       : PasswordField,
            labelPosition: 'inline',
            labelText    : 'Password',
            name         : 'password',
            required     : true
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

Neo.setupClass(LoginFormContainer);

export default LoginFormContainer;
