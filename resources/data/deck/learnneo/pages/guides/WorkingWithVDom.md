## A Comprehensive Guide to Custom Component Development

**Target Audience**: Developers building custom Neo.mjs components who need to work directly with the VDom layer for performance optimization, complex animations, or advanced UI patterns.

**Prerequisites**: Understanding of Neo.mjs's two-tier architecture (Component Tree vs VDom). Read the "Declarative Component Trees vs Imperative VDom" guide first.

## Overview

While 99% of Neo.mjs development happens at the Component Tree layer, creating custom components requires working with the VDom layer. This guide covers the patterns, best practices, and techniques for effective VDom manipulation in Neo.mjs.

## VDom Fundamentals

### VDom Structure

Neo.mjs VDom nodes are plain JavaScript objects that represent DOM elements.
**Important**: VDom only contains structure, styling, content, and attributes - **never event listeners**.

```javascript
// Basic VDom node structure
{
    tag      : 'div',                // HTML tag (default: 'div')
    id       : 'unique-id',          // DOM element ID
    cls      : ['class1', 'class2'], // CSS classes array
    style    : {color: 'red'},       // Inline CSS object
    html     : 'Text content',       // Inner HTML (exclusive with text/cn)
    text     : 'Text content',       // Plain text content (exclusive with html/cn)
    cn       : [],                   // Child nodes array (exclusive with html/text)
    vtype    : 'vnode',              // VNode type: 'vnode', 'text', 'root'
    static   : false,                // Exclude from delta updates (optimization)
    removeDom: false,                // Hide/show element
    data     : {custom: 'value'},    // data-* attributes
    // Standard HTML attributes
    disabled: true,
    tabIndex: -1,
    role    : 'button'
    // ❌ NO EVENT LISTENERS IN VDOM
}
```

### Component VDom Definition

Components define their internal DOM structure via the `vdom` config:

```javascript
import Component from './src/component/Base.mjs';

class CustomButton extends Component {
    static config = {
        className: 'Neo.custom.Button',
        ntype    : 'custom-button',

        // Define internal DOM structure for this component
        vdom:
        {cls: ['neo-button', 'neo-custom-button'], cn: [
            {tag: 'span', cls: ['neo-button-icon'], flag: 'iconNode'}, // Flag for easy access
            {tag: 'span', cls: ['neo-button-text'], flag: 'textNode'},
            {cls: ['neo-button-badge'], flag: 'badgeNode', removeDom: true} // Initially hidden badge
        ]},

        // DOM event listeners are defined in static config, not VDom
        domListeners: [{
            click: 'onButtonClick'
        }]
    }

    onButtonClick(data) {
        console.log('CustomButton clicked:', data);
    }
}
```

---

## Connecting VDom to User Interaction (DOM Events)

While VDom nodes define the visual structure and attributes of your components, they do **not** contain event listeners. Neo.mjs uses a robust, delegated global DOM event system where listeners are defined separately within your component's `domListeners` static config.

This clear separation ensures that your VDom markup remains easily serializable and performant across worker threads, while still providing flexible and powerful event handling.

For a comprehensive deep dive into all aspects of DOM event handling in Neo.mjs (including static, programmatic, string-based handlers, delegation, bubbling, and more), please refer to the dedicated **[DOM Event Handling Guide](guides.events.DomEvents)**.

Here's a simple example of how an event handler defined via `domListeners` would interact with a component's VDom:

```javascript
import Component from './src/component/Base.mjs';
import VdomUtil  from './src/util/Vdom.mjs'; // For accessing VDom nodes by flag

class InteractiveComponent extends Component {
    static config = {
        className: 'Neo.examples.InteractiveComponent',

        vdom: {
            cls: ['neo-interactive-box'],
            cn: [
                {tag: 'button', text: 'Click Me', cls: ['neo-button'], flag: 'myButton'},
                {tag: 'div', text: 'Hover over me', cls: ['hoverable-area'], flag: 'hoverArea'}
            ]
        },

        domListeners: [{
            click   : 'onButtonClick',
            delegate: '.neo-button' // Event delegated to elements with this class
        }, {
            mouseenter: 'onHoverAreaEnter',
            mouseleave: 'onHoverAreaLeave',
            delegate  : '.hoverable-area'
        }]
    }

    // Access VDom nodes using VdomUtil (or flags in afterSet methods)
    get myButton() {
        return VdomUtil.getByFlag(this, 'myButton');
    }

    get hoverArea() {
        return VdomUtil.getByFlag(this, 'hoverArea');
    }

    onButtonClick(data) {
        console.log('Button clicked:', data.component.id);
        // Imperatively modify VDom properties in response to event
        this.myButton.text = 'Clicked!';
        this.myButton.disabled = true;
        this.update(); // Trigger VDom reconciliation
    }

    onHoverAreaEnter(data) {
        this.hoverArea.style = {backgroundColor: '#f0f0f0'};
        this.update();
    }

    onHoverAreaLeave(data) {
        this.hoverArea.style = {}; // Reset style
        this.update();
    }
}
```

