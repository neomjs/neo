# Epic: String-Based VDOM Templates

This epic covers the exploration and implementation of a new feature allowing developers to use string-based template literals (HTML-like syntax) to define the VDOM for all components (functional and class-based). This will provide a more familiar and intuitive way to structure component views compared to the current JSON-based VDOM approach.

An early proof-of-concept (PoC) already exists in the following files:
- `test/siesta/tests/functional/HtmlTemplateComponent.mjs`
- `src/functional/component/Base.mjs` (see `enableHtmlTemplates_` config)
- `src/functional/util/html.mjs`

## Sub-Tasks

### 1. Dev Mode: Main Thread Addon for Live Parsing

**Status:** Dropped

**Reason:** This approach was superseded by the in-worker parsing strategy (Sub-Task 4). The main thread addon would require an inefficient and slow worker roundtrip for parsing, while the in-worker approach is synchronous and significantly more performant for the zero-builds development mode. The addon and its related tests have been deleted to simplify the codebase.

### 2. Production Mode: Build-Time Parsing with `parse5`

**Description:**
For production builds, parsing HTML strings in the main thread is inefficient. Instead, we will pre-process the source code, identify the templates, and replace them with their JSON VDOM representation directly in the build output.

**Implementation Details:**
- **Tool:** `parse5` (minified size: ~176KB). This is a robust and spec-compliant HTML parser.
- **Method:**
  1. During the build process, use a regular expression to identify the tagged template literals (e.g., `html`...``).
  2. For each match, use `parse5` to parse the string content into an abstract syntax tree (AST).
  3. Convert the `parse5` AST into the final Neo.mjs VDOM JSON format.
  4. Replace the original template literal in the source code with the generated JSON object.

### 3. Bundle `parse5` for Browser Compatibility

**Status: Done**

**Description:**
To adhere to the framework's "zero builds" development principle, the `parse5` library cannot be imported directly from `node_modules` at runtime. A build step is required to convert it into a browser-compatible ES module. This bundled file will be checked into the `dist` directory and imported by the `HtmlTemplateProcessor`.

**Implementation Details:**
- **Tool:** `esbuild`
- **Source:** `node_modules/parse5/dist/index.js`
- **Output:** `dist/parse5.mjs`
- **Script:** Create a new build script `buildScripts/bundleParse5.mjs` and an associated npm script `bundle-parse5` to perform the bundling and minification.
- **Outcome:** The `HtmlTemplateProcessor` will be updated to import `../../../dist/parse5.mjs`.

### 4. Alternative Dev Mode: In-Worker Parsing with `parse5`

**Status: Done**

**Description:**
As an alternative to the main thread addon, we will evaluate using `parse5` directly within the App worker for dev mode. This approach avoids the complexities and potential race conditions of an asynchronous worker roundtrip for parsing. While it introduces a ~176KB dependency to the dev build, this cost may be acceptable for the significant gain in architectural simplicity and rendering predictability.

**Implementation Details:**
- **Tool:** `parse5` (via the bundled `dist/parse5.mjs`)
- **Method:**
  1. Create a new `HtmlTemplateProcessor` utility inside the app worker (`src/functional/util/HtmlTemplateProcessor.mjs`).
  2. This processor will be lazy-loaded when a component first uses an HTML template.
  3. The processor will use the bundled `parse5` to synchronously convert the template string into a Neo.mjs VDOM JSON structure.
  4. The component's lifecycle (`continueUpdateWithVdom` for functional, a new hook for class-based) will then proceed synchronously with the parsed VDOM.
  5. The existing main thread addon (`Neo.main.addon.HtmlStringToVdom`) and its tests will be kept for comparison and potential future use cases.

### 5. Template Syntax Specification

**Status: To Do**

**Description:**
Define a clear and comprehensive specification for the template syntax. This document will serve as the blueprint for the parser implementation and as the primary reference for developers using this feature.

**Implementation Details:**
- Create a new markdown file: `learn/guides/uibuildingblocks/HtmlTemplates.md`.
- **Conventions:**
  - **Component vs. HTML:** Define the convention for distinguishing neo.mjs components from standard HTML tags (e.g., PascalCase for components: `<MyComponent>`, lowercase for HTML: `<div>`).
  - **Attribute Mapping:** Specify how template attributes map to VDOM config properties (e.g., `class` to `cls`, `style` to `style`).
- **Data Types:**
  - **Primitives:** How string, number, and boolean attributes are handled.
  - **Objects & Arrays:** The syntax for passing object literals and arrays directly as attributes (e.g., `style="${{color: 'red'}}"`, `items="${['a', 'b']}"`).
  - **Functions:** How to pass non-DOM-event handlers and other function references (e.g., `renderer="${this.myRenderer}"`).
- **Directives:**
  - **Conditionals:** A mechanism for conditional rendering (e.g., an `n-if` attribute: `<div n-if="${isVisble}">...</div>`).
  - **Loops:** A mechanism for rendering lists from arrays (e.g., an `n-for` attribute: `<li n-for="${item} of ${items}">${item.name}</li>`).
