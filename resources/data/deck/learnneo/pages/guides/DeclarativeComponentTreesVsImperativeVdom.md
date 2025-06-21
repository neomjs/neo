## Overview

Neo.mjs employs a unique two-tier architecture that separates **declarative component configuration** from **imperative
virtual DOM (VDom) operations**. This design provides both developer productivity and framework performance optimization
while maintaining clear separation of concerns across different abstraction layers.

**Target Audience**: This guide is essential for developers coming from React, Vue, or Angular who need to understand
Neo.mjs's fundamentally different approach to UI composition.

## Architecture at a Glance

Neo.mjs operates on two distinct abstraction layers:

- **Component Tree Layer** (Application Development): Declarative, mutable, reactive component configurations
- **VDom Tree Layer** (Framework Internals): Imperative virtual DOM operations for performance optimization

```
Your Application Code → Component Tree (declarative, mutable, reactive)
                            ↓
                        VDom Tree (imperative, optimized)
                            ↓
                        Real DOM
```

## Mental Model Shift for Framework Migrants

### What You're Used To (React/Vue/Angular)

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

Your mental model:</br>
*"I write DOM structure and insert components as custom HTML tags."*

### The Neo.mjs Approach

In Neo.mjs, you work with **declarative component configurations** that create a component tree abstraction:

```javascript
// Neo.mjs pattern - component relationship configuration
class Viewport extends Container {
    static config = {
        cls  : ['viewport'],
        items: [{
            module: HeaderToolbar
        }, {
            module: Container,
            cls   : ['main-content'],
            items : [{
                module: CustomButton,
                text  : 'Click me'
            }, {
                module: DataGrid,
                data  : users
            }]
        }]
    }
}
```

Your new mental model:</br>
*"I configure a component tree abstraction that sits above the VDom layer. Components define their internal DOM via `vdom`."*

### Key Architectural Differences

| Aspect | Other Frameworks | Neo.mjs |
|---|---|---|
| **Layers** | Single virtual DOM layer | Two-tier: Component tree + VDom |
| **Composition** | Mix HTML + components directly in templates/JSX | Pure component hierarchies via `items` configs |
| **Property Definition** | Component props & DOM attributes often intermingled | Sharp separation, no accidental overriding of raw DOM attributes |
| **Updates** | Manual state management | Automatic reactive updates |
| **Mutability** | Recreate tree on changes | Runtime mutable component tree |

## Component Tree Layer (Application Development)

### Declarative Configuration

Components are defined through static configuration objects that describe relationships and behavior:

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

### Runtime Mutability

The component tree is **dynamic and mutable at runtime**:

```javascript
// Runtime mutations on the component tree
container.add({module: NewComponent});           // Add component
container.removeAt(0);                           // Remove component  
container.insert(1, {module: AnotherComponent}); // Insert component

// Move components between containers
// => This re-uses the same component JS instance & works accross different browser windows
let sourceView = sourceContainer.removeAt(0, false);
targetContainer.add(sourceView);
```

### Reactive Updates

**Every component tree configuration change automatically triggers UI updates**:

```javascript
// These changes automatically update the UI
button.text    = 'New Text';        // Property change → UI update
button.iconCls = 'fa fa-home';      // Config change → UI update
container.layout.activeIndex = 1;   // Layout change → UI update

// State changes automatically trigger UI updates
viewport.stateProvider.setData({size: 'large'});

// Shorthand Syntax
viewport.setState({size: 'large'}); // State change → UI update


```

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
viewportStateProvider.setData({size: 'large'});
```

## VDom Layer (Framework Internals)

### Internal VDom Structure

Framework components define their internal DOM structure through `vdom` config:

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

### Imperative VDom Operations

Framework code performs imperative operations on VDom node properties:

```javascript
// Neo.button.Base - internal framework code
afterSetIconCls(value, oldValue) {
    let {iconNode} = this;
    
    // Imperative class list manipulation
    NeoArray.remove(iconNode.cls, oldValue);
    NeoArray.add(iconNode.cls, value);
    iconNode.removeDom = !value;
    
    this.update(); // Trigger DOM reconciliation
}