---

## VDom Update Mechanisms

### Standard Approach: `this.update()`

The typical way to sync VDom changes to the DOM is through the component's `update()` method:

```javascript
import Component from './src/component/Base.mjs'; // Required import

class StandardComponent extends Component {
    // Assuming these flags point to VDom nodes within this component's vdom config
    get textNode() { return VdomUtil.getByFlag(this, 'myTextNode'); }
    get iconNode() { return VdomUtil.getByFlag(this, 'myIconNode'); }

    changeContent() {
        // Modify VDom structure (properties of VDom nodes accessed via flags or direct object mutation)
        this.textNode.text = 'New content';
        this.iconNode.cls = ['fa', 'fa-star'];

        // Send component's VDom to VDom worker via engine
        this.update() // Engine calculates what changed
    }
}
```

**How `this.update()` works:**
1.  Sends the component's entire VDom tree to the VDom worker.
2.  VDom worker compares with previous state (diffing).
3.  Worker calculates minimal deltas needed.
4.  Deltas are sent to Main thread for efficient DOM updates.

**Use `this.update()` when:**
* Making standard component updates.
* You want the framework's VDom engine to handle diffing automatically.
* Working with complex VDom structures where manual delta calculation would be error-prone.
* This covers ~95% of VDom manipulation use cases.

### Advanced Approach: `Neo.applyDeltas()`

For performance-critical scenarios, you can bypass the VDom worker's diffing engine and send manually crafted deltas
directly from the App Worker to the Main Thread. This offers precise control but requires careful manual delta construction.

```javascript
import Component from './src/component/Base.mjs'; // Required import

class AdvancedComponent extends Component {
  // Assume getItemId method exists to get the VDom ID of an element
  // within the component's vdom structure.

  optimizedUpdate() {
    let me = this;
    // Manually craft precise deltas. Each delta targets a VDom node by its ID.
    const deltas = [{
      id   : me.getItemId('my-item-id-1'), // Unique VDom ID of the target element
      style: {opacity: 0.5, backgroundColor: 'blue'}
    }, {
      id : me.getItemId('my-item-id-2'),
      cls: {add: ['highlight'], remove: ['normal']}
    }, {
      id  : me.getItemId('my-text-node-id'),
      text: 'Updated text via direct delta'
    }];

    // Apply deltas directly to the Main Thread.
    // This bypasses the VDom worker's diffing process and worker roundtrip.
    Neo.applyDeltas(me.appName, deltas)
  }
}
```

**How `Neo.applyDeltas()` works:**
1.  You explicitly construct an array of delta objects (e.g., specific changes to style, classes, or text for targeted VDom nodes).
2.  These pre-calculated deltas are sent directly from the App Worker to the Main Thread.
3.  The Main Thread immediately applies these changes to the DOM, without any prior diffing or processing by the VDom worker.

