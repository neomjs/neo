import Model from '../../../src/data/Model.mjs';

/**
 * @summary Record schema for the open-source maintainer sponsorship and activity sheet, supplying one typed field for
 * each of the fourteen non-tree built-in grid column types.
 * @class Neo.examples.grid.cellTypes.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.cellTypes.MainModel'
         * @protected
         */
        className: 'Neo.examples.grid.cellTypes.MainModel',
        /**
         * @member {Object[]} fields
         */
        fields: [
            {name: 'id',            type: 'String'},
            {name: 'login',         type: 'String'},
            {name: 'name',          type: 'String'},
            {name: 'avatarUrl',     type: 'Integer'},
            {name: 'countryCode',   type: 'String'},
            {name: 'location',      type: 'String'},
            {name: 'ecosystem',     type: 'String'},
            {name: 'annualGoal',    type: 'Integer'},
            {name: 'pledged',       type: 'Integer'},
            {name: 'lastDelta',     type: 'Integer'},
            {
                name     : 'goalPercent',
                type     : 'Integer',
                calculate: data => data.annualGoal > 0 ? Math.min(100, Math.round((data.pledged / data.annualGoal) * 100)) : 0
            },
            {name: 'recentCommits', type: 'Integer'},
            {name: 'trend',         type: 'Array'},
            {name: 'tierIcon',      type: 'String'},
            {name: 'topRepoUrl',    type: 'String'},
            {name: 'topRepoStars',  type: 'String'},
            {name: 'linkedin',      type: 'String'},
            {name: 'organizations', type: 'Array'},
            {name: 'actionLabel',   type: 'String'}
        ]
    }
}

export default Neo.setupClass(MainModel);
