import Base from '../../core/Base.mjs';

/**
 * @class Neo.worker.mixin.RemoteMethodAccess
 * @extends Neo.core.Base
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
     * @param {Object} source
     * @param {Object} target
     */
    assignPort(source, target) {
        if (source) {
            const {appName, port, windowId} = source;
            Object.assign(target, {appName, port, windowId})
        }
    }

    /**
     * @param {Object} remote
     * @param method
     * @returns {function(*=, *=): Promise<any>}
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

            me.isSharedWorker && me.assignPort(data, opts);

            return me.promiseMessage(origin, opts, buffer)
        }
    }

    /**
     * @param {Object} remote
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
            })
        }
    }

    /**
     * @param {Object} msg
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
            throw new Error('Invalid remote method name "' + msg.remoteMethod + '"')
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
     * Gets called when promiseMessage gets rejected
     * @param {Object} msg
     * @param {Object} data
     */
    reject(msg, data) {
        let me = this,

        opts = {
            action : 'reply',
            data,
            reject : true,
            replyId: msg.id
        };

        me.isSharedWorker && me.assignPort(msg, opts);
        me.sendMessage(msg.origin, opts)
    }

    /**
     * Gets called when promiseMessage gets resolved
     * @param {Object} msg
     * @param {Object} data
     */
    resolve(msg, data) {
        let me = this,

        opts = {
            action : 'reply',
            data,
            replyId: msg.id
        };

        me.isSharedWorker && me.assignPort(msg, opts);
        me.sendMessage(msg.origin, opts)
    }
}

export default Neo.setupClass(RemoteMethodAccess);
