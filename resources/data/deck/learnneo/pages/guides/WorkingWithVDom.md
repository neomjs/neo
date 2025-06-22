## A Comprehensive Guide to Custom Component Development

**Target Audience**: Developers building custom Neo.mjs components who need to work directly with the VDom layer for performance optimization, complex animations, or advanced UI patterns.

**Prerequisites**: Understanding of Neo.mjs's two-tier architecture (Component Tree vs VDom). Read the "Declarative Component Trees vs Imperative VDom" guide first.

## Overview

While 99% of Neo.mjs development happens at the Component Tree layer, creating custom components requires working with the VDom layer. This guide covers the patterns, best practices, and techniques for effective VDom manipulation in Neo.mjs.

## VDom Fundamentals

### VDom Structure

Neo.mjs VDom nodes are plain JavaScript objects that represent DOM elements. **Important**: VDom only contains structure, styling, content, and attributes - **never event listeners**.

```javascript
// Basic VDom node structure
{
    tag      : 'div',                // HTML tag (default: 'div')
    id       : 'unique-id',          // DOM element ID
    cls      : ['class1', 'class2'], // CSS classes array
    style    : {color: 'red'},       // Inline styles object
    html     : 'Text content',       // Inner HTML (exclusive with text/cn)
    text     : 'Text content',       // Text content (exclusive with html/cn)
    cn       : [],                   // Child nodes array (exclusive with html/text)
    vtype    : 'vnode',              // VNode type: 'vnode', 'text', 'root'
    static   : false,                // Exclude from delta updates
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
        
        // Define internal DOM structure
        vdom: {
            cls: ['neo-button', 'neo-custom-button'], 
            cn: [
                {tag: 'span', cls: ['neo-button-icon'], flag: 'iconNode'},
                {tag: 'span', cls: ['neo-button-text'], flag: 'textNode'},
                {cls: ['neo-button-badge'], flag: 'badgeNode', removeDom: true}
            ]
        },

        // Define DOM event listeners in static config
        domListeners: [{
            click: 'onButtonClick'
        }]
    }

    onButtonClick(data) {
        console.log('Button clicked:', data);
    }
}
```

## DOM Event Handling in Neo.mjs

### Core Principles

Neo.mjs uses a **delegated global DOM event system**. By default, the framework attaches listeners for all common events to `document.body` and uses event delegation to route events to the appropriate components.

**Key Rules:**
- Event listeners are **never** defined in VDom
- Event handling is separated from markup representation
- All DOM events are delegated through a global system
- Components subscribe to events via `domListeners` config

### Static Configuration Approach (Recommended)

The recommended approach is to define `domListeners` in the static config for class-based event handling:

```javascript
class InteractiveComponent extends Component {
    static config = {
        className: 'Neo.examples.InteractiveComponent',
        
        vdom:
        {cls: ['neo-interactive'], cn: [
            {tag: 'button', text: 'Click Me', cls: ['neo-button']},
            {cls: ['neo-content', 'hoverable-area'], text: 'Hover over me'}
        ]},

        // ✅ Define listeners in static config
        domListeners: [{
            click: 'onButtonClick'
        }, {
            mouseenter: 'onContentMouseEnter',
            mouseleave: 'onContentMouseLeave',
            delegate  : '.hoverable-area'
        }]
    }

    onButtonClick(data) {
        console.log('Button clicked:', data);
        
        // Update VDom in response to event
        let buttonNode = this.vdom.cn[0];
        buttonNode.disabled = true;
        this.update();
    }

    onContentMouseEnter(data) {
        // Update VDom styling
        let contentNode = this.vdom.cn[1];
        contentNode.style = {backgroundColor: '#f0f0f0'};
        this.update();
    }

    onContentMouseLeave(data) {
        let contentNode = this.vdom.cn[1];
        contentNode.style = {};
        this.update();
    }
}
```

### Programmatic Event Handling

Use `addDomListeners()` when you need to add listeners dynamically or keep static config open for class extensions:

```javascript
class DynamicComponent extends Component {
    static config = {
        className: 'Neo.examples.DynamicComponent',
        
        vdom:
        {cls: ['neo-dynamic'], cn: [
            {tag: 'button', text: 'Dynamic Button', cls: ['dynamic-btn']}
        ]}
        // Keep domListeners empty for extension flexibility
    }

    construct(config) {
        super.construct(config);
        
        // ✅ Add listeners programmatically
        this.addDomListeners([{
            click: this.onButtonClick,
            scope: this
        }]);

        // Conditional event handling
        if (this.enableHover) {
            this.addDomListeners([{
                mouseenter: this.onMouseEnter,
                mouseleave: this.onMouseLeave,
                scope     : this
            }])
        }
    }

    onButtonClick(data) {
        console.log('Dynamic button clicked')
    }
}
```

