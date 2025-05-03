import Base from '../core/Base.mjs';

/**
 * @class Neo.util.Date
 * @extends Neo.core.Base
 */
class DateUtil extends Base {
    static config = {
        /**
         * @member {String} className='Neo.util.Date'
         * @protected
         */
        className: 'Neo.util.Date',
        /**
         * Valid values for dayNameFormat
         * @member {String[]} dayNameFormats=['narrow', 'short', 'long']
         * @protected
         * @static
         */
        dayNameFormats: ['narrow', 'short', 'long'],
        /**
         * Valid values for monthNameFormat
         * @member {String[]} monthNameFormats=['narrow', 'short', 'long']
         * @protected
         * @static
         */
        monthNameFormats: ['narrow', 'short', 'long'],
        /**
         * Valid values for dayNameFormat
         * @member {Number[]} weekStartDays=[0, 1, 2, 3, 4, 5, 6]
         * @protected
         * @static
         */
        weekStartDays: [0, 1, 2, 3, 4, 5, 6]
    }

    /**
     * Clones a Date instance using the same value
     * @param {Date|null} date
     * @returns {Date|null} the cloned date object
     */
    static clone(date) {
        return date && new Date(date.valueOf()) || null
    }

    /**
     * Returns the yyyy-mm-dd formatted value of a given Date instance
     * @param {Date} date
     * @returns {String} the yyyy-mm-dd formatted date
     */
    static convertToyyyymmdd(date) {
        return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0]
    }

    /**
     * Returns the amount of days inside the month of a passed date object
     * @param {Date} date
     * @returns {Number} days inside the month
     */
    static getDaysInMonth(date) {
        return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    }

    /**
     * @param {Date} date
     * @param {Number} weekStartDay 0-6
     * @returns {Number}
     */
    static getFirstDayOffset(date, weekStartDay) {
        let firstDayInMonth = DateUtil.getFirstDayOfMonth(date),
            firstDayOffset  = firstDayInMonth - weekStartDay;

        return firstDayOffset < 0 ? firstDayOffset + 7 : firstDayOffset
    }

    /**
     * Returns the day number of the first day of a passed date object
     * @param {Date} date
     * @returns {Number} 0-6 (Sun-Sat)
     */
    static getFirstDayOfMonth(date) {
        return new Date(date.getFullYear(), date.getMonth(), 1).getDay()
    }

    /**
     * Returns the week number of the passed date
     * https://en.wikipedia.org/wiki/ISO_8601
     * @param {Date} targetDate
     * @returns {Number}
     */
    static getWeekOfYear(targetDate) {
        let date      = new Date(targetDate.valueOf()),
            dayNumber = (targetDate.getUTCDay() + 6) % 7,
            firstThursday;

        date.setUTCDate(date.getUTCDate() - dayNumber + 3);
        firstThursday = date.valueOf();
        date.setUTCMonth(0, 1);

        if (date.getUTCDay() !== 4) {
            date.setUTCMonth(0, 1 + ((4 - date.getUTCDay()) + 7) % 7)
        }

        return Math.ceil((firstThursday - date) /  (7 * 24 * 3600 * 1000)) + 1
    }

    /**
     * @param {Date} date
     * @param {Number} weekStartDay 0-6
     * @returns {Number} 5-6
     */
    static getWeeksOfMonth(date, weekStartDay) {
        let daysInMonth    = DateUtil.getDaysInMonth(date),
            firstDayOffset = DateUtil.getFirstDayOffset(date, weekStartDay);

        return (daysInMonth + firstDayOffset) / 7 > 5 ? 6 : 5
    }

    /**
     * Returns true in case the day, month & year of 2 given Date objects are the same
     * @param {Date} date1
     * @param {Date} date2
     * @returns {Boolean}
     */
    static matchDate(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth()    === date2.getMonth()    &&
               date1.getDate()     === date2.getDate()
    }
}

export default Neo.setupClass(DateUtil);
