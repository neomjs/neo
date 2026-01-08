# Codebase Overview: Neo.mjs - The AI-Native Web Platform

> **Note for Readers:** This guide is primarily written for AI agents working with the Neo.mjs codebase and is part of their required session initialization. However, it also serves as a comprehensive overview for human developers seeking to understand the platform's scale, architecture, and design philosophy. References to "querying" refer to the AI Knowledge Base system available to agents.

## Understanding the Scale (State of January 2026)

Neo.mjs is not a library. It's a **comprehensive web platform** with:

- **45,244 lines** of core engine source (370 files)
- **19,210 lines** of working examples (485 files)
- **16,478 lines** of flagship applications (313 files)
- **13,714 lines** of AI infrastructure (105 files)
- **6,769 lines** of automated tests (56 files)
- **5,813 lines** of build tooling (44 files)
- **1,294 lines** of documentation app (17 files)
- **12,137 lines** of production theming (446 SCSS files)
- **52,850 lines** of JSDoc documentation

**Total: ~121,000 lines of source code + 53,000 lines of documentation = ~174,000 lines of knowledge**

The documentation lines count. They contain intent, architectural rationale, and usage patterns—knowledge that's as valuable as the code itself for understanding the platform.

**Note:** These metrics exclude:
- The `/dist` directory (production builds, which would triple these numbers)
- Markdown files in `/learn` (~100 files of guides, tutorials, and blog posts)
- Generated documentation outputs

This is not a small library—it's a comprehensive platform with more source code than many established frameworks. It represents a decade of architectural thinking about how web applications *should* work—and how AI agents *should* collaborate with them.

---

## The Vision: A New Operating System for the Web

Neo.mjs reimagines web development from first principles. It's not "React, but faster" or "Vue, but different." It's a fundamentally different architecture that treats the browser as a **distributed computing environment**, not a single-threaded document renderer.

### The Core Insight

> *"The browser's main thread should be treated like a neurosurgeon: only perform precise, scheduled operations with zero distractions."*

Everything in Neo.mjs flows from this principle. Every architectural decision—the worker threads, the VDOM protocol, the config system—exists to keep the main thread doing exactly one job: updating the DOM with surgical precision.

---

## The Architecture: Why These Choices?

### 1. True Multithreading (Not Just "Web Workers")

**The Problem**: Single-threaded frameworks fundamentally cannot prevent UI jank. They use schedulers and time-slicing, but they're still fighting the browser's event loop.

**The Solution**: Neo.mjs moves *all application logic* to dedicated workers:
- **App Worker**: Your entire application (components, state, logic)
- **VDom Worker**: Diffing and patching calculations
- **Data Worker**: Store operations and data transformations
- **Canvas Worker**: Canvas-based rendering for charts and graphics
- **Task Worker**: Generic background task processing
- **Main Thread**: DOM updates only

**The Trade-off**: Added architectural complexity, but guaranteed smoothness under load.

**The Result**: Over 40,000 delta updates per second in optimized environments. The UI never freezes, regardless of computational intensity.

---

### 2. The VDOM as a Cross-Thread Protocol

**The Problem**: Workers communicate via `postMessage`, which requires serializable data. JSX and function components aren't serializable.

**The Solution**: The Virtual DOM *is* the protocol. Components describe themselves as **JSON blueprints**:
```javascript
{
    tag: 'div',
    cls: ['neo-container'],
    cn: [/* children */]
}
```

**The Trade-off**: More verbose than JSX, but:
- Serializable by definition
- Language-agnostic (ideal for AI generation)
- Debuggable without source maps
- Zero compilation required

**The Result**: The VDOM isn't a rendering optimization; it's the **IPC (Inter-Process Communication) layer** of the platform.

---

### 3. Two-Tier Reactivity (Not One-Size-Fits-All)

**The Problem**: Different use cases need different reactivity models:
- Local component state → Simple, imperative updates (push)
- Application-wide state → Dependency tracking (pull)

**The Solution**: Neo.mjs provides both:

**Push-based (Classic)**: Reactive configs with lifecycle hooks
```javascript
static config = {
    myValue_: 'default'  // Trailing underscore = reactive
}

afterSetMyValue(value, oldValue) {
    // React to changes
}
```

**Pull-based (Modern)**: `Effect` with automatic dependency tracking
```javascript
Neo.create(Effect, {
    fn: () => this.sum = this.a + this.b  // Auto-tracks a and b
})
```

**The Trade-off**: Two systems to learn, but optimal performance for each use case.

**The Result**: Fine-grained reactivity where you need it, coarse-grained where you don't.

---

### 4. Zero-Build Development Mode

**The Problem**: Build tools add complexity, slow iteration, and create debugging friction (source maps are never perfect).

**The Solution**: Neo.mjs apps run as **native ES Modules directly in the browser**. No transpilation. No bundling. No build step in development.

