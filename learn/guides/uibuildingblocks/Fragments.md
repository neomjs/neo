# Fragments: Phantom Containers

`Neo.container.Fragment` represents a significant architectural evolution in how we structure Web Applications. Unlike traditional containers that render a wrapping `<div>`, or compile-time fragments that disappear entirely, Neo.mjs Fragments are **runtime-manipulatable DOM ranges**.

## The "Phantom Node" Architecture

In the VDOM and DOM, a Fragment appears as a range of sibling nodes anchored by comments.

```html
<!-- fragment-id-start -->
<div class="child-1"></div>
<div class="child-2"></div>
<!-- fragment-id-end -->
```

This architecture enables capabilities that are often impossible in single-threaded frameworks:

1.  **Transparent Layouts:** Children sit directly in the parent's layout context. This is critical for **CSS Grid** and **Flexbox**, where an intermediate wrapper `<div>` would break the layout algorithm.
2.  **Smart Runtime / Lean IPC:** When you move a Fragment (e.g., reordering it in a list), the Worker does **not** serialize N child operations. It sends a single high-level delta: `{action: 'moveNode', id: 'fragment-id'}`. The Main Thread resolves this by locating the anchors and moving the entire physical range atomically.
3.  **Conservation of Identity (Atomic Moves):** Moving items in or out of a Fragment **preserves their DOM state** (focus, selection, input values, iframe content). The nodes are physically moved in the DOM, not destroyed and recreated.

## Live Example: The "Impossible" Move

In many frameworks, moving a component into a different logical parent (like a Fragment) forces a teardown and re-render, losing the user's input state.

In this example, try typing in "Field 1", then click **"Move Field 1 into Fragment"**.
Notice that **the input value and focus are preserved**. The DOM node was physically transferred into the Fragment's range without a reset.

```javascript live-preview
import Button        from '../button/Base.mjs';
import FormContainer from '../form/Container.mjs';
import Fragment      from '../container/Fragment.mjs';
import TextField     from '../form/field/Text.mjs';

class MainContainer extends FormContainer {
    static config = {
        className: 'Neo.examples.guides.Fragments',
        layout   : {ntype: 'vbox', align: 'start'},
        style    : {padding: '20px'},
        items    : [{
            module   : TextField,
            labelText: 'Field 1 (Outside)',
            name     : 'field1',
            reference: 'field1',
            placeholder: 'Type here then move me!'
        }, {
            // Start of Fragment
            module   : Fragment,
            reference: 'myFragment',
            items    : [{
                module   : TextField,
                labelText: 'Fragment Field A',
                name     : 'fragFieldA',
                style    : {backgroundColor: '#e6f7ff'}
            }]
            // End of Fragment
        }, {
            ntype : 'container',
            layout: {ntype: 'hbox', gap: '10px'},
            style : {marginTop: '20px'},
            items : [{
                module : Button,
                text   : 'Toggle Fragment',
                handler: 'up.onToggleFragment'
            }, {
                module : Button,
                text   : 'Move Field 1 into Fragment',
                handler: 'up.onMoveIntoFragment'
            }, {
                module : Button,
                text   : 'Move Field 1 Out',
                handler: 'up.onMoveOutFragment'
            }]
        }]
    }

    onToggleFragment(data) {
        const fragment = this.getReference('myFragment');
        fragment.hidden = !fragment.hidden;
    }

    onMoveIntoFragment(data) {
        const
            field    = this.getReference('field1'),
            fragment = this.getReference('myFragment');

        // Atomic Move: Physically transfers the node
        fragment.insert(0, field);
        
        data.component.disabled = true;
        this.getReference('field1').placeholder = 'I am now inside the Fragment!';
    }

    onMoveOutFragment(data) {
        const
            field = this.getReference('field1'),
            me    = this;

        // Atomic Move: Physically transfers the node back
        me.insert(0, field);
        
        data.component.disabled = true;
        this.getReference('field1').placeholder = 'I am back outside!';
    }
}

MainContainer = Neo.setupClass(MainContainer);
```

## Cross-Window Capabilities

Because Neo.mjs uses a SharedWorker architecture, this "Identity Conservation" extends to **Cross-Window Drag & Drop**. You can move a Fragment (and all its children) from one browser window to another. The framework handles the DOM node transfer (or recreation with state hydration) seamlessly, making multi-monitor workflows trivial to implement.