afterSetText(value, oldValue) {
    let {textNode} = this;
    
    // Direct imperative manipulation
    textNode.removeDom = !value || value === '';
    if (value) {
        textNode.text = value;
    }
    
    this.update();
}
```

**Note**: While `this.update()` is not required for creating the initial VDom tree, it is **crucial** for runtime updates.

### Performance Optimizations

```javascript
// Neo.button.Base - optimized animations
async showRipple(data) {
    let rippleEl = this.rippleWrapper.cn[0];
    
    // Direct style manipulation for performance
    rippleEl.style = Object.assign(rippleEl.style || {}, {
        animation: 'none',
        height   : `${diameter}px`,
        left     : `${data.clientX - buttonRect.left - radius}px`,
        top      : `${data.clientY - buttonRect.top - radius}px`,
        width    : `${diameter}px`
    });

    // Asynchronous DOM updates
    delete this.rippleWrapper.removeDom;
    this.update();

    await this.timeout(1);

    rippleEl.style.animation = `ripple ${duration}ms linear`;
    this.update();
}
```

## Developer Experience Benefits

### What You Write vs. What the Framework Handles

Understanding the value proposition of Neo.mjs's two-tier architecture:

```javascript
// What developers write - declarative configurations
{
    module   : Button,
    text     : 'Click Me',
    iconCls  : 'fa fa-home',
    handler  : 'onButtonClick',
    badgeText: '5'
}

// What the framework automatically handles:
// ✓ VDom node creation and management
// ✓ Event binding and cleanup  
// ✓ DOM updates and reconciliation
// ✓ Performance optimizations via multi-threading
// ✓ Cross-worker communication
// ✓ Batched updates and efficient rendering
```

This separation allows developers to focus on **what** they want to build rather than **how** the DOM should be manipulated.

## Real-World Application Examples

### Navigation System Architecture

Routing happens inside view controllers, instead of being tag-based.
Developers are in full control to define what route-changes should do.

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

// Component tree manipulation
async setMainContentIndex(index) {
    let container = this.getReference('main-content');
    
    // Reactive layout changes
    if (this.mainContentLayout === 'cube') {
        container.layout = {
            ntype      : 'cube',
            activeIndex: index,
            fitContainer: true
        };
    }

    await this.timeout(200);
    container.layout.activeIndex = index; // Automatic UI update
}
```

### Responsive Design Handling

If needed, this can be done via JavaScript too (instead of purely focussing on CSS).

```javascript
// Portal.view.Viewport
static sizes = ['large', 'medium', 'small', 'x-small', null];

// Reactive size changes
afterSetSize(value, oldValue) {
    let cls = this.cls;
    
    // Component tree updates
    NeoArray.remove(cls, 'portal-size-' + oldValue);
    NeoArray.add(cls, 'portal-size-' + value);
    this.cls = cls; // Automatic UI update
    
    // State synchronization
    this.stateProvider.setData({size: value});
    this.controller.size = value;
}
```

### Dynamic Component Management

```javascript
// Portal.view.ViewportController
async onAppConnect(data) {
    let app = Neo.apps[data.appName];
    
    // Component tree mutations
    let sourceView = sourceContainer.removeAt(0, false);
    mainView.add(sourceView);

    // Reactive config updates
    tabContainer.activeIndex = 0;
    tabContainer.getTabAtIndex(1).disabled = true;
}
```

## When to Use Each Layer

### Use Component Tree Layer When (99% of development):

- Building application interfaces
- Defining component hierarchies through composition
- Managing application state and business logic
- Creating reusable UI patterns
- Implementing user interactions and workflows

### Use VDom Layer When (1% of development):

- Creating custom framework components
- Defining component internal DOM structure (`vdom`)
- Implementing component lifecycle methods (`afterSet*`, `beforeSet*`, `beforeGet*`)
- Optimizing rendering performance
- Building complex animations or effects

## Performance Benefits

### Component Tree Advantages:

