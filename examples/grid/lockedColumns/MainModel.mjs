import Model from '../../../src/data/Model.mjs';

/**
 * @class Neo.examples.grid.lockedColumns.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        className: 'Neo.examples.grid.lockedColumns.MainModel',

        fields: [
            {name: 'id',                        type: 'Integer'},
            {name: 'rank',                      type: 'Integer'},
            {name: 'login',                     type: 'String'},
            {name: 'totalContributions',        type: 'Integer'},
            {name: 'commitRatio',               type: 'Number'},
            {name: 'privateContributionsRatio', type: 'Number'},
            // overflow-tail fields that widen the centre region past its viewport (scroll coverage)
            ...Array.from({length: 14}, (_, i) => ({name: `y${2024 - i}`, type: 'Integer'})),
            {name: 'lastUpdated',               type: 'String'}
        ]
    }
}

export default Neo.setupClass(MainModel);
