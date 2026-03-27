# The Unified Data Pipeline Architecture

## Introduction

Historically, frontend frameworks have handled local API requests (like fetching a JSON file) and remote procedure calls (RPC) to backend services using completely different paradigms. You might use `fetch()` or `XMLHttpRequest` for local data, and a completely separate library or abstraction for WebSockets and RPC calls.

Neo.mjs introduces the **Unified Data Pipeline Architecture**. This architecture eliminates the boundary between local fetches and remote calls. Whether you are loading a local JSON file, executing a standard REST API call, subscribing to a continuous WebSocket stream, or dispatching an RPC command to a remote service, the data flows through the exact same Pipeline mechanism.

This guide explains the four core pillars of this architecture: **Pipelines**, **Connections**, **Parsers**, and **Normalizers**, and how they enable powerful features like "Turbo Mode" and Cross-Worker execution.

## The Four Pillars

A Data Pipeline in Neo.mjs is essentially an assembly line. Raw bytes or requests enter at the start, and fully formed, predictable JavaScript objects exit at the end, ready for a `Store` to consume.

### 1. Connections (The Transport Layer)
The Connection is the gateway to the outside world. Its **only** job is transport. It handles the low-level protocols, network handshakes, and returning the raw payload.

*   `Neo.data.connection.Fetch`: Wraps the modern browser `fetch` API.
*   `Neo.data.connection.Xhr`: Wraps the legacy `XMLHttpRequest` API.
*   `Neo.data.connection.WebSocket`: Handles persistent, bidirectional socket connections.
*   `Neo.data.connection.Stream`: A specialized transport that returns a raw `ReadableStream` (byte pipe), useful for chunked data.

### 2. Parsers (The Deserializer)
Connections often return data in formats that JavaScript cannot natively digest (e.g., text, byte streams, XML, CSV, NDJSON). The Parser takes the raw output from the Connection and translates it into JavaScript objects.

*   `Neo.data.parser.Stream`: Takes a raw byte stream, chunks it by newlines, parses the NDJSON, and trickles the data forward.
*   *Note: Standard JSON responses from `Fetch` or `Xhr` often don't need a formal parser if the native `.json()` method is sufficient.*

### 3. Normalizers (The Shaper)
Even if data is valid JSON, its shape might not match what your `Store` expects. Your backend might wrap the data in metadata (`{ success: true, payload: [...] }`), or use different property names. The Normalizer bridges this gap, flattening or mapping the data into the canonical structure defined by your `Model`.

### 4. The Pipeline (The Orchestrator)
The `Neo.data.Pipeline` ties these three pieces together. It manages the flow of data from Connection -> Parser -> Normalizer.

Crucially, the Pipeline is the **Worker Execution Boundary**. You can configure a Pipeline to execute its heavy lifting in the `App` Worker or offload it entirely to the `Data` Worker to prevent UI freezing during massive data loads.

---

## 1. A Basic Fetch Pipeline

Let's start with the most common scenario: fetching a standard JSON file.

When you define a `url` on a Store, under the hood, Neo.mjs automatically creates a Pipeline using an `Xhr` or `Fetch` connection. However, explicitly defining the pipeline gives you total control.

```javascript live-preview
import Button          from '../../src/button/Base.mjs';
import Container       from '../../src/container/Base.mjs';
import ConnectionFetch from '../../src/data/connection/Fetch.mjs';
import Model           from '../../src/data/Model.mjs';
import Store           from '../../src/data/Store.mjs';
import Table           from '../../src/table/Container.mjs';

class UserModel extends Model {
    static config = {
        className: 'Docs.UserModel',
        keyProperty: 'id',
        fields: [
            {name: 'id',   type: 'Integer'},
            {name: 'name', type: 'String'},
            {name: 'role', type: 'String'}
        ]
    }
}
UserModel = Neo.setupClass(UserModel);

class UserStore extends Store {
    static config = {
        className: 'Docs.UserStore',
        model    : UserModel,
        // The unified pipeline configuration
        pipeline : {
            connection: {
                module: ConnectionFetch,
                url   : '../../resources/data/users.json'
            }
        }
    }
}
UserStore = Neo.setupClass(UserStore);

const myStore = Neo.create(UserStore);

class Example extends Container {
    static config = {
        className: 'Docs.DataPipelineExample1',
        layout: {ntype: 'vbox', align: 'stretch'},
        items : [{
            module : Button,
            flex   : 'none',
            text   : 'Load Data via Pipeline',
            handler: () => myStore.load()
        }, {
            module : Table,
            flex   : 1,
            store  : myStore,
            columns: [
                {dataField: 'id',   text: 'ID'},
                {dataField: 'name', text: 'Name'},
                {dataField: 'role', text: 'Role'}
            ]
        }]
    }
}
Example = Neo.setupClass(Example);
```

