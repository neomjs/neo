**Understanding how Neo.mjs applications start, initialize, and come to life**

## Overview

When you run `npm start` and see your Neo.mjs application in the browser, a sophisticated multi-threaded orchestration
happens behind the scenes. This guide explains the complete application bootstrap process, from initial configuration
loading to your first rendered component.

## The Big Picture

Neo.mjs applications don't start like traditional web apps. Instead of running everything on the main browser thread,
Neo.mjs creates a **multi-worker architecture** where your application logic runs in a dedicated **App Worker**,
completely separate from DOM manipulation.

```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │ Main Thread │ │ App Worker │ │ VDom Worker │ │ │ │ │ │ │ │ • DOM Updates │ │ • Your App Code │ │ • VDom Diffing │ │ • Event Capture │ │ • Components │ │ • Optimization │ │ • Rendering │ │ • Business Logic│ │ • Delta Calc │ └─────────────────┘ └─────────────────┘ └─────────────────┘
``` 

**Key Insight:** Your application code lives entirely in the **App Worker** - a rich JavaScript environment with full framework access, while DOM operations happen automatically on the Main Thread.

## Bootstrap Sequence

### 1. Configuration Loading

Every Neo.mjs application starts with a `neo-config.json` file that defines how the application should initialize:
```json
{
    "appPath"       : "../../apps/portal/app.mjs",
    "basePath"      : "../../",
    "environment"   : "development",
    "mainPath"      : "../src/Main.mjs",
    "workerBasePath": "../../src/worker/"
}
``` 

**Key Configuration Properties:**
- **`appPath`** - Points to your application's entry point (app.mjs)
- **`basePath`** - Root path for resolving other paths
- **`environment`** - Controls optimization and debugging features
- **`mainPath`** - Framework's main thread bootstrap file
- **`workerBasePath`** - Location of worker initialization files

### 2. Main Thread Initialization

The main thread starts by loading `src/Main.mjs`, which:

1. **Creates the Worker Manager** - Coordinates all worker threads
2. **Spawns Workers** - App Worker, VDom Worker, Data Worker (if needed)
3. **Establishes Communication** - Sets up message passing between threads
4. **Loads Configuration** - Distributes neo-config.json to all workers

### 3. Worker Spawning and Setup

**App Worker Creation:**
```javascript
// Main Thread creates App Worker
const appWorker = new Worker('src/worker/App.mjs', {type: 'module'});

// App Worker receives configuration and initializes
// worker/App.mjs loads your application entry point
``` 

**VDom Worker Creation:**
```javascript
// VDom Worker handles virtual DOM operations
const vdomWorker = new Worker('src/worker/VDom.mjs', {type: 'module'});
// Optimizes rendering and calculates DOM deltas
``` 

### 4. Application Loading Process

Once workers are initialized, the magic begins:

**Step 1: Dynamic Import**
```javascript
// App Worker dynamically imports your app.mjs
const module = await import('../../apps/portal/app.mjs');
// Your entry point gets loaded into the App Worker context
``` 

**Step 2: Entry Point Execution**
```javascript
// Your app.mjs exports an onStart function export
const onStart = () => Neo.app({ mainView: Viewport, name : 'Portal' });
// Framework calls this function to bootstrap your application
``` 

**Step 3: Application Controller Creation**
```javascript
// Neo.app() creates an Application controller
const app = Neo.create({ module: Neo.controller.Application, mainView: Viewport, // Your main UI component name: 'Portal', // Application identifier appName: 'Portal' // Used for CSS scoping, routing });
``` 

### 5. Component Tree Construction

Your `mainView` component (like `Viewport`) gets instantiated:
```
javascript // Your Viewport component class Viewport extends Container { static config = { className: 'Portal.view.Viewport', layout : 'vbox',
items: [
HeaderComponent,    // Child components
MainPanel,         // All created in App Worker
FooterComponent
]
}
}
``` 

**Component Instantiation Process:**
1. **Viewport created** in App Worker with rich component APIs
2. **Child components instantiated** recursively
3. **Event listeners attached** via framework's event system
4. **Data bindings established** for reactive updates

### 6. VDom Generation and Initial Render

Once the component tree is built:

1. **VDom Generation** - Each component generates its virtual DOM structure
2. **VDom Tree Assembly** - Framework builds complete virtual DOM tree
3. **Initial DOM Creation** - VDom Worker calculates initial DOM structure
4. **DOM Projection** - Main Thread creates actual DOM elements
5. **CSS Application** - Styling and layout applied
6. **Event Delegation Setup** - Event system activated

## The app.mjs Pattern

Your application entry point follows a simple but powerful pattern:
```
javascript // apps/myapp/app.mjs import Overwrites from './Overwrites.mjs'; // Optional framework extensions import Viewport from './view/Viewport.mjs'; // Your main UI component
export const onStart = () => Neo.app({ mainView: Viewport, // Root component of your application name : 'MyApp' // Application identifier });
``` 

**Why This Pattern Works:**
- **Minimal Entry Point** - Framework handles complex initialization
- **Component-Centric** - Your app is just a component tree
- **Configuration-Driven** - Declarative approach to app structure
- **Import-Based** - Clean dependency management

## App Worker: Your Development Environment

Once bootstrap completes, your entire application runs in the **App Worker** - a rich JavaScript environment with:

