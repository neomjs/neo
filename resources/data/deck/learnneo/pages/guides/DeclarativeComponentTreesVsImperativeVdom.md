## Critical Mental Model Shift for React/Vue/Angular Developers

**If you're coming from React, Vue, or Angular:** Neo.mjs requires a fundamental shift in how you think about UI composition. This isn't just different syntax—it's a completely different paradigm.

### What You're Used To (Other Frameworks)
In React, Vue, and Angular, you compose UIs by writing templates/JSX that mix HTML elements with custom components:

```jsx
// React/Vue/Angular pattern - mixing HTML with components
function App() {
  return (
    <div className="viewport">
      <HeaderToolbar />
      <div className="main-content">
        <CustomButton text="Click me" />
        <DataGrid data={users} />
      </div>
    </div>
  );
}
```

Your mental model: *"I write the DOM structure I want, and insert components as custom HTML tags."*

### What Neo.mjs Actually Does
In Neo.mjs, you compose UIs through **declarative component configurations** that describe relationships:

```javascript
// Neo.mjs pattern - component relationship configuration
class App extends Container {
    static config = {
        cls: ['viewport'],
        items: [{
            module: HeaderToolbar
        }, {
            module: Container,
            cls: ['main-content'],
            items: [{
                module: CustomButton,
                text: 'Click me'
            }, {
                module: DataGrid,
                data: users
            }]
        }]
    }
}
```

Your new mental model: *"I configure component relationships through `items`, and components define their own internal DOM structure through `vdom`."*

### The Key Difference
- **Other frameworks**: You write DOM structure first, then add components as tags
- **Neo.mjs**: You configure component hierarchies via `items`. Individual components define their internal DOM via `vdom`

### When to Use Each Approach
- **Component composition via `items`** (99% of application development): Building UIs, managing hierarchies, application logic
- **VDom manipulation** (1% - framework development): Creating custom components, optimizing internal component rendering

---

## Introduction

Neo.mjs employs a unique two-tier architecture that separates **declarative component configuration** from **imperative virtual DOM (VDom) operations**. This design provides both developer productivity and framework performance optimization while maintaining clear separation of concerns across different abstraction layers.

## Abstraction Layer Separation

Neo.mjs operates on two distinct levels:

- **Application Layer**: Developers work with declarative & reactive component configurations.
- **Framework Layer**: Internal imperative VDom operations handle performance optimization.

## Declarative Component Trees

### Structure Definition

Components are defined through configuration objects that describe relationships and behavior. In Neo.mjs, the declarative
component hierarchy is primarily established using the `items` config property of container components. This defines a tree
of **component instances or modules**.

```javascript
// Declarative component hierarchy
class Viewport extends BaseViewport {
    static config = {
        layout: {ntype: 'vbox', align: 'stretch'},
        items: [{
            module: HeaderToolbar,
            flex  : 'none'
        }, {
            module   : Container,
            cls      : ['portal-main-content'],
            layout   : 'card',
            reference: 'main-content',
            items: [
                {module: () => import('./home/MainContainer.mjs')},
                {module: () => import('./learn/MainContainer.mjs')},
                {module: () => import('./blog/Container.mjs')}
            ]
        }]
    }
}
```

### Key Characteristics

- **Configuration-Based**: Components defined as static config objects (`static config = { ... }`).
- **Lazy Loading**: Dynamic imports enable code splitting.
- **Hierarchical**: Nested `items` arrays establish parent-child relationships.
- **Referential**: `reference` property enables component lookup.
- **Mutable Structure**: The live component instance tree is **dynamic and mutable at runtime**, allowing developers to
  imperatively add, remove, or reorder components using methods like `add()`, `remove()` and `insert()`.

### State Provider Integration

```javascript
// Portal.view.ViewportStateProvider
class ViewportStateProvider extends StateProvider {
    static config = {
        data: {
            size: null  // Reactive state property
        }
    }
}

// State changes automatically trigger UI updates
viewport.stateProvider.setData({size: 'large'});

// Shorthand syntax:
viewport.setState({size: 'large'});
```

## Imperative VDom Operations

### Internal VDom Structure

Framework components define the structure of their own root DOM element and any static child HTML elements through their
`vdom` config property. This `vdom` config represents a Virtual DOM node and adheres to the `VDomNodeConfig` interface.

