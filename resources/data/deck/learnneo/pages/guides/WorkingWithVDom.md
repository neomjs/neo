# Working with VDom
## A Comprehensive Guide to Custom Component Development

**Target Audience**: Developers building custom Neo.mjs components who need to work directly with the VDom layer for performance optimization, complex animations, or advanced UI patterns.

**Prerequisites**: Understanding of Neo.mjs's two-tier architecture (Component Tree vs VDom). Read the "Declarative Component Trees vs Imperative VDom" guide first.

## Overview

While 99% of Neo.mjs development happens at the Component Tree layer, creating custom components requires working with the VDom layer. This guide covers the patterns, best practices, and techniques for effective VDom manipulation in Neo.mjs.

## VDom Fundamentals

### VDom Structure

Neo.mjs VDom nodes are plain JavaScript objects that represent DOM elements:

```javascript
// Basic VDom node structure
{
    tag     : 'div',           // HTML tag (default: 'div')
    id      : 'unique-id',     // DOM element ID
    cls     : ['class1', 'class2'], // CSS classes array
    style   : {color: 'red'},  // Inline styles object
    html    : 'Text content',  // Inner HTML
    text    : 'Text content',  // Text content (safer than html)
    cn      : [],              // Child nodes array
    flag    : 'headerNode',    // Reference flag for VdomUtil
    removeDom: false,          // Hide/show element
    // DOM attributes
    disabled: true,
    tabIndex: -1,
    // Event listeners
    onclick : 'onButtonClick'
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
        
        // Define internal DOM structure
        vdom: {
            cls: ['neo-button', 'neo-custom-button'],
            cn: [
                {tag: 'span', cls: ['neo-button-icon'], flag: 'iconNode'},
                {tag: 'span', cls: ['neo-button-text'], flag: 'textNode'},
                {cls: ['neo-button-badge'], flag: 'badgeNode', removeDom: true}
            ]
        }
    }
}
```

## VDom Update Mechanisms

### Standard Approach: `this.update()`

The typical way to sync VDom changes to the DOM is through the component's `update()` method:

```javascript
class StandardComponent extends Component {
    changeContent() {
        // Modify VDom structure
        this.textNode.text = 'New content';
        this.iconNode.cls = ['fa', 'fa-star'];
        
        // Send entire VDom to VDom worker via engine
        this.update(); // Engine calculates what changed
    }
}
```

**How `this.update()` works:**
1. Sends the component's entire VDom tree to the VDom worker
2. VDom worker compares with previous state (diffing)
3. Worker calculates minimal deltas needed
4. Deltas are sent to Main thread for DOM updates

**Use `this.update()` when:**
- Making standard component updates
- You want the engine to handle diffing automatically
- Working with complex VDom structures where manual delta calculation would be error-prone
- This covers 95% of use cases

### Advanced Approach: `Neo.applyDeltas()`

For performance-critical scenarios, you can bypass the engine and send manually crafted deltas directly:

```javascript
class AdvancedComponent extends Component {
    optimizedUpdate() {
        // Manually craft precise deltas
        let deltas = [
            {
                id: this.getItemId('item-1'),
                style: {opacity: 0.5}
            },
            {
                id: this.getItemId('item-2'), 
                cls: {add: ['active'], remove: ['inactive']}
            },
            {
                id: this.textNodeId,
                text: 'Updated text'
            }
        ];
        
        // Send deltas directly from App worker to Main
        Neo.applyDeltas(this.appName, deltas);
    }
}
```

**How `Neo.applyDeltas()` works:**
1. You manually create an array of delta objects
2. Deltas are sent directly from App worker to Main thread
3. Bypasses VDom worker entirely - no diffing, no engine processing
4. Main thread applies deltas directly to DOM

**Use `Neo.applyDeltas()` when:**
- You know exactly what DOM changes are needed
- Performance is critical (animations, high-frequency updates)
- Working with large datasets where diffing would be expensive
- You need precise control over DOM update timing

## VDom Manipulation Patterns

### 1. Using Flag-Based References

Flags provide efficient access to VDom nodes without DOM queries:

