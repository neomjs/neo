In Neo.mjs, a **Record** is a super lightweight, reactive JavaScript object, dynamically created and structured
according to a `Neo.data.Model`. Records provide a powerful way to manage application data with built-in features like
data validation, type conversion, dirty tracking, and seamless integration with `Neo.data.Store`.

This guide will cover:

-   **What is a Record?**: Understanding the concept and its benefits.
-   **`Neo.data.Model`**: Defining the structure and behavior of your records.
-   **`Neo.data.RecordFactory`**: The engine behind reactive record creation.
-   **Record Fields**: Data types, default values, mapping, and custom logic.
-   **Reactivity and Dirty Tracking**: How records respond to changes and track their state.
-   **Interaction with `Neo.data.Store`**: Managing collections of records.

## What is a Record?

A Record in Neo.mjs is a dynamically generated, lightweight JavaScript object that represents a single row or item of data.
Crucially, Records do **not** extend `Neo.core.Base` or `Neo.data.Model`; they are plain objects with reactive properties.
This design choice makes them extremely performant and memory-efficient. When you modify a property of a Record, it automatically
triggers events, allowing UI components or other parts of your application to react to these changes.

**Benefits of using Records:**

-   **Structured Data**: Records enforce a predefined structure based on a `Neo.data.Model`, ensuring data consistency.
-   **Reactivity**: Changes to record fields are observable, simplifying UI updates and data synchronization.
-   **Data Integrity**: Built-in type conversion and validation (defined in the Model) help maintain data quality.
-   **Dirty Tracking**: Easily determine if a record or specific fields within it have been modified from their original state.
-   **Integration with Stores**: Records are designed to work seamlessly with `Neo.data.Store` for managing collections of data.

## `Neo.data.Model`: The Blueprint for Your Records

`Neo.data.Model` is the **central blueprint** for your Records. It defines the complete structure, data types, default
values, and any custom logic for data processing or validation. Every Record instance is an embodiment of its associated
Model. Each `Neo.data.Model` is a class that extends `Neo.core.Base`. Records, however, are instances of dynamically generated classes, not direct extensions of `Neo.core.Base`.

### Key `Neo.data.Model` Configurations:

-   **`fields`**: An array of objects, where each object defines a field of the record. This is where you specify the
  data schema. Each field can have properties like:
    -   `name` (String, required): The unique identifier for the field within the record.
    -   `type` (String): The data type (e.g., `'string'`, `'number'`, `'boolean'`, `'date'`, `'int'`, `'float'`, `'html'`).
      Neo.mjs provides automatic type conversion based on this type.
    -   `defaultValue` (Any): A value that will be assigned to the field if it's not provided when creating a record.
    -   `mapping` (String): A dot-separated string used to extract the field's value from a nested path within the raw
      data received (e.g., `'address.street'` would map to `record.address.street`).
    -   `calculate` (Function): A powerful function that defines a **computed property**. The value of this field is
      dynamically calculated based on other fields in the record. When the source fields change, the calculated field
      automatically updates.
    -   `convert` (Function): A custom function to perform more complex data transformations or validations on the
      field's value during assignment.
    -   `nullable` (Boolean): If `false`, the field cannot be `null`.
    -   `maxLength` (Number): Maximum length for string types. Values exceeding this may trigger a warning.
    -   `minLength` (Number): Minimum length for string types. Values falling below this may trigger a warning.
    -   **Nested Fields**: A field can itself contain a `fields` array, allowing you to define complex, hierarchical data
      structures directly within your model (e.g., an `address` field with nested `street`, `city`, `zip` fields).
-   **`keyProperty`**: (String, default: `'id'`) The field name that uniquely identifies each record within a
  `Neo.data.Store`. This is crucial for efficient lookups and operations.
-   **`trackModifiedFields`**: (Boolean, default: `false`) If `true`, the record will track changes to individual fields,
  allowing you to determine which fields have been modified. **Be aware that enabling this will cause the record to store
  a copy of its original data, effectively doubling the memory footprint for each record. Only enable this feature if you
  specifically require granular dirty tracking.**

### Dynamic Model Fields

While typically defined once, `Neo.data.Model` instances can have their `fields` configuration changed at runtime. If
the `fields` config of an already created `Model` instance is modified, `Neo.data.RecordFactory` will dynamically update
the associated Record class. This allows for advanced scenarios where your data schema might evolve during the application's
lifecycle.


## `Neo.data.RecordFactory`: The Engine Behind Records

`Neo.data.RecordFactory` is a singleton class responsible for taking your `Neo.data.Model` definitions and dynamically
generating JavaScript classes for your Records. It intercepts property access on Record instances to provide reactivity,
type conversion, and dirty tracking.

When you create a new Record (typically via a `Neo.data.Store` or directly using `RecordFactory.createRecord()`), the
`RecordFactory`:

1.  Checks if a Record class for the given Model already exists. If not, it creates one. This dynamically generated class implicitly extends `Object`, making records as lightweight as possible and efficient.
2.  Defines getters and setters for each field specified in your Model. These getters and setters are what make Records
  reactive.