```javascript
// Neo.button.Base
class Button extends Component {
    static config = {
        vdom:
        {tag: 'button', type: 'button', cn: [
            {tag: 'span', cls: ['neo-button-glyph']},
            {tag: 'span', cls: ['neo-button-text']},
            {cls: ['neo-button-badge']},
            {cls: ['neo-button-ripple-wrapper'], cn: [
                {cls: ['neo-button-ripple']}
            ]}
        ]}
    }
}
```

### Direct Vdom Manipulation

Framework code (typically within component lifecycle methods or setters like `afterSet*`) performs imperative operations
directly on properties of VDom nodes. After imperatively modifying a VDom node's properties (e.g., `text`, `cls`, `style`),
the component calls `this.update()` to signal the framework to reconcile the VDom changes with the real DOM.

```javascript
// Neo.button.Base
afterSetIconCls(value, oldValue) {
    let {iconNode} = this;
    
    // Imperative class list manipulation
    NeoArray.remove(iconNode.cls, oldValue);
    NeoArray.add(iconNode.cls, value);
    iconNode.removeDom = !value;
    
    this.update();
}

afterSetText(value, oldValue) {
  let {textNode} = this;

  // Direct imperative manipulation
  textNode.removeDom = !value || value === '';
  if (value) {
    textNode.text = value;
  }

  // Trigger DOM reconciliation
  this.update();
}
```

### Performance Optimizations

```javascript
// Neo.button.Base
async showRipple(data) {
    let rippleEl = this.rippleWrapper.cn[0];
    
    // Direct style manipulation for performance
    rippleEl.style = Object.assign(rippleEl.style || {}, {
        animation: 'none',
        height: `${diameter}px`,
        left: `${data.clientX - buttonRect.left - radius}px`,
        top: `${data.clientY - buttonRect.top - radius}px`,
        width: `${diameter}px`
    });
    
    // Asynchronous DOM updates
    delete this.rippleWrapper.removeDom;
    this.update();
    
    await this.timeout(1);
    
    rippleEl.style.animation = `ripple ${duration}ms linear`;
    this.update();
}
```

## Practical Examples from Real Applications

### 1. Navigation System Architecture

```javascript
// Portal.view.ViewportController
// Declarative route configuration
static config = {
    routes: {
        '/home' : 'onHomeRoute',
        '/learn': 'onLearnRoute',
        '/blog' : 'onBlogRoute'
    }
}

// Imperative navigation handling
onHomeRoute(params, value, oldValue) {
    this.setMainContentIndex(0);  // Triggers layout changes
}

async setMainContentIndex(index) {
    let container = this.getReference('main-content');
    
    // Imperative layout manipulation
    if (this.mainContentLayout === 'cube') {
        container.layout = {
            ntype      : 'cube', 
            activeIndex: index,
            fitContainer: true
        };
    }

    // Imperative timing control
    await this.timeout(200);
    container.layout.activeIndex = index; // reactive
}
```

### 2. Responsive Design Handling

If needed, this can be done via JavaScript too (instead of purely focussing on CSS)

```javascript
// Portal.view.Viewport
// Declarative size definitions
static sizes = ['large', 'medium', 'small', 'x-small', null];

static config = {
  size_: null,
}

// Imperative responsive updates
afterSetSize(value, oldValue) {
    let cls = this.cls;
    
    // Direct class manipulation
    NeoArray.remove(cls, 'portal-size-' + oldValue);
    NeoArray.add(cls, 'portal-size-' + value);
    this.cls = cls;
    
    // State synchronization
    this.stateProvider.setData({size: value});
    this.controller.size = value;
}
```

### 3. Dynamic Component Management

```javascript
// Portal.view.ViewportController
async onAppConnect(data) {
    let app = Neo.apps[data.appName];
    let sourceView = sourceContainer.removeAt(0, false);  // Imperative removal of a component instance
    mainView.add(sourceView);                             // Imperative addition of a component instance

  // Imperative reactive config updates on component instances:
    tabContainer.activeIndex = 0;
    tabContainer.getTabAtIndex(1).disabled = true;
}
```

## Developer Experience Benefits

### Application Developer Perspective

```javascript
// Developers write declarative configurations
{
    module   : Button,
    text     : 'Click Me',
    iconCls  : 'fa fa-home',
    handler  : 'onButtonClick',
    badgeText: '5'
}

// Framework automatically handles:
// - Vdom node creation and management
// - Event binding and cleanup  
// - DOM updates and reconciliation
// - Performance optimizations via multi-threading
```

### Framework Developer Perspective

