---
id: 6985
title: Implement and Validate Deep Merge for `State.Provider`'s `data_` Config
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-08T02:20:57Z'
updatedAt: '2025-07-08T02:27:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6985'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-08T02:27:34Z'
---
# Implement and Validate Deep Merge for `State.Provider`'s `data_` Config

**Reported by:** @tobiu on 2025-07-08

**Problem Statement:**
The `Neo.state.Provider`'s `data_` config, intended to support deep merging of data from class-level definitions and instance-level overrides, was not functioning as expected. Initial attempts to leverage the `merge: 'deep'` descriptor strategy resulted in only instance-level data being present, or various `TypeError` exceptions during testing due to incompatibilities between the `createHierarchicalDataProxy` and the Siesta testing framework's deep comparison utilities.

**Root Cause & Analysis:**

1.  **Initial Deep Merge Failure:** The primary reason for the `data_` config not deep-merging was that its `value` property in the descriptor was set to `null`. When `Neo.setupClass` invoked `Neo.mergeConfig` for `data_`, `null` was passed as the `defaultValue`. Since `null` is not an object, the `deep` merge strategy's condition (`defaultValueType === 'Object' && instanceValueType === 'Object'`) was never met, causing `Neo.mergeConfig` to default to a `replace` strategy, effectively discarding class-level data.

2.  **Proxy Introspection Issues:** After addressing the core merge issue, the `createHierarchicalDataProxy` encountered several `TypeError` exceptions when subjected to Siesta's deep comparison (`t.isDeeplyStrict`) and other introspection methods. These errors stemmed from the proxy's default behavior not exposing its dynamically managed properties in a way that external tools could enumerate or inspect. Specifically:
    *   Accessing internal properties like `__REFADR__` (used by Siesta) or `symbol` properties.
    *   Attempting to enumerate properties (e.g., `Object.keys()`) on the proxy's empty internal `target` object.
    *   Incorrectly handling nested objects during deep comparison, leading to `config.get is not a function` errors when Siesta tried to inspect raw objects instead of nested proxies.

**Solution & Changes Implemented:**

1.  **Enable `data_` Deep Merge (Core Fix):**
    *   **`src/state/Provider.mjs`**: Changed `data_.value` from `null` to `{}`. This ensures that `Neo.mergeConfig` receives a valid empty object as `defaultValue`, allowing the `merge: 'deep'` strategy to correctly combine class-level and instance-level `data`.

2.  **Enhance `createHierarchicalDataProxy` for Robust Introspection & Compatibility:**
    *   **`src/state/createHierarchicalDataProxy.mjs`**:
        *   **`get` trap**: Modified to explicitly handle `symbol` properties, `__REFADR__`, `inspect`, and `then` by using `Reflect.get(currentTarget, property)`. This prevents errors when external tools or internal mechanisms try to access these non-data properties directly on the proxy.
        *   **`set` trap**: Modified to explicitly handle `symbol` properties and `__REFADR__` by using `Reflect.set(currentTarget, property, value)`.
        *   **`ownKeys` trap**: Implemented to correctly report the top-level data keys managed by the `State.Provider` by calling `rootProvider.getTopLevelDataKeys(path)`. This allows introspection methods like `Object.keys()` and `for...in` loops to function correctly.
        *   **`getOwnPropertyDescriptor` trap**: Implemented to provide accurate property descriptors. Crucially, for nested objects, it now returns a new `createNestedProxy` as the `value` in the descriptor, enabling deep comparison tools to recursively traverse the proxied data structure.

3.  **Refine `State.Provider`'s Data Processing:**
    *   **`src/state/Provider.mjs`**:
        *   **`processDataObject`**: Adjusted the recursive processing condition to `Neo.typeOf(value) === 'Object'`. This ensures that only plain JavaScript objects are recursively processed, preventing `Config` instances or other Neo.mjs classes from being incorrectly re-processed, which could corrupt the internal `#dataConfigs` map.
        *   **`getTopLevelDataKeys`**: Added a public method to `State.Provider` to expose the top-level data keys from its private `#dataConfigs` map, allowing the proxy's `ownKeys` trap to function without directly accessing private fields.

4.  **Adapt Testing Utilities:**
    *   **`test/siesta/tests/state/Provider.mjs`**:
        *   **`proxyToObject` helper**: Reverted to a more robust implementation that recursively converts the proxy into a plain JavaScript object for `t.isDeeplyStrict` comparisons. This helper now correctly handles `null`/`undefined` values and uses `Neo.typeOf(value) === 'Object'` for accurate plain object detection.
        *   **`t.isDeeplyStrict` calls**: Modified to use the `proxyToObject` helper, ensuring that the deep comparison is performed on a plain object representation of the proxied data.
        *   **New Test Case**: Added a test case for multi-level `State.Provider` class extension deep merging to verify that `data_` configs are correctly deep-merged across multiple levels of `State.Provider` class extensions.

**Overall Impact:**
The `Neo.state.Provider`'s `data_` config now correctly supports deep merging of class-level and instance-level data. The `createHierarchicalDataProxy` is significantly more robust, compatible with standard JavaScript introspection methods, and fully testable with deep comparison utilities like Siesta's `t.isDeeplyStrict`. All relevant tests are now passing, confirming the correct behavior of the `State.Provider`'s reactive data system.

