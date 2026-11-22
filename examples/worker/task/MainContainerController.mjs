import Controller  from '../../../src/controller/Component.mjs';
import countPrimes from './countPrimes.mjs';

const batchSize = 2_000_000,
      limit     = 16_000_000,
      format    = new Intl.NumberFormat('en-US');

/**
 * @summary Drives the comparison and reports UI updates from the App Worker.
 * @class Neo.examples.worker.task.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    static config = {
        /**
         * @member {String} className='Neo.examples.worker.task.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.worker.task.MainContainerController'
    }

    /**
     * @member {Number|null} clockTimer
     * @protected
     */
    clockTimer = null;

    /**
     * @member {Boolean} started=false
     * @protected
     */
    started = false;

    /**
     * @summary Stops App Worker updates when the example goes away during a job.
     */
    destroy() {
        clearInterval(this.clockTimer);
        super.destroy()
    }

    /**
     * @summary Reflects what the App Worker handled independently of the browser's native input echo.
     * @param {Object} data
     * @param {String|null} data.value
     */
    onInputChange({value}) {
        const echo = this.getReference('echo');

        if (echo) {
            const length = value?.length || 0;

            echo.text = `App Worker received ${length} ${length === 1 ? 'character' : 'characters'}.`
        }
    }

    /**
     * @summary Runs the Task Worker once on arrival without taking focus from the visitor.
     * @returns {Promise<void>}
     */
    async onMounted() {
        if (!this.started) {
            this.started = true;
            await this.runCount('task', false)
        }
    }

    /**
     * @summary Starts the remote comparison and puts typing in reach straight away.
     * @returns {Promise<void>}
     */
    onRunTaskButtonClick() {
        return this.runCount('task')
    }

    /**
     * @summary Starts the synchronous comparison only when explicitly requested.
     * @returns {Promise<void>}
     */
    onRunAppButtonClick() {
        return this.runCount('app')
    }

    /**
     * @summary Runs the same prime count on either worker and retains the other lane's result.
     * @param {String} lane Worker lane, `app` or `task`
     * @param {Boolean} [focus=true] Focus the text field for a manually started run
     * @returns {Promise<void>}
     */
    async runCount(lane, focus=true) {
        const me         = this,
              taskButton = me.getReference('task-run'),
              appButton  = me.getReference('app-run'),
              progress   = me.getReference(`${lane}-progress`),
              result     = me.getReference(`${lane}-result`),
              clock      = me.getReference(`${lane}-clock`),
              heartbeat  = me.getReference('heartbeat'),
              runLocally = lane === 'app',
              worker     = runLocally ? 'App Worker' : 'Task Worker';

        if (taskButton.disabled) return;

        // Move focus while the initiating button still exists in the tab order.
        focus && me.getReference('input').focus();

        taskButton.disabled = true;
        appButton.disabled  = true;
        progress.set({labelText: 'Numbers checked: 0%', value: 0});
        clock.text      = 'App Worker updates during job: 0';
        heartbeat.value = 0;

        try {
            if (!runLocally && !await me.waitFor(() => Boolean(Neo.examples.worker.task.MyTasks?.compute))) {
                result.text = 'The Task Worker could not start. Try running it again.';
                return
            }

            result.text = `Counting primes in the ${worker}…`;
            await result.promiseUpdate();

            let count    = 0,
                ticks    = 0,
                longest  = 0,
                previous = performance.now();

            me.clockTimer = setInterval(() => {
                const now = performance.now();

                longest         = Math.max(longest, now - previous);
                previous        = now;
                heartbeat.value = ++ticks % 10 * 10;
                clock.text      = `App Worker updates during job: ${ticks}`
            }, 100);

            if (runLocally) {
                count = countPrimes(2, limit)
            } else {
                const task = Neo.examples.worker.task.MyTasks;

                for (let last = batchSize; last <= limit; last += batchSize) {
                    const batch = await task.compute({first: Math.max(2, last - batchSize + 1), last}),
                          value = last * 100 / limit;

                    if (me.isDestroyed) return;

                    count += batch;
                    progress.set({labelText: `Numbers checked: ${Math.round(value)}%`, value})
                }
            }

            longest = Math.max(longest, performance.now() - previous);
            progress.set({labelText: 'Numbers checked: 100%', value: 100});
            result.text = `${format.format(count)} primes found in the ${worker}.`;
            clock.text  = `App Worker updates during job: ${ticks} · Longest gap: ${Math.round(longest)} ms`
        } catch (error) {
            if (error !== Neo.isDestroyed && !me.isDestroyed) {
                result.text = `The ${worker} could not finish the calculation.`
            }
        } finally {
            clearInterval(me.clockTimer);
            me.clockTimer = null;

            if (!me.isDestroyed) {
                taskButton.disabled = false;
                appButton.disabled  = false
            }
        }
    }
}

export default Neo.setupClass(MainContainerController);
