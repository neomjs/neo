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
