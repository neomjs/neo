import Neo       from '../Neo.mjs';
import Base      from './Base.mjs';
import * as core from '../core/_export.mjs';

/**
 * The Task worker can get filled with custom remote methods as needed.
 * To activate it, set useTaskWorker to true inside your neo-config.json and add a task.mjs file as the entry point.
 * @class Neo.worker.Task
 * @extends Neo.worker.Base
 * @singleton
 */
class Task extends Base {
    static config = {
        /**
         * @member {String} className='Neo.worker.Task'
         * @protected
         */
        className: 'Neo.worker.Task',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {String} workerId='task'
         * @protected
         */
        workerId: 'task'
    }

    /**
     *
     */
    afterConnect() {
        let me             = this,
            channel        = new MessageChannel(),
            {port1, port2} = channel;

        port1.onmessage = me.onMessage.bind(me);

        me.sendMessage('app', {action: 'registerPort', transfer: port2}, [port2]);

        me.channelPorts.app = port1
    }

    /**
     * @param {Object} msg
     */
    onRegisterNeoConfig(msg) {
        super.onRegisterNeoConfig(msg);

        let path = Neo.config.appPath.slice(0, -8); // removing "/app.mjs"

        import(
            /* webpackInclude: /\/task.mjs$/ */
            /* webpackExclude: /\/node_modules/ */
            /* webpackMode: "lazy" */
            `../../${path}/task.mjs`
        ).then(module => {
            module.onStart()
        })
    }
}

let instance = Neo.setupClass(Task);

export default instance;
