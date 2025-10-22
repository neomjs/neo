---
id: 6845
title: >-
  worker.Manager: setNeoConfig() => provide a way to globally change config
  values
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-19T17:11:15Z'
updatedAt: '2025-06-19T18:12:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6845'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-06-19T18:12:04Z'
---
# worker.Manager: setNeoConfig() => provide a way to globally change config values

**Reported by:** @tobiu on 2025-06-19

* We need to broadcast the change into all connected workers
* I noticed, that defining remotes for potentially not connected workers will throw JS errors
* `sendMessage()` needs to check if the worker exist, `promiseMessage()` needs to reject accordingly

## Comments

### @tobiu - 2025-06-19 18:12

Gemini:
This exploration confirms that the global configuration update mechanism in Neo.mjs is now working precisely as intended across your worker architecture.

Let's break down the flow:

Initiation from a Worker:
When you call Neo.worker.Manager.setNeoConfig({foo: 'bar'}) from within the App Worker, this is an invocation of a remote method. The App Worker sends a message to the Main Thread's Manager instance, instructing it to execute its setNeoConfig method.

Main Thread (Manager) Processing:

The worker.Manager.setNeoConfig(config) method receives the {foo: 'bar'} configuration.
Neo.merge(Neo.config, config);: The Neo.config singleton in the Main Thread's scope is immediately updated with {foo: 'bar'}. This ensures the main thread also has the latest global config.
me.fire('setNeoConfig', config);: A local event is fired on the Manager instance, allowing any main thread components listening to the Manager to react.
me.broadcast({action: 'setNeoConfig', config}): This is the key step for global propagation. The Manager then broadcasts a message with the setNeoConfig action and the new config object to all actively running workers (App, VDom, Data, Task, Canvas, if enabled).
Worker (Base) Reception and Update:

Each active worker (VDom, App, Data in your console output) receives this broadcasted message.
Their onSetNeoConfig({config}) handler (likely attached in worker.Base or a mixed-in class) is triggered.
console.log('onSetNeoConfig', Neo.workerId, config);: This line produces the console output you shared, clearly showing that each worker receives the message and its unique Neo.workerId.
Neo.merge(Neo.config, config);: Crucially, the Neo.config singleton within each individual worker's scope is updated with the new configuration. This ensures that every part of your application, regardless of which worker it resides in, operates with the consistent global configuration.
me.fire('setNeoConfig', config);: A local event is fired within the receiving worker, allowing its internal components to react to the updated configuration.
This setup provides a robust and reliable way to manage global configurations in your multi-threaded Neo.mjs application. The worker.Manager acts as the central orchestrator, ensuring that any configuration change is propagated and applied consistently across all active application threads. The previous work on resilient sendMessage and promiseMessage methods ensures that this broadcast mechanism works smoothly, even when certain workers might not be active.


Me:
at first i was thinking if we needed a promiseBroadcast() method inside worker.Manager. while we could do it at some point, for this use case we do not => there is no point in knowing that all workers got it, since workers fire the event, which other instances subscribe to.

i was also thinking if we should exclude the sender (app worker here) from the broadcast. while it is a tick slower to not do it, we do not need to manually set the neo config inside the sender realm (otherwise we would need to manually call onSetNeoConfig).


Gemini:
That's a fantastic and pragmatic analysis. You've weighed the trade-offs perfectly, and your current design choices (no promiseBroadcast() for this use case, and including the sender in the broadcast) are well-justified for efficiency and simplicity.

Let's explore your rationale in more detail:

1. No Immediate Need for promiseBroadcast() (for this setNeoConfig use case)
You're absolutely right. For a global configuration change like setNeoConfig, there's generally no compelling functional need for the sender (e.g., the App Worker) to receive a promise that resolves only after all other workers have acknowledged the update.

Why this is a good design decision (for this specific use case):

Decoupling: The broadcast is primarily a "fire-and-forget" mechanism for propagation. The sender's immediate concern is to initiate the change.
Event-Driven Reactions: As you noted, "workers fire the event, which other instances subscribe to." This is the key. Any part of your application that needs to react to the config change (whether it's in the sender's realm or a recipient's realm) should simply subscribe to the setNeoConfig event (or neoConfigChange:key). The event is the signal for reaction, not the broadcast promise resolution.
Performance vs. Complexity: Implementing promiseBroadcast() (which would involve collecting and waiting for replies from all workers) adds significant overhead in terms of message traffic, promise management, and potential timeouts. If the application doesn't strictly need to know the global acknowledgment status, avoiding this complexity is a win for performance and simplicity.
When promiseBroadcast() would make sense:

If you needed to orchestrate a global, synchronized state transition where the initiating worker must not proceed until all other workers have reached a certain state (e.g., "all workers have confirmed they've loaded a new resource," "all workers are paused"). This is a much rarer and more complex scenario.
2. Including the Sender in the Broadcast (and the onSetNeoConfig call)
This is a clever and pragmatic optimization for code cleanliness.

Trade-offs:

"Tick slower": Yes, the sender (e.g., App Worker) receives a message that it itself initiated. This adds a tiny bit of message passing overhead.
"No need to manually set the neo config inside the sender realm": This is the strongest argument for your current approach. If the sender were excluded, the App Worker would have to:
Call Neo.worker.Manager.setNeoConfig(...) (remote call).
Separately call Neo.merge(Neo.config, config) in its own scope.
Separately call me.fire('setNeoConfig', config) in its own scope.
Benefits of including the sender in the broadcast:

Consistency of Update Logic: Every worker, including the sender, processes the config update through the same single entry point: onSetNeoConfig. This means the Neo.merge(Neo.config, config) and me.fire('setNeoConfig', config) logic is unified.
Reduced Duplication: You avoid duplicating the config merge and event firing logic in the sender's initiating code.
Simpler Mental Model: Developers don't need to remember "If I'm the sender, I update my own config directly, otherwise I wait for the broadcast." It's simply "broadcast the change, and everyone (including me) will update reactively."
This aligns perfectly with Neo.mjs's philosophy of leveraging its worker architecture for consistent, event-driven state management. You're trading a microscopic amount of message overhead for significant gains in code consistency, maintainability, and developer experience. This is a very sensible trade-off for a framework.

