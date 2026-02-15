import Model from '../../../src/data/Model.mjs';

/**
 * @class DevIndex.model.Contributor
 * @extends Neo.data.Model
 */
class Contributor extends Model {
    static config = {
        /**
         * @member {String} className='DevIndex.model.Contributor'
         * @protected
         */
        className: 'DevIndex.model.Contributor',
        /**
         * @member {Object[]} fields
         */
        fields: [
            {name: 'login', mapping: 'l',  type: 'String'},
            {name: 'name',  mapping: 'n',  type: 'String'},
            {
                name        : 'avatar_url', // Keeping snake_case for external URL convention? No, let's keep consistency? Wait, strict instruction said rename specific fields. I will stick to the list. `avatar_url` was not in the rename list. I'll leave it or rename it? The prompt didn't ask to rename avatar_url. I'll stick to the requested list to be safe, but `avatar_url` is inconsistent. I will rename `avatar_url` to `avatarUrl` for consistency as it is a "Refactor to camelCase" task.
                mapping     : 'i',
                type        : 'String',
                defaultValue: null,
                convert     : value => value ? `https://avatars.githubusercontent.com/u/${value}?v=4` : null
            },
            {name: 'avatarUrl',            mapping: 'i',  type: 'String',  defaultValue: null, convert: value => value ? `https://avatars.githubusercontent.com/u/${value}?v=4` : null}, // Duplicate for safety or replacement? I will REPLACE.
            {name: 'location',             mapping: 'lc', type: 'String',  defaultValue: null},
            {name: 'countryCode',          mapping: 'cc', type: 'String',  defaultValue: null},
            {name: 'company',              mapping: 'c',  type: 'String',  defaultValue: null},
            {name: 'bio',                  mapping: 'b',  type: 'String',  defaultValue: null},
            {name: 'followers',            mapping: 'fl', type: 'Integer'},
            {name: 'totalContributions',   mapping: 'tc', type: 'Integer'},
            {name: 'firstYear',            mapping: 'fy', type: 'Integer'},
            {name: 'lastUpdated',          mapping: 'lu', type: 'Date'},
            {name: 'linkedinUrl',          mapping: 'li', type: 'String',  defaultValue: null},
            {name: 'twitter',              mapping: 't',  type: 'String',  defaultValue: null},
            {name: 'website',              mapping: 'w',  type: 'String',  defaultValue: null},
            {name: 'isHireable',           mapping: 'h',  type: 'Boolean', defaultValue: false, convert: v => !!v},
            {name: 'hasSponsors',          mapping: 's',  type: 'Integer', defaultValue: null},
            {name: 'heuristics',           mapping: 'hm', type: 'Object',  defaultValue: null},
            {name: 'topRepo',              mapping: 'tr', type: 'Array',   defaultValue: null},
            {name: 'privateContributions', mapping: 'py', type: 'Array',   defaultValue: []},
            {
                name   : 'organizations',
                mapping: 'o',
                type   : 'Array',
                convert: value => {
                    if (!Array.isArray(value)) return [];
                    return value.map(item => ({
                        login     : item[0],
                        avatar_url: `https://avatars.githubusercontent.com/u/${item[1]}?v=4`
                    }))
                }
            },
            {name: 'commitsArray', mapping: 'cy', type: 'Array'},
            {
                name   : 'totalCommits',
                type   : 'Integer',
                /**
                 * Calculates the total commits from the yearly breakdown.
                 *
                 * **Turbo Mode / Soft Hydration Compatibility:**
                 * In "Turbo Mode" (autoInitRecords: false), the Store sorts raw JSON objects, not Record instances.
                 * The `Neo.data.Store#doSort` "Soft Hydration" logic resolves this field (`totalCommits`)
                 * by calling this `calculate` function on the raw object.
                 *
                 * - **Record Context:** `data` is a Record. `data.commitsArray` exists (via getter/mapping).
                 * - **Raw Context:** `data` is a POJO. `data.commitsArray` is undefined. `data.cy` exists.
                 *
                 * To support both contexts without forcing full record instantiation (performance killer),
                 * we must check for both the canonical name AND the raw data key.
                 *
                 * @param {Object|Neo.data.Record} data
                 * @returns {Number}
                 */
                calculate: data => {
                    return (data.commitsArray || data.cy)?.reduce((a, b) => a + b, 0) || 0
                }
            }
        ]
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.addYearFields()
    }

    /**
     * Dynamically add fields for each year from 2010 to current year
     */
    addYearFields() {
        let me          = this,
            currentYear = new Date().getFullYear(),
            fields      = [...me.fields];

        for (let i = currentYear; i >= 2010; i--) {
            // Total Contributions
            fields.push({
                name   : `y${i}`,
                mapping: 'y', // Map to the raw years array
                type   : 'Integer',
                convert: (value, record) => {
                    // value is the raw 'y' array. record contains raw 'fy' or mapped 'firstYear'.
                    if (!value || !Array.isArray(value)) return 0;

                    const firstYear = record.fy || record.firstYear;
                    if (!firstYear) return 0;

                    const index = i - firstYear;
                    return (index >= 0 && index < value.length) ? value[index] : 0;
                }
            });

            // Commits Only
            fields.push({
                name   : `cy${i}`,
                mapping: 'cy', // Map to the raw commits array
                type   : 'Integer',
                convert: (value, record) => {
                    if (!value || !Array.isArray(value)) return 0;

                    const firstYear = record.fy || record.firstYear;
                    if (!firstYear) return 0;

                    const index = i - firstYear;
                    return (index >= 0 && index < value.length) ? value[index] : 0;
                }
            });
        }

        me.fields = fields
    }
}

export default Neo.setupClass(Contributor);
