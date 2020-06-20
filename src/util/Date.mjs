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
        className: 'Neo.util.Date'
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
     * Returns the yyyy-mm-dd formated value of a given Date instance
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
}

Neo.applyClassConfig(DateUtil);

export default DateUtil;