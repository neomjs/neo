import Model                from './MainModel.mjs';
import TreeStore            from '../../../src/data/TreeStore.mjs';
import {createSeededRandom} from '../../../src/util/Random.mjs';

/**
 * The ten divisions at the root, each with its departments, its job titles and its home office
 * @type {Object[]}
 */
const divisions = [
    {name: 'Engineering',      city: 'Berlin',        departments: ['Platform', 'Mobile', 'Data', 'Security', 'Infrastructure', 'Web', 'Developer Tools', 'Quality'],             titles: ['Software Engineer', 'Senior Engineer', 'Staff Engineer', 'Engineering Manager', 'Site Reliability Engineer']},
    {name: 'Sales',            city: 'New York',      departments: ['Enterprise', 'Mid-Market', 'EMEA', 'Americas', 'APAC', 'Partnerships', 'Inside Sales', 'Sales Operations'],      titles: ['Account Executive', 'Sales Engineer', 'Account Manager', 'Sales Director', 'Business Developer']},
    {name: 'Marketing',        city: 'London',        departments: ['Brand', 'Content', 'Growth', 'Events', 'Product Marketing', 'Communications', 'Analytics', 'Web'],              titles: ['Content Strategist', 'Growth Marketer', 'Brand Designer', 'Marketing Manager', 'Analyst']},
    {name: 'Operations',       city: 'Toronto',       departments: ['Logistics', 'Facilities', 'Procurement', 'IT', 'Supply Chain', 'Workplace', 'Vendors', 'Quality'],              titles: ['Operations Manager', 'Buyer', 'IT Specialist', 'Planner', 'Coordinator']},
    {name: 'Finance',          city: 'Amsterdam',     departments: ['Accounting', 'Controlling', 'Treasury', 'Tax', 'Payroll', 'Audit', 'Planning', 'Investor Relations'],         titles: ['Accountant', 'Controller', 'Financial Analyst', 'Tax Advisor', 'Finance Manager']},
    {name: 'Customer Success', city: 'Singapore',     departments: ['Onboarding', 'Support', 'Renewals', 'Training', 'Community', 'Escalations', 'Solutions', 'Advocacy'],         titles: ['Support Specialist', 'Customer Success Manager', 'Trainer', 'Solutions Architect', 'Team Lead']},
    {name: 'Research',         city: 'San Francisco', departments: ['Applied Research', 'Labs', 'User Research', 'Data Science', 'Prototyping', 'Standards', 'Algorithms', 'Benchmarks'], titles: ['Research Scientist', 'Data Scientist', 'Research Engineer', 'UX Researcher', 'Principal Scientist']},
    {name: 'Design',           city: 'Paris',         departments: ['Product Design', 'Design Systems', 'UX Writing', 'Visual Design', 'Motion', 'Accessibility', 'Research Ops', 'Illustration'], titles: ['Product Designer', 'UX Writer', 'Visual Designer', 'Design Lead', 'Motion Designer']},
    {name: 'People',           city: 'Bangalore',     departments: ['Recruiting', 'People Partners', 'Learning', 'Compensation', 'Benefits', 'Culture', 'Talent', 'People Analytics'], titles: ['Recruiter', 'People Partner', 'Learning Designer', 'Compensation Analyst', 'People Manager']},
    {name: 'Legal',            city: 'Sydney',        departments: ['Contracts', 'Compliance', 'Privacy', 'Litigation', 'Corporate', 'Intellectual Property', 'Employment', 'Policy'], titles: ['Counsel', 'Paralegal', 'Compliance Officer', 'Privacy Officer', 'General Counsel']}
];

const
    cities    = ['Berlin', 'New York', 'London', 'Toronto', 'Amsterdam', 'Singapore', 'San Francisco', 'Paris', 'Bangalore', 'Sydney', 'São Paulo', 'Tokyo'],
    codenames = ['Atlas', 'Beacon', 'Cobalt', 'Delta', 'Ember', 'Falcon', 'Granite', 'Harbor', 'Iris', 'Juniper', 'Kestrel', 'Lumen', 'Meridian', 'Nova', 'Orbit', 'Pulse', 'Quartz', 'Ridge', 'Summit', 'Tidal'],
    greek     = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Sigma'],
    // The role a unit shows by its level; a level past the list is a Group
    levels    = ['Division', 'Department', 'Team', 'Squad', 'Pod', 'Crew'],
    SEED      = 21165;