### String-Based Handler Resolution

Neo.mjs provides flexible handler resolution for string-based listeners:

```javascript
class HandlerResolutionExample extends Component {
    static config = {
        domListeners: [
            // Method in current component
            {click: 'onLocalClick'},
            
            // Method in parent component tree (any level up)
            {click: 'up.onParentClick'},
            
            // Method in ViewController
            {click: 'onControllerClick'}
        ]
    }

    onLocalClick(data) {
        // Handled by this component
    }
}

class ParentContainer extends Container {
    static config = {
        items: [HandlerResolutionExample]
    }

    onParentClick(data) {
        // Handled by parent in component tree
    }
}

class MainViewController extends Controller {
    onControllerClick(data) {
        // Handled by ViewController
    }
}
```

### Multiple Listeners and Event Options

You can define multiple listeners with various options:

```javascript
class AdvancedEventComponent extends Component {
    static config = {
        domListeners: [
            // Multiple listeners for same event
            {
                click   : 'onFirstClick',
                priority: 2  // Higher priority executes first
            },
            {
                click   : 'onSecondClick',
                priority: 1
            },
            
            // Event delegation
            {
                click   : 'onItemClick',
                delegate: '.list-item'
            },
            
            // Prevent bubbling
            {
                click   : 'onInnerClick',
                delegate: '.inner-element',
                bubble  : false
            },
            
            // Multiple events, same handler
            {
                mouseenter: 'onMouseEvent',
                mouseleave: 'onMouseEvent',
                delegate  : '.hover-target'
            }
        ]
    }

    onFirstClick(data) {
        console.log('First click handler - executes first due to priority');
    }

    onSecondClick(data) {
        console.log('Second click handler - executes second');
    }

    onItemClick(data) {
        // Only fires when clicking on .list-item elements
        let itemId = data.target.dataset.itemId;
        console.log('Item clicked:', itemId);
    }

    onInnerClick(data) {
        // Won't bubble up due to bubble: false
        console.log('Inner click - no bubbling');
    }

    onMouseEvent(data) {
        console.log('Mouse event:', data.type); // 'mouseenter' or 'mouseleave'
    }
}
```

### Event Delegation Patterns

Event delegation is crucial for performance and dynamic content:

```javascript
class ListComponent extends Component {
    static config = {
        vdom: {
            cls: ['neo-list'],
            cn: [] // Will be populated with list items
        },

        domListeners: [
            // Delegate events to dynamically created items
            {
                click   : 'onItemClick',
                delegate: '.neo-list-item'
            },
            {
                click   : 'onDeleteClick',
                delegate: '.delete-button'
            },
            {
                mouseenter: 'onItemHover',
                mouseleave: 'onItemLeave',
                delegate  : '.neo-list-item'
            }
        ]
    }

    createListItems(data) {
        let items = data.map((item, index) => ({
            cls: ['neo-list-item'],
            data: {itemId: item.id}, // Use data attributes for identification
            cn: [{
                tag : 'span',
                text: item.name,
                cls : ['item-name']
            }, {
                tag : 'button',
                text: 'Delete',
                cls : ['delete-button', 'btn-danger']
            }]
        }));

        this.vdom.cn = items;
        this.update();
    }

    onItemClick(data) {
        let itemId = data.target.dataset.itemId;
        console.log('Item clicked:', itemId);
    }

    onDeleteClick(data) {
        let itemElement = data.target.closest('.neo-list-item');
        let itemId = itemElement.dataset.itemId;
        this.fire('deleteItem', {itemId});
    }

    onItemHover(data) {
        data.target.style.backgroundColor = '#e0e0e0';
    }

    onItemLeave(data) {
        data.target.style.backgroundColor = '';
    }
}
```

### Form Event Handling

Complex form interactions with multiple input types:

