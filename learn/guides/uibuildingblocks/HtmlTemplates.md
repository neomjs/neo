# Using HTML Templates for VDOM

This guide covers the purpose, syntax, and trade-offs of using tagged template literals (HTML-like syntax) to define VDOM structures in neo.mjs. This feature provides an intuitive and familiar alternative to the traditional JSON-based VDOM approach, especially for developers coming from other traditional, single-threaded architectures.

## The "Why": An Alternative, Not a Replacement

The core of neo.mjs is built on a highly efficient, JSON-based VDOM structure. This approach is powerful and performant, as it requires zero parsing or transformation at runtime.

However, we recognize that many developers are accustomed to writing UI with an HTML-like syntax. HTML templates are offered as a **beginner-friendly and transitional option** to lower the barrier to entry. They allow you to get started quickly, leveraging familiar patterns, while you learn the more advanced capabilities of the engine.

## The Trade-Off: Performance in Development

Using this feature comes with a clear trade-off. To enable live parsing of HTML templates in your browser during development, the engine must load the `parse5` library. This adds **~176KB (minified)** to your application's initial download size in development mode.

For production builds, this penalty is removed, as the templates are pre-compiled into the standard JSON VDOM format.

## Best Practices

-   **Use for simpler components:** Templates are excellent for components with relatively static structures, such as informational dialogs, buttons, or basic forms.
-   **Prefer JSON VDOM for complex views:** For highly dynamic, data-driven, or programmatically generated views (like complex grids or dashboards), the native JSON VDOM approach is often clearer and more performant.
-   **Embrace JavaScript for Logic:** Do not look for template-specific directives like `n-if` or `n-for`. All conditional logic and looping should be handled with standard JavaScript inside your `createVdom` method, before the `html` tag is even used.

## For Developers Coming from JSX (e.g., React)

You may be accustomed to writing component tags directly, like `<Button>`. In neo.mjs, the equivalent is `<${Button}>`. This small difference is intentional and unlocks significant architectural benefits.

-   **JSX Requires a Compiler:** JSX is not standard JavaScript. It must be compiled into `React.createElement(Button, ...)` calls. The simplicity of `<Button>` is an abstraction provided by a mandatory build step.
-   **neo.mjs Templates are Native JavaScript:** The `html`...`` syntax is a standard JavaScript feature called a "tagged template literal." It runs directly in the browser without a build step in development. The `<${Button}>` syntax is the native JavaScript way to pass the actual `Button` component constructor (the variable) into the template function.

This approach means you are not learning a special template language; you are using the full power of JavaScript itself for all your view logic, including conditionals and loops, which is a core design principle of the engine.

## Basic Usage

To use this feature, import the `html` tag from `neo.mjs/src/functional/util/html.mjs` and use it to wrap your template string.

```javascript
import { html } from '../../../src/functional/util/html.mjs';

const vdom = html`
    <div class="container">
        <h1>Hello, World!</h1>
    </div>
`;
```

## Component vs. HTML Tags

The template processor distinguishes between standard HTML elements and neo.mjs components based on the tag itself.

### 1. HTML Tags

Standard HTML tags are written as lowercase literal strings, as you would in normal HTML.

```javascript
const vdom = html`
    <section>
        <p>This is a standard HTML paragraph.</p>
    </section>
`;
```

### 2. Component Tags

There are two ways to render a neo.mjs component, with the first being the strongly recommended approach.

#### Recommended: Interpolation (Lexical Scope)

Import the component you need and pass the constructor directly into the template as the tag name using `${...}` syntax. This is the most explicit and robust method, as it uses the file's lexical scope.

**Note:** Components can and should be self-closing if they do not have children.

```javascript
import { html } from '../../../src/functional/util/html.mjs';
import Button   from '../../../src/button/Base.mjs';

const vdom = html`<${Button} text="Click Me" />`;
```

#### Fallback: Global Namespace

If a tag name is written as a literal string in `PascalCase` or with dots (e.g., `Neo.button.Base` or `MyApp.view.MyButton`), the processor will attempt to resolve it from the global namespace using the `Neo.ns()` utility. This should be used sparingly, as the interpolation method is more explicit and less prone to issues with name collisions or refactoring.

```javascript
const vdom = html`<Neo.button.Base text="Global Button" />`;
```

## Attributes and Configs

Attributes are used to pass configuration values to both HTML tags and components.

### Primitives (String, Number, Boolean)

Static strings can be passed directly. For dynamic values (including numbers, booleans, or variables), use interpolation.

```javascript
const myId    = 'main-container';
const disabled = true;

const vdom = html`
    <div id="${myId}" class="static-class"></div>
    <${Button} text="Submit" disabled="${disabled}" />
`;
```

### Objects, Arrays, and Functions

To pass non-string data like objects (for styles), arrays (for child items), or functions (for renderers or handlers), you **must** use interpolation.

```javascript
import { html } from '../../../src/functional/util/html.mjs';
import Grid from '../../../src/grid/Container.mjs';

const myStyle = { color: 'blue', fontSize: '16px' };

// A renderer function for a grid column
const statusRenderer = ({ value }) => {
    const color = value === 'Active' ? 'green' : 'red';
    // A renderer can return a VDOM object for rich cell content
    return { tag: 'span', style: { color }, cn: [value] };
};

// The array of column configuration objects
const gridColumns = [
    { dataField: 'name', text: 'Name' },
    { dataField: 'status', text: 'Status', renderer: statusRenderer } // The function is passed here
];

const vdom = html`
    <div style="${myStyle}">Styled Text</div>
    <${Grid} columns="${gridColumns}" />
`;
```

## Dynamic and Conditional Rendering

Unlike other architectures, neo.mjs templates do not have special directives for logic. Instead, you use the full power of JavaScript to build your dynamic UI *before* it goes into the template.

### Conditional Rendering

Use standard JavaScript constructs like `if/else` statements, ternary operators, or `&&` for conditional rendering.

```javascript
// Using a ternary operator
const content = isVisible
    ? html`<p>Now you see me.</p>`
    : html`<small>Now you don't.</small>`;

const vdom = html`
    <div>
        <h1>Conditional Content</h1>
        ${content}
    </div>
`;

// Using short-circuiting (&&)
const vdom2 = html`
    <div>
        <h2>Admin Section</h2>
        ${isAdmin && html`<p>Welcome, Admin!</p>`}
    </div>
`;
```

### Rendering Lists

Use the standard `Array.prototype.map()` method to transform an array of data into an array of VDOM nodes.

```javascript
const items = [
    { id: 1, name: 'First Item' },
    { id: 2, name: 'Second Item' }
];

const listItems = items.map(item => html`
    <li id="${item.id}">${item.name}</li>
`);

const vdom = html`
    <ul>
        ${listItems}
    </ul>
`;
```

**IMPORTANT:** When rendering lists, always provide a unique `id` attribute to each element in the list. This is crucial for the VDOM diffing algorithm to efficiently update, reorder, or remove items.

## DOM Events (Out of Scope)

This template system **does not** support inline DOM event handlers (e.g., `onClick="..."`).

To handle DOM events, you must continue to use the engine's standard, efficient, and secure delegated event system via the `domListeners` config on class-based components or the `useEvent()` hook in functional components. This maintains architectural consistency and performance.