```javascript
import VdomUtil from './src/util/Vdom.mjs';

class IconButton extends Component {
    static config = {
        vdom: {
            cls: ['neo-icon-button'],
            cn: [
                {tag: 'i', cls: ['neo-icon'], flag: 'iconNode'},
                {tag: 'span', cls: ['neo-text'], flag: 'textNode'}
            ]
        }
    }

    // Access nodes via flags
    get iconNode() {
        return VdomUtil.getByFlag(this, 'iconNode')
    }

    get textNode() {
        return VdomUtil.getByFlag(this, 'textNode')
    }

    // Manipulate VDom nodes
    afterSetIconCls(value, oldValue) {
        let {iconNode} = this;
        
        // Update CSS classes
        NeoArray.remove(iconNode.cls, oldValue);
        NeoArray.add(iconNode.cls, value);
        
        // Hide/show based on value
        iconNode.removeDom = !value;
        
        // STANDARD: Let engine handle the diffing
        this.update();
    }

    afterSetText(value, oldValue) {
        let {textNode} = this;
        
        textNode.text = value;
        textNode.removeDom = !value;
        
        // STANDARD: Let engine calculate deltas
        this.update();
    }
}
```

### 2. Dynamic VDom Creation

Build VDom structures programmatically:

```javascript
class DataList extends Component {
    static config = {
        vdom: {
            cls: ['neo-data-list'],
            cn: [] // Will be populated dynamically
        }
    }

    // Create VDom items from data
    createListItems() {
        let {data, vdom} = this,
            items = [];

        data.forEach((record, index) => {
            items.push({
                cls: ['neo-list-item'],
                cn: [
                    {
                        tag: 'img',
                        src: record.avatar,
                        cls: ['neo-avatar']
                    },
                    {
                        cls: ['neo-content'],
                        cn: [
                            {tag: 'h3', text: record.name},
                            {tag: 'p', text: record.description}
                        ]
                    }
                ]
            });
        });

        // STANDARD: Engine handles VDom diffing
        vdom.cn = items;
        this.update();
    }

    afterSetData(value, oldValue) {
        value && this.createListItems();
    }
}
```

### 3. Complex VDom Transformations

For sophisticated UI patterns, combine multiple VDom operations:

```javascript
// From the Helix component example
class Helix extends Component {
    refresh() {
        let me = this,
            deltas = [],
            {deltaY, flipped, itemAngle, matrix, radius, rotationAngle, 
             rotationMatrix, translateX, translateY, translateZ} = me,
            len = Math.min(me.maxItems, me.store.getCount());

        // Calculate transforms for each item
        for (let index = 0; index < len; index++) {
            let item = me.store.items[index],
                angle = -rotationAngle + index * itemAngle;

            // 3D mathematics for positioning
            let s = Math.sin(angle * Math.PI / 180),
                c = Math.cos(angle * Math.PI / 180),
                x = -300 + radius * s + translateX,
                y = -400 + angle * deltaY + translateY,
                z = 99800 + radius * c + translateZ;

            // Build transformation matrix
            matrix.items = [
                [c, 0, -s, 0],
                [0, 1,  0, 0],
                [s, 0,  c, 0],
                [x, y,  z, 1]
            ];

            let transformStyle = matrix.getTransformStyle(),
                opacity = me.calculateOpacity(item);

            // Batch DOM updates
            deltas.push({
                id: me.getItemVnodeId(item[me.keyProperty]),
                style: { opacity, transform: transformStyle }
            });
        }

        // ADVANCED: Bypass engine with precise deltas
        Neo.applyDeltas(me.appName, deltas);
    }
}
```

## Advanced VDom Techniques

### 1. VDom Node Lifecycle Management

