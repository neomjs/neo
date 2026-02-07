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
            {name: 'login',               type: 'String'},
            {name: 'name',                type: 'String'},
            {name: 'avatar_url',          type: 'String'},
            {name: 'location',            type: 'String'},
            {name: 'company',             type: 'String'},
            {name: 'bio',                 type: 'String'},
            {name: 'followers',           type: 'Integer'},
            {name: 'total_contributions', type: 'Integer'},
            {name: 'first_year',          type: 'Integer'},
            {name: 'last_updated',        type: 'Date'},
            {name: 'linkedin_url',        type: 'String'},
            {name: 'organizations',       type: 'Array'},
            {name: 'years',               type: 'Object'} // Map of year -> count
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
