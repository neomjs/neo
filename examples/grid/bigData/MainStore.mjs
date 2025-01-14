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
        'Ashley',
        'Barbara',
        'Betty',
        'Chris',
        'David',
        'Elizabeth',
        'Jack',
        'James',
        'Jennifer',
        'Jessica',
        'Joe',
        'John',
        'Karen',
        'Kelly',
        'Kim',
        'Linda',
        'Lisa',
        'Mary',
        'Max',
        'Michael',
        'Nancy',
        'Patricia',
        'Rich',
        'Robert',
        'Sam',
        'Sandra',
        'Sarah',
        'Susan',
        'Thomas',
        'Tobias'
    ]

    lastnames = [
        'Anderson',
        'Brown',
        'Davis',
        'Garcia',
        'Gonzales',
        'Harris',
        'Hernandez',
        'Jackson',
        'Johnson',
        'Jones',
        'Lee',
        'Lopez',
        'Martin',
        'Martinez',
        'Miller',
        'Moore',
        'Perez',
        'Rahder',
        'Rodriguez',
        'Smith',
        'Taylor',
        'Thomas',
        'Thompson',
        'Uhlig',
        'Waters',
        'White',
        'Williams',
        'Wilson'
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
