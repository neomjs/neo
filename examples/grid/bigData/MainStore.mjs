import Model from './MainModel.mjs';
import Store from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.grid.bigData.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.bigData.MainStore'
         * @protected
         */
        className: 'Neo.examples.grid.bigData.MainStore',
        /**
         * @member {Number} amountColumns_=50
         */
        amountColumns_: 50,
        /**
         * @member {Number} amountRows_=10000
         */
        amountRows_: 10000,
        /**
         * @member {Neo.data.Model} model=Model
         */
        model: Model
    }

    firstnames = [
        'Amanda', 'Andrew', 'Anthony', 'Ashley', 'Barbara', 'Betty', 'Brian', 'Carol', 'Charles', 'Christopher',
        'Daniel', 'David', 'Deborah', 'Donna', 'Elizabeth', 'Emily', 'George', 'Jack', 'James', 'Jennifer',
        'Jessica', 'Joe', 'John', 'Joseph', 'Joshua', 'Karen', 'Kenneth', 'Kelly', 'Kevin', 'Kimberly',
        'Linda', 'Lisa', 'Margaret', 'Mark', 'Mary', 'Matthew', 'Max', 'Melissa', 'Michael', 'Michelle',
        'Nancy', 'Patricia', 'Paul', 'Richard', 'Robert', 'Ronald', 'Sam', 'Sandra', 'Sarah', 'Stephanie',
        'Steven', 'Susan', 'Thomas', 'Timothy', 'Tobias', 'William'
    ]

    lastnames = [
        'Adams', 'Allen', 'Anderson', 'Baker', 'Brown', 'Campbell', 'Carter', 'Clark', 'Davis', 'Flores',
        'Garcia', 'Gonzales', 'Green', 'Hall', 'Harris', 'Hernandez', 'Hill', 'Jackson', 'Johnson', 'Jones',
        'King', 'Lee', 'Lewis', 'Lopez', 'Martin', 'Martinez', 'Miller', 'Mitchell', 'Moore', 'Nelson',
        'Nguyen', 'Perez', 'Rahder', 'Ramirez', 'Roberts', 'Rivera', 'Robinson', 'Rodriguez', 'Sanchez', 'Scott',
        'Smith', 'Taylor', 'Thomas', 'Thompson', 'Torres', 'Uhlig', 'Walker', 'Waters', 'White', 'Williams',
        'Wilson', 'Wright', 'Young'
    ]

    /**
     * Triggered after the amountColumns config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetAmountColumns(value, oldValue) {
        if (oldValue !== undefined) {
            let me    = this,
                data  = me.generateData(me.amountRows, value),
                start = performance.now();

            me.model.amountColumns = value;

            console.log('Start creating records');

            me.data = data;

            console.log(`Record creation total time: ${Math.round(performance.now() - start)}ms`)
        }
    }

    /**
     * Triggered after the amountRows config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetAmountRows(value, oldValue) {
        let me    = this,
            data  = me.generateData(value, me.amountColumns),
            start = performance.now();

        console.log('Start creating records');

        me.data = data;

        console.log(`Record creation total time: ${Math.round(performance.now() - start)}ms`)
    }

    /**
     * @param {Number} amountRows
     * @param {Number} amountColumns
     * @returns {Object[]}
     */
    generateData(amountRows, amountColumns) {
        console.log('Start creating data', {amountRows, amountColumns});

        let me               = this,
            start            = performance.now(),
            amountFirstnames = me.firstnames.length,
            amountLastnames  = me.lastnames.length,
            records          = [],
            row              = 0,
            column, record;

        for (; row < amountRows; row++) {
            column = 4;
            record = {
                id       : row + 1,
                firstname: me.firstnames[Math.floor(Math.random() * amountFirstnames)],
                lastname : me.lastnames[ Math.floor(Math.random() * amountLastnames)]
            };

            for (; column <= amountColumns; column++) {
                record['number' + column] = Math.round(Math.random() * 10000)
            }

            records.push(record)
        }

        console.log(`Data creation total time: ${Math.round(performance.now() - start)}ms`);

        return records
    }
}

export default Neo.setupClass(MainStore);
