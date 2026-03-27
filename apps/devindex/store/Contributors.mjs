import ContributorModel from '../model/Contributor.mjs';
import Store            from '../../../src/data/Store.mjs';
import StreamConnection from '../../../src/data/connection/Stream.mjs';
import StreamParser     from '../../../src/data/parser/Stream.mjs';

/**
 * @class DevIndex.store.Contributors
 * @extends Neo.data.Store
 */
class Contributors extends Store {
    static config = {
        /**
         * @member {String} className='DevIndex.store.Contributors'
         * @protected
         */
        className: 'DevIndex.store.Contributors',
        /**
         * @member {Neo.data.Model} model=ContributorModel
         */
        model: ContributorModel,
        /**
         * @member {String} keyProperty='login'
         */
        keyProperty: 'login',
        /**
         * @member {Boolean} autoLoad=true
         */
        autoLoad: true,
        /**
         * @member {Boolean} autoInitRecords=false
         */
        autoInitRecords: false,
        /**
         * @member {Object[]} filters
         */
        filters: [
            {property: 'bio',         operator: 'like', value: null},
            {property: 'commitRatio', operator: '<=',   value: null},
            {property: 'countryCode', operator: '===',  value: null},
            {property: 'isHireable',  operator: '===',  value: null},
            {property: 'login',       operator: 'like', value: null},
            {property: 'name',        operator: 'like', value: null}
        ],
        /**
         * @member {Object} pipeline
         */
        pipeline: {
            connection: {
                module: StreamConnection,
                url   : Neo.config.basePath + 'apps/devindex/resources/data/users.jsonl'
            },
            parser: {
                module              : StreamParser,
                progressiveChunkSize: true
            }
        },
        /**
         * @member {Object[]} sorters
         */
        sorters: [
            {property: 'totalContributions', direction: 'DESC'}
        ]
    }

    /**
     * @member {String} lastStructuralFilterState=''
     */
    lastStructuralFilterState = ''

    /**
     * @member {Number} lastRankAssigned=0
     */
    lastRankAssigned = 0

    /**
     * @param {Array|Object} item
     * @param {Boolean} [init]
     * @returns {Number|Object[]|Neo.data.Model[]}
     */
    add(item, init) {
        let me    = this,
            items = Array.isArray(item) ? item : [item],
            i     = 0,
            len   = items.length,
            record;

        // Assign initial global rank based on stream order
        for (; i < len; i++) {
            record = items[i];
            me.lastRankAssigned++;
            record.initialRank = me.lastRankAssigned;
            record.rank        = me.lastRankAssigned;
        }

        return super.add(items, init);
    }


    /**
     * Overrides Store:filter() to dynamically calculate contextual ranks.
     * The rank is calculated based on "structural" filters (country, hireable, etc.)
     * and ignores "search" filters (login, name, bio).
     * @param {Boolean} [silent=false]
     * @protected
     */
    filter(silent=false) {
        let me = this;

        const searchProperties = ['login', 'name', 'bio'];
        const activeStructuralFilters = me.filters.filter(f =>
            !f.disabled && f.value !== null && !searchProperties.includes(f.property)
        );

        // Create a string representation of the current structural filter state
        const currentStructuralState = activeStructuralFilters
            .map(f => `${f.property}:${f.value}`)
            .sort()
            .join(',');

        const sourceItems = me.allItems ? me.allItems._items : me._items;

        // Recalculate if structural filters changed, or if we haven't calculated yet and data exists.
        // We also need to recalculate if data is streaming in (count changed) but structural state is the same.
        const needsCalculation = me.lastStructuralFilterState !== currentStructuralState ||
                               (me.lastStructuralFilterState === '' && sourceItems.length > 0) ||
                               (me._lastRankedCount !== sourceItems.length);

        let newRanks = new Map();

        if (needsCalculation) {
            me.lastStructuralFilterState = currentStructuralState;
            me._lastRankedCount = sourceItems.length;

            let i = 0,
                len, item;

            if (activeStructuralFilters.length === 0) {
                // Reset to global rank
                len = sourceItems.length;

                for (; i < len; i++) {
                    item = sourceItems[i];
                    newRanks.set(item, item.initialRank)
                }
            } else {
                let rankedItems = [],
                    fLen        = activeStructuralFilters.length,
                    j, filter, isExcluded;

                len = sourceItems.length;

                for (; i < len; i++) {
                    item = sourceItems[i];
                    isExcluded = false;

                    for (j = 0; j < fLen; j++) {
                        filter = activeStructuralFilters[j];
                        if (!item.isRecord && !Object.hasOwn(item, filter.property)) {
                            item[filter.property] = me.resolveField(item, filter.property)
                        }
                        if (filter.isFiltered(item)) {
                            isExcluded = true;
                            break
                        }
                    }

                    if (!isExcluded) {
                        rankedItems.push(item)
                    }
                }

                // EXPLICIT SORT: Guarantee ranks are based on actual contributions, not array position
                rankedItems.sort((a, b) => {
                    let valA = a.isRecord ? a.totalContributions : (a.tc ?? a.totalContributions ?? 0),
                        valB = b.isRecord ? b.totalContributions : (b.tc ?? b.totalContributions ?? 0);
                    return valB - valA // DESC
                });

                len = rankedItems.length;

                for (i = 0; i < len; i++) {
                    newRanks.set(rankedItems[i], i + 1)
                }
            }
        }

        // Run parent filter SILENTLY
        super.filter(true);

        if (needsCalculation) {
            // Apply the calculated ranks smartly
            for (let [item, newRank] of newRanks.entries()) {
                if (item.isRecord) {
                    if (me.map.has(item.login)) {
                        // Visible Record: Loud update to trigger VDOM refresh
                        item.rank = newRank
                    } else {
                        // Hidden Record: Silent update to avoid event storm
                        item.setSilent({rank: newRank})
                    }
                } else {
                    // Raw Object: Direct mutation is always silent
                    item.rank = newRank
                }
            }
        }

        if (!silent) {
            me.fire('filter', {
                isFiltered: me.isFiltered(),
                items     : me.items
            })
        }
    }
}

export default Neo.setupClass(Contributors);