- **Complex Configs:** Document the recommended approach for handling deeply nested JSON configs, advocating for passing them as interpolated objects to maintain template clarity (e.g., `columns="${gridColumns}"`).
- **DOM Events (Out of Scope):** Explicitly state that inline DOM event handlers (e.g., `onClick="..."`) are not supported. The framework's global, delegated event system (`domListeners` config or `useEvent()` hook) remains the sole, recommended approach for handling DOM events. This maintains performance and architectural consistency.

### 6. Parser: Interpolation and Data Type Handling

**Status: Done**

**Description:**
Enhance the `parse5` processor to correctly handle the mapping of interpolated values from the tagged template literal to their corresponding VDOM properties, respecting their original data types.

**Implementation Details:**
- The parser must receive not only the HTML string but also the array of interpolated values from the template literal.
- When an attribute value is a placeholder for an interpolated value (e.g., `renderer="$[0]"`, where `$[0]` maps to the first expression), the parser must assign the raw expression value (the function object) to the VDOM config, not the placeholder string.
- Implement logic to correctly handle and assign functions, objects, arrays, and other non-string data types to the appropriate VDOM properties.

### 7. Parser: Component vs. HTML Tag Recognition

**Status: Done**

**Description:**
Implement the logic within the `parse5` processor to differentiate between standard HTML tags and neo.mjs component tags based on the convention defined in the Syntax Specification.

**Implementation Details:**
- When traversing the `parse5` AST, check the tag name of each element.
- If the tag name follows the component convention (e.g., starts with a capital letter), generate a VDOM object with a `module` or `className` property pointing to the corresponding component class.
- If it's a standard HTML tag, generate a standard VDOM object with a `tag` property.
- A mechanism will be needed to resolve the string name (e.g., "GridContainer") to the actual class constructor (`GridContainer`) at runtime. This may involve a component registry or passing a scope object to the template processor.

### 8. Component Resolution Strategy

**Status: Done**

**Description:**
Define the official strategy for how component tags in templates are resolved to their corresponding class constructors. This is critical for developer experience and code clarity. The strategy prioritizes explicit imports while allowing a fallback to the global namespace, all while maintaining synchronous parsing.

**Resolution Order:**
1.  **Lexical Scope via Interpolation (Primary):** The recommended method is to pass the imported component constructor directly as the tag name using template interpolation: `<${Button} />`. The processor will identify the interpolated value and use the constructor directly.
2.  **Global Namespace Fallback:** If the tag is a literal string (e.g., `<Neo.button.Base>`), the processor will attempt to resolve it using `Neo.ns()`. If a valid class constructor is found in the global namespace, it will be used.
3.  **Error:** If a tag that appears to be a component (PascalCase) cannot be resolved through either of the above methods, the processor will throw an error.

### 9. Enhance Learning Content

**Status: To Do**

**Description:**
Create a comprehensive guide to explain the purpose and trade-offs of using HTML templates. The current syntax-only file is insufficient for developers to make an informed decision. This new content should clearly position templates as an alternative to the core JSON VDOM, aimed at developers familiar with string-based syntaxes.

**Implementation Details:**
- **Location:** Enhance the existing file: `learn/guides/uibuildingblocks/HtmlTemplates.md`.
- **Key Points to Cover:**
  - **The "Why":** Explain that this feature is an alternative, not a replacement, for JSON VDOM, designed to lower the barrier to entry for developers from other framework backgrounds.
  - **The Trade-Offs:** Clearly state that using this feature in development mode requires loading the `parse5` library (~176KB), which has a performance cost compared to the zero-dependency JSON VDOM approach.
  - **Positioning:** Frame it as a "beginner-friendly" or "transitional" option that helps developers get started quickly, while encouraging them to explore the power and performance of the native JSON VDOM as they become more familiar with the framework.
  - **Best Practices:** Provide clear examples of when to use templates and when JSON VDOM might be a better choice (e.g., for highly dynamic or programmatically generated views).

### 10. Expand Test Coverage with Real Components

**Status: To Do**

**Description:**
While the mock component tests are a good start, we need to ensure the template processor works correctly in real-world scenarios with actual functional components and their lifecycle. This involves creating more complex integration tests.

**Implementation Details:**
- **Location:** Create new test files or enhance `test/siesta/tests/functional/HtmlTemplateComponent.mjs`.
- **Scenarios to Test:**
  - Components with nested children defined in the template.
  - Components that use reactive configs passed in via attributes.
  - Templates that include a mix of standard HTML tags and multiple, different neo.mjs components.
  - Edge cases with complex interpolation in attributes and text nodes.
  - Ensure the entire component lifecycle (mount, update, destroy) works as expected when the VDOM is generated from a template.

### 11. Code Quality Refinement

**Status: Done**

**Description:**
After the feature is functionally complete and well-tested, refactor the new modules (`HtmlTemplateProcessor`, etc.) to meet the high code quality standards of the neo.mjs framework. This includes adding comprehensive JSDoc comments, ensuring adherence to coding guidelines, and optimizing for clarity and performance.

### 12. Create a Real-World Example

**Status: Done**

**Description:**
To showcase the new feature and provide a practical learning resource, create a new, simple example application that is built using a functional component with a string-based template. This will serve as a clear, working demonstration for developers.

### 13. Fix Conditional Rendering and Add Tests

**Status: Done**

