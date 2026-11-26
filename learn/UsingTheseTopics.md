# Using These Topics

***Welcome to the Neo.mjs learning base!*** Neo.mjs is a complete application platform — 514 classes in 44 namespaces from grid, forms, calendar, and dashboard docking to 40 main-thread addons — paired with an Off-Main-Thread (OMT) multi-window runtime (**the Body**) and an AI Agent OS and live runtime inspection bridge (**the Brain** and **Neural Link**). It builds the applications teams build with [Angular, React or Vue](./comparisons/Overview.md) today, at [feature parity with Ext JS](./comparisons/NeoVsExtJs.md) and generations ahead of it in architecture, for desktop and mobile browsers, and goes where single-threaded libraries cannot — sustaining [`40,000+` delta updates/sec](./benefits/body/Speed.md), `100,000`-row buffered grids, and live cross-window component mobility on a single `SharedWorker` heap. These guides walk you through every layer of the architecture with runnable, interactive examples.

<details>
<summary>Click here to see how disclosure widgets work</summary>
<p style="background-color:lightgreen;padding:8px">Throughout the documentation, optional deep-dives and secondary implementation notes are placed inside expandable <code>&lt;details&gt;</code> disclosure widgets like this one so you can scan core concepts first and reveal details on demand.</p>
</details>

## Where to Start — Three Reader Paths