```javascript
class FormComponent extends Component {
    static config = {
        vdom: {
            tag: 'form',
            cls: ['neo-form'],
            cn : [{
                tag        : 'input',
                type       : 'text',
                placeholder: 'Enter name',
                cls        : ['form-input', 'name-input']
            }, {
                tag        : 'textarea',
                placeholder: 'Enter description',
                cls        : ['form-input', 'description-input']
            }, {
                tag : 'button',
                type: 'submit',
                text: 'Submit',
                cls : ['submit-button']
            }]
        },

        domListeners: [
            // Form-level event handling
            {
                submit: 'onFormSubmit'
            },
            
            // Input change events via delegation
            {
                input   : 'onInputChange',
                delegate: '.form-input'
            },
            
            // Button-specific events
            {
                click   : 'onSubmitClick',
                delegate: '.submit-button'
            }
        ]
    }

    onFormSubmit(data) {
        data.preventDefault();
        
        let formData = {
            name       : this.vdom.cn[0].value,
            description: this.vdom.cn[1].value
        };
        
        this.fire('formSubmit', formData);
    }

    onInputChange(data) {
        let input = data.target;
        
        // Update component state, not VDom
        if (input.classList.contains('name-input')) {
            this.name = input.value;
        } else if (input.classList.contains('description-input')) {
            this.description = input.value;
        }
    }

    onSubmitClick(data) {
        // Validate before submission
        if (!this.name || !this.description) {
            this.showValidationError();
        }
    }
}
```

### Inline Event Handlers (For Debugging)

While not recommended for production, inline handlers can be useful for debugging:

```javascript
class DebugComponent extends Component {
    static config = {
        vdom: {
            cn: [
                {tag: 'button', text: 'Debug Button 1'},
                {tag: 'button', text: 'Debug Button 2'}
            ]
        },

        domListeners: [
            // Fat arrow function - scope points to class
            {
                click: data => Neo.Main.log({value: `Clicked on ${data.component.id}`}),
                delegate: 'button:first-child'
            },
            
            // Regular function - scope points to component instance
            {
                click: function(data) {
                    Neo.Main.log({value: `Clicked on ${this.id}`});
                },
                delegate: 'button:last-child'
            }
        ]
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
        this.update() // Engine calculates what changed
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
        const deltas = [{
            id   : this.getItemId('item-1'),
            style: {opacity: 0.5}
        }, {
            id : this.getItemId('item-2'), 
            cls: {add: ['active'], remove: ['inactive']}
        }, {
            id  : this.textNodeId,
            text: 'Updated text'
        }];

        // Send deltas directly from App worker to Main
        Neo.applyDeltas(this.appName, deltas)
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
                {tag: 'i',    cls: ['neo-icon'], flag: 'iconNode'},
                {tag: 'span', cls: ['neo-text'], flag: 'textNode'}
            ]
        },

        domListeners: [{
            click: 'onClick'
        }]
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

### 2. Dynamic VDom Creation

Build VDom structures programmatically:

```javascript
class DataList extends Component {
    static config = {
        vdom: {
            cls: ['neo-data-list'],
            cn: [] // Will be populated dynamically
        },

        domListeners: [
            {
                click: 'onItemClick',
                delegate: '.neo-list-item'
            },
            {
                click: 'onAvatarClick',
                delegate: '.neo-avatar'
            }
        ]
    }

