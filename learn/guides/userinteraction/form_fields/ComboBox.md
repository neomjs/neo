# ComboBox Field

The `Neo.form.field.ComboBox` is a powerful and flexible input component that provides a dropdown list for selecting one or multiple items. It combines the functionality of a text input field with a list, allowing users to either type to filter options or select directly from a predefined set of choices.

## 1. Basic Usage

At its simplest, a `ComboBox` can be configured with a static array of data.

```javascript live-preview
import ComboBox      from '../../src/form/field/ComboBox.mjs';
import FormContainer from '../../src/form/Container.mjs';

class MainView extends FormContainer {
    static config = {
        className: 'MyComboBoxForm',
        layout   : {ntype: 'vbox', align: 'start'},
        items    : [{
            module       : ComboBox,
            labelPosition: 'inline',
            labelText    : 'Select a Fruit',
            name         : 'selectedFruit',
            width        : 200,

            store: { // Inline store configuration
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

MainView = Neo.setupClass(MainView);
```

In this example:
*   The `store` config is an inline object that gets automatically converted into a `Neo.data.Store`.
*   The `id` property of each data item is used as the internal value, and `name` is used for display by default.
*   **Note**: If your data uses different property names for the unique identifier or display value (e.g., `cityId` instead of `id`), you must explicitly define a `model` (even inline) within the `store` config and set the `keyProperty` to match your unique identifier.

## 2. Data Integration with `Neo.data.Store`

For more complex scenarios, especially when dealing with large datasets or remote data, it's best practice to use a separate `Neo.data.Store` instance.

```javascript readonly
import ComboBox from '../../src/form/field/ComboBox.mjs';
import Store    from '../../src/data/Store.mjs';
import Model    from '../../src/data/Model.mjs';

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

// Define a Store class
class CountriesStore extends Store {
    static config = {
        className: 'CountriesStore',
        model    : CountryModel,
        autoLoad : true,
        url      : '/path/to/your/countries.json' // Example: fetch data from a URL
    }
}

class CountryComboBoxForm extends Neo.form.Container {
    static config = {
        className: 'CountryComboBoxForm',
        layout   : {ntype: 'vbox', align: 'start'},
        items    : [{
            module   : ComboBox,
            labelText: 'Select a Country',
            name     : 'selectedCountry',
            store    : CountriesStore // Pass the Store Class
        }]
    }
}
```

### Passing Models and Stores: Flexibility in Configuration

Neo.mjs offers significant flexibility in how you configure models and stores for your components. For both the `model` config within a `Store` and the `store` config within a data-bound component (like `ComboBox`), you can typically pass one of three types:

1.  **Configuration Object**: A plain JavaScript object containing the properties for the model or store. Neo.mjs will automatically create an instance from this object. This is convenient for inline, simple definitions.
    ```javascript readonly
    // Example: Inline Store config for ComboBox
    store: {
        model: { // Model config object
            fields: [{name: 'id'}, {name: 'name'}]
        },
        data: [{id: 1, name: 'Item 1'}]
    }
    ```

2.  **Class Reference**: A direct reference to the class (e.g., `MyStoreClass`, `MyModelClass`). Neo.mjs will automatically instantiate this class when the component or store is created. This is the most common and recommended approach for reusable definitions.
    ```javascript readonly
    // Example: Passing a Store Class to ComboBox
    import MyStoreClass from './MyStoreClass.mjs';

    // ...
    items: [{
        module: ComboBox,
        store : MyStoreClass // Pass the Store Class
    }]
    ```
    ```javascript readonly
    // Example: Passing a Model Class to a Store
    import MyModelClass from './MyModelClass.mjs';

    class MyStoreClass extends Neo.data.Store {
        static config = {
            model: MyModelClass // Pass the Model Class
        }
    }
    ```

3.  **Instance**: A pre-created instance of the model or store. This is useful when you need a single, shared instance across multiple components (e.g., a singleton store for application-wide settings or a store that's managed externally).
    ```javascript readonly
    // Example: Passing a Store Instance to ComboBox
    const mySharedStore = Neo.create({
        module: Neo.data.Store,
        // ... store configs
    });

    // ...
    items: [{
        module: ComboBox,
        store : mySharedStore // Pass the Store Instance
    }]
    ```
    While less common for `model` configs (as models are typically instantiated by stores), you could theoretically pass a `Model` instance if a custom scenario required it.

Choosing the appropriate method depends on your application's architecture, reusability needs, and whether you require shared or independent data instances.

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

```javascript live-preview
import ComboBox      from '../../src/form/field/ComboBox.mjs';
import FormContainer from '../../src/form/Container.mjs';

class MainView extends FormContainer {
    static config = {
        className: 'AdvancedComboBox',
        layout   : {ntype: 'vbox', align: 'start'},
        items    : [{
            module        : ComboBox,
            displayField  : 'cityName',
            editable      : true,
            filterDelay   : 200,
            forceSelection: false, // Allow custom input
            labelText     : 'Search for a City',
            name          : 'citySearch',
            triggerAction : 'filtered',
            typeAhead     : true,
            valueField    : 'cityId',
            width         : 300,

            store: {
                keyProperty: 'cityId',
                model      : {fields: [{name: 'cityId', type: 'String'}, {name: 'cityName', type: 'String'}]},
                
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

MainView = Neo.setupClass(MainView);
```

## 4. Events

The `ComboBox` field emits several events that you can listen to for custom logic:

*   **`change`**: Inherited from `Neo.form.field.Base`, fired when the field's `value` config changes.
*   **`userChange`**: Inherited from `Neo.form.field.Base`, fired when the field's value changes due to direct user interaction (e.g., typing or selecting from the list).
*   **`select`**: Specific to `ComboBox`, fired when an item is selected from the dropdown list. The event object contains the `record` that was selected.

```javascript live-preview
import ComboBox      from '../../src/form/field/ComboBox.mjs';
import FormContainer from '../../src/form/Container.mjs';

class MainView extends FormContainer {
    static config = {
        className: 'ComboBoxWithEvents',
        layout   : {ntype: 'vbox', align: 'start'},
        items    : [{
            module       : ComboBox,
            labelPosition: 'top',
            labelText    : 'Choose an Option',
            name         : 'option',

            store: {
                data: [
                    {id: 1, name: 'Option A'},
                    {id: 2, name: 'Option B'}
                ]
            },
            listeners: {
                select: function(data) {
                    Neo.Main.log({value: `Selected record: ${data.value.name}`}); // data.value is the selected record
                },
                change: function(data) {
                    Neo.Main.log({value: `Field value changed (record or null): ${data.value?.name || data.value}`});
                },
                userChange: function(data) { // text input
                    Neo.Main.log({value: `User interacted, new value: ${data.value}`});
                }
            }
        }]
    }
}

MainView = Neo.setupClass(MainView);
```