3.  Applies default values and performs initial data parsing/conversion.
4.  Initializes dirty tracking if `trackModifiedFields` is enabled in the Model.

You generally won't interact directly with `RecordFactory` unless you're creating records outside of a `Store`.
In most real-world scenarios, when you add plain JavaScript objects to a `Neo.data.Store` or load JSON data from a backend into a `Store`, the `Store` automatically leverages `RecordFactory` to convert each item into a reactive Record. This means developers will very rarely need to use `RecordFactory` manually.

### Example: Creating a Record Directly

```javascript
import RecordFactory from '../../src/data/RecordFactory.mjs';
import UserModel     from './UserModel.mjs'; // Assuming UserModel is defined as above

const userModelInstance = Neo.create(UserModel); // Create an instance of your Model

const userRecord = RecordFactory.createRecord(userModelInstance, {
    age      : 28,
    email    : 'jane.doe@example.com',
    firstName: 'Jane',
    id       : 101,
    lastName : 'Doe',

    address: {
        city  : 'Anytown',
        street: '123 Main St'
    }
});

console.log(userRecord.fullName); // Output: Jane Doe (calculated field)
userRecord.age = '30';            // Automatic type conversion from string to int
console.log(userRecord.age);      // Output: 30

// Accessing nested fields
// IMPORTANT: Direct access like `userRecord.address.street` will result in a JavaScript error
// because `userRecord.address` is undefined. Always use the full string path for nested fields.
console.log(userRecord['address.street']); // Output: 123 Main St
console.log(userRecord['address.city']);   // Output: Anytown

// Modifying nested fields using string path
userRecord['address.street'] = '456 Oak Ave';
console.log(userRecord['address.street']); // Output: 456 Oak Ave

userRecord['address.city'] = 'Newville';
console.log(userRecord['address.city']); // Output: Newville

// Wrong way: Accessing the raw internal data (DO NOT USE FOR REACTIVE UPDATES).
// Direct modification of the data holder object will NOT trigger `recordChange` events or update dirty tracking.
// This gives you a REFERENCE to the internal data holder object.
const rawAddress = userRecord[Symbol.for('data')].address;
console.log(rawAddress.street); // Output: 456 Oak Ave

// Correct way (for a safe, disconnected copy):
// This gives you a STRUCTURED CLONE (a disconnected copy) of the data holder object.
const safeRawAddress = userRecord.toJSON().address;
console.log(safeRawAddress.street); // Output: 456 Oak Ave

// Modifying nested fields using set() with nested object structure
userRecord.set({ address: { street: '789 Pine Ln' } });
console.log(userRecord['address.street']); // Output: 789 Pine Ln
console.log(userRecord['address.city']);   // Output: Newville (sibling untouched)
```

## Reactivity and Dirty Tracking

Records are inherently reactive. When you change a field's value, the setter defined by `RecordFactory` intercepts the
change, updates the internal data, and can trigger events. If the Model has `trackModifiedFields: true`, the Record also
keeps track of its original state.

-   **`isModified`**: A boolean property on the Record instance that is `true` if any field has been changed from its
  original value.
-   **`isModifiedField(fieldName)`**: A method to check if a specific field has been modified.
-   **`set(fields)`**: Bulk-update multiple fields and trigger a single change event. This method is particularly powerful
  for nested objects: it performs a **deep merge** of the provided `fields` object with the record's existing data.
  This means you can update specific properties within a nested object without overwriting the entire nested object.
  For example, `myRecord.set({ address: { street: 'New Street' } })` will update only the `street` property within
  `address`, leaving other `address` properties untouched. This contrasts with direct assignment to a nested object,
  which would replace the entire nested object.
-   **`setSilent(fields)`**: Bulk-update multiple fields without triggering a change event.
-   **`toJSON()`**: A method available on every Record instance that returns a plain JavaScript object representing the
  record's current data. Crucially, it returns a **structured clone** of the internal data. This ensures that any
  modifications made to the object returned by `toJSON()` will **not** affect the original record and will **not**
  trigger `recordChange` events, providing a safe, disconnected snapshot for serialization or external processing.

### Bad Practice: Overwriting Nested Objects with Direct Assignment

While direct assignment to a nested *leaf property* using its full string path (e.g.,
`myRecord['address.street'] = "New Street";`) is reactive and works, directly assigning to a nested *object property*
(a non-leaf node) is generally considered a **bad practice** compared to using `record.set()` for several reasons:

1.  **Complete Overwrite**: If you assign directly to a nested object property (e.g., `myRecord.address = { newProp: 'value' };`),
  you will **completely overwrite** the existing nested object. Any other properties within that nested object that are
  not explicitly included in your new assignment will be **lost**. `record.set()` performs a **deep merge**, intelligently
  updating only the specified nested properties while preserving others.
2.  **Multiple Change Events (for multiple field updates)**: If you need to update several fields (even leaf properties,
  nested or not), performing multiple direct assignments will trigger a separate `recordChange` event for each assignment.
  `record.set()` allows you to batch all these updates into a single operation, triggering only one `recordChange` event,
  which is significantly more efficient for UI updates and overall application performance.