**When to use `Neo.applyDeltas()` (Primary use cases):**
* **Extreme Transient Animations**: For highly frequent, localized visual updates (e.g., continuous animations of 300-600 items' transforms, reaching ~40,000 real DOM updates per second via mousewheel events). Here, the benefit of bypassing diffing and worker roundtrips is paramount.
* **Buffered Rendering / Virtualized Lists**: For scenarios like virtualized lists or data grids where elements are precisely manipulated (e.g., `shift`/`unshift` operations to recycle DOM nodes). This allows you to generate a single `move` delta directly, completely avoiding the overhead of full tree parsing and worker roundtrips that the standard VDom diffing process would incur.
* **Precise Control**: When you have full knowledge of the exact DOM changes needed and require ultimate control over the update timing.

**Important Limitations and Considerations:**
* **State Desynchronization (Critical)**: `Neo.applyDeltas()` modifies the DOM but **does not** automatically update the
  component's internal VDom (`this.vdom`, your desired state) or the framework's cached `VNode` state (`this.vnode`, the
  last state known by the VDom engine).
  * If these internal states are not manually synchronized, subsequent standard `this.update()` calls will compare against
    stale data, leading to **redundant, incorrect, or "undoing" deltas** being sent to the Main Thread.
* **Manual Synchronization for Persistent Changes (Highly Complex)**: For persistent UI changes that must remain synchronized,
  manually updating both `this.vdom` (to reflect the new visual state) and `this.vnode` (to match the exact state after
  `Neo.applyDeltas()`) is required. This low-level `VNode` manipulation is generally considered a **framework-internal task**
  dueled to its complexity and the specific `Neo.vdom.VNode` class structure. It is **not typically recommended for
  application developers** for general UI management.
* **No Automatic Diffing**: You are entirely responsible for calculating the precise deltas. Errors in delta calculation
  will lead to incorrect or unexpected DOM behavior.

---

## VDom Manipulation Patterns

### 1. Using Flag-Based References

Flags provide efficient, direct access to specific VDom nodes within a component's `vdom` structure, avoiding the need for DOM queries.

```javascript
import Component from './src/component/Base.mjs';
import VdomUtil  from './src/util/Vdom.mjs'; // Required import for VdomUtil
import NeoArray  from './src/util/Array.mjs'; // Required import for NeoArray

class IconButton extends Component {
    static config = {
    vdom:
    {cls: ['neo-icon-button'], cn: [
        {tag: 'i',    cls: ['neo-icon'], flag: 'iconNode'},
        {tag: 'span', cls: ['neo-text'], flag: 'textNode'}
    ]},

        // domListeners are included here for context, but their detailed explanation is in the dedicated guide.
        domListeners: [{
            click: 'onClick'
        }]
    }

    // Define getters for easy access to flagged VDom nodes
    get iconNode() {
        return VdomUtil.getByFlag(this, 'iconNode');
    }

    get textNode() {
        return VdomUtil.getByFlag(this, 'textNode');
    }

    // Manipulate VDom nodes in response to config changes
    afterSetIconCls(value, oldValue) {
        let {iconNode} = this;

        // Update CSS classes imperatively
        NeoArray.remove(iconNode.cls, oldValue);
        NeoArray.add(iconNode.cls, value);

        // Hide/show icon based on value
        iconNode.removeDom = !value;

        this.update();
    }

    afterSetText(value, oldValue) {
        let {textNode} = this;

        textNode.text = value;
        textNode.removeDom = !value;

        this.update();
    }

    onClick(data) {
        this.fire('buttonClick', {
            iconCls: this.iconCls,
            text   : this.text
        });
    }
}
```

### 2. Dynamic VDom Creation (List Rendering)

Build VDom structures programmatically, often in response to data changes. This is common for lists or complex, data-driven UI fragments.

```javascript
import Component from './src/component/Base.mjs'; // Required import

class DataList extends Component {
    static config = {
        data: null, // Reactive config to hold list data

        vdom: {
            cls: ['neo-data-list'],
            cn : [] // Will be populated dynamically by createListItems
        },

        // domListeners are included for context
        domListeners: [
            { click: 'onItemClick',   delegate: '.neo-list-item' },
            { click: 'onAvatarClick', delegate: '.neo-avatar' }
        ]
    }

    // Create VDom items from component's data config
    createListItems() {
        let {data, vdom} = this,
            items = [];

        // Ensure data exists before mapping
        if (Array.isArray(data)) {
            data.forEach((record) => {
                items.push({
                    cls: ['neo-list-item'],
                    data: {recordId: record.id}, // Use data attributes for event identification
                    cn: [{
                        tag: 'img',
                        src: record.avatar,
                        cls: ['neo-avatar']
                    }, {
                        cls: ['neo-content'],
                        cn: [
                            {tag: 'h3', text: record.name},
                            {tag: 'p', text: record.description}
                        ]
                    }]
                })
            })
        }

        vdom.cn = items; // Assign new VDom children
        this.update();   // Trigger VDom reconciliation
    }

    // Automatically re-render list when 'data' config changes
    afterSetData(value, oldValue) {
        if (value) { // Only create items if data is set
            this.createListItems();
        }
    }

    onItemClick(data) {
        let recordId = data.target.closest('.neo-list-item')?.dataset.recordId; // Use optional chaining for safety
        if (recordId) {
            this.fire('itemSelect', {recordId});
        }
    }

    onAvatarClick(data) {
        let recordId = data.target.closest('.neo-list-item')?.dataset.recordId; // Use optional chaining
        if (recordId) {
            this.fire('avatarClick', {recordId});
        }
    }
}
```

### 3. Complex VDom Transformations (e.g., 3D Animations)

For sophisticated UI patterns like 3D visualizations or complex dynamic layouts, you might imperatively calculate and apply VDom properties or even use `Neo.applyDeltas()` for maximum performance.

```javascript
import Component from './src/component/Base.mjs'; // Base component class

class Helix extends Component {
    /**
     * This method demonstrates complex VDom transformations by
     * programmatically building VDom deltas and applying them directly
     * using `Neo.applyDeltas()`.
     *
     * In a real application, the values for 'items', 'rotationAngle', etc.,
     * would typically come from component configs, a store, or user interaction
     * (e.g., via event handlers, which are covered in a separate guide).
     */
    transformHelixItems() {
        let me = this;
        let deltas = [];

        // --- Simulate input data and transformation parameters for the example ---
        const simulatedItems = [
            { id: 'itemA', name: 'Helix Item 1' },
            { id: 'itemB', name: 'Helix Item 2' },
            { id: 'itemC', name: 'Helix Item 3' },
            { id: 'itemD', name: 'Helix Item 4' },
            { id: 'itemE', name: 'Helix Item 5' }
        ];
        const baseRotation = 0; // Degrees
        const itemAngleIncrement = 72; // Degrees per item (360 / 5 items)
        const helixRadius = 150; // Pixels
        const verticalSpacing = 40; // Pixels per item

        // --- Core VDom Delta Calculation Loop ---
        for (let i = 0; i < simulatedItems.length; i++) {
            let item = simulatedItems[i];
            let currentAngle = baseRotation + i * itemAngleIncrement; // Angle for this item

            // Basic 3D-like position calculation for CSS `transform`
            let x = helixRadius * Math.sin(currentAngle * Math.PI / 180);
            let y = i * verticalSpacing; // Stack vertically
            let z = helixRadius * Math.cos(currentAngle * Math.PI / 180); // For depth effect

            // Construct the CSS 3D transform string
            let transformStyle = `translate3d(${x}px, ${y}px, ${z}px) rotateY(${currentAngle}deg)`;

            // Calculate opacity based on depth (cosine of angle)
            let opacity = (Math.cos(currentAngle * Math.PI / 180) + 1) / 2;

            // Push a delta object for this specific VDom node.
            // The 'id' here must correspond to the actual VDom node's ID in the Main Thread.
            // This example assumes VDom nodes for helix items already exist or will be created
            // by a separate render cycle; 'Neo.applyDeltas' is for *updating* existing nodes.
            deltas.push({
                id   : `${me.id}-helix-element-${item.id}`, // Example ID convention
                style: { opacity: opacity, transform: transformStyle },
                text : item.name // Example: update text content
            })
        }

        // --- ADVANCED: Directly apply calculated deltas to the DOM ---
        // This bypasses the VDom worker's diffing engine, sending changes
        // directly from the App Worker to the Main Thread for immediate application.
        // It's used for scenarios requiring extreme performance or precise control.
        Neo.applyDeltas(me.appName, deltas); // 'Neo' is globally available
    }
}
```

---

## Security Considerations

### XSS Prevention

```javascript
import Component from './src/component/Base.mjs'; // Required import
// import DOMPurify from 'dompurify'; // Example for external sanitization library

class SecureComponent extends Component {
// SECURE: Use text property for user-provided string content
setContent(userInput) {
this.textNode.text = userInput; // Automatically HTML-escaped by the framework
this.update();
}

    // SECURE: Use 'tag' property for creating elements with custom names
    createElement(tagName) {
        return {
            tag: tagName,  // Safe element creation: tagName is treated as a literal tag name
            cls: ['user-element']
        };
    }

    // AVOID: Direct HTML injection using 'html' property without sanitization
    unsafeSetContent(userInput) {
        // This example shows a VDom node named 'containerNode' within the component's vdom.
        // It directly sets innerHTML, which is a high XSS risk if 'userInput' is not sanitized.
        this.containerNode.html = userInput; // XSS risk if userInput is untrusted!
        this.update(); // Don't forget to update!
    }

    // SECURE: Validate and sanitize if HTML content is absolutely needed
    setSafeHtml(content) {
        // If an external library like DOMPurify is used, ensure it's imported and available.
        // For simplicity, this example just shows the call.
        // let sanitized = DOMPurify.sanitize(content);
        // this.containerNode.html = sanitized;
        // this.update();
        console.warn('DOMPurify or similar sanitization library should be used here for user-provided HTML.');
        this.containerNode.html = content; // Still unsafe without actual sanitization
        this.update();
    }
}
```

---

## Performance Best Practices

### 1. Batch VDom Updates

```javascript
import Component from './src/component/Base.mjs'; // Required import
import Neo from './src/Neo.mjs'; // Required import for Neo.applyDeltas

class PerformantComponent extends Component {
// Assume getItemNode and getItemId methods exist to access VDom nodes/IDs

    // BAD: Multiple individual updates
    updateItemsBad(items) {
        items.forEach(item => {
            let node = this.getItemNode(item.id); // Get VDom node
            if (node) { // Ensure node exists
                node.text = item.name;
            }
            this.update(); // Too many VDom worker round-trips!
        });
    }

    // GOOD: Single engine update with all changes
    updateItemsGood(items) {
        items.forEach(item => {
            let node = this.getItemNode(item.id); // Get VDom node
            if (node) {
                node.text = item.name;
            }
        });

        this.update(); // Single VDom diff operation, more efficient
    }

    // ADVANCED: Bypass engine entirely with manual deltas
    updateItemsAdvanced(items) {
        let deltas = [];

        items.forEach(item => {
            deltas.push({
                id: this.getItemId(item.id), // Get VDom node ID
                text: item.name
            });
        });

        Neo.applyDeltas(this.appName, deltas); // Directly send pre-calculated deltas to Main Thread
    }
}
```

### 2. Efficient Event Delegation

```javascript
import Component from './src/component/Base.mjs'; // Required import

class EfficientEventComponent extends Component {
construct(config) {
super.construct(config);

        // Single delegated listener handles multiple item types
        this.addDomListeners({
            click: this.onItemInteraction,
            delegate: '.interactive-item',
            scope: this
        });
    }

    onItemInteraction(data) {
        // data.target is a proxy for the DOM element, allowing direct DOM-like calls
        let element = data.target.closest('.interactive-item');
        if (!element) { return; } // Safety check

        let itemType = element.dataset.itemType;
        let itemId = element.dataset.itemId;

        // Route based on item type
        switch (itemType) {
            case 'button':
                this.handleButtonClick(itemId, data);
                break;
            case 'card':
                this.handleCardClick(itemId, data);
                break;
            case 'menu-item':
                this.handleMenuClick(itemId, data);
                break;
            default:
                console.warn('Unknown interactive item type:', itemType);
        }
    }

    // Example handlers
    handleButtonClick(itemId, data) { console.log('Button clicked:', itemId); }
    handleCardClick(itemId, data) { console.log('Card clicked:', itemId); }
    handleMenuClick(itemId, data) { console.log('Menu item clicked:', itemId); }
}
```

### 3. Memory Management

```javascript
import Component from './src/component/Base.mjs'; // Required import

class MemoryEfficientComponent extends Component {
    destroy(...args) {
        // Clean up internal VDom-related references if they are not automatically managed
        this._cachedNodes = null;

        // Clear any pending timeouts or intervals to prevent leaks
        this.transitionTimeouts?.forEach(clearTimeout);
        this.transitionTimeouts = null;

        // Call super.destroy() last
        super.destroy(...args);
    }

    // Avoid memory leaks in event handlers by binding scope correctly or using fat arrows
    createEventHandler(itemId) {
        // GOOD: Minimal closure scope, 'this' context handled by 'bind'
        // This is often for passing handlers to other parts of the app, not for domListeners config
        return this.processItem.bind(this, itemId);
    }

    processItem(itemId) {
        console.log('Processing item:', itemId);
    }
}
```

---

## Common VDom Patterns

### 1. Conditional Rendering

Dynamically show or hide VDom nodes by setting their `removeDom` property. This is efficient as the VDom node remains in the tree, but its corresponding DOM element is removed/added from the document flow by the framework.

```javascript
import Component from './src/component/Base.mjs'; // Required import
import VdomUtil  from './src/util/Vdom.mjs'; // Required import

class ConditionalComponent extends Component {
    static config = {
        vdom:
        {cn: [
            {tag: 'div', flag: 'contentNode', text: 'Main Content'},
            {tag: 'div', flag: 'loadingNode', text: 'Loading...', removeDom: true} // Initially hidden
        ]}
    }

    // Access VDom nodes by flag
    get contentNode() { return VdomUtil.getByFlag(this, 'contentNode'); }
    get loadingNode() { return VdomUtil.getByFlag(this, 'loadingNode'); }

    toggleVisibility(nodeFlag, visible) {
        let node = VdomUtil.getByFlag(this, nodeFlag);
        node.removeDom = !visible; // true to hide, false to show
        this.update(); // STANDARD: Let engine handle the DOM update
    }

    showLoadingState() {
        this.contentNode.removeDom = true;
        this.loadingNode.removeDom = false;
        this.update(); // STANDARD: Single engine update for multiple changes
    }

    showContent() {
        this.contentNode.removeDom = false;
        this.loadingNode.removeDom = true;
        this.update(); // STANDARD: Single engine update
    }
}
```

### 2. List Rendering (Dynamic Children)

Programmatically create and update lists of VDom nodes, typically from data. This approach is highly efficient as the VDom diffing engine optimizes the DOM updates.

```javascript
import Component from './src/component/Base.mjs'; // Required import

class ListComponent extends Component {
    static config = {
        data: [], // Example: config to hold the list data
      
        vdom: {
            cls: ['neo-list'],
            cn: [] // This array will be populated with VDom nodes dynamically
        },

        domListeners: [{
            click   : 'onDeleteItem',
            delegate: '.delete-button' // Delegate click to delete buttons
        }]
    }

    // Access the VDom node where list items will be rendered
    get listNode() {
        // Assuming the component's root VDom is the list container
        return this.vdom; // Or VdomUtil.getByFlag(this, 'listContainer') if you have a flag
    }

    // Method to generate VDom nodes from an array of data
    renderItems(items) {
        let listItems = items.map(item => ({
            cls: ['list-item'],
            data: {itemId: item.id}, // Use data attributes for identifying the item
            cn: [
                {tag: 'span',   text: item.name},
                {tag: 'button', text: 'Delete', cls: ['delete-button'], data: {itemId: item.id}} // Pass itemId to button
            ]
        }));

        this.listNode.cn = listItems; // Assign new array of VDom children
        this.update();               // Trigger VDom reconciliation
    }

    // Example handler for the delegated delete button click
    onDeleteItem(data) {
        let itemId = data.target.dataset.itemId; // Get itemId from the clicked button's data attribute
        console.log('Delete item:', itemId);
        this.fire('deleteItem', {itemId}); // Fire a component-level event
    }

    // Example: Trigger list rendering when 'data' config changes
    afterSetData(value, oldValue) {
        if (value) {
            this.renderItems(value);
        }
    }
}
```

---

## Conclusion

Working with VDom in Neo.mjs provides fine-grained control over DOM manipulation while maintaining the framework's performance benefits. Key takeaways:

* **Separate Concerns**: VDom defines structure/attributes, `domListeners` handle events.
* **Use flags for node references**: More efficient than querying the real DOM.
* **Batch VDom updates**: Minimize DOM operations with `this.update()` or `Neo.applyDeltas()`.
* **Leverage `this.update()`**: Essential for VDom-to-DOM synchronization, letting the framework optimize diffing.
* **`Neo.applyDeltas()` for advanced cases**: Bypass diffing for extreme performance needs.
* **Follow security best practices**: Use `text` over `html` (unless sanitized), use `tag` for safe element creation.
* **Optimize for performance**: Batch updates, use efficient delegation, manage memory.
* **Test thoroughly**: VDom logic benefits from comprehensive testing due to its low-level nature.

The VDom layer is where Neo.mjs's performance optimizations happen, and understanding these patterns enables you to build sophisticated, high-performance custom components that integrate seamlessly with the framework's architecture.

Remember: Most development should happen at the Component Tree layer. Only drop down to VDom manipulation when you need the additional control and performance optimization it provides.
