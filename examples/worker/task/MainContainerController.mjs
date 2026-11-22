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
     * @summary Runs the same prime count either in bounded remote batches or synchronously in the App Worker.
     * @returns {Promise<void>}
     */
    async onRunButtonClick() {
        const me           = this,
              run          = me.getReference('run'),
              useAppWorker = me.getReference('useAppWorker'),
              progress     = me.getReference('progress'),
              result       = me.getReference('result'),
              clock        = me.getReference('clock'),
              task         = Neo.examples.worker.task.MyTasks,
              runLocally   = useAppWorker.checked,
              worker       = runLocally ? 'App Worker' : 'Task Worker';

        if (run.disabled) return;

        if (!runLocally && !task?.compute) {
            result.text = 'The Task Worker is starting. Try again in a moment.';
            return
        }

        run.disabled          = true;
        useAppWorker.disabled = true;
        progress.value        = 0;
        progress.labelText    = 'Numbers checked: 0%';
        result.text           = `Counting primes in the ${worker}…`;
        clock.text            = 'App Worker updates during job: 0';

        let count    = 0,
            ticks    = 0,
            longest  = 0,
            previous = performance.now();

        try {
            await result.promiseUpdate();
            previous = performance.now();

            me.clockTimer = setInterval(() => {
                const now = performance.now();

                longest    = Math.max(longest, now - previous);
                previous   = now;
                clock.text = `App Worker updates during job: ${++ticks}`
            }, 100);

            if (runLocally) {
                count = countPrimes(2, limit)
            } else {
                for (let last = batchSize; last <= limit; last += batchSize) {
                    const response = await task.compute({first: Math.max(2, last - batchSize + 1), last});

                    if (me.isDestroyed) return;

                    count             += response.count;
                    progress.value     = last * 100 / limit;
                    progress.labelText = `Numbers checked: ${Math.round(progress.value)}%`
                }
            }

            longest            = Math.max(longest, performance.now() - previous);
            progress.value     = 100;
            progress.labelText = 'Numbers checked: 100%';
            result.text        = `${format.format(count)} primes found in the ${worker}.`;
            clock.text         = `App Worker updates during job: ${ticks} · Longest gap: ${Math.round(longest)} ms`
        } catch (error) {
            if (error !== Neo.isDestroyed && !me.isDestroyed) {
                result.text = `The ${worker} could not finish the calculation.`
            }
        } finally {
            clearInterval(me.clockTimer);
            me.clockTimer = null;

            if (!me.isDestroyed) {
                useAppWorker.disabled = false;
                run.disabled          = false
            }
        }
    }
}

export default Neo.setupClass(MainContainerController);
