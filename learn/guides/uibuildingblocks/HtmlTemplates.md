# HTML Template Syntax

This document outlines the syntax for using tagged template literals (HTML-like syntax) to define VDOM structures in neo.mjs. This feature provides an intuitive and familiar alternative to the traditional JSON-based VDOM approach.

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

If a tag name is written as a literal string in `PascalCase` or with dots (e.g., `Neo.button.Base`), the processor will attempt to resolve it from the global `Neo` namespace. This should be used sparingly.

```javascript
const vdom = html`<Neo.button.Base text="Global Button" />`;
```

## Attributes

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

## DOM Events (Out of Scope)

This template system **does not** support inline DOM event handlers (e.g., `onClick="..."`).

To handle DOM events, you must continue to use the framework's standard, efficient, and secure delegated event system via the `domListeners` config on class-based components or the `useEvent()` hook in functional components. This maintains architectural consistency and performance.
