import Model from './MainModel.mjs';
import Store from '../../../src/data/Store.mjs';

/**
 * @summary Store for the Global Code Sprint Leaderboard in the animated row sorting example.
 * Provides candidate records and re-sorts the leaderboard when rankings are updated.
 * @class Neo.examples.grid.animatedRowSorting.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.animatedRowSorting.MainStore'
         * @protected
         */
        className: 'Neo.examples.grid.animatedRowSorting.MainStore',
        /**
         * @member {Neo.data.Model} model=Model
         */
        model: Model,

        /**
         * @member {Object[]} data
         */
        data: [
            {country: 'NL', firstname: 'Amanda',  id: 1,  lastname: 'King',     progress: 92},
            {country: 'US', firstname: 'Sam',     id: 2,  lastname: 'Anderson', progress: 88},
            {country: 'AT', firstname: 'Carol',   id: 3,  lastname: 'Jackson',  progress: 85},
            {country: 'DE', firstname: 'Max',     id: 4,  lastname: 'Johnson',  progress: 81},
            {country: 'FR', firstname: 'Sarah',   id: 5,  lastname: 'Scott',    progress: 78},
            {country: 'GR', firstname: 'William', id: 6,  lastname: 'Wilson',   progress: 74},
            {country: 'UK', firstname: 'Paul',    id: 7,  lastname: 'Walker',   progress: 70},
            {country: 'JP', firstname: 'Kenji',   id: 8,  lastname: 'Sato',     progress: 67},
            {country: 'SE', firstname: 'Elena',   id: 9,  lastname: 'Rostova',  progress: 64},
            {country: 'BR', firstname: 'Mateo',   id: 10, lastname: 'Silva',    progress: 61},
            {country: 'IN', firstname: 'Ananya',  id: 11, lastname: 'Sharma',   progress: 58},
            {country: 'IE', firstname: 'Liam',    id: 12, lastname: "O'Connor", progress: 55},
            {country: 'SG', firstname: 'Mei',     id: 13, lastname: 'Chen',     progress: 52},
            {country: 'CH', firstname: 'Lucas',   id: 14, lastname: 'Meyer',    progress: 49},
            {country: 'IT', firstname: 'Sofia',   id: 15, lastname: 'Rossi',    progress: 46},
            {country: 'AE', firstname: 'Tariq',   id: 16, lastname: 'Mansour',  progress: 44},
            {country: 'BE', firstname: 'Chloe',   id: 17, lastname: 'Dubois',   progress: 42},
            {country: 'DK', firstname: 'Noah',    id: 18, lastname: 'Hansen',   progress: 40},
            {country: 'MA', firstname: 'Zara',    id: 19, lastname: 'Al-Fassi', progress: 38},
            {country: 'KR', firstname: 'Daniel',  id: 20, lastname: 'Kim',      progress: 36},
            {country: 'CA', firstname: 'Olivia',  id: 21, lastname: 'Taylor',   progress: 34},
            {country: 'PT', firstname: 'Gabriel', id: 22, lastname: 'Santos',   progress: 32},
            {country: 'EG', firstname: 'Fatima',  id: 23, lastname: 'Zahra',    progress: 30},
            {country: 'MX', firstname: 'Alex',    id: 24, lastname: 'Rivera',   progress: 28}
        ],

        /**
         * @member {Object[]} filters
         */
        filters: [{
            operator: 'like',
            property: 'firstname',
            value   : null
        }],

        /**
         * @member {Object[]} sorters
         */
        sorters: [{
            direction            : 'DESC',
            property             : 'progress',
            reapplyOnRecordChange: true
        }]
    }

    /**
     * @member {Boolean} #isFirstTick=true
     * @private
     */
    #isFirstTick = true

    /**
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    afterSetSorters(value, oldValue) {
        super.afterSetSorters(value, oldValue);

        this.sorters?.forEach(sorter => {
            if (sorter.property === 'progress') {
                sorter.reapplyOnRecordChange = true
            }
        })
    }

    /**
     * @summary Periodically updates candidate scores and re-sorts the leaderboard.
     * On the first tick (1.5s), the third-place candidate is boosted to the top position to ensure an overtake within 5s.
     * On subsequent ticks, 2 random candidates in the top 12 are updated, resetting to 38-55
     * if reaching >= 95 to avoid stagnation at 100%.
     */
    updateRankings() {
        let me = this;

        if (me.isDestroyed) {
            return
        }

        if (me.#isFirstTick) {
            me.#isFirstTick = false;

            const rank3 = me.getAt(2);

            if (rank3) {
                const rank1  = me.getAt(0),
                      target = rank1 ? Math.max(96, rank1.progress + 4) : 96;

                me.updateRows([{
                    key   : me.getKey(rank3),
                    values: {progress: target}
                }])
            }
        } else {
            const topCount = Math.min(12, me.count);

            if (topCount >= 2) {
                let idx1 = Math.floor(Math.random() * topCount),
                    idx2 = Math.floor(Math.random() * topCount);

                while (idx2 === idx1) {
                    idx2 = Math.floor(Math.random() * topCount)
                }

                const rec1 = me.getAt(idx1),
                      rec2 = me.getAt(idx2);

                if (rec1 && rec2) {
                    const getNextProgress = current => {
                        if (current >= 95) {
                            return Math.floor(Math.random() * (55 - 38 + 1)) + 38
                        }
                        return Math.min(98, current + Math.floor(Math.random() * 5) + 3)
                    };

                    me.updateRows([
                        {key: me.getKey(rec1), values: {progress: getNextProgress(rec1.progress)}},
                        {key: me.getKey(rec2), values: {progress: getNextProgress(rec2.progress)}}
                    ])
                }
            }
        }
    }
}

export default Neo.setupClass(MainStore);
