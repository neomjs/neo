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

**Description:**
To adhere to the framework's "zero builds" development principle, the `parse5` library cannot be imported directly from `node_modules` at runtime. A build step is required to convert it into a browser-compatible ES module. This bundled file will be checked into the `dist` directory and imported by the `HtmlTemplateProcessor`.

**Implementation Details:**
- **Tool:** `esbuild`
- **Source:** `node_modules/parse5/dist/index.js`
- **Output:** `dist/parse5.mjs`
- **Script:** Create a new build script `buildScripts/bundleParse5.mjs` and an associated npm script `bundle-parse5` to perform the bundling and minification.
- **Outcome:** The `HtmlTemplateProcessor` will be updated to import `../../../dist/parse5.mjs`.

### 4. Alternative Dev Mode: In-Worker Parsing with `parse5`

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

**Description:**
Define a clear and comprehensive specification for the template syntax. This document will serve as the blueprint for the parser implementation and as the primary reference for developers using this feature.

**Implementation Details:**
- Create a new markdown file: `docs/templates/Syntax.md`.
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

**Description:**
Enhance the `parse5` processor to correctly handle the mapping of interpolated values from the tagged template literal to their corresponding VDOM properties, respecting their original data types.

**Implementation Details:**
- The parser must receive not only the HTML string but also the array of interpolated values from the template literal.
- When an attribute value is a placeholder for an interpolated value (e.g., `renderer="$[0]"`, where `$[0]` maps to the first expression), the parser must assign the raw expression value (the function object) to the VDOM config, not the placeholder string.
- Implement logic to correctly handle and assign functions, objects, arrays, and other non-string data types to the appropriate VDOM properties.

### 7. Parser: Component vs. HTML Tag Recognition

**Description:**
Implement the logic within the `parse5` processor to differentiate between standard HTML tags and neo.mjs component tags based on the convention defined in the Syntax Specification.

**Implementation Details:**
- When traversing the `parse5` AST, check the tag name of each element.
- If the tag name follows the component convention (e.g., starts with a capital letter), generate a VDOM object with a `module` or `className` property pointing to the corresponding component class.
- If it's a standard HTML tag, generate a standard VDOM object with a `tag` property.
- A mechanism will be needed to resolve the string name (e.g., "GridContainer") to the actual class constructor (`GridContainer`) at runtime. This may involve a component registry or passing a scope object to the template processor.


