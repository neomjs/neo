import Button        from '../../../src/button/Base.mjs';
import CheckBox      from '../../../src/form/field/CheckBox.mjs';
import Component     from '../../../src/component/Base.mjs';
import Container     from '../../../src/container/Base.mjs';
import EmailField    from '../../../src/form/field/Email.mjs';
import FormContainer from '../../../src/form/Container.mjs';
import Panel         from '../../../src/container/Panel.mjs';
import PasswordField from '../../../src/form/field/Password.mjs';
import TextField     from '../../../src/form/field/Text.mjs';
import ThemeSwitcher from '../../../src/button/ThemeSwitcher.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

/**
 * The fields of the sign-up form in the order the problem list names them:
 * the field's name inside the form, the label the list uses, and the field's reference
 */
const FIELDS = [
    {name: 'name',           label: 'Full name',       reference: 'name-field'},
    {name: 'email',          label: 'Email',           reference: 'email-field'},
    {name: 'password',       label: 'Password',        reference: 'password-field'},
    {name: 'passwordRepeat', label: 'Repeat password', reference: 'password-repeat-field'},
    {name: 'terms',          label: 'Terms',           reference: 'terms-field'}
];

/**
 * @param {String} value
 * @returns {String} The value with the characters escaped that would break out of a text node
 */