**The Trade-off**: Modern browser required (ES6+ support).

**The Result**:
- Instant reload on file save
- Debug the exact code you wrote
- 100% web standards alignment
- Future-proof architecture

---

## The Major Subsystems: What Exists to Explore

### Component System (Two Models)

**Class-based Components**: Full engine features
- Reactive configs with `beforeGet`/`beforeSet`/`afterSet` hooks
- Mixins for composable behavior
- Full inheritance chain
- Instance lifecycle management

**Functional Components**: Lightweight alternative
- Stateless by default
- Pure render functions
- Composable via nesting
- Full interop with class-based components

Both models work together seamlessly. Choose based on your needs.

---

### Forms Engine

A complete form management system that goes beyond HTML forms:

- **True Nested Forms**: Forms can contain other forms (impossible in HTML)
- **Detached Validation**: Validate forms that aren't mounted in the DOM
- **Integrated State Provider**: Form state lives in the App Worker
- **20+ Field Types**: Text, Number, Date, Time, Picker, ComboBox, Chip, Currency, Phone, Email, URL, Password, Search, Range, Color, Country, FileUpload, Hidden, Switch, Radio, CheckBox
- **Multi-step Wizards**: Preserve state across navigation

---

### Data Layer

A highly optimized and flexible data layer designed for performance with large datasets.

**Neo.data.Model**: The blueprint for your data records.
- Defines the schema for records, including field names, types, and default values.
- Supports calculated fields and data validation rules.
- Can be configured to track modifications to fields (`trackModifiedFields`).

**Neo.collection.Base**: The foundation for data collections.
- Provides powerful client-side filtering and sorting capabilities.
- Manages items with a key-based map for fast lookups.
- Fires mutation events for observing changes.

**Neo.data.Store**: A powerful collection manager for records, which extends `Neo.collection.Base`.
- Can be loaded with raw JavaScript objects for maximum performance.
- Uses a `RecordFactory` to create lightweight, reactive record instances **on-demand** when data is accessed. This lazy-instantiation approach is extremely memory-efficient.
- Inherits filtering and sorting from `collection.Base` and adds support for remote operations (e.g., remote filtering, pagination).
- Supports loading data from remote APIs.

**Neo.state.Provider**: Hierarchical state
- Application-wide state management
- Lives entirely in App Worker
- Automatic change propagation
- Scoped state for component subtrees

---

### Layout System

Declarative layout management without manual positioning:

- **Card**: Show one child at a time (tabs, wizards, carousels)
- **Fit**: Single child fills container completely
- **Flexbox**: CSS flexbox abstraction with sensible defaults
- **HBox/VBox**: Horizontal/vertical flexbox shortcuts
- **Grid**: CSS Grid layout with responsive templates
- **Form**: Specialized layout for form fields with labels

Layouts compose: nest containers with different layouts to achieve complex UIs.

---

### Multi-Window Support

Desktop-class application architecture:

- Single App Worker manages multiple browser windows
- Shared state across windows in real-time
- Move components between windows (keep JavaScript instances alive)
- Window-specific theming and configuration
- Cross-window drag-and-drop
- Use cases: Trading dashboards, monitoring systems, multi-monitor workflows

---

### Component Library (The "Batteries")

**Containers**:
- `Base`, `Panel`, `Viewport`, `Accordion`

**Forms** (20+ field types):
- `Text`, `Number`, `Date`, `Time`, `Picker`, `ComboBox`, `Chip`, `Color`, `Country`, `Currency`, `Phone`, `Email`, `URL`, `Password`, `Search`, `Range`, `FileUpload`, `Hidden`, `Switch`, `Radio`, `CheckBox`, `TextArea`

**Data Display**:
- `Grid`: Spreadsheet-like data grid with sorting, filtering, cell editing
- `Table`: Simpler table component for basic data display
- `List`: Virtualized list with selection models
- `Tree`: Hierarchical data with expand/collapse
- `Gallery`: Image gallery with multiple layout modes
- `Helix`: 3D carousel effect for images/cards

**Navigation**:
- `Tab`: Tabbed interfaces with multiple layout modes
- `Breadcrumb`: Hierarchical navigation
- `Menu`: Context menus and dropdowns
- `Toolbar`: Action bars with buttons, separators, spacers

**Feedback**:
- `Toast`: Temporary notifications
- `Dialog`: Modal dialogs with custom content
- `Progress`: Progress bars and spinners
- `Tooltip`: Contextual help on hover

**Third-Party Wrappers**:
- `AmCharts`: Full-featured charting library
- `MapboxGL`: Interactive maps
- `Monaco Editor`: Code editor (powers VS Code)
- `CesiumJS`: 3D globe and map visualization
- `Google Maps`: Maps integration
- `OpenStreetMap`: Open-source maps

---

