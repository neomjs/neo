import Manager from './Base.mjs';

/**
 * @class Neo.manager.Task
 * @extends Neo.manager.Base
 * @singleton
 *
 * @example
 *     import TaskManager from '../../../node_modules/neo.mjs/src/manager/Task.mjs';
 *
 *     task = {
 *         args: [clockDom],           // arguments passed into the run fn
 *         addCountToArgs: true,       // adds the count to the arguments
 *         fireOnStart: false          // run before the first interval
 *         id: 'clockcounter',         // id for the task or autocreated
 *         interval: 1000,             // in ms
 *         onError: function(){},      // runs in case an error occurred
 *         repeat: 10,                 // stopAfterTenTimes
 *         run: function(clock) {      // function to run
 *             clock.setHtml(new Date());
 *         },
 *         scope: this                 // scope of the function
 *     };
 *
 *     TaskManager.start(task); // or taskId if exists
 *     TaskManager.stop('clockcounter', remove); // false to not remove it from the TaskManager
 *     TaskManager.stopAll(remove);
 *
 *     TaskManager.createTask(task);
 *     TaskManager.remove(taskId);
 *
 *     TaskManager.run(taskId);
 *     TaskManager.get(taskId).repeat = 20;
 */
class Task extends Manager {
    static config = {
        /**
         * @member {String} className='Neo.manager.Task'
         * @protected
         */
        className: 'Neo.manager.Task',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Adds a task to collection.
     * Typically used via `start(task)`
     * @param {Object} task
     * @returns {Object}
     */
    createTask(task) {
        let me = this;

        if (!task.id) {
            task.id = Neo.core.IdGenerator.getId('task')
        }

        task.scope          && task.run.bind(task.scope);
        task.addCountToArgs && task.args.push(0);

        task = {
            args      : [],
            isRunning : false,
            onError   : Neo.emptyFn,
            runCount  : 0,
            runner    : null,
            runOnStart: false,
            ...task
        };

        me.register(task);

        return task
    }

    /**
     * Removes a task from collection.
     * @param {String} taskId
     */
    removeTask(taskId) {
        this.unregister(taskId)
    }

    /**
     * Runs a task from collection.
     * @param {String} taskId
     */
    run(taskId) {
        let me   = this,
            task = me.get(taskId);

        if (task.isRunning) {
            Neo.logError('[Neo.util.TaskManager] Task is already running');
            return task
        }

        try {
            let fn = function(task) {
                task.runCount++;

                if (task.addCountToArgs) {
                    task.args[task.args.length - 1] = task.runCount
                }

                if (task.repeat && task.runCount === task.repeat) {
                    me.stop(task.id)
                }

                task.run(...task.args)
            };

            task.isRunning = true;
            task.runner    = setInterval(fn, task.interval, task)
        } catch (taskError) {
            Neo.logError('[Neo.util.TaskManager] Error while running task ' + task.id);
            task.onError(taskError);
            task.isRunning = false
        }
    }

    /**
     * Adds a task and runs it.
     * @param {Object|String} task or taskId
     * @returns {Object}
     */
    start(task) {
        let me = this;

        if (Neo.isString(task)) {
            task = me.get(task);
            !task && Neo.logError('[Neo.util.TaskManager] You passed a taskId which does not exits')
        } else if (!task.id || !me.get(task.id)) {
            task = me.createTask(task)
        }

        if (task.isRunning) {
            Neo.logError('[Neo.util.TaskManager] Task is already running');
            return task
        }

        if (task.runOnStart) {
            task.runCount++;
            task.run(...task.args)
        }

        me.run(task.id);

        return task
    }

    /**
     * Stops a task and resets configs.
     * If remove is true it will remove the task from the collection
     * @param {String} taskId
     * @param {Boolean} remove
     */
    stop(taskId, remove) {
        let task = this.get(taskId);

        task.isRunning && clearInterval(task.runner);

        if (remove) {
            this.removeTask(task)
        } else {
            task.isRunning = false;
            task.runCount  = 0;
            task.runner    = null;

            if (task.addCountToArgs) {
                task.args[task.args.length - 1] = 0
            }
        }
    }

    /**
     * Stops all running tasks from collection.
     * If remove is true, it will remove all tasks from Manager
     * @param {Boolean} remove
     */
    stopAll(remove) {
        Object.keys(this.map).forEach(key => {
            this.stop(key, remove)
        })
    }
}

export default Neo.setupClass(Task);
