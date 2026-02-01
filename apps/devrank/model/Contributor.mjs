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
            {name: 'years',               type: 'Object'}, // Map of year -> count
            
            // Year mappings
            {name: 'y2025', mapping: 'years.2025', type: 'Integer'},
            {name: 'y2024', mapping: 'years.2024', type: 'Integer'},
            {name: 'y2023', mapping: 'years.2023', type: 'Integer'},
            {name: 'y2022', mapping: 'years.2022', type: 'Integer'},
            {name: 'y2021', mapping: 'years.2021', type: 'Integer'},
            {name: 'y2020', mapping: 'years.2020', type: 'Integer'},
            {name: 'y2019', mapping: 'years.2019', type: 'Integer'},
            {name: 'y2018', mapping: 'years.2018', type: 'Integer'},
            {name: 'y2017', mapping: 'years.2017', type: 'Integer'},
            {name: 'y2016', mapping: 'years.2016', type: 'Integer'},
            {name: 'y2015', mapping: 'years.2015', type: 'Integer'},
            {name: 'y2014', mapping: 'years.2014', type: 'Integer'},
            {name: 'y2013', mapping: 'years.2013', type: 'Integer'},
            {name: 'y2012', mapping: 'years.2012', type: 'Integer'},
            {name: 'y2011', mapping: 'years.2011', type: 'Integer'},
            {name: 'y2010', mapping: 'years.2010', type: 'Integer'}
        ]
    }
}

export default Neo.setupClass(Contributor);