```javascript
class ExpandableCard extends Component {
    expandItem(itemId) {
        let me = this,
            {appName, store} = me,
            record = store.get(itemId),
            itemVdom = Neo.clone(me.getItemVdom(itemId), true);

        // Modify cloned VDom
        itemVdom.id = itemVdom.id + '__expanded';
        NeoArray.add(itemVdom.cls, 'neo-expanded');
        
        // Add expansion content
        itemVdom.cn.push({
            cls: ['neo-expansion-panel'],
            cn: [
                {tag: 'h3', text: record.title},
                {tag: 'p', text: record.description}
            ]
        });

        // Create new DOM node
        Neo.vdom.Helper.create({
            appName,
            autoMount: true,
            parentId: me.getContainerId(),
            vdom: itemVdom
        }).then(() => {
            // Animate expansion
            me.timeout(50).then(() => {
                // ADVANCED: Direct delta application bypasses VDom worker
                Neo.applyDeltas(appName, {
                    id: itemVdom.id,
                    cls: {add: ['neo-animate-in']}
                });
            });
        });
    }

    collapseItem(itemId) {
        let expandedId = itemId + '__expanded';
        
        // ADVANCED: Manual delta for precise control
        Neo.applyDeltas(this.appName, {
            id: expandedId,
            cls: {add: ['neo-animate-out']}
        }).then(() => {
            this.timeout(300).then(() => {
                Neo.applyDeltas(this.appName, {
                    id: expandedId,
                    action: 'removeNode'
                });
            });
        });
    }
}
```

### 2. Performance-Optimized VDom Updates

```javascript
class VirtualScrollList extends Component {
    static config = {
        // Large datasets require viewport-based rendering
        itemHeight: 50,
        visibleItems: 20,
        bufferItems: 5
    }

    updateVisibleItems() {
        let me = this,
            {scrollTop, itemHeight, visibleItems, bufferItems} = me,
            startIndex = Math.floor(scrollTop / itemHeight),
            endIndex = startIndex + visibleItems + bufferItems,
            fragment = me.vdom.cn[0]; // Container for items

        // Only update VDom nodes that changed
        let newItems = me.data.slice(startIndex, endIndex).map((record, index) => ({
            cls: ['neo-list-item'],
            style: {
                transform: `translateY(${(startIndex + index) * itemHeight}px)`
            },
            cn: [{text: record.name}]
        }));

        // STANDARD: Let engine diff the VDom changes
        fragment.cn = newItems;
        this.update();
    }

    onScroll(data) {
        this.scrollTop = data.scrollTop;
        // Throttle updates for performance
        this.throttledUpdate();
    }
}
```

### 3. Animation and Transition Management

```javascript
class AnimatedComponent extends Component {
    // Coordinate VDom changes with CSS transitions
    applyTransition(callback, duration = 300) {
        let me = this,
            transitionClass = `neo-transition-${duration}`;

        // ADVANCED: Direct delta application for animation
        Neo.applyDeltas(me.appName, {
            id: me.id,
            cls: {add: [transitionClass]}
        }).then(() => {
            // STANDARD: Use update() for VDom changes
            this.vdom.style.transform = 'translateX(0)';
            this.update();
            
            // Remove transition class after animation
            me.timeout(duration + 50).then(() => {
                Neo.applyDeltas(me.appName, {
                    id: me.id,
                    cls: {remove: [transitionClass]}
                });
            });
        });
    }

    slideIn() {
        this.applyTransition(() => {
            // STANDARD: Modify VDom, let engine handle diffing
            this.vdom.style.transform = 'translateX(0)';
            this.update();
        }, 500);
    }

    slideOut() {
        this.applyTransition(() => {
            // STANDARD: Modify VDom, let engine handle diffing  
            this.vdom.style.transform = 'translateX(-100%)';
            this.update();
        }, 500);
    }
}
```

## VDom Utilities and Helpers

### VdomUtil Methods

```javascript
import VdomUtil from './src/util/Vdom.mjs';

class UtilityComponent extends Component {
    manipulateVdom() {
        // Find nodes by flag
        let headerNode = VdomUtil.getByFlag(this, 'header');
        
        // Find nodes by ID
        let specificNode = VdomUtil.findVdomChild(this.vdom, 'specific-id');
        
        // Replace node content
        VdomUtil.replaceVdomChild(this.vdom, oldNode, newNode);
        
        // Get child by index
        let firstChild = VdomUtil.getChildAt(this.vdom, 0);
        
        // STANDARD: Let engine handle diffing
        this.update();
    }
}
```

