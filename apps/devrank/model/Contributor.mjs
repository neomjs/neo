import Model from '../../../src/data/Model.mjs';

class Contributor extends Model {
    static config = {
        className: 'DevRank.model.Contributor',
        fields   : [
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
            {name: 'years',               type: 'Object'} // Map of year -> count
        ]
    }
}

export default Neo.setupClass(Contributor);