3.  **Clarity and Consistency**: Using `record.set()` is the idiomatic and recommended way to modify record data,
  especially for nested structures. It clearly communicates intent and promotes consistent API usage across your application.

Always prefer `record.set()` for modifying record data, particularly when dealing with nested fields or multiple updates,
to leverage its deep merge capabilities and optimize event triggering.

### Example: Reactivity and Dirty Tracking

```javascript
import RecordFactory from '../../src/data/RecordFactory.mjs';
import UserModel     from './UserModel.mjs';

const userModelInstance = Neo.create(UserModel);
const userRecord = RecordFactory.createRecord(userModelInstance, {
    email    : 'john.smith@example.com',
    firstName: 'John',
    id       : 102,
    lastName : 'Smith',

    address: {
        city  : 'Oldtown',
        street: '100 Elm St'
    }
});

console.log(userRecord.isModified); // Output: false

userRecord.firstName = 'Jonathan';
console.log(userRecord.isModified);                   // Output: true
console.log(userRecord.isModifiedField('firstName')); // Output: true
console.log(userRecord.isModifiedField('lastName'));  // Output: false

userRecord.set({ address: { city: 'Newtown' } });        // Update nested field using set()
console.log(userRecord.isModifiedField('address.city')); // Output: true

userRecord.reset({firstName: 'John'}); // Reset firstName to original
console.log(userRecord.isModified);    // Output: true (because address.city is still modified)

userRecord.reset(); // Reset all fields to original state
console.log(userRecord.isModified); // Output: false
```

## Interaction with `Neo.data.Store`

`Neo.data.Store` is designed to manage collections of Records. When you add raw data (plain JavaScript objects) to a
`Store`, it automatically uses its associated `Neo.data.Model` and `RecordFactory` to convert them into reactive Record
instances.

-   **`store.add(data)`**: Converts data into Records and adds them to the store.
-   **`store.model`**: The `Neo.data.Model` instance associated with the store, defining the structure of its records.
-   **`recordChange` event**: Stores emit a `recordChange` event when a field of one of its records is modified. This
  allows UI components (like Grids) to efficiently update only the changed cells. For a real-world example, see how
  `Neo.grid.Body`'s `onStoreRecordChange` method consumes this event to perform targeted cell updates.

### Example: Store Managing Records

```javascript
import Store     from '../../src/data/Store.mjs';
import UserModel from './UserModel.mjs';

const userStore = Neo.create(Store, {
    model: UserModel, // Link the store to your UserModel
    data: [
        {id: 201, firstName: 'Anna',  lastName: 'Brown', email: 'anna.b@example.com'},
        {id: 202, firstName: 'Peter', lastName: 'Green', email: 'peter.g@example.com'}
    ]
});

userStore.on('recordChange', ({record, fields}) => {
    console.log(`Record ${record.id} changed:`, fields);
});

const anna = userStore.get(201);
anna.email = 'anna.brown@example.com';
// Output: Record 201 changed: [{name: "email", oldValue: "anna.b@example.com", value: "anna.brown@example.com"}]

console.log(userStore.get(201).isModified); // Output: true
```

## The Reactivity Masterpiece: Collections and Records in Harmony

The true power of Neo.mjs's data layer emerges when `Neo.collection.Base` (used by `Neo.data.Store`) and `Neo.data.Model`
(Records) work together. This combination creates a highly reactive and efficient system for managing structured, often
tabular, application data.

`Neo.data.Store` acts as a specialized `Neo.collection.Base` that manages a collection of `Neo.data.Model` instances
(Records). This means you benefit from two layers of reactivity:

1.  **Collection-Level Reactivity**:
    *   When records are added to, removed from, or reordered within a `Store`, the `Store` (as a `Neo.collection.Base`)
      fires `mutate` events. This allows UI components to react to structural changes in the dataset (e.g., a new row
      appearing in a grid, or a row being deleted).

2.  **Record-Level Reactivity**:
    *   When a field *within an individual Record* changes its value (e.g., `myUserRecord.firstName = 'New Name'`),
      the Record itself (via the `RecordFactory`'s generated setters) notifies its owning `Store` (if the Model has a
      `storeId` pointing back to the Store). This triggers the `recordChange` event on the `Store`. This allows UI
      components to react to granular changes within a data item (e.g., updating a single cell in a grid without
      re-rendering the entire row or grid).

This dual-layered reactivity is a cornerstone of Neo.mjs's performance. It enables highly optimized UI updates, as
components can precisely react to only the changes that affect them, avoiding costly full re-renders.

## Conclusion

Records, powered by `Neo.data.Model` and `Neo.data.RecordFactory`, are a cornerstone of data management in Neo.mjs.
They provide a robust, reactive, and structured approach to handling application data, simplifying complex tasks like UI
synchronization, data validation, and state tracking. By leveraging Records, you can build more maintainable, performant,
and predictable data-driven applications.
