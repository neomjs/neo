# Under the Hood: The Philosophy and Mechanics of HTML Templates

This guide explores the "why" and "how" behind the HTML template feature in Neo.mjs. It's a deep dive into an architecture
designed to deliver on a core framework promise: a zero-builds, instant-feedback development mode that doesn't sacrifice
production performance.

This serves as a companion to the [Using HTML Templates](./HtmlTemplates.md) guide, which focuses on syntax
and best practices.

## The Core Philosophy: Why Not JSX?

One of the most critical design goals for Neo.mjs is to provide a **zero-builds development environment**. We believe
that developers should be able to write code and see their changes instantly in the browser, without a mandatory
compilation step. This philosophy directly informed our approach to UI templating.

Frameworks like React and Angular rely on non-standard syntax (JSX, Angular templates) that **must** be compiled into
valid JavaScript. This requirement for a build step, even in development, introduces complexity and slows down
the feedback loop.

Neo.mjs chose a different path: **Tagged Template Literals**. This is a standard, native JavaScript feature. By using
`html`... ``, we are not inventing a new language; we are leveraging the power of JavaScript itself. This allows for:

1.  **True Zero-Builds Development:** Your template code runs directly in the browser. What you write is what you get,
    with no hidden magic or required transformations.
2.  **No Special Directives:** Logic isn't handled by template-specific directives like `n-if` or `n-for`. You use
    standard JavaScript (`if/else`, `map()`) for all conditionals and loops, which is more powerful and familiar.
3.  **Architectural Purity:** The template is just a function call that returns a data structure (a VDOM object).
    This maintains a clean separation between your view definition and the framework's rendering engine.

## Mechanism 1: The Zero-Builds Development Experience

In development mode, templates must be parsed at runtime. This is where the trade-off for instant feedback becomes
apparent.

### Conditional Loading: A Smart Optimization

To parse HTML strings, we need an HTML parser. Neo.mjs uses `parse5`, a robust and spec-compliant library. However, at
~176KB, we don't want to load it unless absolutely necessary.

This is why the parser is **only loaded if a component on the page actually uses an HTML template**. This check happens
inside the `initAsync` method of `Neo.functional.component.Base`.

```javascript
// src/functional/component/Base.mjs
async initAsync() {
    await super.initAsync();

    if (this.enableHtmlTemplates && Neo.config.environment === 'development') {
        if (!Neo.ns('Neo.functional.util.HtmlTemplateProcessor')) {
            const module = await import('../util/HtmlTemplateProcessor.mjs');
            this.htmlTemplateProcessor = module.default
        }
    }
}
```

If `enableHtmlTemplates` is true, the component dynamically imports the `HtmlTemplateProcessor`, which in turn pulls in
`parse5`. This ensures that applications not using this feature pay no performance penalty.

### The Runtime Parsing Process

When a component's `createVdom()` method returns an `HtmlTemplate` object, it's handed off to the `HtmlTemplateProcessor`.
You can inspect its source code here:
[src/functional/util/HtmlTemplateProcessor.mjs](../../../../src/functional/util/HtmlTemplateProcessor.mjs).

The processor executes a series of steps to convert the template literal into a VDOM object, which are detailed in the
expandable section below.

<details>
<summary>Detailed Runtime Parsing Steps</summary>

1.  **Flattening:** It recursively flattens any nested templates into a single string and a corresponding array of
    dynamic values.
2.  **Placeholder Injection:** It replaces dynamic values (e.g., event handlers, component configs, other components)
    with special placeholders in the string (e.g., `__DYNAMIC_VALUE_0__`, `neotag1`).
3.  **Self-Closing Tag Conversion:** Since `parse5` does not handle self-closing custom element tags, a regular
    expression adds explicit closing tags (e.g., `<MyComponent />` becomes `<MyComponent></MyComponent>`).
4.  **Parsing:** The sanitized HTML string is parsed into a standard AST using `parse5.parseFragment()`.
5.  **VDOM Conversion:** The processor traverses the `parse5` AST and converts it back into a Neo.mjs VDOM object.
    During this process, it re-inserts the original dynamic values from the `values` array, preserving their rich data
    types (functions, objects, etc.). It also carefully reconstructs the original case-sensitive tag names for custom
    components.

</details>

