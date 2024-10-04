## Forms include a State-Provider

You don’t need to manually define a state tree for handling form data. Instead, Neo.mjs simplifies this process by allowing you to use namespaces directly within the `name` attribute of each form field.

By organizing fields with namespaces, the form automatically structures its data based on the `name` attributes. This removes the need for complex manual state management and lets you focus on your form’s logic. The framework handles the creation of a structured state tree in the background, ensuring that the data is properly grouped and easy to retrieve, even when fields are nested or split across multiple sections.

This approach enhances both the simplicity and maintainability of your forms, especially in larger applications where managing form state manually can become cumbersome.


<pre data-neo>
import Button        from '../button/Base.mjs';
import FormContainer from '../form/Container.mjs';
import TextField     from '../form/field/Text.mjs';

class MainView extends FormContainer {
    // Configuration of form layout and items
    static config = {
        className: 'Benefits.forms1.MainView',
        layout   : {ntype: 'vbox', align: 'start'},
        
        // Form fields: Firstname, Lastname, and a button
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

    // Method to get form values and log them
    async getFormValues(data) {
        const formValues = await this.getValues();
        Neo.Main.log({value: formValues});  // Logs {user: {firstname: 'John', lastname: 'Doe'}}
    }
}

MainView = Neo.setupClass(MainView);

</pre>

## Forms can get validated without being mounted

Neo.mjs Forms serve as a sophisticated abstraction layer in JavaScript, designed to simplify form handling and improve application efficiency.

Example Overview
In the following example, we illustrate a situation where the form instance remains unmounted. Even in this state, you can effortlessly retrieve the values from the form fields, ensuring a smooth user experience.

Use Case: Efficient Multi-Page Form Management
This feature is ideal for applications with multi-step forms or wizard interfaces. By mounting only the active page, you keep the Document Object Model (DOM) lightweight and responsive. Neo.mjs allows access to field values from the entire form, enhancing user experience and application performance. This approach minimizes unnecessary DOM updates and optimizes resource usage, making it perfect for complex interactions

<pre data-neo>
import Button        from '../button/Base.mjs'; 
import Container     from '../container/Base.mjs';
import FormContainer from '../form/Container.mjs'; 
import TextField     from '../form/field/Text.mjs'; 

// Create a form with user input fields
const myForm = Neo.create({
    module: FormContainer,
    items : [{
        module   : TextField,
        labelText: 'Firstname',
        name     : 'user.firstname',
        value    : 'John' // Default value
    }, {
        module   : TextField,
        labelText: 'Lastname',
        name     : 'user.lastname',
        value    : 'Doe' // Default value
    }]
});

// Define the MainView class
class MainView extends Container {
    static config = {
        className: 'Benefits.forms2.MainView',
        layout   : {ntype:'vbox', align:'start'},
        
        items: [{
            module : Button,
            handler: 'up.getFormValues', // Button click handler
            text   : 'Get Form Values'
        }]
    }

    // Retrieve and log form values
    async getFormValues(data) {
        const formValues = await myForm.getValues();
        Neo.Main.log({value: formValues}); // Log the retrieved values
    }
}

// Setup the MainView class with Neo framework
MainView = Neo.setupClass(MainView);

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

<pre data-neo>import Button        from '../button/Base.mjs'; // Importing Button component
import Container     from '../container/Base.mjs'; // Importing base Container component
import FormContainer from '../form/Container.mjs'; // Importing FormContainer for form handling
import TabContainer  from '../tab/Container.mjs'; // Importing TabContainer for tab functionality
import TextField     from '../form/field/Text.mjs'; // Importing TextField for text inputs

class MainView extends FormContainer {
    static config = {
        className: 'Benefits.forms3.MainView',
        layout   : {ntype:'vbox', align:'stretch'}, // Setting vertical layout with stretching alignment
        
        items: [{
            module       : TextField, // First input for account name
            flex         : 'none',
            labelPosition: 'inline',
            labelText    : 'Account',
            name         : 'account',
            value        : 'My Account' // Default value
        }, {
            module: TabContainer, // Container for tabs to switch between forms
            items : [{
                module         : FormContainer, // User form for user details
                itemDefaults   : {module: TextField, labelPosition: 'inline'},
                layout         : {ntype:'vbox', align:'start'},
                reference      : 'user-form', // Reference for accessing this form
                tabButtonConfig: {text: 'User'}, // Button text for tab
                tag            : 'div',

                items: [{
                    labelText: 'Firstname', // Input for user's first name
                    name     : 'user.firstname',
                    value    : 'John' // Default value
                }, {
                    labelText: 'Lastname', // Input for user's last name
                    name     : 'user.lastname',
                    required : true, // Marked as required
                    value    : 'Doe' // Default value
                }]
            }, {
                module         : FormContainer, // Product form for product details
                itemDefaults   : {module: TextField, labelPosition: 'inline'},
                layout         : {ntype:'vbox', align:'start'},
                reference      : 'product-form', // Reference for accessing this form
                tabButtonConfig: {text: 'Product'}, // Button text for tab
                tag            : 'div',

                items: [{
                    labelText: 'Name', // Input for product name
                    name     : 'product.name',
                    value    : 'Car' // Default value
                }, {
                    labelText: 'Brand', // Input for product brand
                    name     : 'product.brand',
                    required : true, // Marked as required
                    value    : 'Tesla' // Default value
                }]
            }]
        }, {
            module      : Container, // Container for action buttons
            flex        : 'none',
            itemDefaults: {module: Button}, // Default button module
            layout      : {ntype: 'hbox'}, // Horizontal layout for buttons

            items : [{
                handler: 'up.getMainFormValues', // Handler for main form values
                text   : 'Get Main Values' // Button text
            }, {
                handler: 'up.getUserFormValues', // Handler for user form values
                text   : 'Get User Values' // Button text
            }, {
                handler: 'up.getProductFormValues', // Handler for product form values
                text   : 'Get Product Values' // Button text
            }]
        }]
    }

    async getFormValues(form) {
        const formValues = await form.getValues(); // Retrieve values from the specified form
        Neo.Main.log({value: formValues}); // Log the retrieved values

        const isValid = await form.validate(); // Validate the form
        Neo.Main.log({value: `isValid: ${isValid}`}); // Log the validation result
    }

    async getMainFormValues(data) {
        await this.getFormValues(this); // Retrieve values from the main form
    }

    async getProductFormValues(data) {
        await this.getFormValues(this.getReference('product-form')); // Retrieve values from the product form
    }

    async getUserFormValues(data) {
        await this.getFormValues(this.getReference('user-form')); // Retrieve values from the user form
    }
}

MainView = Neo.setupClass(MainView); // Setting up the MainView class

</pre>

Bonus: Inspect the DOM Inside the `TabContainer`.
You will notice that only the active Tab is mounted inside the DOM.

1. We can still get field values of unmounted forms
2. We can still validate unmounted forms


This implementation creates a multi-tabbed form using the Neo framework. The MainView class extends FormContainer to manage nested forms for user and product details efficiently.

1. Nesting Forms: By using TabContainer with FormContainer, related fields are organized without cluttering the DOM.

2. Data Retrieval: The unique references (user-form and product-form) allow for targeted retrieval and validation of input values.

3. Action Buttons: Buttons at the bottom trigger methods to log the values and validation status of each form, ensuring a clear user experience.

Overall, this structure provides a modular and efficient way to handle form data within a multi-tabbed interface.
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
