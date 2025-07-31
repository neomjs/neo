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

**Status: To Do**

**Description:**
After the feature is functionally complete and well-tested, refactor the new modules (`HtmlTemplateProcessor`, etc.) to meet the high code quality standards of the neo.mjs framework. This includes adding comprehensive JSDoc comments, ensuring adherence to coding guidelines, and optimizing for clarity and performance.

### 12. Create a Real-World Example

**Status: To Do**

**Description:**
To showcase the new feature and provide a practical learning resource, create a new, simple example application that is built using a functional component with a string-based template. This will serve as a clear, working demonstration for developers.