    // Create VDom items from data
    createListItems() {
        let {data, vdom} = this,
            items = [];

        data.forEach((record, index) => {
            items.push({
                cls: ['neo-list-item'],
                data: {recordId: record.id}, // For event identification
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
        });

        vdom.cn = items;
        this.update();
    }

    afterSetData(value, oldValue) {
        value && this.createListItems()
    }

    onItemClick(data) {
        let recordId = data.target.closest('.neo-list-item').dataset.recordId;
        this.fire('itemSelect', {recordId})
    }

    onAvatarClick(data) {
        let recordId = data.target.closest('.neo-list-item').dataset.recordId;
        this.fire('avatarClick', {recordId})
    }
}
```

### 3. Complex VDom Transformations

For sophisticated UI patterns, combine multiple VDom operations:

```javascript
class Helix extends Component {
    static config = {
        domListeners: [
            // Mouse interaction for 3D rotation
            {
                mousemove: 'onMouseMove',
                mousedown: 'onMouseDown',
                mouseup  : 'onMouseUp'
            },
            
            // Item selection via delegation
            {
                click   : 'onItemClick',
                delegate: '.helix-item'
            }
        ]
    }

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

    onMouseMove(data) {
        if (this.isDragging) {
            this.updateRotation(data.clientX, data.clientY);
        }
    }

    onItemClick(data) {
        let itemElement = data.target.closest('.helix-item');
        let itemId = itemElement.dataset.itemId;
        this.fire('itemSelect', {itemId});
    }
}
```

## Event Handler Patterns and Best Practices

### 1. Handler Method Naming

Use consistent naming conventions for event handlers:

```javascript
class ComponentWithConsistentNaming extends Component {
    static config = {
        domListeners: [
            {click     : 'onButtonClick'}, // on + EventType + Target
            {submit    : 'onFormSubmit'},  // on + EventType + Context
            {change    : 'onInputChange'}, // on + EventType + Element
            {mouseenter: 'onItemHover'},   // on + Target + Action
            {mouseleave: 'onItemLeave'}    // on + Target + Action
        ]
    }

    // Clear, descriptive handler names
    onButtonClick(data) { /* ... */ }
    onFormSubmit(data) { /* ... */ }
    onInputChange(data) { /* ... */ }
    onItemHover(data) { /* ... */ }
    onItemLeave(data) { /* ... */ }
}
```

### 2. Event Data Utilization

Make full use of the event data provided by Neo.mjs:

```javascript
class EventDataExample extends Component {
    static config = {
        domListeners: [{
            click: 'onElementClick'
        }]
    }

    onElementClick(data) {
        // Available properties in event data
        console.log('Event type:', data.type);           // 'click'
        console.log('Target element:', data.target);     // DOM element clicked
        console.log('Component:', data.component);       // Component instance
        console.log('Original event:', data.originalEvent); // Browser event
        console.log('Current target:', data.currentTarget); // Delegated element
        
        // Use data attributes for identification
        let itemId = data.target.dataset.itemId;
        let actionType = data.target.dataset.action;
        
        // Prevent default behavior if needed
        if (data.target.tagName === 'A') {
            data.preventDefault();
        }
        
        // Stop propagation if necessary
        if (data.target.classList.contains('no-bubble')) {
            data.stopPropagation();
        }
    }
}
```

### 3. Conditional Event Handling

Handle different scenarios within the same event handler:

```javascript
class ConditionalEventComponent extends Component {
    static config = {
        domListeners: [{
            click   : 'onUniversalClick',
            delegate: '.interactive-element'
        }]
    }

    onUniversalClick(data) {
        let element     = data.target.closest('.interactive-element'); // todo: WRONG => no elements inside the app worker
        let elementType = element.dataset.elementType;
        let elementId   = element.dataset.elementId;
        
        // Route based on element type
        switch (elementType) {
            case 'button':
                this.handleButtonAction(elementId, data);
                break;
                
            case 'card':
                this.handleCardSelection(elementId, data);
                break;
                
            case 'menu-item':
                this.handleMenuAction(elementId, data);
                break;
                
            default:
                this.handleGenericClick(elementId, data);
        }
    }

    handleButtonAction(buttonId, data) {
        let action = data.target.dataset.action;
        
        if (action === 'delete') {
            this.confirmDelete(buttonId);
        } else if (action === 'edit') {
            this.startEdit(buttonId);
        }
    }

    handleCardSelection(cardId, data) {
        this.selectCard(cardId);
        this.fire('cardSelected', {cardId});
    }

    handleMenuAction(menuId, data) {
        let menuItem = data.target.dataset.menuItem;
        this.fire('menuAction', {menuId, menuItem});
    }
}
```

## Advanced VDom Techniques

### 1. VDom Node Lifecycle Management

```javascript
class ExpandableCard extends Component {
    static config = {
        domListeners: [{
            click: 'onToggleClick',
            delegate: '.toggle-button'
        }, {
            click: 'onCardClick',
            delegate: '.expandable-card'
        }]
    }

    expandItem(itemId) {
        let me               = this,
            {appName, store} = me,
            record           = store.get(itemId),
            itemVdom         = Neo.clone(me.getItemVdom(itemId), true);

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
                Neo.applyDeltas(appName, {
                    id: itemVdom.id,
                    cls: {add: ['neo-animate-in']}
                });
            });
        });
    }

    collapseItem(itemId) {
        let expandedId = itemId + '__expanded';
        
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

    onToggleClick(data) {
        let itemElement = data.target.closest('.expandable-card');
        let itemId = itemElement.dataset.itemId;
        let isExpanded = itemElement.classList.contains('neo-expanded');
        
        if (isExpanded) {
            this.collapseItem(itemId);
        } else {
            this.expandItem(itemId);
        }
    }
}
```

### 2. Performance-Optimized VDom Updates

```javascript
class VirtualScrollList extends Component {
    static config = {
        bufferItems : 5,
        itemHeight  : 50,
        visibleItems: 20,

        domListeners: [{
            scroll: 'onScroll'
        }, {
            click   : 'onItemClick',
            delegate: '.neo-list-item'
        }]
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
            data: {itemId: record.id}, // For event handling
            style: {
                transform: `translateY(${(startIndex + index) * itemHeight}px)`
            },
            cn: [{text: record.name}]
        }));

        fragment.cn = newItems;
        this.update();
    }

    onScroll(data) {
        this.scrollTop = data.target.scrollTop;
        this.throttledUpdate();
    }

    onItemClick(data) {
        let itemId = data.target.dataset.itemId;
        this.fire('itemClick', {itemId});
    }
}
```

### 3. Animation and Transition Management

```javascript
class AnimatedComponent extends Component {
    static config = {
        domListeners: [{
            click   : 'onTriggerAnimation',
            delegate: '.animate-trigger'
        }, {
            transitionend: 'onTransitionEnd'
        }]
    }

