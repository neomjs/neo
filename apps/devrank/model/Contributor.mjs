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
                name   : 'avatar_url',
                mapping: 'i',
                type   : 'String',
                convert: value => value ? `https://avatars.githubusercontent.com/u/${value}?v=4` : null
            },
            {name: 'location',            mapping: 'lc', type: 'String'},
            {name: 'country_code',        mapping: 'cc', type: 'String'},
            {name: 'company',             mapping: 'c',  type: 'String'},
            {name: 'bio',                 mapping: 'b',  type: 'String'},
            {name: 'followers',           mapping: 'fl', type: 'Integer'},
            {name: 'total_contributions', mapping: 'tc', type: 'Integer'},
            {name: 'first_year',          mapping: 'fy', type: 'Integer'},
            {name: 'last_updated',        mapping: 'lu', type: 'Date'},
            {name: 'linkedin_url',        mapping: 'li', type: 'String'},
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
            {
                name   : 'years',
                mapping: 'y',
                type   : 'Object',
                convert: (value, record) => {
                    // Reconstruct year map from array
                    // record is the raw data object here during read? No, in Neo it depends.
                    // If convert is called, 'value' is data['y']. We need 'first_year' (data['fy']).
                    
                    // Note: In Neo.data.Model, `convert` signature might vary, but typically has access to record/data.
                    // Assuming we can access sibling data. If not, we might need a safer check.
                    
                    // Accessing raw data property 'fy' directly since 'first_year' might not be processed yet.
                    let startYear = record.fy || record.first_year; 
                    
                    if (!value || !startYear) return {};
                    
                    const map = {};
                    value.forEach((count, index) => {
                        map[startYear + index] = count
                    });
                    return map
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
            fields      = [...me.fields]; // Create a copy of the current fields

        for (let i = currentYear; i >= 2010; i--) {
            fields.push({name: `y${i}`, mapping: `years.${i}`, type: 'Integer'})
        }

        me.fields = fields
    }
}

export default Neo.setupClass(Contributor);