**Description:**
Ensured that falsy values (e.g., `false`, `null`, `undefined`) in template interpolations do not render any output, which is the correct and expected behavior for conditional rendering. Added a new test case to `test/siesta/tests/functional/HtmlTemplateComponent.mjs` to verify this functionality by toggling a conditional element and asserting its presence and absence in the VDOM.

### 14. Refactor `render` to `initVnode` and `createTemplateVdom` to `render`

**Status: Done**

**Description:**
To improve the developer experience for those familiar with React, a major refactoring was undertaken. The framework's core `render()` method was renamed to `initVnode()` to more accurately reflect its purpose of creating the initial VNode and mounting the component. This freed up the `render` name, allowing `createTemplateVdom()` to be renamed to `render()`, providing a more intuitive and familiar API for functional components using HTML templates. This change also included renaming the `rendered` property to `vnodeInitialized`, the `autoRender` config to `autoInitVnode`, and the `rendering` flag to `isVnodeInitializing` to maintain semantic consistency throughout the framework.

### 15. Create a Robust VDOM-to-String Serializer

**Status: To Do**

**Description:**
The `JSON.stringify` + regex method for generating the VDOM string during the build process is flawed. It incorrectly handles object keys that are not valid JavaScript identifiers (e.g., `data-foo`) and produces non-idiomatic code (quoted keys). A dedicated serializer is required for correctness and code quality.

**Implementation Details:**
- **Tool:** A new, custom utility module.
- **Location:** `buildScripts/util/vdomToString.mjs`.
- **Method:**
  1. The utility will export a `vdomToString(vdom)` function that recursively traverses the VDOM object.
  2. It will check if each object key is a valid JavaScript identifier.
  3. Valid identifiers will be written to the output string without quotes (e.g., `tag:`).
  4. Invalid identifiers (e.g., `data-foo`) will be correctly wrapped in single quotes (e.g., `'data-foo':`).
  5. It will handle the build-time placeholders for runtime expressions, outputting them as raw, unquoted code.
  6. This new utility will completely replace the `JSON.stringify` and subsequent regex calls in the build scripts.

### 16. Refactor Build-Time Parser to be AST-Based for Robustness

**Status: To Do**