    // Coordinate VDom changes with CSS transitions
    applyTransition(callback, duration = 300) {
        let me = this,
            transitionClass = `neo-transition-${duration}`;

        // Add transition class
        Neo.applyDeltas(me.appName, {
            id: me.id,
            cls: {add: [transitionClass]}
        }).then(() => {
            // Modify VDom structure
            callback.call(me);
            me.update();
            
            // Remove transition class after animation
            me.timeout(duration + 50).then(() => {
                Neo.applyDeltas(me.appName, {
                    id : me.id,
                    cls: {remove: [transitionClass]}
                })
            })
        })
    }

    slideIn() {
        this.applyTransition(() => {
            this.vdom.style.transform = 'translateX(0)'
        }, 500);
    }

    slideOut() {
        this.applyTransition(() => {
            this.vdom.style.transform = 'translateX(-100%)'
        }, 500);
    }

    onTriggerAnimation(data) {
        let animationType = data.target.dataset.animationType;
        
        switch (animationType) {
            case 'slideIn':
                this.slideIn();
                break;
            case 'slideOut':
                this.slideOut();
                break;
        }
    }

    onTransitionEnd(data) {
        console.log('Animation completed:', data.propertyName);
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
            data: options.data || {},
            cn: [{
                cls: ['neo-card-header'],
                cn: [{tag: 'h3', text: title}]
            }, {
                cls: ['neo-card-body'],
                cn: Array.isArray(content) ? content : [{text: content}]
            }]
        };
    }

    static createButton(text, iconCls, options = {}) {
        return {
            tag : 'button',
            cls : ['neo-button', ...(options.cls || [])],
            data: options.data || {},
            cn  : [
                iconCls ? {tag: 'i', cls: [iconCls]} : null,
                {tag: 'span', text}
            ].filter(Boolean)
            // No event handlers in VDom template
        };
    }
}

// Usage in components
class CardList extends Component {
    construct(config) {
        super.construct(config);
        
        // Event delegation for all cards and buttons
        this.addDomListeners({
            click: this.onCardClick,
            delegate: '.neo-card',
            scope: this
        });

        this.addDomListeners({
            click: this.onButtonClick,
            delegate: '.neo-button',
            scope: this
        });
    }

    createCards() {
        let cards = this.data.map(item => 
            VdomTemplates.createCard(item.title, item.content, {
                cls: ['custom-card'],
                data: {itemId: item.id}
            })
        );
        
        this.vdom.cn = cards;
        this.update();
    }

    onCardClick(data) {
        let itemId = data.target.dataset.itemId;
        this.fire('cardClick', {itemId});
    }

    onButtonClick(data) {
        let itemId = data.target.closest('.neo-card').dataset.itemId;
        this.fire('buttonClick', {itemId});
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
        this.containerNode.html = sanitized;
        this.update();
    }
}
```

## Performance Best Practices

### 1. Batch VDom Updates

```javascript
class PerformantComponent extends Component {
    // BAD: Multiple individual updates
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
        
        Neo.applyDeltas(this.appName, deltas);
    }
}
```

### 2. Efficient Event Delegation

```javascript
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
        let element = data.target.closest('.interactive-item');
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
        }
    }
}
```

### 3. Memory Management

```javascript
class MemoryEfficientComponent extends Component {
    destroy(...args) {
        // Clean up VDom references
        this._cachedNodes = null;
        
        // Clear transition timeouts
        this.transitionTimeouts?.forEach(clearTimeout);
        this.transitionTimeouts = null;
        
        super.destroy(...args);
    }

    // Avoid memory leaks in event handlers
    createEventHandler(itemId) {
        // GOOD: Minimal closure scope
        return this.processItem.bind(this, itemId);
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
    static config = {
        //...
        domListeners: [{
            click: 'onDeleteItem'
        }]
    }
    
    renderItems(items) {
        let listItems = items.map(item => ({
            cls: ['list-item'],
            cn: [
                {tag: 'span',   text: item.name},
                {tag: 'button', text: 'Delete', itemId: item.id}
            ]
        }));

        this.listNode.cn = listItems;
        this.update()
    }

    onDeleteItem(data) {
        let itemId = data.target.itemId;
        this.fire('deleteItem', {itemId})
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
