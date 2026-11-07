# Multi-Window Applications

## One Application, Many Windows

Your users already work across screens. The customer record sits on one monitor and the ticket queue on the other;
the chart goes up on the projector while the filters stay on the laptop; the reference grid floats beside the form
being filled in. On the desktop, applications have offered this for decades. On the web it has always stopped at the
same line: **the window boundary.**

A second browser window is a second document, a second JavaScript heap and a second DOM. The web's docking libraries
answer that one of two ways. Either the panel that arrives in the new window is rebuilt from serialized state, a fresh
instance that lost the scroll position, the selection and the half-typed edit. Or it is rendered from the opener's
realm and dies the moment the opener reloads or closes. The design record behind Neo's docking subsystem
([ADR 0029](../../agentos/decisions/0029-docking-design.md)) surveyed the field against the desktop bar and found no
surveyed web library that keeps a docked panel alive independently of the window it came from.

Neo.mjs takes a different position: **the application lives once, in a SharedWorker heap, and every window is a
render target.** The component that shows your order book in the main window is the same object that shows it in the
popup. It is not a copy and not a serialized twin, so its state, its subscriptions and its data travel with it.

## What this gives your application

*   **Windows that share one application.** All open windows read the same stores and the same state. There is no
    inter-window messaging to write, because there is nothing to synchronize: a record edited in one window is the
    same record in every other.
*   **Components that move without restarting.** A grid, a chart or a whole form can leave one window and mount in
    another while keeping its JavaScript instance, its scroll position and its unsaved input.
*   **Any monitor arrangement.** Windows can sit on different monitors, and the application keeps working as one.
*   **Any kind of application.** Back-office tools where the lookup grid floats beside the form, analytics dashboards
    whose charts tear out onto a second screen, customer-service desks with several cases open at once, trading and
    monitoring desks spread across three monitors: they all rest on the same engine capability.

## Dock Layouts: the desktop docking language, in the browser

On top of that capability, Neo.mjs ships **Dock Layouts** (`src/dashboard/dock`): the interaction language that
desktop teams know from IDEs and trading floors.

*   Drag a pane by its tab and drop it beside, below or into another zone, guided by a drop indicator.
*   Tear a pane out into its own operating-system window, and dock it back when you are done.
*   Tuck noisy panes into auto-hide rails, maximize the one that matters, and lock what must not change.
*   Save the whole arrangement as a named perspective and restore it tomorrow. A layout is one small JSON document,
    so it can be stored, versioned and shared like any other data.

Watch it in the [Dock Layouts film](https://www.youtube.com/watch?v=KESyjFmOz0k) ("One Application, Many Windows"),
or run the `apps/workstation` showcase. To build your own, start with
[Dock Layouts: One Application, Many Windows](../../guides/uibuildingblocks/DockLayouts.md) and the tutorial
[Your First Dock Layout](../../tutorials/DockLayoutsFirstLayout.md). Then go deeper with
[A Pane's Life Across Windows](../../guides/uibuildingblocks/DockLayoutsWindows.md),
[State, Operations and Persistence](../../guides/uibuildingblocks/DockLayoutsStateAndPersistence.md),
[what users can do with a dock](../../guides/uibuildingblocks/DockLayoutsFeatures.md), and the
[dock-zone model contract](../../agentos/DockZoneModel.md).

## Your coding agent sees every window

Because every window renders the same heap, a coding agent connected through the
[Neural Link](../../agentos/NeuralLink.md) sees your whole application at once. It can see which window shows which
component, read the live instance behind each one, open a component in a new window, move windows, and check a fix
across all of them without a reload. A multi-window application is usually the hardest kind to debug. With Neo.mjs it
is the one where your agent sees the most.

<details>
<summary><h3>Try it on this page</h3></summary>
The page you are reading is part of a Neo.mjs application: the Portal. In the example below, click Preview, then click
the new-window icon on the right side of the toolbar. The code launches in a new browser window, and it is still part
of the same application: both windows share events and data, and the code does not care which window it renders into.
```javascript live-preview
import Button    from '../button/Base.mjs';
import Container from '../container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Benefits.multiwindow.MainView',
        layout   : {ntype:'vbox', align:'start'},
        items    : [{
            module : Button,
            iconCls: 'fa fa-home',
            text   : 'Home'
        }]
    }
}

MainView = Neo.setupClass(MainView);
```

</details>