**Description:**
The current build-time approach, which uses regular expressions to find and replace templates, has proven to be brittle and incorrect. It cannot handle nested `html` templates and can be easily fooled by JSDoc comments or strings that happen to contain the `html`` sequence, leading to build failures. To ensure correctness and consistency with the runtime environment, the build process must be refactored to use a proper JavaScript parser.

**Implementation Details:**
- **Tools:** `acorn` (to parse JS into an Abstract Syntax Tree) and `astring` (to generate JS code from the AST).
- **Method:**
  1. In the build script, for each `.mjs` file, use `acorn` to parse the entire file content into an AST.
  2. Traverse the AST, specifically looking for `TaggedTemplateExpression` nodes where the `tag` is an `Identifier` with the name `html`.
  3. Process these template nodes recursively (post-order traversal) to correctly handle nested templates from the inside out.
  4. The logic from `HtmlTemplateProcessorLogic` will be used to convert the template into its VDOM object representation.
  5. The original `TaggedTemplateExpression` node in the AST will be replaced with a new AST node representing the generated VDOM object (using an object-to-AST converter).
  6. Finally, use `astring` to generate the final, correct JavaScript code from the modified AST.
  7. This new, robust process will replace the fragile regex-based `replace` loop.

---

## 17. Sub-Ticket: Build-Time `html` Template to VDOM Conversion

**Status:** Done

### 1. Summary

Implement a build-time process to convert `html` tagged template literals into JSON-based VDOM structures. This is a critical optimization that removes the need for a client-side HTML parser, leading to smaller bundle sizes and faster initial render times.

### 2. Rationale

Pre-processing templates at build time is a best practice in modern web development. It shifts the parsing overhead from the user's browser to the developer's machine, resulting in a better user experience. This also opens the door for more advanced static analysis and optimizations in the future. By converting templates to standard JSON VDOM, we align this new syntax with the core rendering engine of Neo.mjs, ensuring consistency and maintainability.

### 3. Scope & Implementation Plan

1.  **Isolate Processor Logic:** Refactor the template parsing logic out of the client-side `HtmlTemplateProcessor` and into a dedicated build script utility (`buildScripts/util/templateBuildProcessor.mjs`).
2.  **AST-Based Parsing:** Use `acorn` to parse JavaScript files into an Abstract Syntax Tree (AST), providing a robust way to find templates.
3.  **Find & Process Templates:** Traverse the AST to locate all `TaggedTemplateExpression` nodes tagged with the `html` identifier.
4.  **Convert to VDOM:** For each found template, use the `templateBuildProcessor` to convert it into a JSON VDOM object. This process correctly handles nested templates and embedded JavaScript expressions.
5.  **Rename `render` to `createVdom`:** While traversing the AST, if an `html` template is found within a method or object property named `render`, rename that method/property to `createVdom`.
6.  **Replace in AST:** Replace the original `TaggedTemplateExpression` node in the AST with the newly generated VDOM object (represented as an AST `ObjectExpression`).
7.  **Generate Final Code:** Use `astring` to generate the final, modified JavaScript code from the updated AST.
8.  **Integrate into Build:** Incorporate this AST-based transformation into the `buildSingleFile.mjs` and `buildESModules.mjs` scripts.

### 4. Definition of Done

-   The build process correctly identifies and converts `html` templates to VDOM objects.
-   The `render` method/property is automatically renamed to `createVdom` when it contains an `html` template.
-   The final minified output contains JSON VDOM, not template literals.
-   The client-side `HtmlTemplateProcessor` is no longer required for production builds using this feature.
-   The logic is cleanly separated, with no build-time code included in client-side bundles.
---

## 18. Sub-Ticket: Finalize and Integrate AST-based Build Process

**Status:** Done

### 1. Summary

This ticket covers the final integration of the robust, AST-based template processing into the main `build-es-modules` script, and the subsequent cleanup of temporary development scripts.

### 2. Rationale

After proving the AST-based approach in a dedicated script (`buildSingleFile.mjs`), it was necessary to merge this superior logic into the primary build script (`buildESModules.mjs`) that processes the entire project. This ensures that all files benefit from the robust template conversion. Consolidating the logic also simplifies the build toolchain.

### 3. Scope & Implementation Plan

1.  **Integrate Logic:** The `minifyFile` function from `buildSingleFile.mjs`, containing the full AST parsing, transformation, and code generation logic, was moved into `buildESModules.mjs`, replacing the older, less robust implementation.
2.  **Cleanup:** The temporary `buildSingleFile.mjs` script was deleted from the repository.
3.  **Rename Script:** For improved clarity and consistency, the `build-es-modules` npm script in `package.json` was renamed to `build-dist-esm`.

### 4. Definition of Done

-   The `buildESModules.mjs` script now uses the AST-based approach for all files.
-   The temporary `buildSingleFile.mjs` script has been removed.
-   The corresponding npm script has been renamed to `build-dist-esm`.
-   The full build process runs successfully, correctly transforming all `html` templates across the project.

## 19. Sub-Ticket: Showcase Nested Templates and Component Usage

**Status:** Done

### 1. Summary

Created a new example application to demonstrate the capabilities of string-based templates, specifically focusing on nested templates and the inclusion of other Neo.mjs components directly within the template.

### 2. Rationale

A practical example is crucial for developers to understand how to leverage the new HTML template feature effectively. This example highlights advanced usage patterns like template nesting and component composition, which are common in real-world applications. It also serves as a confirmation that the build process (specifically `buildScripts/buildESModules.mjs`) correctly handles these complex scenarios, converting them into optimized JSON VDOM.

### 3. Scope & Implementation Plan

1.  **Create Example Component:** Develop a new functional component at `examples/functional/nestedTemplateComponent/Component.mjs`.
2.  **Implement Nested Templates:** Within the example component, define and use a separate `html` template literal that is then conditionally included within the main component's `html` template.
3.  **Integrate Another Component:** Demonstrate how to include another Neo.mjs component (e.g., `Neo.button.Base`) directly within the `html` template using template interpolation (`<${Button} />`).
4.  **Verify Build Process:** Confirm that the `buildScripts/buildESModules.mjs` script correctly processes this example, converting the nested templates and embedded components into the appropriate JSON VDOM structure during the build.

### 4. Definition of Done

-   A new example component `examples/functional/nestedTemplateComponent/Component.mjs` exists.
-   The example successfully demonstrates nested `html` templates.
-   The example successfully demonstrates the inclusion of another Neo.mjs component within an `html` template.
-   The build process correctly converts this complex template structure into optimized JSON VDOM, as verified by inspecting the `dist/esm` output.

### 20. Introduce `attributeNameMap` for Robust Attribute Handling

**Status:** Done

### 1. Summary

Refactored `src/functional/util/HtmlTemplateProcessor.mjs` to use an `attributeNameMap` instead of a flat array for storing original attribute names. This change ensures correct mapping of dynamic values to their corresponding attributes, especially in complex scenarios involving nested templates and conditional rendering.

### 2. Rationale

Previously, the `HtmlTemplateProcessor` relied on a simple array (`attributeNames`) to track the original, case-sensitive names of attributes associated with dynamic values. This approach was prone to index shifting issues when falsy values were skipped or when nested templates were flattened, leading to incorrect attribute assignments (e.g., `handler` being mapped to `style`). By introducing an `attributeNameMap` that directly associates the dynamic value's index with its attribute name, we eliminate these synchronization problems, making the attribute parsing robust and reliable.

### 3. Scope & Implementation Plan

1.  **Modify `flattenTemplate`:** Change its return type to include an `attributeNameMap` (an object) instead of an `attributeNames` array.
2.  **Populate `attributeNameMap`:** Store `dynamicValueIndex: attributeName` pairs in the map within `flattenTemplate`, ensuring the `attrMatch` is recorded at the precise index where its corresponding dynamic value is pushed to `flatValues`.
3.  **Handle Nested Templates:** When flattening nested templates, adjust the keys of the nested `attributeNameMap` before merging them into the parent's map to maintain unique and correct indices across the entire flattened structure.
4.  **Update `convertNodeToVdom`:** Modify this method to retrieve the correct attribute name from the `attributeNameMap` using the dynamic value's index, rather than relying on a sequential `attrNameIndex`.
5.  **Update JSDoc:** Ensure all relevant JSDoc comments reflect the change from `attributeNames` to `attributeNameMap`.

### 4. Definition of Done

-   `src/functional/util/HtmlTemplateProcessor.mjs` uses `attributeNameMap` for attribute name tracking.
-   The `style` vs `handler` bug (and similar attribute mapping issues) is resolved.
-   The attribute mapping logic is robust against nested templates and conditional rendering.
-   All related JSDoc comments are updated to reflect the new `attributeNameMap` parameter.
---

### 21. Fix Self-Closing Custom Component Tags

**Status:** Done

#### 1. Summary

Implemented a lightweight fix in `HtmlTemplateProcessor.mjs` to correctly handle self-closing custom component tags (e.g., `<MyComponent />` or `<${Button} />`).

#### 2. Rationale

The `parse5` library, while robust for HTML, does not correctly parse self-closing tags for custom elements that are not standard HTML void elements. This would lead to incorrect VDOM structures. The initial thought was to use a full JS parser like `acorn` to identify these, but that would add a significant overhead (~120KB) to the zero-builds development environment. The chosen solution is much more efficient.

#### 3. Scope & Implementation Plan

1.  **Identify the Issue:** Confirmed that `parse5` fails to create a proper AST for templates containing self-closing custom component tags.
2.  **Implement Regex Pre-processing:**
  -   A new regular expression (`selfClosingComponentRegex`) was added to `HtmlTemplateProcessor.mjs`.
  -   This regex specifically finds component tags (identified by starting with a capital letter or being a `neotag` placeholder) that are self-closed (`/>`).
  -   Before passing the template string to `parse5`, a `replace()` call uses this regex to convert the self-closing tag into a standard tag with an explicit closing tag (e.g., `<MyComponent />` becomes `<MyComponent></MyComponent>`).
3.  **Ensure Specificity:** The regex is carefully crafted to *not* affect standard HTML void elements (like `<br>`, `<img>`), ensuring correct HTML parsing is preserved.
4.  **Cleanup:** Removed unused imports for `acorn` and `astring` from `HtmlTemplateProcessor.mjs` as they were no longer needed.

#### 4. Definition of Done

-   `HtmlTemplateProcessor.mjs` now correctly parses templates containing self-closing custom components.
-   The fix is implemented with a minimal performance footprint, avoiding large new dependencies in the development build.
-   Standard HTML void elements are unaffected and continue to parse correctly.
-   Unnecessary `acorn` and `astring` imports have been removed from the processor.

---

### 22. Fix Build-Time Conditional Template Rendering

**Status:** Done

#### 1. Summary

Corrected a subtle bug in the build-time parser (`buildScripts/util/templateBuildProcessor.mjs`) that caused it to incorrectly handle conditionally rendered nested templates.

#### 2. Rationale

The build-time parser was wrapping raw JavaScript expressions (like `showDetails && detailsTemplate`) inside a VDOM text node (`{vtype: 'text', text: '...'}`). This prevented the expression from being correctly evaluated at runtime, leading to incorrect output. The client-side parser handled this correctly because it evaluates the expression *before* parsing. The build-time parser needed to be adjusted to produce an equivalent VDOM structure.

#### 3. Scope & Implementation Plan

1.  **Identify the Bug:** Pinpointed the difference in logic between the client-side and build-time `convertNodeToVdom` functions. The build-time version was too aggressive in wrapping dynamic placeholders in text nodes.
2.  **Modify `convertNodeToVdom`:**
  -   The logic in `buildScripts/util/templateBuildProcessor.mjs` was changed.
  -   When the parser encounters a text node that consists *only* of a single dynamic value placeholder (e.g., `${showDetails && detailsTemplate}`), it now returns the raw placeholder value itself (e.g., `##__NEO_EXPR__showDetails && detailsTemplate##__NEO_EXPR__##`).
  -   This ensures the raw expression is inserted directly into the `cn` (children) array of the VDOM, allowing it to be properly evaluated at runtime.