function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * @summary A sign-up form that validates as you type and lists what is wrong.
 *
 * Each field carries its own checks and shows its error while the visitor types or leaves it:
 * `required`, the email field's address rule, and `minLength` / `maxLength` on the text fields.
 * The page around the form answers the two questions a single field cannot: whether everything
 * is valid, which `form.Container#isValid` decides and which enables or disables the Sign up
 * button, and what the visitor entered, which `form.Container#getSubmitValues` hands over after
 * a successful sign-up. A list beside the button repeats the errors of the fields the visitor
 * has already engaged with and, once the visitor has started, names the untouched fields that
 * still block Sign up, so a blocked button always says why. The one rule no field
 * can check on its own, that the repeated password matches the first one, is applied by this
 * page through the repeat field's `error` config.
 * @class Neo.examples.form.validation.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.form.validation.MainContainer'
         * @protected
         */
        className: 'Neo.examples.form.validation.MainContainer',
        /**
         * @member {String[]} cls=['neo-examples-form-validation']
         */
        cls: ['neo-examples-form-validation'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'center',pack:'center'}
         */
        layout: {ntype: 'vbox', align: 'center', pack: 'center'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Panel,
            cls   : ['signup-card'],
            layout: {ntype: 'vbox', align: 'stretch'},
            width : 440,

            items: [{
                module: Container,
                cls   : ['signup-heading'],
                flex  : 'none',
                layout: {ntype: 'vbox', align: 'stretch'},

                items: [{
                    module: Container,
                    cls   : ['signup-header'],
                    flex  : 'none',
                    layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},

                    items: [{
                        module: Component,
                        flex  : 1,
                        html  : '<h1>Create your account</h1>'
                    }, {
                        module: ThemeSwitcher,
                        ui    : 'secondary'
                    }]
                }, {
                    module: Component,
                    flex  : 'none',
                    html  : '<p>Every field checks itself as you type. Sign up stays blocked while anything ' +
                            'is wrong, and the problems are listed beside the button.</p>'
                }]
            }, {
                module   : FormContainer,
                cls      : ['signup-form'],
                layout   : {ntype: 'vbox', align: 'stretch'},
                listeners: {fieldChange: 'up.onFieldChange'},
                reference: 'signup-form',

                items: [{
                    module       : TextField,
                    autoComplete : 'name',
                    labelPosition: 'top',
                    labelText    : 'Full name',
                    maxLength    : 50,
                    minLength    : 2,
                    name         : 'name',
                    placeholderText: 'Jane Doe',
                    reference    : 'name-field',
                    required     : true
                }, {
                    module       : EmailField,
                    autoComplete : 'email',
                    labelPosition: 'top',
                    labelText    : 'Email',
                    name         : 'email',
                    placeholderText: 'name@example.com',
                    reference    : 'email-field',
                    required     : true
                }, {
                    module       : PasswordField,
                    autoComplete : 'new-password',
                    labelPosition: 'top',
                    labelText    : 'Password',
                    maxLength    : 64,
                    minLength    : 8,
                    name         : 'password',
                    reference    : 'password-field',
                    required     : true
                }, {
                    module       : PasswordField,
                    autoComplete : 'new-password',
                    labelPosition: 'top',
                    labelText    : 'Repeat password',
                    name         : 'passwordRepeat',
                    reference    : 'password-repeat-field',
                    required     : true
                }, {
                    module   : CheckBox,
                    labelText: 'I agree to the terms and conditions',
                    name     : 'terms',
                    reference: 'terms-field',
                    required : true
                }]
            }, {
                module: Container,
                cls   : ['signup-actions'],
                layout: {ntype: 'hbox', align: 'start'},

                items: [{
                    module   : Button,
                    disabled : true,
                    handler  : 'up.onSignUpClick',
                    reference: 'signup-button',
                    text     : 'Sign up'
                }, {
                    module   : Component,
                    cls      : ['signup-problems'],
                    flex     : 1,
                    html     : '<p class="signup-problems-hint">Start typing: problems show here as you type.</p>',
                    reference: 'signup-problems'
                }]
            }, {
                module   : Component,
                cls      : ['signup-result'],
                hidden   : true,
                reference: 'signup-result'
            }]
        }]
    }

    /**
     * The error text this page applies to the repeat field while the two passwords differ
     * @member {String} passwordMismatchText='Passwords do not match'
     */
    passwordMismatchText = 'Passwords do not match'

    /**
     * The names of the fields the visitor has changed at least once, or tried to submit.
     * Only their errors join the problem list: a field the visitor has not reached yet is
     * only named as still to fill in, and only once the visitor has started
     * @member {Set<String>} engagedFields=new Set()
     */
    engagedFields = new Set()

    /**
     * The form fires a fieldChange event for every field value change inside it
     * @param {Object} data
     * @param {Neo.form.field.Base} data.component
     */
    onFieldChange(data) {
        this.engagedFields.add(data.component.name);
        this.updateValidationState()
    }

    /**
     * Sign up is enabled only while the form is valid. A press validates the whole form once
     * more and hands the values over only if it still is
     */
    async onSignUpClick() {
        let me   = this,
            form = me.getReference('signup-form');

        FIELDS.forEach(({name}) => me.engagedFields.add(name));

        if (await form.validate()) {
            me.showSubmittedValues(await form.getSubmitValues())
        }

        await me.updateValidationState()
    }

    /**
     * Recomputes the problem list. An engaged field adds its current error. Once the visitor
     * has started, an untouched field that fails its own check is named as still to fill in:
     * it is what keeps Sign up blocked when every engaged field is fine
     */
    renderProblems() {
        let me        = this,
            problems  = [],
            untouched = [];

        FIELDS.forEach(({name, label, reference}) => {
            let field = me.getReference(reference);

            if (me.engagedFields.has(name)) {
                field.error && problems.push(`<li><strong>${label}:</strong> ${escapeHtml(field.error)}</li>`)
            } else if (me.engagedFields.size && !field.isValid()) {
                untouched.push(label)
            }
        });

        untouched.length && problems.push(`<li><strong>Still to fill in:</strong> ${untouched.join(', ')}</li>`);

        me.getReference('signup-problems').html = problems.length ?
            `<p class="signup-problems-title">${problems.length} ${problems.length === 1 ? 'problem' : 'problems'} to fix:</p><ul>${problems.join('')}</ul>` :
            '<p class="signup-problems-hint">' + (me.engagedFields.size ?
                'Nothing wrong with what you have filled in so far.' :
                'Start typing: problems show here as you type.') + '</p>'
    }

    /**
     * Shows the values a valid form handed over. The password stays masked: a submitted
     * values display is a receipt, not a place to print a secret back
     * @param {Object} values
     */
    showSubmittedValues(values) {
        let me     = this,
            result = me.getReference('signup-result');

        result.html = '<h2>Sign-up complete</h2>' +
            '<p>The form handed over these values:</p>' +
            '<dl>' +
            `<dt>Full name</dt><dd>${escapeHtml(values.name)}</dd>` +
            `<dt>Email</dt><dd>${escapeHtml(values.email)}</dd>` +
            `<dt>Password</dt><dd>${'•'.repeat(Math.min(String(values.password).length, 20))} (${String(values.password).length} characters)</dd>` +
            `<dt>Terms</dt><dd>${values.terms ? 'Agreed' : 'Not agreed'}</dd>` +
            '</dl>';

        result.hidden = false
    }

    /**
     * Applies the cross-field rule no single field can check: while both password fields
     * hold a value and the values differ, the repeat field carries this page's error.
     * Setting it through the `error` config keeps it in place across the field's own
     * validations until the values match again
     */
    syncPasswordMatch() {
        let me       = this,
            password = me.getReference('password-field'),
            repeat   = me.getReference('password-repeat-field'),
            mismatch = Boolean(password.value && repeat.value && password.value !== repeat.value);

        if (mismatch && repeat.error !== me.passwordMismatchText) {
            repeat.error = me.passwordMismatchText
        } else if (!mismatch && repeat.error === me.passwordMismatchText) {
            repeat.error = null
        }
    }

    /**
     * Keeps the button and the problem list in step with the form: the password rule first,
     * then the form's own verdict for the button, then the list
     */
    async updateValidationState() {
        let me = this;

        me.syncPasswordMatch();

        me.getReference('signup-button').disabled = !(await me.getReference('signup-form').isValid());

        me.renderProblems()
    }
}

export default Neo.setupClass(MainContainer);
