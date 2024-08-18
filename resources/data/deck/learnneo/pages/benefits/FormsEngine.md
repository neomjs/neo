## Forms include a State-Provider

You do not need to define a state tree on your own.
It if sufficient to just use namespaces inside the `name` attribute of each field.

<pre data-neo>
import Button        from '../button/Base.mjs';
import FormContainer from '../form/Container.mjs';
import TextField     from '../form/field/Text.mjs';

class MainView extends FormContainer {
    static config = {
        className: 'Benefits.forms1.MainView',
        layout   : {ntype:'vbox', align:'start'},
        
        items: [{
            module   : TextField,
            labelText: 'Firstname',
            name     : 'user.firstname',
            value    : 'John'
        }, {
            module   : TextField,
            labelText: 'Lastname',
            name     : 'user.lastname',
            value    : 'Doe'
        }, {
            module : Button,
            handler: 'up.getFormValues',
            style  : {marginTop: '1em'},
            text   : 'Get Form Values'
        }]
    }

    async getFormValues(data) {
        const formValues = await this.getValues();
        // Logs {user: {firstname: 'John', lastname: 'Doe'}}
        Neo.Main.log({value: formValues})
    }
}
Neo.setupClass(MainView);
</pre>

## Forms can get validated without being mounted

Neo.mjs Forms live as a pure abstraction layer inside JavaScript.
The following example is similar to the first one, but this time the form instance will not get mounted.
Getting the field values still works like before.

Use case: In case you have a form split into multiple pages and only one of them is mounted to keep
the DOM minimal, you can still get all field values.

<pre data-neo>
import Button        from '../button/Base.mjs';
import Container     from '../container/Base.mjs';
import FormContainer from '../form/Container.mjs';
import TextField     from '../form/field/Text.mjs';

const myForm = Neo.create({
    module: FormContainer,
    items : [{
        module   : TextField,
        labelText: 'Firstname',
        name     : 'user.firstname',
        value    : 'John'
    }, {
        module   : TextField,
        labelText: 'Lastname',
        name     : 'user.lastname',
        value    : 'Doe'
    }]
});

class MainView extends Container {
    static config = {
        className: 'Benefits.forms2.MainView',
        layout   : {ntype:'vbox', align:'start'},
        
        items: [{
            module : Button,
            handler: 'up.getFormValues',
            text   : 'Get Form Values'
        }]
    }

    async getFormValues(data) {
        const formValues = await myForm.getValues();
        // Logs {user: {firstname: 'John', lastname: 'Doe'}}
        Neo.Main.log({value: formValues})
    }
}
Neo.setupClass(MainView);
</pre>

## Nested Forms

Inside the DOM, it is impossible to nest form tags.
Neo forms can get easily mapped to other nodes:</br>
`{module: FormContainer, tag: 'div'}`

This allows us to nest forms and validate or retrieve form values of each nested form or
for the top-level form (including all nested items) as we see fit.

Inside the example preview, clear the user lastname via hitting the x-button.
Afterwards, click on the 3 buttons at the bottom and inspect the output inside the main window console carefully.

The main form will log:
<pre data-javascript>
{
    account: 'My Account',
    product: {brand: 'Tesla', name: 'Car'},
    user   : {firstname: 'John', lastname: null}
}
'isValid: false'
</pre>

The user form will log:
<pre data-javascript>
{user: {firstname: 'John', lastname: null}}
'isValid: false'
</pre>

The product form will log:
<pre data-javascript>
{product: {brand: 'Tesla', name: 'Car'}}
'isValid: true'
</pre>

<pre data-neo>
import Button        from '../button/Base.mjs';
import Container     from '../container/Base.mjs';
import FormContainer from '../form/Container.mjs';
import TabContainer  from '../tab/Container.mjs';
import TextField     from '../form/field/Text.mjs';

class MainView extends FormContainer {
    static config = {
        className: 'Benefits.forms3.MainView',
        layout   : {ntype:'vbox', align:'stretch'},
        
        items: [{
            module       : TextField,
            flex         : 'none',
            labelPosition: 'inline',
            labelText    : 'Account',
            name         : 'account',
            value        : 'My Account'
        }, {
            module: TabContainer,
            items : [{
                module         : FormContainer,
                itemDefaults   : {module: TextField, labelPosition: 'inline'},
                layout         : {ntype:'vbox', align:'start'},
                reference      : 'user-form',
                tabButtonConfig: {text: 'User'},
                tag            : 'div',

                items: [{
                    labelText: 'Firstname',
                    name     : 'user.firstname',
                    value    : 'John'
                }, {
                    labelText: 'Lastname',
                    name     : 'user.lastname',
                    required : true,
                    value    : 'Doe'
                }]
            }, {
                module         : FormContainer,
                itemDefaults   : {module: TextField, labelPosition: 'inline'},
                layout         : {ntype:'vbox', align:'start'},
                reference      : 'product-form',
                tabButtonConfig: {text: 'Product'},
                tag            : 'div',

                items: [{
                    labelText: 'Name',
                    name     : 'product.name',
                    value    : 'Car'
                }, {
                    labelText: 'Brand',
                    name     : 'product.brand',
                    required : true,
                    value    : 'Tesla'
                }]
            }]
        }, {
            module      : Container,
            flex        : 'none',
            itemDefaults: {module: Button},
            layout      : {ntype: 'hbox'},

            items : [{
                handler: 'up.getMainFormValues',
                text   : 'Get Main Values'
            }, {
                handler: 'up.getUserFormValues',
                text   : 'Get User Values'
            }, {
                handler: 'up.getProductFormValues',
                text   : 'Get Product Values'
            }]
        }]
    }

    async getFormValues(form) {
        const formValues = await form.getValues();
        Neo.Main.log({value: formValues});

        const isValid = await form.validate();
        Neo.Main.log({value: `isValid: ${isValid}`})
    }

    async getMainFormValues(data) {
        await this.getFormValues(this)
    }

    async getProductFormValues(data) {
        await this.getFormValues(this.getReference('product-form'))
    }

    async getUserFormValues(data) {
        await this.getFormValues(this.getReference('user-form'))
    }
}
Neo.setupClass(MainView);
</pre>

Bonus: Inspect the DOM Inside the `TabContainer`.
You will notice that only the active Tab is mounted inside the DOM.

1. We can still get field values of unmounted forms
2. We can still validate unmounted forms

## Nested lazy-loaded Forms

If you look close into the `Button` handlers of the last example:
`getValues()` and `validate()` are both async.

The reason for this is that `form.getFields()` itself is async as well:
It will lazy-load (but not necessarily mount) missing fields when needed.

The lazy-loading use case is not easy to display inside the `LivePreview`,
since it does rely on defining child modules inside their own class files
and dynamically importing them.

In a nutshell:
<pre data-javascript>
{
    module: TabContainer,
    items : [
        {module: () => import('./MyChildForm1.mjs')},
        {module: () => import('./MyChildForm2.mjs')}
    ]
}
</pre>
