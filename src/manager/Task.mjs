import Base from './Base.mjs';

/**
 * @class Neo.util.TaskManager
 * @extends Neo.core.Base
 * @singleton
 *
 * @example
 *     task = {
 *         args: [clockDom],           // arguments passed into the run fn
 *         addCountToArgs: true,       // adds the count to the arguments
 *         fireOnStart: false          // run before the first interval
 *         id: 'clockcounter',         // id for the task or autocreated
 *         interval: 1000,             // in ms
 *         onError: function(){},      // runs in case an error occured
 *         repeat: 10,                 // stopAfterTenTimes
 *         run: function(clock) {      // function to run
 *             clock.setHtml(new Date());
 *         },
 *         scope: this                 // scope of the function
 *     };
 *
 *     Neo.TaskManager.start(task); // or taskId if exists
 *     Neo.TaskManager.stop('clockcounter', remove); // false to not remove it from the TaskManager
 *     Neo.TaskManager.stopAll(remove);
 *     Neo.TaskManager.remove(taskId);
 *     Neo.TaskManager.get(taskId).repeat = 20;
 */
class Task extends Base {

    static getConfig() {
        return {
            /**
             * @member {String} className='Neo.manager.Task'
             * @protected
             */
            className: 'Neo.manager.Task',
            /**
             * @member {boolean} enableLogs=true
             * @protected
             */
            singleton: true
        }
    }

    /**
     * Adds a task to collection.
     * Typically used via `start(task)`
     * @param {Object} task
     * @return {Object}
     */
    addTask(task) {
        let me = this;

        if(!task.id) task.id = Neo.core.IdGenerator.getId('task');
        if(task.scope) task.run.bind(task.scope);
        if(task.addCountToArgs) task.args.push(0);

        task = Neo.merge({
            args: [],
            isRunning: false,
            onError: Neo.emptyFn,
            runCount: 0,
            runner: null,
            runOnStart: false
        }, task);

        me.register(task);

        return task;
    }

    /**
     * Removes a task from collection.
     * @param {String} taskId
     */
    removeTask(taskId) {
        this.unregister(taskId);
    }

    /**
     * Runs a task from collection.
     * @param {String} taskId
     */
    run(taskId) {
        const me = this,
            task = this.get(taskId);

        if(task.isRunning) {
            Neo.logError('[Neo.util.TaskManager] Task is already running');
            return task;
        }

        try {
            let fn = function (task) {
                task.runCount++;
                if(task.addCountToArgs) task.args[task.args.length - 1] = task.runCount;
                if(task.repeat && task.runCount === task.repeat) {
                    me.stop(task.id);
                }

                task.run(...task.args);
            };

            task.isRunning = true;
            task.runner = setInterval(fn, task.interval, task);
        } catch (taskError) {
            Neo.logError('[Neo.util.TaskManager] Error while running task ' + task.id);
            task.onError(taskError);
            task.isRunning = false;
        }
    }

    /**
     * Adds a task and runs it.
     * @param {Object|String} task or taskId
     * @return {Object}
     */
    start(task) {
        if(typeof task === 'string') {
            task = this.get(task);
            if(!task) Neo.logError('[Neo.util.TaskManager] You passed a taskId which does not exits');
        } else {
            if(!task.id || !this.get(task.id)) task = this.addTask(task);
        }

        if(task.isRunning) {
            Neo.logError('[Neo.util.TaskManager] Task is already running');
            return task;
        }

        if(task.runOnStart) {
            task.runCount++;
            task.run(...task.args);
        }

        this.run(task.id);

        return task;
    }

    /**
     * Stops a task and resets configs.
     * If remove is true it will remove the task from the collection
     * @param {String} taskId
     * @param {Boolean} remove
     */
    stop(taskId, remove) {
        let task = this.get(taskId);
        if(task.isRunning) clearInterval(task.runner);

        if(remove) {
            this.removeTask(task);
        } else {
            task.isRunning = false;
            task.runCount = 0;
            task.runner = null;
            if(task.addCountToArgs) task.args[task.args.length - 1] = 0;
        }
    }

    /**
     * Stops all running tasks from collection.
     * If remove is true, it will remove all tasks from Manager
     * @param {Boolean} remove
     */
    stopAll(remove) {
        let me = this,
            map = me.map;

        for (var [key, value] of map.entries()) {
            me.stop(key, remove);
        }
    }
}

Neo.applyClassConfig(Task);

let instance = Neo.create(Task);

Neo.applyToGlobalNs(instance);

export default instance;
