# Epic: String-Based VDOM Templates

This epic covers the exploration and implementation of a new feature allowing developers to use string-based template literals (HTML-like syntax) to define the VDOM for all components (functional and class-based). This will provide a more familiar and intuitive way to structure component views compared to the current JSON-based VDOM approach.

An early proof-of-concept (PoC) already exists in the following files:
- `test/siesta/tests/functional/HtmlTemplateComponent.mjs`
- `src/functional/component/Base.mjs` (see `enableHtmlTemplates_` config)
- `src/functional/util/html.mjs`

## Sub-Tasks

### 1. Dev Mode: Main Thread Addon for Live Parsing

**Description:**
For development mode, we need an addon that can parse these HTML string templates on the fly within the browser. This allows for rapid development and testing without requiring a build step after every change.

**Implementation Details:**
- **Name:** `Neo.main.addon.HtmlStringToVdom`
- **Method:**
    1. Use the native `DOMParser` to convert the HTML string into a standard DOM tree.
    2. Traverse the generated DOM tree and map it to a JSON structure that matches the Neo.mjs VDOM format.
    3. Ensure that any embedded logic or dynamic values from the template literal are correctly placed within the resulting VDOM for later processing by the framework.

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
