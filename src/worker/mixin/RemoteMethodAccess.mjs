import Base from '../../core/Base.mjs';

/**
 * @summary Mixin to enable and handle remote method access across threads (Workers and Main Threads).
 *
 * **What is Remote Method Access?**
 * This pattern allows code running in one thread (e.g., an App Worker) to execute a method located in another thread
 * (e.g., the Main Thread) as if it were a local function call. Since the threads are isolated, the execution is asynchronous:
 * the caller invokes the method and awaits a `Promise` that resolves with the return value from the other thread.
 *
 * **Crucial Constraints:**
 * - **Serialization:** All arguments passed to the method and the return value sent back MUST be **JSON-serializable**.
 *   This means you cannot pass DOM nodes, DOM Events, or complex class instances directly.
 * - **Transferables:** `ArrayBuffer`, `MessagePort` and `OffscreenCanvas` can be transferred (zero-copy) if explicitly handled.
 *
 * This mixin is the core mechanism for cross-thread communication in Neo.mjs. It is consumed by:
 * - `Neo.worker.Base` (App, Data, VDom, Task, Canvas workers)
 * - `Neo.worker.ServiceBase` (Service Worker)
 * - `Neo.worker.Manager` (Main Thread)
 *
 * This broad usage ensures that **all** connected realms can communicate with each other. This includes
 * Worker-to-Worker, Worker-to-Main, and even Main-to-Worker method calls.
 *
 * **Key Responsibilities:**
 * 1. **Registration:** Registers methods defined in the `remote` config as callable endpoints.
 * 2. **Proxy Generation:** Creates local proxy functions that send messages to the target thread when called.
 * 3. **Routing:** Ensures messages are sent to the correct `windowId` in a multi-window environment.
 * 4. **Interception:** Supports the `interceptRemotes` config to intercept calls before they are executed.
 *    This is particularly critical for Main Thread Addons (Singletons). Calls arriving before an addon is
 *    `isReady` (e.g., waiting for external libraries like Monaco Editor or Google Maps to load) can be
 *    intercepted and queued, ensuring they execute only once the singleton is fully functional.
 *
 * **Synchronous vs. Asynchronous:**
 * - **Definition:** Remote methods can be defined as synchronous or asynchronous functions in their origin class.
 * - **Execution:** When called from a different thread, the execution is **ALWAYS asynchronous**. The proxy
 *   function returns a `Promise` that resolves with the return value of the remote method. This is true even if
 *   the original method is synchronous.
 *
 * **Namespace-Driven Access:**
 * Remote access is resolved via namespaces. The calling thread must know the full class name (e.g., `Neo.main.addon.LocalStorage`)
 * to invoke the method.
 *
 * **Architectural Note:**
 * To support the distributed multi-window architecture where one App Worker serves multiple connected Main Threads,
 * **the first parameter of any remote method MUST be an object containing `windowId`**.
 * This allows the sender to attach the `windowId` (and other metadata) to the payload, ensuring the message
 * is routed to the correct browser window context. Calls passing arrays or primitive values as the first argument
 * cannot be reliably routed in a shared-worker environment.
 *
 * @example
 * // 1. Usage in Neo.component.wrapper.MonacoEditor
 * // Calls the remote method 'setTheme' on the Main Thread addon 'Neo.main.addon.MonacoEditor'
 * Neo.main.addon.MonacoEditor.setTheme({
 *     id      : me.id,
 *     value   : 'vs-dark',
 *     windowId: me.windowId // Critical for routing!
 * }).then(() => {
 *     console.log('Theme updated');
 * });
 *
 * @example
 * // 2. Usage in a Controller accessing LocalStorage
 * // Calls 'readLocalStorageItem' on the Main Thread addon 'Neo.main.addon.LocalStorage'
 * const value = await Neo.main.addon.LocalStorage.readLocalStorageItem({
 *     key     : 'mySettings',
 *     windowId: this.windowId
 * });
 *
 * @class Neo.worker.mixin.RemoteMethodAccess
 * @extends Neo.core.Base
 * @see Neo.worker.Base
 * @see Neo.worker.ServiceBase
 * @see Neo.worker.Manager
 * @see Neo.main.addon.Base
 * @see Neo.main.addon.MonacoEditor
 * @see Neo.main.addon.LocalStorage
 */
class RemoteMethodAccess extends Base {
    static config = {
        /**
         * @member {String} className='Neo.worker.mixin.RemoteMethodAccess'
         * @protected
         */
        className: 'Neo.worker.mixin.RemoteMethodAccess'
    }

    /**
     * Helper method to copy routing information (appName, port, windowId) from a source message to a target message.
     * This is crucial in SharedWorker environments to maintain the context of the original sender when formulating a reply or forwarding a message.
     *
     * @param {Object} source The source message object containing routing metadata.
     * @param {Object} target The target message object to populate with routing metadata.
     */
    assignPort(source, target) {
        if (source) {
            const {appName, port, windowId} = source;
            Object.assign(target, {appName, port, windowId})
        }
    }