### Full Framework Access
```
javascript // Inside any component in your app: class MyComponent extends Component { someMethod() { // Component management Neo.getComponent('my-button');
// Data access
Neo.data.Store.getById('users');

    // Routing
    Neo.HashHistory.push({page: 'settings'});
    
    // Utilities
    Neo.util.Array.add(myArray, item);
    
    // State management
    this.getViewModel().setData({loading: true});
    this.getController().loadData();
}
}
``` 

### Event-Driven Architecture
```
javascript // Components communicate via events class ProductGrid extends Grid { static config = { listeners: { select: 'onProductSelect' } }
onProductSelect(data) {
// Fire custom events that bubble up
this.fire('productSelected', {
product: data.record,
grid   : this
});
}
}
``` 

### Reactive Configuration System
```
javascript // Configs automatically trigger UI updates class UserProfile extends Component { static config = { user_: null, // Reactive config
// UI updates automatically when user changes
bind: {
html: data => `Welcome, ${data.user?.name || 'Guest'}!`
}
}

afterSetUser(value, oldValue) {
// Automatic lifecycle method
console.log('User changed:', value);
}
}
``` 

## Multi-Application Scenarios

Neo.mjs supports multiple applications in a single browser session:

### Shared Worker Multi-App
```
javascript // Multiple apps can run simultaneously // apps/crm/app.mjs export const onStart = () => Neo.app({ mainView: CrmViewport, name : 'CRM' });
// apps/accounting/app.mjs
export const onStart = () => Neo.app({ mainView: AccountingViewport, name : 'Accounting' });
// Both run in same App Worker, different browser windows
``` 

### Cross-App Communication
```
javascript // Apps can communicate and share data Neo.apps.CRM.mainView.fire('customerUpdated', { customerId: 123, changes : {status: 'active'} });
// Shared stores, utilities, and state possible
``` 

## Performance and Optimization

### Automatic Optimizations

The bootstrap process includes built-in optimizations:

- **Worker Thread Isolation** - Main thread never blocks
- **Lazy Loading** - Components load only when needed
- **VDom Diffing** - Minimal DOM updates calculated automatically
- **Event Delegation** - Efficient event handling across component tree
- **Memory Management** - Proper cleanup and garbage collection

### Development vs Production

**Development Mode:**
- Source maps for debugging
- Detailed error messages
- Hot reload support
- Performance monitoring

**Production Mode:**
- Minified bundles
- Optimized worker loading
- Reduced debug overhead
- Enhanced caching

## Configuration Deep Dive

### Common Configuration Options

```json
{
    "appPath": "../../apps/myapp/app.mjs",
    "basePath": "../../",
    "environment": "development",
    "useSharedWorkers": false,
    "useServiceWorker": false,
    "themes": ["neo-theme-light"],
    "mainThreadAddons": ["Stylesheet"],
    "workerBasePath": "../../src/worker/"
}
```
```
**Configuration Categories:**
- **Path Resolution** - Where to find files and modules
- **Worker Settings** - How workers should be configured
- **Theme Management** - CSS and styling options
- **Addon Loading** - Additional framework features
- **Environment Flags** - Development vs production settings

### Environment-Specific Configs
Different environments can use different configurations:
- **`neo-config.json`** - Default configuration
- **`neo-config-development.json`** - Development overrides
- **`neo-config-production.json`** - Production optimizations

## Debugging and Troubleshooting
### Common Startup Issues
**Configuration Problems:**
``` 
Error: Failed to resolve module
Solution: Check appPath and basePath in neo-config.json
```
**Worker Loading Failures:**
``` 
Error: Worker script failed to load
Solution: Verify workerBasePath and main thread configuration
```
**Application Module Issues:**
``` 
Error: onStart is not a function
Solution: Ensure app.mjs exports onStart function correctly
```
### Debug Tools
**Worker Communication:**
``` javascript
// Enable worker message logging
Neo.config.logLevel = 'debug';

// Monitor worker messages in browser console
```
**Performance Monitoring:**
``` javascript
// Track bootstrap timing
Neo.config.renderCountDeltas = true;

// Monitor component creation
Neo.config.logLevel = 'info';
```
## Best Practices
### Application Structure
``` 
apps/myapp/
├── app.mjs              ← Entry point
├── neo-config.json      ← Configuration
├── view/                ← UI components
│   ├── Viewport.mjs     ← Main component
│   ├── Header.mjs       ← Child components
│   └── MainPanel.mjs
├── store/               ← Data management
├── model/               ← Data models
└── controller/          ← Business logic
```
### Entry Point Guidelines
``` javascript
// Keep app.mjs minimal and focused
import Overwrites from './Overwrites.mjs';  // Optional
import Viewport   from './view/Viewport.mjs';

export const onStart = () => Neo.app({
    mainView: Viewport,    // Always use a meaningful main component
    name    : 'MyApp'      // Use consistent naming
});

// Avoid complex logic in app.mjs - put it in components
```
### Configuration Management
``` json
{
    // Use relative paths for portability
    "appPath": "../../apps/myapp/app.mjs",
    
    // Keep development-specific settings separate
    "environment": "development",
    
    // Document custom configuration
    "customSettings": {
        "apiEndpoint": "https://api.example.com"
    }
}
```
## What's Next?