## The Knowledge Landscape: What's Available to Query

### Core Engine (`/src` - 351 files, 81k lines)

**Foundation**:
- `Neo.mjs`: The entry point. Class factory, `setupClass()`, global configuration
- `core/Base.mjs`: Foundation of all classes. Config system, instance lifecycle, destruction
- `core/Config.mjs`: The reactive config system implementation
- `core/Effect.mjs`: The pull-based reactivity system

**Workers**:
- `worker/App.mjs`: Application worker logic
- `worker/VDom.mjs`: Virtual DOM worker
- `worker/Data.mjs`: Data processing worker
- `worker/Canvas.mjs`: Canvas-based rendering worker
- `worker/Task.mjs`: Generic background task worker
- `worker/Base.mjs`: Shared worker foundation

**Component Architecture**:
- `component/Base.mjs`: Base class for all UI components
- `component/Abstract.mjs`: Lower-level component abstraction
- `container/Base.mjs`: Base class for containers (components with children)

**Data & State**:
- `data/Model.mjs`: Record definition and validation
- `data/Store.mjs`: Collection management
- `state/Provider.mjs`: Hierarchical state management

**Managers** (Global Singletons):
- `manager/Component.mjs`: Component registry and lookup
- `manager/Focus.mjs`: Application-wide focus management
- `manager/DomEvent.mjs`: Event delegation and handling

---

### Working Examples (`/examples` - 485 files, 25k lines)

Focused demonstrations organized by category:
- **Component examples**: Button, Form, Grid, List, Tab, Tree, etc.
- **Feature showcases**: Drag-drop, animations, theming, routing
- **Integration examples**: AmCharts, Google Maps, Monaco, etc.
- **Layout demonstrations**: All layout types with variations
- **Form examples**: Field types, validation, nested forms, wizards

Each example is self-contained and demonstrates one concept clearly.

---

### Flagship Applications (`/apps` - 260 files, 23k lines)

**Portal** (`apps/portal/`):
- The neo.mjs.com website source
- Multi-window IDE with live code editing
- Dynamic theming system
- Component browser with live examples
- Source code viewer with syntax highlighting

**SharedCovid** (`apps/sharedcovid/`):
- Multi-window data visualization
- Real-time COVID-19 statistics
- Shared state across multiple windows
- AmCharts integration
- Gallery and Helix components

**RealWorld** (`apps/RealWorld/`):
- Standard benchmark application (Conduit clone)
- Demonstrates full CRUD operations
- Routing and navigation
- Authentication and state management

---

### Learning Materials (`/learn`)

**Structured Content**:
- **Benefits**: Why Neo.mjs exists, what problems it solves
- **Getting Started**: First steps, tutorials, quick wins
- **Fundamentals**: Core concepts, architecture deep-dives
- **Guides**: Task-oriented how-tos
- **Blog**: Historical context, design decisions, evolution

The content in `/learn` is the source material for the AI Knowledge Base. Query it for conceptual understanding.

---

### Historical Context

**Release Notes** (`.github/RELEASE_NOTES/`):
- Version-by-version changelog
- Feature additions with rationale
- Bug fixes and their context
- Breaking changes and migration guides

**Ticket Archive** (`.github/ISSUE_ARCHIVE/`):
- Closed issues organized by release version
- Full context: problem, discussion, solution, implementation
- Searchable history of decisions

Query these when you need to understand *why* something works a certain way.

---

## The AI-Native Design

Neo.mjs isn't just "AI-friendly"—it was **architected for AI collaboration from the ground up**.

### The Evidence: 9,120 Lines of AI Infrastructure

The platform includes three dedicated Model Context Protocol (MCP) servers (47 files):

**1. Knowledge Base Server** (`ai/mcp/server/knowledge-base/`)
- Indexes the entire platform: source code, examples, guides, release notes, tickets
- Semantic search via vector embeddings (ChromaDB + Google Gemini)
- Sophisticated scoring algorithm prioritizing relevance
- Pre-calculates class inheritance chains for fast queries
- Transforms ~158k lines of code into queryable knowledge

**2. Memory Core Server** (`ai/mcp/server/memory-core/`)
- Long-term conversational memory across sessions
- Consolidates agent "thought process" for analysis
- Enables learning from past decisions
- Supports session summaries and context retrieval

**3. GitHub Workflow Server** (`ai/mcp/server/github-workflow/`)
- 2-way sync between local filesystem and GitHub issues
- Automated ticket creation with templates
- Status tracking and archival
- Ensures all work is traceable and documented

### Why This Matters for You

You're not operating in a typical codebase. You have:

- **Queryable Everything**: The knowledge base contains the *entire platform* indexed and searchable
- **Semantic Understanding**: Vector embeddings understand *meaning*, not just keywords
- **Historical Memory**: Past conversations and decisions are preserved
- **Structured Conventions**: Consistent patterns make navigation predictable