### Custom VDom Utilities

```javascript
// Create reusable VDom patterns
class VdomTemplates {
    static createCard(title, content, options = {}) {
        return {
            cls: ['neo-card', ...(options.cls || [])],
            cn: [
                {
                    cls: ['neo-card-header'],
                    cn: [{tag: 'h3', text: title}]
                },
                {
                    cls: ['neo-card-body'],
                    cn: Array.isArray(content) ? content : [{text: content}]
                }
            ]
        };
    }

    static createButton(text, iconCls, handler) {
        return {
            tag: 'button',
            cls: ['neo-button'],
            cn: [
                iconCls ? {tag: 'i', cls: [iconCls]} : null,
                {tag: 'span', text}
            ].filter(Boolean),
            onclick: handler
        };
    }
}

// Usage in components
class CardList extends Component {
    createCards() {
        let cards = this.data.map(item => 
            VdomTemplates.createCard(item.title, item.content, {
                cls: ['custom-card']
            })
        );
        
        // STANDARD: Engine calculates what changed
        this.vdom.cn = cards;
        this.update();
    }
}
```

## Event Handling in VDom

### DOM Event Binding

```javascript
class InteractiveComponent extends Component {
    static config = {
        vdom: {
            cls: ['neo-interactive'],
            cn: [
                {
                    tag: 'button',
                    text: 'Click Me',
                    onclick: 'onButtonClick',  // Method name as string
                    flag: 'button'
                },
                {
                    cls: ['neo-content'],
                    onmouseenter: 'onContentEnter',
                    onmouseleave: 'onContentLeave'
                }
            ]
        }
    }

    onButtonClick(data) {
        // data contains event information
        console.log('Button clicked:', data);
        
        // STANDARD: Let engine handle the update
        let buttonNode = VdomUtil.getByFlag(this, 'button');
        buttonNode.disabled = true;
        this.update();
    }

    onContentEnter(data) {
        // STANDARD: Hover effects via VDom
        data.target.style.backgroundColor = '#f0f0f0';
        this.update();
    }
}
```

### Dynamic Event Management

```javascript
class DynamicEventComponent extends Component {
    addEventListeners() {
        // Add listeners programmatically
        this.addDomListeners({
            click: this.onClick,
            scroll: this.onScroll,
            resize: this.onResize,
            scope: this
        });
    }

    removeEventListeners() {
        this.removeDomListeners({
            click: this.onClick,
            scroll: this.onScroll,
            resize: this.onResize,
            scope: this
        });
    }
}
```

## Security Considerations

### XSS Prevention

```javascript
class SecureComponent extends Component {
    // SECURE: Use text property
    setContent(userInput) {
        this.textNode.text = userInput; // Automatically escaped
        this.update();
    }

    // SECURE: Use tag property for elements
    createElement(tagName) {
        return {
            tag: tagName,  // Safe element creation
            cls: ['user-element']
        };
    }

    // AVOID: Direct HTML injection
    unsafeSetContent(userInput) {
        this.containerNode.html = userInput; // XSS risk!
    }

    // SECURE: Validate and sanitize if HTML is needed
    setSafeHtml(content) {
        // Use a trusted sanitization library
        let sanitized = DOMPurify.sanitize(content);
        // STANDARD: Let engine diff changes
        this.containerNode.html = sanitized;
        this.update();
    }
}
```

## Performance Best Practices

### 1. Batch VDom Updates

```javascript
class PerformantComponent extends Component {
    // BAD: Multiple individual updates via engine
    updateItemsBad(items) {
        items.forEach(item => {
            let node = this.getItemNode(item.id);
            node.text = item.name;
            this.update(); // Too many engine round-trips!
        });
    }

    // GOOD: Single engine update with all changes
    updateItemsGood(items) {
        items.forEach(item => {
            let node = this.getItemNode(item.id);
            node.text = item.name;
        });
        
        this.update(); // Single VDom diff operation
    }

    // ADVANCED: Bypass engine entirely with manual deltas
    updateItemsAdvanced(items) {
        let deltas = [];
        
        items.forEach(item => {
            deltas.push({
                id: this.getItemId(item.id),
                text: item.name
            });
        });
        
        // Direct App worker -> Main thread
        Neo.applyDeltas(this.appName, deltas);
    }
}
```