3.  **Align with Client-Side Behavior:** This change brings the build-time parser's output in line with the correct behavior of the client-side parser, ensuring consistency between development and production environments.

#### 4. Definition of Done

-   The build-time parser now correctly handles conditionally rendered nested `html` templates.
-   Expressions that resolve to a template or a falsy value are correctly represented in the final VDOM.
-   The build output for components using this pattern is now functionally correct and matches the client-side rendering logic.

### 23. Finalize Build-Time AST Transformation

**Status:** Done

#### 1. Summary

This ticket addresses the final, robust implementation of the build-time HTML-to-VDOM conversion. Previous attempts using regex and incomplete AST patching have proven to be brittle. This task will implement a full, proper AST transformation pipeline to ensure correctness and handle all edge cases, including nested templates, complex expressions, and conditional rendering.

#### 2. Rationale

The core problem is that the build process must reliably convert an `html` tagged template literal into a standard JavaScript object (the VDOM) within the source code itself. The process must correctly handle interpolated expressions, converting them into valid AST nodes that can be integrated back into the main file's AST. The previous failures were due to improper string manipulation and parsing, leading to syntax errors. A full AST-based approach is the only way to guarantee a syntactically correct and robust transformation.

#### 3. Scope & Implementation Plan

This task will replace the existing template processing logic in `buildScripts/buildESModules.mjs` with the following, more robust pipeline:

