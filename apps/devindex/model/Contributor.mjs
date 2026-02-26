import Model from '../../../src/data/Model.mjs';

/**
 * @class DevIndex.model.Contributor
 * @extends Neo.data.Model
 *
 * @summary Data model representing a GitHub contributor with advanced year-based field mapping.
 *
 * This model utilizes `Neo.data.RecordFactory`'s advanced capabilities to map array-based data
 * (compact JSON for network efficiency) into addressable fields (required for Grid sorting and binding)
 * with zero per-record memory overhead.
 *
 * **Performance Architecture:**
 * - **Raw Data:** stored as compact arrays: `y` (Total), `cy` (Commits), `py` (Private).
 * - **Virtual Fields:** The `addYearFields()` method generates field configurations for every year (e.g., `y2024`, `py2024`).
 * - **Zero Overhead:** These fields are processed by `RecordFactory` to create **prototype-based getters** on the generated
 *   Record class. They read directly from the raw data arrays using the calculated index. This means adding 60+ year fields
 *   adds 0 bytes to the individual record instances, maintaining a flat memory profile even with 50k+ records.
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
                name        : 'avatar_url',
                mapping     : 'i',
                type        : 'String',
                defaultValue: null,
                convert     : value => value ? `https://avatars.githubusercontent.com/u/${value}?v=4` : null
            },
            {name: 'avatarUrl',            mapping: 'i',  type: 'String',  defaultValue: null, convert: value => value ? `https://avatars.githubusercontent.com/u/${value}?v=4` : null},
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
            {
                name     : 'topRepoCount',
                type     : 'Integer',
                virtual  : true,
                calculate: data => (data.topRepo ?? data.tr)?.[1] || 0
            },
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
            {name: 'yearsArray',   mapping: 'y',  type: 'Array'},
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
            },
            {
                name   : 'totalPrivateContributions',
                type   : 'Integer',
                /**
                 * Calculates the total private contributions from the yearly breakdown.
                 * @param {Object|Neo.data.Record} data
                 * @returns {Number}
                 */
                calculate: data => {
                    return (data.privateContributions || data.py)?.reduce((a, b) => a + b, 0) || 0
                }
            },
            {
                name   : 'totalPublicContributions',
                type   : 'Integer',
                /**
                 * Calculates the total public contributions (Total - Private).
                 * @param {Object|Neo.data.Record} data
                 * @returns {Number}
                 */
                calculate: data => {
                    // Optimization: Use pre-calculated fields if available (Record context)
                    let total           = data.totalContributions || data.tc || 0,
                        privateContribs = data.totalPrivateContributions;

                    if (privateContribs === undefined) {
                         privateContribs = (data.privateContributions || data.py)?.reduce((a, b) => a + b, 0) || 0
                    }

                    return total - privateContribs
                }
            },
            {
                name: 'privateContributionsRatio',
                type: 'Float',
                /**
                 * Calculates the ratio of private to total contributions (0-100).
                 * @param {Object|Neo.data.Record} data
                 * @returns {Number}
                 */
                calculate: data => {
                    // Optimization: Use totalPrivateContributions if already calculated (Record context)
                    // Fallback: Calculate from raw array (Raw/Store context)
                    let privateContribs = data.totalPrivateContributions;

                    if (privateContribs === undefined) {
                        privateContribs = (data.privateContributions || data.py)?.reduce((a, b) => a + b, 0) || 0
                    }

                    const total = data.totalContributions || data.tc || 0;

                    return total === 0 ? 0 : (privateContribs / total) * 100
                }
            },
            {
                name: 'commitRatio',
                type: 'Float',
                /**
                 * Calculates the ratio of commits to total contributions (0-100).
                 * @param {Object|Neo.data.Record} data
                 * @returns {Number}
                 */
                calculate: data => {
                    // Optimization: Use totalCommits if already calculated (Record context)
                    // Fallback: Calculate from raw array (Raw/Store context)
                    let commits = data.totalCommits;

                    if (commits === undefined) {
                        commits = (data.commitsArray || data.cy)?.reduce((a, b) => a + b, 0) || 0
                    }

                    const total = data.totalContributions || data.tc || 0;

                    return total === 0 ? 0 : (commits / total) * 100
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
                name     : `y${i}`,
                type     : 'Integer',
                virtual  : true,
                calculate: data => {
                    const firstYear = data.fy || data.firstYear;
                    if (!firstYear) return 0;
                    return (data.yearsArray || data.y)?.[i - firstYear] || 0
                }
            });

            // Commits Only
            fields.push({
                name     : `cy${i}`,
                type     : 'Integer',
                virtual  : true,
                calculate: data => {
                    const firstYear = data.fy || data.firstYear;
                    if (!firstYear) return 0;
                    return (data.commitsArray || data.cy)?.[i - firstYear] || 0
                }
            });

            // Private Contributions
            fields.push({
                name     : `py${i}`,
                type     : 'Integer',
                virtual  : true,
                calculate: data => {
                    const firstYear = data.fy || data.firstYear;
                    if (!firstYear) return 0;
                    return (data.privateContributions || data.py)?.[i - firstYear] || 0
                }
            });

            // Public Contributions (Calculated: Total - Private)
            fields.push({
                name     : `puy${i}`,
                type     : 'Integer',
                virtual  : true,
                calculate: data => {
                    const firstYear = data.fy || data.firstYear;
                    if (!firstYear) return 0;

                    const
                        index      = i - firstYear,
                        total      = (data.yearsArray || data.y)?.[index] || 0,
                        privateVal = (data.privateContributions || data.py)?.[index] || 0;

                    return total - privateVal
                }
            });
        }

        me.fields = fields
    }
}

export default Neo.setupClass(Contributor);