### 2. Efficient VDom Structure

```javascript
class OptimizedList extends Component {
    static config = {
        // Use flags for frequently accessed nodes
        vdom: {
            cls: ['neo-list'],
            cn: [
                {cls: ['neo-list-header'], flag: 'headerNode'},
                {cls: ['neo-list-body'], flag: 'bodyNode'},
                {cls: ['neo-list-footer'], flag: 'footerNode'}
            ]
        }
    }

    // Cache VDom node references
    get headerNode() {
        return this._headerNode ??= VdomUtil.getByFlag(this, 'headerNode');
    }

    get bodyNode() {
        return this._bodyNode ??= VdomUtil.getByFlag(this, 'bodyNode');
    }

    // Reset cache when VDom structure changes
    afterUpdate() {
        this._headerNode = null;
        this._bodyNode = null;
        this._footerNode = null;
    }
}
```

### 3. Memory Management

```javascript
class MemoryEfficientComponent extends Component {
    destroy(...args) {
        // Clean up VDom references
        this._cachedNodes = null;
        this._eventHandlers = null;
        
        // Clear transition timeouts
        this.transitionTimeouts?.forEach(clearTimeout);
        this.transitionTimeouts = null;
        
        super.destroy(...args);
    }

    // Avoid memory leaks in closures
    createEventHandler(itemId) {
        // BAD: Creates closure that holds reference to entire component
        return (data) => {
            this.processItem(itemId, data);
        };
    }

    createEventHandlerOptimized(itemId) {
        // GOOD: Minimal closure scope
        let handler = this.processItem.bind(this, itemId);
        return handler;
    }
}
```

## Testing VDom Components

### Unit Testing VDom Structure

```javascript
// Test VDom generation
describe('CustomButton VDom', () => {
    let button;

    beforeEach(() => {
        button = Neo.create(CustomButton, {
            text: 'Test Button',
            iconCls: 'fa fa-home'
        });
    });

    it('should generate correct VDom structure', () => {
        let vdom = button.vdom;
        
        expect(vdom.cls).toContain('neo-button');
        expect(vdom.cn).toHaveLength(3);
        expect(vdom.cn[0].cls).toContain('neo-button-icon');
        expect(vdom.cn[1].text).toBe('Test Button');
    });

    it('should update VDom when properties change', () => {
        button.text = 'New Text';
        
        let textNode = VdomUtil.getByFlag(button, 'textNode');
        expect(textNode.text).toBe('New Text');
    });
});
```

### Integration Testing

```javascript
// Test VDom-to-DOM synchronization
describe('VDom DOM Integration', () => {
    it('should sync VDom changes to DOM', async () => {
        let component = Neo.create(TestComponent);
        await component.render();
        
        // Modify VDom
        component.headerNode.text = 'Updated Header';
        component.update();
        
        // Wait for DOM update
        await component.timeout(100);
        
        // Verify DOM reflects VDom changes
        let domElement = Neo.getDomElement(component.headerNode.id);
        expect(domElement.textContent).toBe('Updated Header');
    });
});
```

## Migration from Other Frameworks

### From React Components

```javascript
// React pattern
function ReactButton({text, onClick, disabled}) {
    return (
        <button onClick={onClick} disabled={disabled}>
            {text}
        </button>
    );
}

// Neo.mjs VDom equivalent
class NeoButton extends Component {
    static config = {
        text_: '',
        disabled_: false,
        
        vdom: {
            tag: 'button',
            text: '', // Will be set by afterSetText
            onclick: 'onClick'
        }
    }

    afterSetText(value) {
        this.vdom.text = value;
        this.update();
    }

    afterSetDisabled(value) {
        this.vdom.disabled = value;
        this.update();
    }

    onClick(data) {
        this.fire('click', data);
    }
}
```

### From Vue Templates

