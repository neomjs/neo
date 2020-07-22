import Base from '../core/Base.mjs';

/**
 * @class Neo.util.Date
 * @extends Neo.core.Base
 */
class DateUtil extends Base {
    static getConfig() {return {
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
         * Valid values for dayNameFormat
         * @member {Number[]} weekStartDays=[0, 1, 2, 3, 4, 5, 6]
         * @protected
         * @static
         */
        weekStartDays: [0, 1, 2, 3, 4, 5, 6]
    }}

    /**
     * Clones a Date instance using the same value
     * @param {Date} date
     * @return {Date} the cloned date object
     */
    static clone(date) {
        return new Date(date.valueOf());
    }

    /**
     * Returns the yyyy-mm-dd formatted value of a given Date instance
     * @param {Date} date
     * @return {String} the yyyy-mm-dd formatted date
     */
    static convertToyyyymmdd(date) {
        return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    }

    /**
     * Returns the amount of days inside the month of a passed date object
     * @param {Date} date
     * @returns {Number} days inside the month
     */
    static getDaysInMonth(date) {
        return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    }

    /**
     * Returns the day number of the first day of a passed date object
     * @param {Date} date
     * @returns {Number} 0-6 (Sun-Sat)
     */
    static getFirstDayOfMonth(date) {
        return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
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
            date.setUTCMonth(0, 1 + ((4 - date.getUTCDay()) + 7) % 7);
        }

        return Math.ceil((firstThursday - date) /  (7 * 24 * 3600 * 1000)) + 1;
    }
}

Neo.applyClassConfig(DateUtil);

export default DateUtil;