1.  **Parse to AST:** For each input file, use `acorn` to parse the entire source code into a complete Abstract Syntax Tree (AST). Add parent pointers to each node during a walk for easier tree manipulation.

2.  **Post-Order Traversal:** Traverse the AST in post-order (children first). This is critical for correctly handling nested `html` templates, as it ensures the innermost templates are processed and replaced before their parents.

3.  **Identify `html` Templates:** During the traversal, identify all `TaggedTemplateExpression` nodes whose tag is an `Identifier` with the name `html`.

4.  **Process Template to JSON VDOM:** For each identified template node:
  *   Extract the raw strings and the source code of the interpolated expressions.
  *   Use the existing `buildScripts/util/templateBuildProcessor.mjs` to convert this into a serializable JSON VDOM object. This utility is already effective at this specific step, creating placeholders like `##__NEO_EXPR__...##` for dynamic parts.

5.  **Convert JSON VDOM to AST Node:** This is the most critical step. Create a new, robust `jsonToAst` function inside `buildScripts/buildESModules.mjs` that recursively converts the JSON VDOM object from the previous step into a valid `acorn` AST `ObjectExpression` node. This function will:
  *   Correctly handle primitives (string, number, boolean) by creating `Literal` nodes.
  *   Correctly handle arrays by creating `ArrayExpression` nodes.
  *   When it encounters a string that is a placeholder (e.g., `##__NEO_EXPR__(...)##__NEO_EXPR__##`), it will extract the inner expression string, parse *only that expression* with `acorn.parse()`, and insert the resulting `Expression` node directly into the AST. This avoids all previous syntax errors.
  *   When it encounters a component placeholder (`{__neo_component_name__: 'MyComponent'}`), it will create an `Identifier` node.

6.  **Replace Node in Main AST:** Replace the original `TaggedTemplateExpression` node in the main AST with the newly generated `ObjectExpression` node from the previous step.

7.  **Rename `render` method:** As part of the same traversal, if a processed `html` template was inside a method definition or object property named `render`, rename that key to `createVdom`.

8.  **Generate Final Code:** After the traversal and all replacements are complete, use `astring` to generate the final, correct, and human-readable JavaScript code from the modified AST.

9.  **Minify:** Pass the generated code to `Terser` for final minification.

#### 4. Definition of Done

-   The build process no longer produces any parsing or syntax errors related to template conversion.
-   The `buildESModules.mjs` script is updated to use the full AST transformation pipeline described above.
-   The final `dist/esm` output for components with `html` templates is syntactically correct and functionally equivalent to the client-side parsed version.
-   All previous edge cases (conditional rendering, mixed static/dynamic text, self-closing tags) are handled correctly.

UPDATE on 23:

// Helper to create a context for vm
function createVmContext(scope) {
    const context = vm.createContext(scope);
    return context;
}

// Helper to evaluate code in a given context
function evaluateInContext(code, context) {
    try {
        return vm.runInContext(code, context);
    } catch (e) {
        console.error('Error evaluating code in VM:', e);
       return null;
    }
}

This is a great starting point. The existing buildESModules.mjs already has a full AST pipeline: it uses acorn to parse, walks the
tree, finds html templates, and has a jsonToAst function to convert the processed VDOM back into an AST node.

However, the core processing logic in buildScripts/util/templateBuildProcessor.mjs is flawed for build-time execution. It uses
vm.runInContext to evaluate the template expressions. This is fundamentally incorrect for the build script because it cannot (and
should not) know the runtime values of variables like showDetails or isActive. This approach will fail for any component with
state-dependent logic.

The goal is to preserve the expressions, not evaluate them.

Here is the new plan, which refines sub-task #23 with the knowledge of the existing code:

1. Remove `vm` from `templateBuildProcessor.mjs`: The entire vm.runInContext logic is wrong for this use case and must be removed. The
   processor should work with the raw expression strings directly.

2. Refactor `processHtmlTemplateLiteral`:
  * It will accept strings and expressionCodeStrings as it does now.
  * Instead of evaluating expressionCodeStrings, it will wrap them in the ##__NEO_EXPR__...## placeholder format.
  * It will then call a new version of flattenTemplate that works with these placeholders.

3. Refactor `flattenTemplate`:
  * This function needs to correctly handle nested templates. When it encounters a value that is another template (which will already
    be a VDOM object at build time, thanks to post-order traversal), it needs to embed that object directly.
  * For conditional expressions like showDetails && detailsTemplate, it must preserve the entire expression as a single placeholder:
    ##__NEO_EXPR__showDetails && detailsTemplate##__NEO_EXPR__##.