- **Evaluating or Building with the Application Engine:** Start with [Introduction](./benefits/Introduction.md) and [Architecture Overview](./benefits/ArchitectureOverview.md), then walk through [Getting Started](./gettingstarted/Workspaces.md), [Guides](./guides/fundamentals/CodebaseOverview.md) (covering the `514`-class component library across *Fundamentals*, *Data Handling*, [Forms](./benefits/body/FormsEngine.md), and the *UI Building Blocks* dock-layout guides), and [Tutorials](./tutorials/DockLayoutsFirstLayout.md).
- **Evaluating Neo.mjs Against Frameworks or Ext JS:** Start with the [Enterprise Evaluation](./benefits/EnterpriseEvaluation.md), which answers what an architecture review asks with commands and public records. Then review the [Introduction Claims & Proof Register](./benefits/Introduction.md), the [Body Benefits](./benefits/body/OffTheMainThread.md) ([Multi-Window](./benefits/body/MultiWindow.md), [Four Environments](./benefits/body/FourEnvironments.md)), and [Engine vs Frameworks](./comparisons/Overview.md) (including [Neo.mjs vs Ext JS](./comparisons/NeoVsExtJs.md)).
- **Running or Integrating Coding Agents:** Open **Brain Interface, Fleet & Agent Tooling** — starting with [Agent Institution](https://neomjs.com/learn/institution/Introduction) and [Cockpit Tour](https://neomjs.com/learn/institution/CockpitTour) for the operator cockpit, [Fleet Manager Architecture](./agentos/FleetManagerArchitecture.md) and [Running the Fleet Cockpit](./agentos/RunningTheFleetCockpit.md) for topology and local boot, [Memory Core](https://neomjs.com/learn/agentos/MemoryCore) and [The Dream Pipeline](https://neomjs.com/learn/agentos/DreamPipeline) under **Agent OS**, [Tooling & Configuration](https://neomjs.com/learn/agentos/tooling/Introduction) and [Deploying the Agent OS](https://neomjs.com/learn/agentos/cloud-deployment/Overview) for MCP and Docker setup, and [The Neural Link](./agentos/NeuralLink.md), [Progressive Disclosure Skills](./agentos/ProgressiveDisclosureSkills.md), [Core Skills](./agentos/CoreSkills.md), and [The Seat Memory Layer](./agentos/SeatMemoryLayer.md) for runtime possession and skill discipline.

## How the Content is Organized

The learning navigation tree (`learn/tree.json`) composes `228` visible topics across ten sections (`133` Engine topics plus `95` federated guides from `neo-agent-brain`, `neo-agent-institution`, and `devindex`, alongside hidden redirect/legacy routes and the `learn/blog/` articles):

1. **Using These Topics:** How the learning base is organized and how to run and edit the inline live-preview examples below.
2. **Benefits:** The [Introduction](./benefits/Introduction.md), [Architecture Overview](./benefits/ArchitectureOverview.md), [Enterprise Evaluation](./benefits/EnterpriseEvaluation.md), **The Brain - Agent OS** (`6` pages covering the [AI Engineering Team](https://neomjs.com/learn/benefits/brain/AIEngineeringTeam), [Identity, Rituals & Culture](https://neomjs.com/learn/benefits/brain/IdentityRitualsCulture), [Agent Memory](https://neomjs.com/learn/benefits/brain/AgentMemory), [Self-Evolution](https://neomjs.com/learn/benefits/brain/SelfEvolution), [The Agent OS on Your Codebase](https://neomjs.com/learn/benefits/brain/AgentOSOnYourCodebase), and [Deploying the Agent OS](https://neomjs.com/learn/benefits/brain/DeployingTheAgentOS)), and **The Body - Application Engine** (`13` pages covering Off-the-Main-Thread workers, multi-window apps, the config system, forms, and four build environments) — `22` pages in all.
3. **Getting Started:** Creating workspaces, describing UI with JSON blueprints, reactive configs, and worker debugging.
4. **Brain Interface, Fleet & Agent Tooling:** Operating coding agents across **Agent OS** (`23` architecture guides), **Tooling & Configuration** (`18` MCP contracts and operational runbooks), **Deploying the Agent OS** (`15` Docker and cloud-deployment guides), **Agent Institution** (`7` cockpit and native-vessel guides), the `7` Engine-hosted Neural Link, Cockpit, Skill, and Seat Memory guides, and `8` retained Architectural Decision Records (`78` topics).
5. **Guides:** In-depth engineering guides grouped into ten shelves: *Fundamentals*, *The Core Engine*, *The VDOM Engine*, *UI Building Blocks* (including the dock-layout series and web desktops), *Data Handling*, *User Interaction*, *Testing*, *Specific Applications/Features*, *Advanced Architecture*, and the `26`-topic *DevIndex App* case study.
6. **Tutorials:** Step-by-step builds (`DockLayoutsFirstLayout`, `TodoList`, `Earthquakes`, `CreatingAFunctionalButton`, `Routing`) that combine multiple engine primitives.
7. **JavaScript Classes:** How Neo.mjs builds on standard ES module classes, private fields, and `Neo.setupClass`.
8. **Engine vs Frameworks:** Architectural comparisons between Neo.mjs and React, Angular, Vue, Solid, Svelte, and Sencha Ext JS.
9. **Glossary:** Concise definitions of core Neo.mjs and Agent OS terms (`OMT`, `VDOM`, `VNode`, `RMA`, `Neural Link`, `State Provider`).
10. **API Docs:** Direct route (`/docs`) to the generated JSDoc class and method reference.

## Live Previews

Many topics include runnable `live-preview` examples rendered by `Neo.code.LivePreview` as tab panels with **Source** and **Preview** tabs. Click the **Preview** tab to mount and interact with the live component, or edit the code in the **Source** tab to see your changes applied immediately in **Preview**.

You can also launch any preview into its own native browser window by clicking the window popout icon (<span class="far fa-xs fa-window-maximize"></span> *"Open preview in a separate window"*) on the right side of the preview tab bar. Because the Portal itself is a Neo.mjs application, popped-out preview windows are not isolated iframes — they stay live-wired to the same multi-window runtime, demonstrating a capability that is physically impossible in traditional single-threaded frameworks:

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

---

Your journey into Neo.mjs starts here. Continue to the [Introduction](./benefits/Introduction.md) to explore the full architecture and proof register, or jump straight to [Getting Started](./gettingstarted/Workspaces.md) to build your first Off-Main-Thread application.