---

## 2. Offloading to the Data Worker

If your JSON file is massive (e.g., 50,000 records), processing that fetch, parsing the JSON string, and converting it into Records inside the App Worker will cause a noticeable stutter in your UI.

Because the Pipeline acts as the Execution Boundary, you can simply tell it to execute in the `Data` Worker. The App Worker Pipeline becomes a lightweight proxy. It instructs the Data Worker to establish the Connection, parse the data, and send only the finalized chunks back via fast IPC (Inter-Process Communication).

To enable this, simply add `workerExecution: 'data'` to your pipeline config:

```javascript
pipeline: {
    workerExecution: 'data',
    connection: {
        className: 'Neo.data.connection.Fetch',
        url      : '../../resources/data/massive_dataset.json'
    }
}
```
*Note: When using `workerExecution: 'data'`, you must use string-based `className` references (e.g., `'Neo.data.connection.Fetch'`) instead of `module` imports for your connection/parser/normalizer. This ensures the configs can be cleanly serialized and sent to the other thread without dragging App-specific modules across the worker boundary.*

---

## 3. The RPC/WebSocket Universe

Because RPC and local fetching now share the same architecture, integrating a WebSocket backend is identical to setting up a local Fetch.

If your project defines an RPC API (via `remotes-api.json`), you don't even need to define the connection manually. You just reference the API endpoint, and the system dynamically constructs the WebSocket pipeline for you.

```javascript readonly
import Container from '../../src/container/Base.mjs';
import Model     from '../../src/data/Model.mjs';
import Store     from '../../src/data/Store.mjs';
import Table     from '../../src/table/Container.mjs';

// Assume remotes-api.json defines a WebSocket stream:
// "services": { "Backend": { "streams": { "LiveUsers": { "type": "websocket", "url": "wss://..." } } } }

class LiveUserModel extends Model {
    static config = {
        className: 'Docs.LiveUserModel',
        keyProperty: 'id',
        fields: [
            {name: 'id',     type: 'Integer'},
            {name: 'status', type: 'String'}
        ]
    }
}
LiveUserModel = Neo.setupClass(LiveUserModel);

class LiveUserStore extends Store {
    static config = {
        className: 'Docs.LiveUserStore',
        model    : LiveUserModel,
        // Instead of 'url', we use the 'api' shortcut.
        // The Store automatically builds a Pipeline with a WebSocket connection.
        api      : 'MyApp.backend.LiveUsers'
    }
}
LiveUserStore = Neo.setupClass(LiveUserStore);

const liveStore = Neo.create(LiveUserStore);

class Example extends Container {
    static config = {
        className: 'Docs.DataPipelineExample2',
        layout: {ntype: 'vbox', align: 'stretch'},
        items : [{
            module : Table,
            flex   : 1,
            store  : liveStore,
            columns: [
                {dataField: 'id',     text: 'User ID'},
                {dataField: 'status', text: 'Status'}
            ]
        }]
    }
}
Example = Neo.setupClass(Example);
```

### Unsolicited Pushes & UI Reactivity

The true power of the Pipeline architecture shines with real-time data.

If a WebSocket Connection receives an unsolicited "push" from the server (e.g., `{ "id": 4, "status": "offline" }`), the Connection fires a `push` event.
The Pipeline catches this, passes it through the Parser and Normalizer, and forwards it to the Store.

The Store intercepts the `push` event, automatically looks up Record ID #4, and calls `record.set({ status: 'offline' })`. This triggers the surgical reactivity engine, updating **only that specific row** in the Grid, without ever reloading the collection.

## Migration Path for Legacy Configs

If you are upgrading from an older version of Neo.mjs, your existing `url` and `api` configs on Stores are still fully supported.

*   **Legacy `url`:** If you define `url: 'data.json'`, the Store automatically creates a Pipeline using `connection-xhr` behind the scenes.
*   **Legacy `api`:** If you define `api: 'MyService'`, the Store resolves the API definition and builds the appropriate Pipeline (Fetch, Xhr, or WebSocket) dynamically.

However, to unlock advanced features like Data Worker offloading (`workerExecution: 'data'`) or custom Parsers, you must switch to explicitly defining the `pipeline` config block.
