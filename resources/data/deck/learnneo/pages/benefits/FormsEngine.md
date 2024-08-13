## Forms include a State-Provider

You do not need to define a state tree on your own.
It if sufficient to just use namespaces inside the `name` attribute of each field.

<pre data-neo>
import Button        from '../button/Base.mjs';
import FormContainer from '../form/Container.mjs';
import TextField     from '../form/field/Text.mjs';

class MainView extends FormContainer {
    static config = {
        className: 'Example.view.MainView',
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
        className: 'Example.view.MainView',
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
