The Neo.mjs Forms Engine provides a powerful and flexible way to build
user interfaces for data input and validation. This guide will walk you
through the core concepts and practical usage of forms in Neo.mjs,
from basic field creation to advanced validation and nested structures.

## 1. Basic Form Creation

At its core, a form in Neo.mjs is a `Neo.form.Container`. This container
manages a collection of form fields and provides methods for data
retrieval, validation, and submission.

To create a simple form, you define a `Neo.form.Container` and add
`Neo.form.field.Text` or other field modules to its `items` config.

```javascript readonly
import FormContainer from '../../src/form/Container.mjs';
import TextField     from '../../src/form/field/Text.mjs';

class MySimpleForm extends FormContainer {
    static config = {
        className: 'MySimpleForm',
        layout   : {ntype: 'vbox', align: 'start'},
        items    : [{
            module   : TextField,
            labelText: 'First Name',
            name     : 'firstName',
            required : true
        }, {
            module   : TextField,
            labelText: 'Last Name',
            name     : 'lastName'
        }]
    }
}
```

In this example:
*   `module: TextField` specifies the type of form field.
*   `labelText` defines the visible label for the field.
*   `name` is crucial for data management; it defines the key under
    which the field's value will be stored when retrieving form data.
*   `required: true` enables basic validation, ensuring the field is
    not left empty.

## 2. Field Types

Neo.mjs offers a rich set of pre-built form field types, all extending
`Neo.form.field.Base`. These fields cover a wide range of input needs:

*   **Text-based Inputs**: `TextField`, `TextArea`, `EmailField`,
    `PasswordField`, `PhoneField`, `UrlField`, `SearchField`,
    `DisplayField` (read-only), `HiddenField`.
*   **Numeric Inputs**: `NumberField`, `CurrencyField`, `RangeField`.
*   **Selection Inputs**: `ComboBox`, `Chip`, `ColorField`, `DateField`,
    `TimeField`, `CountryField`, `ZipCodeField`.
*   **Choice Inputs**: `CheckBox`, `Radio`, `Switch`.
*   **File Upload**: `FileUpload`.

You can find the full list of available fields and their configurations
in the `src/form/field/` directory.

## 3. Data Management

A key strength of Neo.mjs forms is their integrated state management. The `Neo.form.Container` automatically manages form data based on field names, eliminating the need for external state management libraries or manual state tree definitions. This significantly simplifies data handling and reduces boilerplate.

The `Neo.form.Container` provides powerful methods for managing form data.

### Getting Form Values

To retrieve all values from a form, use the asynchronous `getSubmitValues()`
method. This method returns a plain JavaScript object where keys correspond
to the `name` attributes of your fields.

```javascript readonly
// Assuming 'myForm' is an instance of your form container
const formValues = await myForm.getSubmitValues();
console.log(formValues);
// Example output: { firstName: 'John', lastName: 'Doe' }
```

### Nested Data Structures

The `name` attribute supports dot notation to create nested data structures.
This is particularly useful for organizing complex form data.

```javascript readonly
import FormContainer from '../../src/form/Container.mjs';
import TextField     from '../../src/form/field/Text.mjs';

class UserForm extends FormContainer {
    static config = {
        className: 'UserForm',
        layout   : {ntype: 'vbox', align: 'start'},
        items    : [{
            module   : TextField,
            labelText: 'User First Name',
            name     : 'user.profile.firstName'
        }, {
            module   : TextField,
            labelText: 'User Last Name',
            name     : 'user.profile.lastName'
        }, {
            module   : TextField,
            labelText: 'Address Street',
            name     : 'user.address.street'
        }]
    }
}

// ... later, after the form is rendered and values are entered
const userFormValues = await myUserForm.getSubmitValues();
console.log(userFormValues);
/*
Output:
{
    user: {
        profile: {
            firstName: 'Jane',
            lastName : 'Doe'
        },
        address: {
            street: '123 Main St'
        }
    }
}
*/
```

### Setting Form Values

You can pre-populate a form or update its values programmatically using
the `setValues(values, suspendEvents)` method. The `values` object should
mirror the structure of the data returned by `getSubmitValues()`.

```javascript readonly
// To set values for the UserForm example above:
await myUserForm.setValues({
    user: {
        profile: {
            firstName: 'Alice',
            lastName : 'Smith'
        },
        address: {
            street: '456 Oak Ave'
        }
    }
});
```

The optional `suspendEvents` parameter (default `false`) can be set to
`true` to prevent `change` events from firing for each field during the
update, which can be useful for large data sets.

### Resetting Forms