```javascript
// Vue template
/*
<template>
  <div class="card">
    <h3>{{ title }}</h3>
    <p v-if="showDescription">{{ description }}</p>
    <button @click="onAction">{{ buttonText }}</button>
  </div>
</template>
*/

// Neo.mjs VDom equivalent
class NeoCard extends Component {
    static config = {
        title_: '',
        description_: '',
        showDescription_: true,
        buttonText_: 'Action',
        
        vdom: {
            cls: ['card'],
            cn: [
                {tag: 'h3', flag: 'titleNode'},
                {tag: 'p', flag: 'descriptionNode'},
                {tag: 'button', flag: 'buttonNode', onclick: 'onAction'}
            ]
        }
    }

    afterSetTitle(value) {
        this.titleNode.text = value;
        this.update();
    }

    afterSetDescription(value) {
        this.descriptionNode.text = value;
        this.update();
    }

    afterSetShowDescription(value) {
        this.descriptionNode.removeDom = !value;
        this.update();
    }

    afterSetButtonText(value) {
        this.buttonNode.text = value;
        this.update();
    }

    onAction(data) {
        this.fire('action', data);
    }
}
```

## Common VDom Patterns

### 1. Conditional Rendering

```javascript
class ConditionalComponent extends Component {
    toggleVisibility(nodeFlag, visible) {
        let node = VdomUtil.getByFlag(this, nodeFlag);
        node.removeDom = !visible;
        this.update(); // STANDARD: Let engine handle
    }

    showLoadingState() {
        this.contentNode.removeDom = true;
        this.loadingNode.removeDom = false;
        this.update(); // STANDARD: Single engine update
    }

    showContent() {
        this.contentNode.removeDom = false;
        this.loadingNode.removeDom = true;
        this.update(); // STANDARD: Single engine update
    }
}
```

### 2. List Rendering

```javascript
class ListComponent extends Component {
    renderItems(items) {
        let listItems = items.map(item => ({
            cls: ['list-item'],
            cn: [
                {tag: 'span', text: item.name},
                {tag: 'button', text: 'Delete', onclick: 'onDeleteItem', itemId: item.id}
            ]
        }));

        this.listNode.cn = listItems;
        this.update(); // STANDARD: Engine handles diffing
    }

    onDeleteItem(data) {
        let itemId = data.target.itemId;
        this.fire('deleteItem', {itemId});
    }
}
```

### 3. Form Controls

```javascript
class FormComponent extends Component {
    static config = {
        vdom: {
            tag: 'form',
            cn: [
                {
                    tag: 'input',
                    type: 'text',
                    placeholder: 'Enter name',
                    flag: 'nameInput',
                    oninput: 'onNameChange'
                },
                {
                    tag: 'textarea',
                    placeholder: 'Enter description',
                    flag: 'descriptionInput',
                    oninput: 'onDescriptionChange'
                },
                {
                    tag: 'button',
                    type: 'submit',
                    text: 'Submit',
                    onclick: 'onSubmit'
                }
            ]
        }
    }

    onNameChange(data) {
        this.name = data.target.value;
    }

    onDescriptionChange(data) {
        this.description = data.target.value;
    }

    onSubmit(data) {
        data.preventDefault();
        this.fire('submit', {
            name: this.name,
            description: this.description
        });
    }
}
```

## Conclusion

Working with VDom in Neo.mjs provides fine-grained control over DOM manipulation while maintaining the framework's performance benefits. Key takeaways:

- **Use flags for node references** - More efficient than DOM queries
- **Batch VDom updates** - Minimize DOM operations with `Neo.applyDeltas`
- **Leverage the `update()` method** - Essential for VDom-to-DOM synchronization
- **Follow security best practices** - Use `text` over `html`, validate input
- **Optimize for performance** - Cache references, minimize updates
- **Test thoroughly** - VDom logic is complex and benefits from comprehensive testing

The VDom layer is where Neo.mjs's performance optimizations happen, and understanding these patterns enables you to build sophisticated, high-performance custom components that integrate seamlessly with the framework's architecture.

Remember: Most development should happen at the Component Tree layer. Only drop down to VDom manipulation when you need the additional control and performance optimization it provides.