4. Refactor `convertNodeToVdom` (in the build processor):
  * This is the most critical part. When it encounters a text node in the parse5 AST that is a placeholder for an expression (e.g.,
    the result of ${showDetails && detailsTemplate}), it must not wrap it in a VDOM text node. Instead, it should return the raw
    placeholder string itself (##__NEO_EXPR__...##). This raw placeholder will then be placed directly into the cn array of its
    parent VDOM node.

5. Enhance `jsonToAst` (in `buildESModules.mjs`):
  * The existing function is a good starting point. It already handles the ##__NEO_EXPR__...## placeholder by parsing the inner
    content with acorn. This is correct.
  * It needs to be robust enough to handle all valid JavaScript expressions that might appear inside a template.

6. Fix Post-Order Traversal in `buildESModules.mjs`:
  * The current implementation walks the tree and collects all nodes, then processes them. This is not a true post-order traversal. A
    proper recursive, post-order traversal is needed to ensure nested templates are processed before their parents.

I will now begin implementing these changes. I'll start by modifying buildScripts/buildESModules.mjs to implement a correct post-order
traversal and then refactor the processor logic.

---

### 24. Create a Reusable, AST-Based Build-Time Processor

**Status:** Done

#### 1. Summary

Refactor the entire build-time template transformation pipeline out of `buildScripts/buildESModules.mjs` and into a new, self-contained, reusable utility module.

#### 2. Rationale

Currently, the logic for finding and transforming `html` templates is tightly coupled to the `buildESModules.mjs` script. To support template transformation in other build environments (like the Webpack-based `dist/dev` and `dist/production`), this logic must be extracted. Creating a single, reusable processor ensures consistency, reduces code duplication, and makes the build system more modular and maintainable.

#### 3. Scope & Implementation Plan

1.  **Create New Utility:** Create a new file at `buildScripts/util/astTemplateProcessor.mjs`.
2.  **Move Core Logic:**
    *   Move the `jsonToAst` function from `buildESModules.mjs` into the new utility.
    *   Create and export a primary function, e.g., `processFileContent(fileContent)`.
    *   This function will encapsulate the entire transformation pipeline:
        *   Parsing the input string with `acorn`.
        *   Performing the post-order traversal to find `html` templates.
        *   Calling `processHtmlTemplateLiteral()` from `templateBuildProcessor.mjs` to get the VDOM object.
        *   Using the moved `jsonToAst` to convert the VDOM object back into an AST node.
        *   Replacing the original template node in the main AST.
        *   Generating the final, transformed code string with `astring`.
3.  **Refactor `buildESModules.mjs`:**
    *   Remove the moved logic (`jsonToAst`, the traversal, etc.).
    *   Import the new `processFileContent` function from `astTemplateProcessor.mjs`.
    *   In the `minifyFile` function, call `processFileContent()` to transform the file's content before passing it to Terser.

#### 4. Definition of Done

-   The new `buildScripts/util/astTemplateProcessor.mjs` module exists and contains the full transformation logic.
-   `buildESModules.mjs` is simplified and correctly uses the new reusable utility.
-   Running `npm run build-dist-esm` produces the exact same correct output as it does now, confirming the refactoring was successful.

---

### 25. Optimize Build Process with a Pre-emptive Regex Check

**Status:** Done

#### 1. Summary

Before running the full, expensive AST parsing pipeline on a file, perform a quick regular expression check to see if the file likely contains an `html` template.

#### 2. Rationale

The current process parses every single `.mjs` file with `acorn`, which is computationally expensive. The vast majority of files in the project do not use `html` templates. By adding a quick pre-check, we can skip the entire AST transformation process for most files, significantly speeding up the overall build time.

#### 3. Scope & Implementation Plan

1.  **Define Regex:** Create a simple, fast regex (e.g., `/html\s*`/`) to detect the presence of a tagged template literal.
2.  **Implement Check:** In `buildESModules.mjs`, inside the `minifyFile` function, add a conditional check:
    *   `if (regex.test(content)) { ... }`
3.  **Conditional Processing:** Only if the regex test passes, call the `processFileContent()` function from the new `astTemplateProcessor`. If it fails, the content can be passed directly to the next step (Terser minification).

#### 4. Definition of Done

-   The regex check is implemented in `buildESModules.mjs`.
-   Files that do not contain `html` templates are no longer processed by the `astTemplateProcessor`.
-   Files that *do* contain `html` templates are still transformed correctly.
-   The overall build time is measurably reduced.

---

### 26. Integrate Template Processing into `dist/development` Build

**Status:** Done

#### 1. Summary

Use the new reusable `astTemplateProcessor` to enable build-time `html` template transformation for the `dist/development` Webpack environment.

#### 2. Rationale

To ensure feature parity and a consistent developer experience, `html` templates must be correctly processed in the `dist/development` environment. This allows developers who use this environment (e.g., for TypeScript or specific debugging scenarios) to use the template syntax.

#### 3. Scope & Implementation Plan

1.  **Create Webpack Loader:** Create a custom Webpack loader (e.g., `buildScripts/webpack/loader/template-loader.mjs`).
2.  **Implement Loader Logic:**
    *   The loader will receive the file content.
    *   It will perform the same pre-emptive regex check from sub-task #25.
    *   If the check passes, it will import and call the `processFileContent()` function from `astTemplateProcessor.mjs`.
    *   It will return the transformed code (or the original code if the check fails) to the Webpack compilation chain.
3.  **Configure Webpack:** Update the Webpack configuration for `dist/development` to use this new loader for all `.mjs` files.

#### 4. Definition of Done

-   The custom Webpack loader is created and functional.
-   The `dist/development` build process correctly transforms `html` templates into VDOM objects.
-   Applications running in `dist/development` mode render components using `html` templates correctly.

---

### 27. Integrate Template Processing into `dist/production` Build

**Status:** Done

#### 1. Summary

Use the new reusable `astTemplateProcessor` to enable build-time `html` template transformation for the `dist/production` Webpack environment.

#### 2. Rationale

This is the final step to ensure `html` templates are a fully supported, production-ready feature. The transformation must be applied to the `dist/production` build to gain the performance benefits of pre-compilation in the most optimized deployment environment.

#### 3. Scope & Implementation Plan

1.  **Reuse Webpack Loader:** The same custom Webpack loader created for sub-task #26 can be used.
2.  **Configure Webpack:** Update the Webpack configuration for `dist/production` to apply the `template-loader.mjs` to all `.mjs` files before they are passed to other loaders like Babel or Terser.

#### 4. Definition of Done

-   The `dist/production` build process correctly transforms `html` templates into VDOM objects.
-   The final, minified production bundles contain optimized VDOM, not raw `html` template strings.
-   Applications running in `dist/production` mode render components using `html` templates correctly.

---

### 28. Add Error Resilience to AST Processor

**Status:** Done

#### 1. Summary

Wrap the core AST processing logic within `astTemplateProcessor.mjs` in a `try...catch` block to prevent a single file's parsing error from crashing the entire build process.

#### 2. Rationale

The AST transformation is complex. If an edge case or a bug in the processor causes an error while parsing a specific file, the current implementation would throw an exception and halt the entire build. By adding error handling, we can isolate the failure. The processor will log the error for later inspection but return the original, untransformed content for the problematic file, allowing the build to complete successfully for all other files.

#### 3. Scope & Implementation Plan

1.  **Modify `processFileContent`:** In `buildScripts/util/astTemplateProcessor.mjs`, wrap the entire block of code following the initial regex check in a `try...catch (e)` block.
2.  **Implement Error Handling:**
    *   Inside the `catch` block, log a detailed error message to the console, including the error `e` and ideally the path of the file being processed (though we might need to pass the file path into the function for that).
    *   Crucially, the `catch` block should return the original, unmodified `fileContent`, ensuring the build can continue.
3.  **Update Return Value:** Ensure the function signature and return value (`{ content: fileContent, hasChanges: false }`) are consistent in the `catch` path.

#### 4. Definition of Done

-   The `try...catch` block is implemented in `processFileContent`.
-   A parsing error in one file logs a console error but does not stop the build.
-   The file that caused the error is passed through the build untransformed.

---
### 29. Create "Under the Hood: HTML Templates" Guide

Status: To Do

#### 1. Summary

Create a new, in-depth guide that explains the technical implementation of the HTML template feature across all of Neo.mjs's environments. This will
serve as a companion to the existing "Using HTML Templates" guide.

#### 2. Rationale

While the existing guide explains how to use templates, it's important to document how they work to highlight the framework's architectural strengths.
This new guide will explain the different processing mechanisms for the zero-builds dev mode versus the production builds, clarifying the performance
trade-offs and showcasing the power of the build-time AST transformation.

#### 3. Scope & Implementation Plan

1. Create New File: Create a new markdown file at learn/guides/uibuildingblocks/HtmlTemplatesUnderTheHood.md.
2. Write Content: The guide will be structured as follows:
    * Introduction: Briefly state the guide's purpose – to explain the mechanics behind the html template feature. Link back to the "Using" guide for
      syntax and best practices.
    * The Core Challenge: Explain the fundamental problem: converting a standard JavaScript tagged template literal into a Neo.mjs VDOM object.
    * Mechanism 1: Zero-Builds Development Mode (Live Parsing):
        * Explain that in dev mode, the parse5 library is loaded directly into the App worker.
        * Describe the process: the html tag function triggers the HtmlTemplateProcessor, which uses parse5 to create an AST from the template string
          at runtime.
        * Clearly state the trade-off: the convenience of live parsing comes at the cost of loading the ~176KB parse5 library.
    * Mechanism 2: Production Builds (`dist/esm`, `dist/dev`, `dist/prod`):
        * Explain that for all production builds, the parse5 dependency is completely eliminated from the client-side code.
        * Describe the build-time AST transformation process:
            * The build script (astTemplateProcessor.mjs) finds all html templates.
            * It uses acorn to parse the file into a JavaScript AST.
            * It converts the template into a VDOM object and then into an AST ObjectExpression.
            * The original template is replaced with the VDOM object in the source code itself before minification.
        * Emphasize the benefit: The browser receives pre-compiled, highly optimized VDOM, resulting in zero runtime parsing overhead and maximum
          performance.
    * Conclusion: Summarize the two approaches, reinforcing that Neo.mjs provides both instant feedback for development and maximum performance for
      production.
3. Update `tree.json`: Add a new entry to learn/tree.json to make the new guide discoverable in the documentation navigation. It should be placed
   directly after the existing "HTML Templates" entry.

#### 4. Definition of Done

- The new guide learn/guides/uibuildingblocks/HtmlTemplatesUnderTheHood.md is created with the specified content.
- The learn/tree.json file is updated to include a link to the new guide.
- The documentation now clearly separates the "how-to" from the "how-it-works" for the HTML templates feature.
