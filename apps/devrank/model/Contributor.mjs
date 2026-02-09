import Model from '../../../src/data/Model.mjs';

/**
 * @class DevRank.model.Contributor
 * @extends Neo.data.Model
 */
class Contributor extends Model {
    static config = {
        /**
         * @member {String} className='DevRank.model.Contributor'
         * @protected
         */
        className: 'DevRank.model.Contributor',
        /**
         * @member {Object[]} fields
         */
        fields: [
            {name: 'login',               mapping: 'l',  type: 'String'},
            {name: 'name',                mapping: 'n',  type: 'String'},
            {
                name        : 'avatar_url',
                mapping     : 'i',
                type        : 'String',
                defaultValue: null,
                convert     : value => value ? `https://avatars.githubusercontent.com/u/${value}?v=4` : null
            },
            {name: 'location',            mapping: 'lc', type: 'String', defaultValue: null},
            {name: 'country_code',        mapping: 'cc', type: 'String', defaultValue: null},
            {name: 'company',             mapping: 'c',  type: 'String', defaultValue: null},
            {name: 'bio',                 mapping: 'b',  type: 'String', defaultValue: null},
            {name: 'followers',           mapping: 'fl', type: 'Integer'},
            {name: 'total_contributions', mapping: 'tc', type: 'Integer'},
            {name: 'first_year',          mapping: 'fy', type: 'Integer'},
            {name: 'last_updated',        mapping: 'lu', type: 'Date'},
            {name: 'linkedin_url',        mapping: 'li', type: 'String', defaultValue: null},
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
            {name: 'commits_array', mapping: 'cy', type: 'Array'},
            {
                name   : 'total_commits',
                type   : 'Integer',
                calculate: data => {
                    return data.commits_array?.reduce((a, b) => a + b, 0) || 0;
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
                    // value is the raw 'y' array. record contains raw 'fy' or mapped 'first_year'.
                    if (!value || !Array.isArray(value)) return 0;

                    const firstYear = record.fy || record.first_year;
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

                    const firstYear = record.fy || record.first_year;
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