- **Predictable Performance**: Framework handles optimizations automatically
- **Automatic Batching**: Updates are batched and optimized
- **Memory Efficiency**: Shared component instances and configs
- **Worker Threading**: Non-blocking UI operations

### VDom Layer Advantages:

- **Fine-Grained Control**: Direct VDom node manipulation when needed
- **Custom Optimizations**: Tailored performance strategies
- **Minimal Overhead**: Direct property access and updates
- **Animation Control**: Precise timing and effects

## Best Practices

### For Application Development:

1. **Favor Component Tree**: Use `items` configurations over VDom manipulation
2. **Leverage Reactivity**: Trust automatic UI updates from config changes
3. **Use State Providers**: Manage application state reactively
4. **Component References**: Use `reference` for component communication

### For Framework Development:

1. **Encapsulate Complexity**: Hide imperative operations behind declarative APIs
2. **Optimize VDom Updates**: Batch changes and use `update()` efficiently
3. **Memory Management**: Clean up event listeners and references
4. **Worker Communication**: Minimize cross-worker message passing

## Migration from Other Frameworks

### Key Mental Shifts:

- **From**: Direct DOM/Virtual DOM manipulation
- **To**: Component tree configuration and reactive updates
</br></br>
- **From**: Manual state management and re-rendering
- **To**: Automatic reactivity and UI synchronization
</br></br>
- **From**: Mixing HTML structure with components
- **To**: Pure component hierarchies via `items`

### Integration Patterns:

```javascript
// Wrapping existing components or custom elements
{
    module: LegacyWrapper,
    items: [{
        ntype: 'component', // Default value, only added for clarity
        tag  : 'legacy-widget',                   // Custom element - SECURE
    //  html : '<legacy-widget></legacy-widget>', // AVOID - XSS risk
        domListeners: {
            'legacy-event': 'onLegacyEvent'
        }
    }]
}
```

> **Security Note**: Using `tag` instead of `html` is crucial for preventing Cross-Site Scripting (XSS) vulnerabilities by avoiding raw HTML injection for element creation.

### Framework-Specific Migration Notes:

- **From React**: Component configs replace JSX, `items` replaces children composition, reactive updates replace manual state management
- **From Vue**: Component configs replace templates, reactive properties work similarly but with automatic UI updates,
  no need for explicit watchers or computed properties for simple cases.
- **From Angular**: More explicit separation between component hierarchy (items) and internal template structure (vdom),
  no need for complex template syntax or change detection strategies.

## Advanced Topics

### Custom Component Development

```javascript
import Component from './src/component/Base.mjs';
import VdomUtil  from './src/util/Vdom.mjs';

class CustomComponent extends Component {
    static config = {
        // Component tree configuration
        customProperty_: null,

        // VDom structure definition
        vdom: {
            tag: 'div', // Default value, only added for clarity
            cn: [
                {tag: 'header', flag: 'headerNode'},
                {tag: 'main',   flag: 'contentNode'}
            ]
        }
    }
    
    // VDom layer manipulation using VdomUtil
    afterSetCustomProperty(value, oldValue) {
        let headerNode = VdomUtil.getByFlag(this, 'headerNode');
        headerNode.text = value;
        this.update(); // Trigger DOM reconciliation
    }
}
```

Neo.mjs provides utilities such as `VdomUtil` for direct interaction with VDom nodes within a component's lifecycle methods.

### Performance Monitoring

```javascript
Neo.config.logDeltaUpdates = true;  // Enable update timing logs
```

## Conclusion

Neo.mjs's two-tier architecture successfully balances developer productivity with framework performance through:

- **Clear Abstraction Layers**: Component tree for apps, VDom for framework optimization
- **Multi-Threading Architecture**: Optimal resource utilization across worker threads
- **Reactive Component Tree**: Automatic UI synchronization with configuration changes
- **Runtime Mutability**: Dynamic component tree modifications without recreation
- **Performance Optimization**: Framework-level imperative optimizations when needed

This architecture enables developers to build complex, performant web applications while focusing on business logic rather
than DOM manipulation details. Understanding the distinction between these layers is crucial for effectively leveraging
Neo.mjs's capabilities and building maintainable, scalable applications.