    /**
     * Generates a proxy function for a remote method.
     * When this proxy is called, it sends a message to the target thread to execute the real method.
     *
     * It handles:
     * 1. Constructing the message payload with `action: 'remoteMethod'`.
     * 2. determining the correct destination (e.g., using `windowId` from the data if targeting 'main').
     * 3. Preserving routing context in SharedWorker environments.
     * 4. Returning a Promise that resolves with the remote method's result.
     *
     * @param {Object} remote The remote configuration object.
     * @param {String} method The name of the method to generate a proxy for.
     * @returns {function(*=, *=): Promise<any>} The proxy function.
     */
    generateRemote(remote, method) {
        let me       = this,
            {origin} = remote;

        return function(data, buffer) {
            let opts = {
                action         : 'remoteMethod',
                data,
                destination    : origin,
                remoteClassName: remote.className,
                remoteMethod   : method
            };

            if (origin === 'main' && data?.windowId) {
                opts.destination = data.windowId
            }

            me.isSharedWorker && me.assignPort(data, opts);

            return me.promiseMessage(opts.destination, opts, buffer)
        }
    }

    /**
     * Handles the 'registerRemote' message action.
     * It iterates over the list of methods provided in the remote config and generates local proxy functions
     * for them in the appropriate namespace. This makes the remote methods available to be called as if they were local.
     *
     * @param {Object} remote The remote configuration object containing className and methods list.
     */
    onRegisterRemote(remote) {
        if (remote.destination === Neo.workerId) {
            let me                   = this,
                {className, methods} = remote,
                pkg                  = Neo.ns(className, true);

            methods.forEach(method => {
                if (remote.origin !== 'main' && pkg[method]) {
                    throw new Error('Duplicate remote method definition ' + className + '.' + method)
                }

                pkg[method] ??= me.generateRemote(remote, method)
            });

            if (remote.id) {
                me.resolve(remote, true)
            }
        }
    }

    /**
     * Handles the execution of a requested remote method.
     * Triggered when a worker receives a message with `action: 'remoteMethod'`.
     *
     * This method:
     * 1. Resolves the target class and method from the namespace.
     * 2. Checks if the call should be intercepted (e.g., if the target singleton is not ready).
     * 3. Executes the method (handling both sync and async results).
     * 4. Catches errors and sends a rejection reply.
     * 5. Resolves success and sends a reply with the result.
     *
     * @param {Object} msg The message payload containing remoteClassName, remoteMethod, and data.
     */
    onRemoteMethod(msg) {
        let me  = this,
            pkg = Neo.ns(msg.remoteClassName),
            out, method;

        if (!pkg) {
            throw new Error('Invalid remote namespace "' + msg.remoteClassName + '"')
        }

        method = pkg[msg.remoteMethod];

        if (!method) {
            throw new Error('Invalid remote method name "' + msg.remoteMethod + '" in namespace "' + msg.remoteClassName + '"')
        }

        // Check for interception
        if (!pkg.isReady && pkg.interceptRemotes?.includes(msg.remoteMethod)) {
            out = pkg.onInterceptRemotes(msg);
        } else if (Array.isArray(msg.data)) {
            out = method.call(pkg, ...msg.data)
        } else {
            out = method.call(pkg, msg.data)
        }

        if (Neo.isPromise(out)) {
            out
                /*
                 * Intended logic:
                 * If the code of a remote method fails, it would not show any errors inside the console,
                 * so we want to manually log the error for debugging.
                 * Rejecting the Promise gives us the chance to recover.
                 *
                 * Example:
                 * Neo.vdom.Helper.update(opts).catch(err => {
                 *     me.isVdomUpdating = false;
                 *     reject?.()
                 * }).then(data => {...})
                 */
                .catch(err => {console.error(err); me.reject(msg, err)})
                .then(data => {me.resolve(msg, data)})
        } else {
            me.resolve(msg, out)
        }
    }

    /**
     * Sends a rejection reply back to the caller of a remote method.
     * Used when the execution of the remote method fails or throws an error.
     * It ensures the reply is routed back to the correct origin (windowId or worker).
     *
     * @param {Object} msg The original message object.
     * @param {Object} data The error data to send back.
     */
    reject(msg, data) {
        let me = this,

        opts = {
            action : 'reply',
            data,
            reject : true,
            replyId: msg.id
        };

        if (me.isSharedWorker) {
            me.assignPort(msg, opts);

            if (msg.origin === 'main' && opts.windowId) {
                msg.origin = opts.windowId
            }
        }

        me.sendMessage(msg.origin, opts)
    }

    /**
     * Sends a success reply back to the caller of a remote method.
     * Used when the remote method executes successfully.
     * It handles the transfer of transferable objects (like ArrayBuffers) and ensures correct routing.
     *
     * @param {Object} msg The original message object.
     * @param {Object} data The result data to send back.
     */
    resolve(msg, data) {
        let me       = this,
            transfer = null,
            opts;

        if (Neo.isObject(data) && Array.isArray(data.transfer)) {
            transfer = data.transfer;
            data     = data.result || data
        }

        opts = {
            action : 'reply',
            data,
            replyId: msg.id
        };

        if (me.isSharedWorker) {
            me.assignPort(msg, opts);

            if (msg.origin === 'main' && opts.windowId) {
                msg.origin = opts.windowId
            }
        }

        me.sendMessage(msg.origin, opts, transfer)
    }
}

export default Neo.setupClass(RemoteMethodAccess);
