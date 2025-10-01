# Ticket: collection.Base#filter() should use constructor for allItems

**Assignee:** Gemini
**Status:** Done

## Description

In `Neo.collection.Base#filter()`, the `allItems` collection was previously hardcoded to be created as a `Neo.collection.Collection` instance.

This caused issues for subclasses like `Neo.data.Store`, where the `allItems` collection would lose the store's specific functionalities, such as lazy record instantiation via the `get()` method.

The fix is to use `me.constructor` instead of `Collection` when creating the `allItems` instance. This ensures that `allItems` is an instance of the same class as the collection being filtered, preserving the subclass's methods and behaviors.

This change is crucial for components like `Neo.form.field.ComboBox` that rely on stores and their filtering capabilities.
