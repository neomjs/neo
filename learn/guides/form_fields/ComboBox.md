# ComboBox Field

The `Neo.form.field.ComboBox` is a powerful and flexible input component that provides a dropdown list for selecting one or multiple items. It combines the functionality of a text input field with a list, allowing users to either type to filter options or select directly from a predefined set of choices.

## 1. Basic Usage

At its simplest, a `ComboBox` can be configured with a static array of data.

```javascript readonly
import ComboBox from '../../src/form/field/ComboBox.mjs';

class MyComboBoxForm extends Neo.form.Container {
    static config = {
        className: 'MyComboBoxForm',
        layout   : {ntype: 'vbox', align: 'start'},
        items    : [{
            module   : ComboBox,
            labelText: 'Select a Fruit',
            name     : 'selectedFruit',
            store    : { // Inline store configuration
                data: [
                    {id: 'apple',  name: 'Apple'},
                    {id: 'banana', name: 'Banana'},
                    {id: 'orange', name: 'Orange'},
                    {id: 'grape',  name: 'Grape'}
                ]
            }
        }]
    }
}
```

In this example:
*   The `store` config is an inline object that gets automatically converted into a `Neo.data.Store`.
*   The `id` property of each data item is used as the internal value, and `name` is used for display by default.

## 2. Data Integration with `Neo.data.Store`

For more complex scenarios, especially when dealing with large datasets or remote data, it's best practice to use a separate `Neo.data.Store` instance.

```javascript readonly
import ComboBox     from '../../src/form/field/ComboBox.mjs';
import Store        from '../../src/data/Store.mjs';
import Model        from '../../src/data/Model.mjs';

// Define a Model for your data
class CountryModel extends Model {
    static config = {
        className: 'CountryModel',
        fields: [
            {name: 'id',   type: 'String'},
            {name: 'name', type: 'String'}
        ]
    }
}

// Create a Store instance
const countriesStore = Neo.create({
    module   : Store,
    model    : CountryModel,
    autoLoad : true,
    url      : '/path/to/your/countries.json' // Example: fetch data from a URL
});

class CountryComboBoxForm extends Neo.form.Container {
    static config = {
        className: 'CountryComboBoxForm',
        layout   : {ntype: 'vbox', align: 'start'},
        items    : [{
            module   : ComboBox,
            labelText: 'Select a Country',
            name     : 'selectedCountry',
            store    : countriesStore // Reference the external store instance
        }]
    }
}
```

## 3. Key Configuration Options

The `ComboBox` offers several configurations to control its behavior and appearance:

*   **`displayField`**: (Default: `'name'`) The name of the field in the store's records that will be displayed in the dropdown list and the input field.
*   **`valueField`**: (Default: `'id'`) The name of the field in the store's records that will be used as the actual value of the `ComboBox` when selected. This is the value returned by `getSubmitValue()`.
*   **`forceSelection`**: (Default: `true`) If `true`, the `ComboBox` will only allow values that match an existing record in its store. If the user types a value that doesn't match, the field will be cleared on blur.
*   **`editable`**: (Default: `true`) If `true`, the user can type into the input field. If `false`, the input field is read-only, and selection can only be made from the dropdown list.
*   **`filterDelay`**: (Default: `50`) The time in milliseconds to delay between user input and applying the filter to the dropdown list. Useful for performance with large stores.
*   **`typeAhead`**: (Default: `true`) If `true`, as the user types, the `ComboBox` will attempt to complete the input with the first matching record from the store, displaying the suggestion as a hint.
*   **`triggerAction`**: (Default: `'all'`) Controls what happens when the dropdown trigger is clicked.
    *   `'all'`: Shows all list items, regardless of current input.
    *   `'filtered'`: Shows only items that match the current input field's value.
*   **`listConfig`**: An object that allows you to configure the underlying `Neo.list.Base` component used for the dropdown. For example, you can enable checkboxes for multi-selection (though `ComboBox` itself is typically single-select, `Chip` extends it for multi-select).

```javascript readonly
import ComboBox from '../../src/form/field/ComboBox.mjs';

class AdvancedComboBox extends Neo.form.Container {
    static config = {
        className: 'AdvancedComboBox',
        layout   : {ntype: 'vbox', align: 'start'},
        items    : [{
            module        : ComboBox,
            labelText: 'Search for a City',
            name          : 'citySearch',
            displayField  : 'cityName',
            valueField    : 'cityId',
            forceSelection: false, // Allow custom input
            editable      : true,
            filterDelay   : 200,
            typeAhead     : true,
            triggerAction : 'filtered',
            store         : {
                data: [
                    {cityId: 'ny',  cityName: 'New York'},
                    {cityId: 'la',  cityName: 'Los Angeles'},
                    {cityId: 'chi', cityName: 'Chicago'},
                    {cityId: 'hou', cityName: 'Houston'}
                ]
            }
        }]
    }
}
```

## 4. Events

The `ComboBox` field emits several events that you can listen to for custom logic:

*   **`change`**: Inherited from `Neo.form.field.Base`, fired when the field's `value` config changes.
*   **`userChange`**: Inherited from `Neo.form.field.Base`, fired when the field's value changes due to direct user interaction (e.g., typing or selecting from the list).
*   **`select`**: Specific to `ComboBox`, fired when an item is selected from the dropdown list. The event object contains the `record` that was selected.

```javascript readonly
import ComboBox from '../../src/form/field/ComboBox.mjs';

class ComboBoxWithEvents extends Neo.form.Container {
    static config = {
        className: 'ComboBoxWithEvents',
        layout   : {ntype: 'vbox', align: 'start'},
        items    : [{
            module   : ComboBox,
            labelText: 'Choose an Option',
            name     : 'option',
            store    : {
                data: [
                    {id: 1, name: 'Option A'},
                    {id: 2, name: 'Option B'}
                ]
            },
            listeners: {
                select: function(data) {
                    console.log('Selected record:', data.value); // data.value is the selected record
                },
                change: function(data) {
                    console.log('Field value changed (record or null):', data.value);
                },
                userChange: function(data) {
                    console.log('User interacted, new value:', data.value);
                }
            }
        }]
    }
}
```
