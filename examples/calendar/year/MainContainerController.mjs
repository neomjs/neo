import ComponentController from '../../../src/controller/Component.mjs';

/**
 * @summary Brings the month of today into view as the year opens. The year view starts on January, so at any size
 * where the months do not all fit, today would sit below the fold.
 * @class Neo.examples.calendar.year.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static config = {
        /**
         * @member {String} className='Neo.examples.calendar.year.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.calendar.year.MainContainerController'
    }

    /**
     * True once the viewport reported its first size: the layout has settled
     * @member {Boolean} sized=false
     * @protected
     */
    sized = false

    /**
     * True once the month of today was scrolled into view: a later resize leaves the visitor's scroll position alone
     * @member {Boolean} todayShown=false
     * @protected
     */
    todayShown = false

    /**
     * The calendar's year view, once the calendar has loaded it
     * @member {Neo.calendar.view.YearComponent|null} yearView=null
     * @protected
     */
    yearView = null

    /**
     * @summary Takes the year view as the calendar loads it, and waits for its mount when it is not mounted yet.
     * @param {Object} data
     * @param {Neo.component.Base} data.item The view the calendar loaded
     */
    onCalendarCardLoaded({item}) {
        let me = this;

        if (item.flag === 'year') {
            me.yearView = item;

            item.mounted ? me.showToday() : me.observeConfig(item, 'mounted', value => value && me.showToday())
        }
    }

    /**
     * @summary Notes the viewport's first size.
     * @param {Object} data The viewport's resize event
     */
    onResize(data) {
        let me = this;

        if (data.id === me.component.id) {
            me.sized = true;
            me.showToday()
        }
    }

    /**
     * @summary Scrolls the year view just far enough to show today, once, as soon as the layout has settled and the
     * year view is mounted. The two arrive in either order, so both call this. Today's cell, not its whole month: a
     * view that already shows today keeps every month title in sight.
     * @returns {Promise<void>}
     */
    async showToday() {
        let me         = this,
            {yearView} = me;

        if (me.sized && yearView?.mounted && !me.todayShown) {
            me.todayShown = true;

            // The months render on mount: the next update settles after them
            await yearView.promiseUpdate();

            await Neo.main.DomAccess.scrollIntoView({
                block        : 'nearest',
                querySelector: `#${yearView.id} .neo-cell:has(.neo-today)`,
                windowId     : me.windowId
            })
        }
    }
}

export default Neo.setupClass(MainContainerController);
