# Using These Topics

Neo.mjs is an Off-Main-Thread multi-window application engine (**the Body**) paired with an AI Agent OS and live runtime inspection bridge (**the Brain** and **Neural Link**). This page explains how to navigate the ten sections of the learning base and how to use the interactive features embedded throughout the guides.

<details>
<summary>Click here to see how disclosure widgets work</summary>
<p style="background-color:lightgreen;padding:8px">Throughout the documentation, optional deep-dives and secondary implementation notes are placed inside expandable <code>&lt;details&gt;</code> disclosure widgets like this one so you can scan core concepts first and reveal details on demand.</p>
</details>

## Where to Start — Three Reader Paths

- **Evaluating or Building with the Application Engine:** Start with [Introduction](./benefits/Introduction.md) and [Architecture Overview](./benefits/ArchitectureOverview.md), then walk through [Getting Started](./gettingstarted/Workspaces.md), [Guides](./guides/fundamentals/CodebaseOverview.md) (especially *Fundamentals*, *Data Handling*, and the 10 *UI Building Blocks* dock-layout guides), and [Tutorials](./tutorials/DockLayoutsFirstLayout.md).
- **Evaluating Neo.mjs for an Enterprise Application:** Review the [Introduction Claims & Proof Register](./benefits/Introduction.md), the [Body Benefits](./benefits/body/OffTheMainThread.md) ([Multi-Window](./benefits/body/MultiWindow.md), [Four Environments](./benefits/body/FourEnvironments.md)), and [Engine vs Frameworks](./comparisons/Overview.md) (including [Neo.mjs vs Ext JS](./comparisons/NeoVsExtJs.md)).
- **Running or Integrating Coding Agents:** Open **Brain Interface, Fleet & Agent Tooling** — starting with [Fleet Manager Architecture](./agentos/FleetManagerArchitecture.md), [Running the Fleet Cockpit](./agentos/RunningTheFleetCockpit.md), [The Neural Link](./agentos/NeuralLink.md), [Progressive Disclosure Skills](./agentos/ProgressiveDisclosureSkills.md), [Core Skills](./agentos/CoreSkills.md), and [The Seat Memory Layer](./agentos/SeatMemoryLayer.md).

## How the Content is Organized

The learning navigation tree (`learn/tree.json`) is organized into ten sections (plus the `learn/blog/` articles):

1. **Using These Topics:** How the learning base is organized and how to run and edit the inline live-preview examples below.
2. **Benefits:** The [Introduction](./benefits/Introduction.md), [Architecture Overview](./benefits/ArchitectureOverview.md), and 14 focused pages covering Off-the-Main-Thread workers, multi-window apps, the config system, forms, and four build environments.
3. **Getting Started:** Creating workspaces, describing UI with JSON blueprints, reactive configs, and worker debugging.
4. **Brain Interface, Fleet & Agent Tooling:** Operating coding agents with Fleet Manager, the Cockpit, the Neural Link's MCP tools, Progressive Disclosure skills, Seat Memory, and retained Architectural Decision Records (ADRs).
5. **Guides:** In-depth engineering guides grouped into eight shelves: *Fundamentals*, *The Core Engine*, *UI Building Blocks* (including the 10-guide dock-layout series), *Data Handling*, *User Interaction*, *Testing*, *Specific Applications/Features*, and *Advanced*.
6. **Tutorials:** Step-by-step builds (`DockLayoutsFirstLayout`, `TodoList`, `Earthquakes`, `CreatingAFunctionalButton`, `Routing`) that combine multiple engine primitives.
7. **JavaScript Classes:** How Neo.mjs builds on standard ES module classes, private fields, and `Neo.setupClass`.
8. **Engine vs Frameworks:** Architectural comparisons between Neo.mjs and React, Angular, Vue, Solid, Svelte, and Sencha Ext JS.
9. **Glossary:** Concise definitions of core Neo.mjs and Agent OS terms (`OMT`, `VDOM`, `VNode`, `RMA`, `Neural Link`, `State Provider`).
10. **API Docs:** Direct route (`/docs`) to the generated JSDoc class and method reference.

## Live Previews

Many topics include runnable `live-preview` examples rendered by `Neo.code.LivePreview` as tab panels with **Source** and **Preview** tabs. Click the **Preview** tab to mount and interact with the live component, or edit the code in the **Source** tab to see your changes applied immediately in **Preview**.

You can also launch any preview into its own browser window by clicking the window popout icon (<span class="far fa-xs fa-window-maximize"></span> *"Open preview in a separate window"*) on the right side of the preview tab bar. Because the Portal itself is a Neo.mjs application, popped-out preview windows stay connected to the same multi-window runtime:

```javascript live-preview
import Button    from '../button/Base.mjs';
import Container from '../container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',
        layout   : {ntype: 'vbox', align: 'start'},
        items    : [{
            module : Button,
            text   : 'Click me!',
            handler: () => Neo.Main.alert({message: 'Button clicked!'})
        }]
    }
}
MainView = Neo.setupClass(MainView);
```

Try editing the `text` config in the **Source** tab above, or inspect how functional components (`defineComponent`) and `useConfig` reactive state update the DOM without page reloads:

```javascript live-preview
import {defineComponent, useConfig} from '../functional/_export.mjs';
import Button                       from '../button/Base.mjs';

export default defineComponent({
    config: {
        className: 'Examples.functional.Counter'
    },

    createVdom() {
        const [count, setCount] = useConfig(0);

        return {
            cn: [{
                module : Button,
                text   : `Count: ${count}`,
                handler: () => setCount(prev => prev + 1)
            }]
        }
    }
});
```