**JSON-First Architecture**: The VDOM format is AI-readable and AI-writable. You can generate valid Neo.mjs UI from natural language descriptions.

**Comprehensive Documentation**: 30,000 lines of JSDoc provide rich context for every class, method, and config.

**Inheritance Pre-Calculation**: The knowledge base pre-computes class hierarchies. When you query a component, you automatically get its parent chain for full context.

You're not just working *with* Neo.mjs. You're working *inside* an ecosystem designed for seamless human-AI collaboration.

---

## Key Concepts: Query Entry Points

When you need to understand Neo.mjs, these are high-value concepts to query. Use these terms with the `query_documents` tool to find relevant source files and guides.

### Architecture & Philosophy
- `"multithreading"`, `"worker architecture"`, `"App Worker"`, `"VDom Worker"`
- `"off main thread"`, `"main thread"`, `"delta updates"`
- `"VDOM protocol"`, `"JSON blueprint"`, `"virtual dom"`
- `"RPC"`, `"remote method access"`, `"postMessage"`

### Component System
- `"component.Base"`, `"container.Base"`, `"core.Base"`
- `"reactive config"`, `"config system"`, `"trailing underscore"`
- `"functional component"`, `"class-based component"`
- `"lifecycle"`, `"construct"`, `"onConstructed"`, `"destroy"`

### Reactivity & State
- `"afterSet"`, `"beforeSet"`, `"beforeGet"`
- `"Effect"`, `"state.Provider"`, `"state management"`
- `"two-tier reactivity"`, `"dependency tracking"`

### Data Management
- `"data.Model"`, `"data.Store"`, `"collection"`
- `"filter"`, `"sort"`, `"store"`, `"proxy"`

### Forms
- `"form.Container"`, `"form.field"`, `"validation"`
- `"nested forms"`, `"detached validation"`
- `"field types"`, `"form state"`

### Layouts
- `"layout"`, `"Card layout"`, `"Fit layout"`
- `"Flexbox"`, `"HBox"`, `"VBox"`, `"Grid layout"`

### Advanced Features
- `"multi-window"`, `"shared state"`, `"child apps"`
- `"theming"`, `"dark mode"`, `"CSS variables"`
- `"drag drop"`, `"sortable"`, `"resizable"`

### Component Library
- Specific components: `"Button"`, `"Grid"`, `"Tab"`, `"Tree"`, `"Form"`, etc.
- Wrappers: `"AmChart"`, `"MapboxGL"`, `"Monaco"`, `"CesiumJS"`

---

## What Makes Neo.mjs Different

If you're coming from other frameworks, here are the key mental shifts:

### Not React
- No JSX → JSON VDOM blueprints
- No hooks → Reactive configs with lifecycle methods
- No virtual DOM reconciliation on main thread → Dedicated VDom Worker
- No single-threaded event loop → True multithreading

### Not Vue
- No template compilation → Direct VDOM construction
- No Options API / Composition API → Class-based with configs
- No Vuex needed → Built-in `state.Provider`

### Not Angular
- No TypeScript requirement → Pure ES Modules
- No required CLI for dev → Zero build mode (optional CLI for scaffolding)
- No Zone.js → Explicit reactivity with configs
- Lighter weight → More focused on UI, less on full-stack

### The Neo.mjs Way
- **Declarative everything**: Components, layouts, data, state—all declarative configs
- **Worker-first**: Logic lives in workers, main thread only touches DOM
- **No magic**: Explicit, traceable data flow
- **Batteries included**: Comprehensive component library and tooling
- **Standards-based**: ES Modules, Web Workers, modern browser APIs

---

## How to Approach This Codebase

### Start with the Foundation
1. Read `src/Neo.mjs` to understand the class system and `setupClass()`
2. Read `src/core/Base.mjs` to understand the config system and lifecycle
3. Read a guide: Query `"fundamentals"` or `"getting started"`

### Understand the Architecture
1. Query `"worker architecture"` to understand the threading model
2. Query `"VDOM"` to understand the rendering protocol
3. Query `"reactivity"` to understand state management

### Explore by Example
1. Query `"Button component examples"` for simple component usage
2. Query `"Grid examples"` for complex data display
3. Look at `/apps/portal/` for a complete application

### When Stuck
1. Query the specific concept (e.g., `"afterSet hook"`)
2. Read both the source file (`type='src'`) and guide (`type='guide'`)
3. Check examples (`type='example'`) for practical usage
4. Review tickets (`type='ticket'`) for historical context

---

## Remember

This is a **174,000-line knowledge base**, not a 5k-line library. And that's just the indexed source and JSDoc—it excludes the `/dist` production builds (which would triple it) and ~100 markdown files of learning content in `/learn`.

Don't assume. Query. The knowledge base contains the answers. Your job is to ask the right questions.