The `reset(values)` method allows you to clear or reset form fields.
If no `values` object is provided, fields will be reset to `null` or their
`emptyValue` (if configured). If `values` are provided, fields will be
reset to those specific values.

```javascript readonly
// Reset all fields to their default empty state
await myForm.reset();

// Reset specific fields to new values
await myForm.reset({
    firstName: 'Default Name'
});
```

## 4. Validation

Neo.mjs forms provide robust validation capabilities, both built-in and
customizable.

### Built-in Validation

Many field types come with built-in validation rules:

*   **`required`**: Ensures a field is not empty.
*   **`minLength` / `maxLength`**: For text-based fields, validates the
    length of the input.
*   **`minValue` / `maxValue`**: For numeric fields, validates the range
    of the input.
*   **`inputPattern`**: A regular expression to validate the input format.
    (e.g., `EmailField`, `UrlField`, `ZipCodeField` use this internally).

You can configure these directly on the field:

```javascript readonly
import TextField from '../../src/form/field/Text.mjs';

// ...
items: [{
    module      : TextField,
    inputPattern: /^[a-zA-Z0-9_]+$/, // Alphanumeric and underscore only
    labelText   : 'Username',
    name        : 'username',
    required    : true,
    minLength   : 5,
    maxLength   : 20
}]
```

Error messages for built-in validations can be customized using `errorText*`
configs (e.g., `errorTextRequired`, `errorTextMaxLength`).

### Custom Validation (`validator`)

For more complex validation logic, you can use the `validator` config on
any field. This should be a function that receives the field instance as
its argument and returns `true` if the value is valid, or a string
(the error message) if it's invalid.

```javascript readonly
import TextField from '../../src/form/field/Text.mjs';

// ...
items: [{
    module   : TextField,
    labelText: 'Password',
    name     : 'password',
    reference: 'passwordField' // Add a reference to the password field
}, {
    module   : TextField,
    labelText: 'Confirm Password',
    name     : 'confirmPassword',
    validator: function(field) {
        // Access the password field using getClosestForm().getReference()
        const passwordField = field.getClosestForm().getReference('passwordField');

        if (field.value !== passwordField.value) {
            return 'Passwords do not match'
        }
        return true
    }
}]
```

### Displaying Errors

Errors are automatically displayed below the field when validation fails.
The `useAlertState` config (globally set in `apps/form/Overwrites.mjs`)
can change the visual styling of required but empty fields from red to orange.

The `clean` property on a field determines if errors are shown immediately.
By default, `clean` is `true` until the user interacts with the field or
`validate(false)` is called.

### Form Validation State

You can check the overall validity of a form using:

*   **`isValid()`**: An asynchronous method that returns `true` if all
    fields in the form (and its nested forms) are valid, `false` otherwise.
    It also triggers validation for all fields.

    ```javascript readonly
    const formIsValid = await myForm.isValid();
    if (formIsValid) {
        console.log('Form is valid!');
    } else {
        console.log('Form has errors.');
    }
    ```

*   **`getFormState()`**: An asynchronous method that returns a string
    indicating the overall state of the form:
    *   `'clean'`: All fields are untouched and valid.
    *   `'valid'`: All fields are valid.
    *   `'invalid'`: At least one field is invalid.
    *   `'inProgress'`: Some fields are valid, some are clean.

    ```javascript readonly
    const state = await myForm.getFormState();
    console.log('Form state:', state);
    ```

## 5. Nested Forms

Neo.mjs allows for true nested forms, providing unparalleled structural
flexibility. This is achieved by nesting `Neo.form.Container` instances
or using `Neo.form.Fieldset`.

### Using `Neo.form.Fieldset`

`Neo.form.Fieldset` extends `Neo.form.Container` and is ideal for
grouping related fields visually. It can also be collapsed.

```javascript readonly
import Fieldset      from '../../src/form/Fieldset.mjs';
import FormContainer from '../../src/form/Container.mjs';
import TextField     from '../../src/form/field/Text.mjs';

class NestedFieldsetForm extends FormContainer {
    static config = {
        className: 'NestedFieldsetForm',
        layout   : {ntype: 'vbox', align: 'start'},
        items    : [{
            module   : Fieldset,
            title    : 'Personal Information',
            formGroup: 'person', // Data will be nested under 'person'
            items    : [{
                module   : TextField,
                labelText: 'First Name',
                name     : 'firstName',
                required : true
            }, {
                module   : TextField,
                labelText: 'Last Name',
                name     : 'lastName'
            }]
        }, {
            module   : Fieldset,
            title    : 'Contact Information',
            formGroup: 'contact', // Data will be nested under 'contact'
            items    : [{
                module   : TextField,
                labelText: 'Email',
                name     : 'email',
                required : true
            }, {
                module   : TextField,
                labelText: 'Phone',
                name     : 'phone'
            }]
        }]
    }
}

// Example getSubmitValues() output:
/*
{
    person: {
        firstName: 'John',
        lastName : 'Doe'
    },
    contact: {
        email: 'john.doe@example.com',
        phone: '123-456-7890'
    }
}
*/
```