```javascript
// Framework developers handle imperative optimizations
afterSetBadgeText(value, oldValue) {
    let {badgeNode} = this;
    
    badgeNode.removeDom = !Boolean(value);
    badgeNode.text = value;
    
    this.update(); // Triggers efficient DOM reconciliation
}
```

## When to Use Each Approach

### Use Declarative Components When:
- Building application interfaces
- Defining component hierarchies through Composition
- Managing application state
- Implementing business logic
- Creating reusable UI patterns

### Use Imperative Vdom When:
- Creating custom app or framework components (defining their root `vdom` structure)
- Implementing component lifecycle methods (`afterSet*`, `beforeSet*`, `beforeGet*`) that modify a component's own VDom properties.
- Optimizing rendering performance (by triggering `this.update()`)
- Building low-level UI utilities or complex animations that directly manipulate VDom node properties.
- Fine-tuning DOM operations

## Performance Implications

### Declarative Benefits:
- **Predictable Performance**: The framework handles optimizations automatically.
- **Automatic Batching**: Updates are batched and optimized
- **Memory Efficiency**: Shared component instances and configs
- **Worker Threading**: Non-blocking UI operations as heavy lifting is offloaded.

### Imperative Benefits:
- **Fine-Grained Control**: Direct manipulation of VDom node properties when needed.
- **Custom Optimizations**: Tailored performance strategies for specific cases.
- **Minimal Overhead**: Direct property access and updates on VDom nodes.
- **Animation Control**: Precise timing and effects

## Best Practices

### For Application Development:

1. **Favor Declarative**: Use component configurations over Vdom manipulation.
   Primarily use component configurations (`items`) for building UIs.
2. **State Management**: Leverage reactive state providers
3. **Component Composition**: Build complex UIs through item hierarchies
4. **Reference Usage**: Use `reference` for component communication

### For Framework Development:

1. **Encapsulate Complexity**: Hide imperative operations behind declarative APIs
2. **Optimize Updates**: Batch DOM changes and use `update()` efficiently
3. **Memory Management**: Clean up event listeners and references
4. **Worker Communication**: Minimize cross-worker message passing

## Migration and Integration

### From Other Frameworks:

- **React**: Similar component concepts, but configs replace JSX
- **Vue**: Comparable reactive patterns with better performance isolation
- **Angular**: More explicit separation between template and logic

### Integration Patterns:

```javascript
// Wrapping existing components or custom elements
{
    module: LegacyWrapper,
    items: [{
        ntype: 'component',     // default value, just added for clarity
    //  html : '<legacy-widget></legacy-widget>',
        tag  : 'legacy-widget', // custom tag name
        domListeners: {
            'legacy-event': 'onLegacyEvent'
        }
    }]
}
```

**Recommendation**: Using tag instead of html is crucial for security as it prevents Cross-Site Scripting (XSS)
vulnerabilities by avoiding raw HTML injection for element creation.

## Advanced Topics

### Custom Component Development

```javascript
import Component from './src/component/Base.mjs';
import VdomUtil  from './src/util/Vdom.mjs';

class CustomComponent extends Component {
    static config = {
        // Declarative configuration
        customProperty_: null,

        // Vdom structure
        vdom: {
            tag: 'div', // default value, just for clarity here
            cn: [
                {tag: 'header', flag: 'headerNode'},
                {tag: 'main',   flag: 'contentNode'}
            ]
        }
    }
    
    // Imperative update handling
    afterSetCustomProperty(value, oldValue) {
        VdomUtil.getByFlag('headerNode').text = value;
        this.update(); // Triggers efficient DOM reconciliation via VDom Worker
    }
}
```

### Performance Monitoring

```javascript
Neo.config.logDeltaUpdates = true;  // Enables update timing logs
```

## Conclusion

Neo.mjs's two-tier architecture successfully balances developer productivity with framework performance through:

- **Clear Separation**: Declarative application layer, imperative framework layer
- **Multi-Threading**: Optimal resource utilization across worker threads
- **Reactive Updates**: Automatic UI synchronization with state changes
- **Performance Optimization**: Framework-level imperative optimizations
- **Developer Experience**: Elegant, maintainable application code

This architecture enables developers to build complex, performant web applications while focusing on business logic rather
than DOM manipulation details. The framework's imperative Vdom operations provide the performance foundation, while the
declarative component system delivers the developer experience.

Understanding this distinction is crucial for effectively leveraging Neo.mjs's capabilities and building maintainable,
scalable applications.
