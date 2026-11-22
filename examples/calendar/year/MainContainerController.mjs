import ComponentController from '../../../src/controller/Component.mjs';

/**
 * @summary Brings the month of today into view on a phone, where the year view stacks its months in one column and
 * would open on January.
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
     * True while the viewport is at most a phone's width
     * @member {Boolean|null} phone=null
     * @protected
     */
    phone = null

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

            item.mounted ? me.showTodayOnPhone() : me.observeConfig(item, 'mounted', value => value && me.showTodayOnPhone())
        }
    }

    /**
     * @summary Notes whether the viewport is at most a phone's width.
     * @param {Object} data The viewport's resize event
     */
    onResize(data) {
        let me = this;

        if (data.id === me.component.id) {
            me.phone = data.borderBoxSize.inlineSize <= 640;
            me.showTodayOnPhone()
        }
    }

    /**
     * @summary Scrolls the month of today to the top of the year view, once, when the viewport is a phone's width and
     * the year view is mounted. The resize and the year view's mount arrive in either order, so both call this.
     * @returns {Promise<void>}
     */
    async showTodayOnPhone() {
        let me         = this,
            {yearView} = me;

        if (me.phone && yearView?.mounted && !me.todayShown) {
            me.todayShown = true;

            // The months render on mount: the next update settles after them
            await yearView.promiseUpdate();

            await Neo.main.DomAccess.scrollIntoView({
                block        : 'start',
                querySelector: `#${yearView.id} .neo-month:has(.neo-today)`,
                windowId     : me.windowId
            })
        }
    }
}

export default Neo.setupClass(MainContainerController);