Once the VDOM is constructed, it's passed back to the component's `continueUpdateWithVdom()` method, and the standard
rendering lifecycle proceeds.

## Mechanism 2: Maximum Performance for Production

For production, the goal is to achieve the exact same VDOM output as the development mode, but with **zero runtime
parsing overhead**. This is accomplished with a powerful build-time AST (Abstract Syntax Tree) transformation.

This work is handled by two main scripts:

-   [buildScripts/util/templateBuildProcessor.mjs](../../../../buildScripts/util/templateBuildProcessor.mjs):
    Contains the core logic for parsing the template string and converting it to a serializable VDOM object.
-   [buildScripts/util/astTemplateProcessor.mjs](../../../../buildScripts/util/astTemplateProcessor.mjs):
    Orchestrates the overall process of reading a JS file, finding `html` templates, and replacing them with the final
    VDOM object via AST manipulation.

### The AST Transformation Process

The `astTemplateProcessor.mjs` script is a marvel of build-time engineering. Instead of just doing a simple text
replacement, it performs a full AST transformation to ensure 100% accuracy.

1.  **Parse Code:** It uses `acorn` to parse the JavaScript file content into an AST.
2.  **Find Templates:** It traverses the AST to find all `html` tagged template expressions.
3.  **Process Template:** Each template is processed by `templateBuildProcessor.mjs`, which converts the HTML-like syntax
    into a serializable VDOM object.
4.  **Convert to AST:** The resulting VDOM object is converted back into a valid AST `ObjectExpression` node.
5.  **Replace Node:** The original `TaggedTemplateExpression` is replaced in the main AST with the new `ObjectExpression`.
6.  **Generate Code:** The modified AST is converted back into a string of JavaScript code using `astring`.

As a developer convenience, if a template is the return value of a method named `render`, the build script automatically
renames the method to `createVdom`.

### Integration with Build Environments

This logic is seamlessly integrated into all three of Neo.mjs's production build environments:

-   **`dist/esm`:** The [buildScripts/buildESModules.mjs](../../../../buildScripts/buildESModules.mjs) script directly
    invokes the `processFileContent` function from the `astTemplateProcessor` for each JavaScript file before minification.
-   **`dist/dev` & `dist/prod`:** These environments use Webpack. The transformation is handled by a custom loader:
    [buildScripts/webpack/loader/template-loader.mjs](../../../../buildScripts/webpack/loader/template-loader.mjs).
    This loader is strategically applied **only to the App worker's build configuration**, an optimization that saves
    build time by not processing code for other workers.

### Key Differences from Runtime Parsing

The build-time process is fundamentally different from the runtime parsing:

-   **No Lexical Scope:** The build script cannot access runtime variables like `this`. It captures the raw code (e.g.,
    `this.name`) as a string.
-   **Placeholder Wrapping:** These code strings are wrapped in special placeholders (e.g.,
    `##__NEO_EXPR__this.name##__NEO_EXPR__##`).
-   **Custom Resolution:** During the VDOM-to-AST conversion, the `jsonToAst` function uses `acorn.parseExpressionAt`
    to parse these placeholders back into proper AST nodes, perfectly preserving the original expressions for runtime
    evaluation.
-   **Component Tag Handling:** A tag like `<MyComponent>` is converted into a placeholder object
    (`{ __neo_component_name__: 'MyComponent' }`) which the `astTemplateProcessor` turns into a plain `Identifier` in
    the final AST.

## Conclusion: The Neo.mjs Advantage

The dual-mode approach to HTML templates is a perfect example of the Neo.mjs philosophy in action. It provides:

-   **An Unmatched Developer Experience:** The zero-builds development mode offers an instant feedback loop that is
    impossible in frameworks requiring mandatory compilation. You write standard JavaScript and it simply works.
-   **Maximum Production Performance:** The build-time AST transformation ensures that your production code is as fast
    as possible, with no client-side parsing overhead. The `parse5` library is completely eliminated from your final bundle.
-   **Architectural Consistency:** The system is designed to produce the exact same VDOM structure in both modes.
    This eliminates a whole class of bugs where development and production environments behave differently.

This architecture isn't just a feature; it's a statement. It demonstrates a commitment to web standards, developer
productivity, and end-user performance that sets Neo.mjs apart from the crowd.
