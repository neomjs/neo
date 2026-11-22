import Interceptor from '../../../src/data/interceptor/Base.mjs';

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * @summary The example's own code inside the pipeline: three hooks that turn a response full of orders into a report
 * with one row per country.
 *
 * It is an ordinary Neo class without a callback or a reference to the app, so a pipeline that runs in the data
 * worker loads it there by its `modulePath` and the work happens in that worker.
 *
 * @class Neo.examples.data.pipeline.Report
 * @extends Neo.data.interceptor.Base
 */
class Report extends Interceptor {
    static config = {
        /**
         * @member {String} className='Neo.examples.data.pipeline.Report'
         * @protected
         */
        className: 'Neo.examples.data.pipeline.Report'
    }

    /**
     * @summary Counts, sums and ranks: per country its orders, revenue, distinct customers and strongest month. Every
     * order's date is parsed, which is most of the work.
     * @param {Object[]} orders
     * @returns {Object[]} One row per country, the highest revenue first
     */
    postParse(orders) {
        const countries = new Map();

        for (const order of orders) {
            let entry = countries.get(order.country);

            if (!entry) {
                countries.set(order.country, entry = {customers: new Set(), months: new Array(12).fill(0), orders: 0, revenue: 0})
            }

            entry.customers.add(order.customer);
            entry.months[new Date(order.placed).getUTCMonth()] += order.amount;
            entry.orders++;
            entry.revenue += order.amount
        }

        return [...countries].map(([country, {customers, months: revenues, orders: count, revenue}]) => ({
            average  : Math.round(revenue / count),
            bestMonth: months[revenues.indexOf(Math.max(...revenues))],
            country,
            customers: customers.size,
            orders   : count,
            revenue
        })).sort((a, b) => b.revenue - a.revenue)
    }

    /**
     * @summary Takes the store's paging params off the request: the payload is one document, and its address takes
     * no query.
     * @param {Object} params
     * @returns {Object}
     */
    request({page, pageSize, ...params}) {
        return params
    }

    /**
     * @summary Hands on the orders alone, without the response around them.
     * @param {Object} response What the connection resolved with
     * @returns {Object[]}
     */
    response(response) {
        return response.data
    }
}

export default Neo.setupClass(Report);
