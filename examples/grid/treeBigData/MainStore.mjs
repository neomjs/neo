import Model     from './MainModel.mjs';
import TreeStore from '../../../src/data/TreeStore.mjs';

/**
 * @class Neo.examples.grid.treeBigData.MainStore
 * @extends Neo.data.TreeStore
 */
class MainStore extends TreeStore {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.treeBigData.MainStore'
         * @protected
         */
        className: 'Neo.examples.grid.treeBigData.MainStore',
        /**
         * @member {Number} amountColumns_=50
         * @reactive
         */
        amountColumns_: 50,
        /**
         * @member {Number} amountRows_=20000
         * @reactive
         */
        amountRows_: 20000,
        /**
         * @member {Boolean} autoInitRecords=false
         */
        autoInitRecords: false,
        /**
         * @member {Object[]} filters
         * @reactive
         */
        filters: [{
            property: 'firstname',
            operator: 'like',
            value   : null
        }, {
            property: 'lastname',
            operator: 'like',
            value   : null
        }],
        /**
         * @member {Number} maxDepth_=5
         * @reactive
         */
        maxDepth_: 5,
        /**
         * @member {Neo.data.Model} model=Model
         * @reactive
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
     * @param {Object} config
     * @returns {Neo.collection.Base}
     * @protected
     */
    createAllItems(config) {
        config.preventDataGeneration = true;
        return super.createAllItems(config)
    }

    /**
     * Triggered after the maxDepth config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetMaxDepth(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this;
            me.afterSetAmountRows(me.amountRows)
        }
    }

    /**
     * Triggered after the amountColumns config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetAmountColumns(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this;
            me.model.amountColumns = value;
            me.afterSetAmountRows(me.amountRows)
        }
    }

    /**
     * Triggered after the amountRows config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetAmountRows(value, oldValue) {
        if (this.preventDataGeneration) {
            return
        }

        let me    = this,
            data  = me.generateData(value, me.amountColumns, me.maxDepth),
            start = performance.now();

        console.log('Start generating data and adding to collection');

        if (me.items?.length > 0) {
            me.clear(false)
        }

        me.add(data);

        console.log(`Data generation and collection add total time: ${Math.round(performance.now() - start)}ms`)
    }

    /**
     * @param {Number} amountRows
     * @param {Number} amountColumns
     * @param {Number} maxDepth
     * @returns {Object[]}
     */
    generateData(amountRows, amountColumns, maxDepth) {
        console.log('Start creating tree data', {amountRows, amountColumns, maxDepth});

        let me               = this,
            start            = performance.now(),
            amountFirstnames = me.firstnames.length,
            amountLastnames  = me.lastnames.length,
            records          = [],
            parentPool       = [],
            row              = 0,
            column, depth, isLeaf, parentId, parentInfo, record;

        // Seed the pool with some initial root folders
        const numRoots = Math.min(10, Math.max(1, Math.floor(amountRows / 100)));
        for (let i = 0; i < numRoots; i++) {
            row++;
            record = me.createRecord(row, amountColumns, null, false, amountFirstnames, amountLastnames);
            records.push(record);
            parentPool.push({ id: record.id, depth: 1 });
        }

        // Generate the rest
        for (; row < amountRows; row++) {
            // Randomly select a parent from the pool
            parentInfo = parentPool[Math.floor(Math.random() * parentPool.length)];
            parentId   = parentInfo.id;
            depth      = parentInfo.depth;

            // Determine if leaf. If we reached max depth, it MUST be a leaf.
            // Otherwise, say 70% chance it's a leaf, 30% chance it's a folder.
            isLeaf = depth >= maxDepth ? true : Math.random() < 0.7;

            record = me.createRecord(row + 1, amountColumns, parentId, isLeaf, amountFirstnames, amountLastnames);
            records.push(record);

            if (!isLeaf) {
                parentPool.push({ id: record.id, depth: depth + 1 });
            }
        }

        console.log(`Tree Data creation total time: ${Math.round(performance.now() - start)}ms`);

        return records
    }

    /**
     * @param {Number} id 
     * @param {Number} amountColumns 
     * @param {String|null} parentId 
     * @param {Boolean} isLeaf 
     * @param {Number} amountFirstnames 
     * @param {Number} amountLastnames 
     * @returns {Object}
     */
    createRecord(id, amountColumns, parentId, isLeaf, amountFirstnames, amountLastnames) {
        let column = 7,
            record = {
                id       : id.toString(),
                name     : (isLeaf ? 'File ' : 'Folder ') + id,
                parentId : parentId,
                isLeaf   : isLeaf,
                collapsed: true,
                counter  : Math.round(Math.random() * 100),
                firstname: this.firstnames[Math.floor(Math.random() * amountFirstnames)],
                lastname : this.lastnames[ Math.floor(Math.random() * amountLastnames)],
                progress : Math.round(Math.random() * 100)
            };

        for (; column <= amountColumns; column++) {
            record['number' + column] = Math.round(Math.random() * 10000)
        }

        return record
    }
}

export default Neo.setupClass(MainStore);