/**
 * The name of the n-th unit (0-based) a parent at `depth - 1` holds. A list that runs out repeats with a number.
 * @param {String[]} names
 * @param {Number} n
 * @returns {String}
 */
const nth = (names, n) => names[n % names.length] + (n < names.length ? '' : ' ' + (Math.floor(n / names.length) + 1));

/**
 * @summary An organization of 20,000 people and units: ten divisions, their departments, teams and squads, with people
 * as leaves on every level, the way staff sit directly in a department.
 *
 * A unit's figures are its people's: the hours booked per month add up, and the utilization is their average. The
 * shape comes from a seeded generator, so every load, the cover and the specs see the same organization. Units come
 * before people at each level, and the first division, its first department and that department's first team open
 * in the first frame.
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
         */
        model: Model
    }

    /**
     * The ids `expandFirstFrame()` opens, set by each generation
     * @member {String[]} firstFrameIds=[]
     */
    firstFrameIds = []
    /**
     * @member {String[]} firstnames
     */
    firstnames = [
        'Amanda', 'Andrew', 'Anthony', 'Ashley', 'Barbara', 'Betty', 'Brian', 'Carol', 'Charles', 'Christopher',
        'Daniel', 'David', 'Deborah', 'Donna', 'Elizabeth', 'Emily', 'George', 'Jack', 'James', 'Jennifer',
        'Jessica', 'Joe', 'John', 'Joseph', 'Joshua', 'Karen', 'Kenneth', 'Kelly', 'Kevin', 'Kimberly',
        'Linda', 'Lisa', 'Margaret', 'Mark', 'Mary', 'Matthew', 'Max', 'Melissa', 'Michael', 'Michelle',
        'Nancy', 'Patricia', 'Paul', 'Richard', 'Robert', 'Ronald', 'Sam', 'Sandra', 'Sarah', 'Stephanie',
        'Steven', 'Susan', 'Thomas', 'Timothy', 'Tobias', 'William'
    ]
    /**
     * @member {String[]} lastnames
     */
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

        // The first generation runs while the store is constructed; onConstructed() opens its first frame
        me.isConstructed && me.expandFirstFrame();

        console.log(`Data generation and collection add total time: ${Math.round(performance.now() - start)}ms`)
    }

    /**
     * @summary Opens the first division, its first unit and that unit's first unit, so the first frame shows three
     * levels of units and the people inside them.
     *
     * Every node is generated collapsed and opened here, after the add: `TreeStore` projects an expanded parent
     * through its own item index, which does not exist yet while the store is constructed.
     */
    expandFirstFrame() {
        this.firstFrameIds.forEach(id => this.expand(id))
    }

    /** @summary Opens the first frame of the organization generated during construction. */
    onConstructed() {
        super.onConstructed();
        this.expandFirstFrame()
    }

    /**
     * @summary Grows the organization from ten divisions: each new row joins a random unit, and below `maxDepth` it is a
     * unit itself three times in ten. A second pass, children before parents, sums the people's figures into their units.
     * @param {Number} amountRows
     * @param {Number} amountColumns
     * @param {Number} maxDepth
     * @returns {Object[]} Units before people at every level, parents before children
     */
    generateData(amountRows, amountColumns, maxDepth) {
        console.log('Start creating tree data', {amountRows, amountColumns, maxDepth});

        let me         = this,
            random     = createSeededRandom(SEED),
            pick       = list => list[Math.floor(random() * list.length)],
            start      = performance.now(),
            numRoots   = Math.min(divisions.length, Math.max(1, Math.floor(amountRows / 100))),
            records    = [],
            byId       = new Map(),
            parentPool = [],
            row        = 0,
            info, isLeaf, parent, record;

        const add = (data, depth, division) => {
            data.order = records.length;
            data.depth = depth;
            records.push(data);
            byId.set(data.id, data);

            if (!data.isLeaf) {
                parentPool.push({depth, division, id: data.id, units: 0})
            }
        };

        for (; row < numRoots; row++) {
            add(me.createUnit(row + 1, amountColumns, null, levels[0], divisions[row].name, divisions[row].city), 1, row)
        }

        for (; row < amountRows; row++) {
            info   = parentPool[Math.floor(random() * parentPool.length)];
            parent = byId.get(info.id);
            isLeaf = info.depth >= maxDepth ? true : random() < 0.7;

            if (isLeaf) {
                record = me.createPerson(row + 1, amountColumns, parent, divisions[info.division], random)
            } else {
                record = me.createUnit(row + 1, amountColumns, parent.id, levels[info.depth] || 'Group',
                    me.unitName(info, divisions[info.division]), random() < 0.7 ? parent.location : pick(cities));
                info.units++
            }

            add(record, info.depth + 1, info.division)
        }

        // Children come after their parents, so one backward pass sums every subtree
        for (let i = records.length - 1; i > 0; i--) {
            record = records[i];

            if (record.parentId) {
                parent = byId.get(record.parentId);
                parent.people      += record.isLeaf ? 1 : record.people;
                parent.utilization += record.isLeaf ? record.progress : record.utilization;

                for (let column = 7; column <= amountColumns; column++) {
                    parent['number' + column] += record['number' + column]
                }
            }
        }

        // Units first at every level, then the people, each in the order they were created
        records.sort((a, b) => a.depth - b.depth || Number(a.isLeaf) - Number(b.isLeaf) || a.order - b.order);

        me.firstFrameIds = me.getFirstFramePath(records);

        records.forEach(item => {
            if (!item.isLeaf) {
                item.progress = item.people ? Math.round(item.utilization / item.people) : 0
            }

            delete item.depth;
            delete item.order;
            delete item.people;
            delete item.utilization
        });

        console.log(`Tree Data creation total time: ${Math.round(performance.now() - start)}ms`);

        return records
    }

    /**
     * The ids of the first division, its first unit and that unit's first unit
     * @param {Object[]} records Sorted, units first
     * @returns {String[]}
     * @protected
     */
    getFirstFramePath(records) {
        let ids  = [],
            node = records[0];

        for (; node && ids.length < 3; node = records.find(item => item.parentId === node.id && !item.isLeaf)) {
            ids.push(node.id)
        }

        return ids
    }

    /**
     * @param {Number} id
     * @param {Number} amountColumns
     * @param {Object} parent
     * @param {Object} division
     * @param {Function} random
     * @returns {Object}
     */
    createPerson(id, amountColumns, parent, division, random) {
        let me        = this,
            firstname = me.firstnames[Math.floor(random() * me.firstnames.length)],
            lastname  = me.lastnames[ Math.floor(random() * me.lastnames.length)],
            record    = {
                collapsed: true,
                counter  : Math.floor(random() * 20),
                firstname,
                id       : id.toString(),
                isLeaf   : true,
                lastname,
                location : parent.location,
                name     : `${firstname} ${lastname}`,
                parentId : parent.id,
                progress : 50 + Math.floor(random() * 51),
                role     : division.titles[Math.floor(random() * division.titles.length)]
            };

        // Hours booked per month
        for (let column = 7; column <= amountColumns; column++) {
            record['number' + column] = 120 + Math.floor(random() * 61)
        }

        return record
    }

    /**
     * @param {Number} id
     * @param {Number} amountColumns
     * @param {String|null} parentId
     * @param {String} role The level, e.g. 'Department'
     * @param {String} name
     * @param {String} location
     * @returns {Object}
     */
    createUnit(id, amountColumns, parentId, role, name, location) {
        let record = {
            collapsed  : true,
            counter    : 0,
            id         : id.toString(),
            isLeaf     : false,
            location,
            name,
            parentId,
            people     : 0,
            progress   : 0,
            role,
            utilization: 0
        };

        for (let column = 7; column <= amountColumns; column++) {
            record['number' + column] = 0
        }

        return record
    }

    /**
     * The name of the next unit below the pooled parent `info`: a department of its division, a team codename, a
     * squad letter, then numbered pods
     * @param {Object} info The parent's pool entry: `{depth, division, id, units}`
     * @param {Object} division
     * @returns {String}
     */
    unitName(info, division) {
        switch (info.depth) {
            case 1 : return nth(division.departments, info.units);
            case 2 : return 'Team '  + nth(codenames, info.units);
            case 3 : return 'Squad ' + nth(greek, info.units);
            default: return 'Pod '   + (info.units + 1)
        }
    }
}

export default Neo.setupClass(MainStore);