The `formGroup` config on `Fieldset` (or any `Form.Container`) automatically
nests the data of its child fields under the specified key.

### Nesting `Form.Container` Instances

You can directly nest `Form.Container` instances to create more complex
hierarchies. This is demonstrated in `apps/form/view/FormPageContainer.mjs`,
which extends `Neo.form.Container` but uses a `div` for its `vdom` tag
to avoid invalid HTML (`<form>` inside `<form>`).

```javascript readonly
// Example from apps/form/view/FormPageContainer.mjs
import BaseFormContainer from '../../../src/form/Container.mjs';

class FormPageContainer extends BaseFormContainer {
    static config = {
        className: 'Form.view.FormPageContainer',
        // ... other configs
        tag: 'div' // Using a div instead of a form tag
    }
}
```

This allows you to treat each nested container as a sub-form, which can
be validated or have its values retrieved independently, or as part of
the top-level form.

## 6. Field Triggers

Field triggers are small, interactive icons or buttons that appear within
or alongside a form field, providing additional functionality. Examples
include clear buttons, date pickers, or spin buttons for number fields.

Triggers are configured via the `triggers` array on a field. You can
configure multiple triggers for a single field, and control their placement
(left or right of the input) using the `align` config on the trigger.

```javascript readonly
import DateField    from '../../src/form/field/Date.mjs';
import ClearTrigger from '../../src/form/field/trigger/Clear.mjs';

// ...
items: [{
    module   : DateField,
    labelText: 'Event Date',
    name     : 'eventDate',
    triggers : [{
        module: ClearTrigger // Adds a clear button to the date field
    }]
}]
```

Many fields automatically include default triggers (e.g., `DateField`
includes a `DateTrigger`). You can override or add to these defaults.

## 7. Form and Field Events

Neo.mjs forms and fields emit various events that you can listen to for
custom logic:

*   **`change`**: Fired when a field's `value` config changes.
*   **`userChange`**: Fired when a field's value changes due to direct
    user interaction (e.g., typing in a text field).
*   **`fieldChange`**: Fired on the `Form.Container` when any of its
    child fields' `value` changes.
*   **`fieldUserChange`**: Fired on the `Form.Container` when any of its
    child fields' value changes due to user interaction.
*   **`focusEnter` / `focusLeave`**: Fired when a field gains or loses focus.

You can listen to these events using the `on` method:

```javascript readonly
manyFormField.on('change', (data) => {
    console.log('Field value changed:', data.value);
});

myFormContainer.on('fieldUserChange', (data) => {
    console.log('User changed field:', data.component.name, data.value);
});
```

## 8. Best Practices and Tips

*   **`itemDefaults`**: Use `itemDefaults` on containers to apply common
    configurations to all child items, reducing boilerplate.
*   **`formGroup`**: Leverage `formGroup` for logical grouping of data,
    especially in complex forms, to create clean nested data structures.
*   **`readOnly` vs. `editable`**: 
    *   `readOnly: true`: Prevents user interaction from changing the value.
        The field is still part of the form data.
    *   `editable: false`: Similar to `readOnly`, but specifically for
        input elements, preventing direct typing. Other interactions (like
        picker selection) might still be possible unless also `readOnly`.
*   **Lazy Loading**: For forms with many pages or complex sections, consider
    lazy loading modules for individual pages or fieldsets to improve initial
    application load times. This is demonstrated in `apps/form/view/FormContainer.mjs`
    where pages are imported dynamically.
*   **Explicit Module Imports**: While the core `Neo` global namespace is always available, it's a best practice to
  explicitly import all Neo.mjs modules you use (e.g., `import FormContainer from '../../src/form/Container.mjs';`).
  Relying on implicit availability of classes within `Neo`'s sub-namespaces can lead to less readable and maintainable code.
  Explicit imports improve code readability, maintainability, and ensure consistent behavior.
*   **`Neo.overwrites`**: Use global overwrites (as seen in `apps/form/Overwrites.mjs`)
    to enforce consistent styling or behavior across all instances of a
    component type.
