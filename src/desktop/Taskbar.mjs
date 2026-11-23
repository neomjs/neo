import Component      from '../component/Base.mjs';
import TaskList       from './TaskList.mjs';
import Toolbar        from '../toolbar/Base.mjs';
import {isDescriptor} from '../core/ConfigSymbols.mjs';

/**
 * @summary A web desktop's bottom bar: the start button with its menu of apps, the open apps, and room for the
 * consumer's own items.
 *
 * The start button's menu is a `Neo.menu.List` cascade over {@link #appStore}: every level reads the same filtered
 * tree, so it offers exactly the apps the launcher shows. The task list renders {@link #taskStore}.
 *
 * Its items are a map, so a consumer adds its own by key and places them by `weight`: the start button weighs 10,
 * the task list 20, the spacer 30 and the clock 100, so an item heavier than 30 sits at the right end, before the
 * clock. A consumer configures a shipped item under its key, e.g. `items: {'start-button': {text: 'Start'}}`, and
 * hides one with `hidden: true`.
 *
 * The clock shows the time and the date in the app's locale (`Neo.config.locale`) and moves on every full minute.
 *
 * A click on a task calls `onTaskItemClick()` up the component chain, which `Neo.desktop.Container` implements.
 * @class Neo.desktop.Taskbar
 * @extends Neo.toolbar.Base
 */
class Taskbar extends Toolbar {
    static config = {
        /**
         * @member {String} className='Neo.desktop.Taskbar'
         * @protected
         */
        className: 'Neo.desktop.Taskbar',
        /**
         * The apps the start menu offers, e.g. a `Neo.desktop.store.Apps`
         * @member {Neo.data.TreeStore|null} appStore_=null
         * @reactive
         */
        appStore_: null,
        /**
         * @member {String[]} baseCls=['neo-desktop-taskbar','neo-toolbar']
         * @protected
         */
        baseCls: ['neo-desktop-taskbar', 'neo-toolbar'],
        /**
         * @member {Object} items
         */
        items: {
            [isDescriptor]: true,
            clone         : 'deep',
            merge         : 'deep',
            value         : {
                'start-button': {
                    cls    : ['neo-desktop-start-button'],
                    iconCls: 'fas fa-grip',
                    text   : 'Apps',
                    weight : 10
                },
                tasks: {
                    module   : TaskList,
                    flex     : 'none',
                    listeners: {itemClick: 'up.onTaskItemClick'},
                    store    : '@config:taskStore',
                    weight   : 20
                },
                spacer: {
                    module: Component,
                    flex  : 1,
                    weight: 30
                },
                clock: {
                    module: Component,
                    cls   : ['neo-desktop-taskbar-clock'],
                    flex  : 'none',
                    vdom  : {cn: [
                        {cls: ['neo-desktop-taskbar-time']},
                        {cls: ['neo-desktop-taskbar-date']}
                    ]},
                    weight: 100
                }
            }
        },
        /**
         * The open apps, e.g. a `Neo.desktop.store.Tasks`
         * @member {Neo.data.Store|null} taskStore_=null
         * @reactive
         */
        taskStore_: null
    }

    /**
     * Triggered after the appStore config got changed
     * @param {Neo.data.TreeStore|null} value
     * @param {Neo.data.TreeStore|null} oldValue
     * @protected
     */
    afterSetAppStore(value, oldValue) {
        // The construction syncs once its items exist
        this.isConstructed && this.syncStartMenu()
    }

    /**
     * Triggered after the taskStore config got changed
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetTaskStore(value, oldValue) {
        let taskList = this.isConstructed && this.getItem('tasks');

        if (taskList) {
            taskList.store = value
        }
    }

    /**
     * Gives the start button its menu once it exists
     */
    createItems() {
        super.createItems();
        this.syncStartMenu()
    }

    /**
     * Starts the clock once the items exist
     */
    onConstructed() {
        super.onConstructed();
        this.runClock()
    }

    /**
     * Keeps the clock on the minute: it shows the time at once, and each wait ends on the next full minute. The
     * taskbar's destruction ends the wait, and with it the loop; removing the clock item ends it at the next minute.
     * @protected
     */
    async runClock() {
        let me = this;

        try {
            while (me.getItem('clock')) {
                let now = new Date();

                me.syncClock(now);
                await me.timeout(60000 - now.getSeconds() * 1000 - now.getMilliseconds())
            }
        } catch (error) {
            if (error !== Neo.isDestroyed) {
                throw error
            }
        }
    }

    /**
     * Shows a moment on the clock: the time, and the date beneath it, in the app's locale
     * @param {Date} date
     */
    syncClock(date) {
        let clock    = this.getItem('clock'),
            {locale} = Neo.config;

        if (clock) {
            let [time, day] = clock.vdom.cn;

            time.text = new Intl.DateTimeFormat(locale, {hour: '2-digit', minute: '2-digit'}).format(date);
            day.text  = new Intl.DateTimeFormat(locale, {day: 'numeric', month: 'short', weekday: 'short'}).format(date);

            clock.update()
        }
    }

    /**
     * Gives the start button its menu over the apps store, or takes it away while there is none
     * @protected
     */
    syncStartMenu() {
        let {appStore} = this;

        this.getItem('start-button').menu = appStore ? {
            align: {edgeAlign: 'b0-t0', targetMargin: 8},
            cls  : ['neo-desktop-start-menu'],
            store: appStore
        } : null
    }
}

export default Neo.setupClass(Taskbar);
