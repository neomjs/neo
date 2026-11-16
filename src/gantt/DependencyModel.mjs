import Model from '../data/Model.mjs';

/**
 * @summary Directed task-dependency edge model (`Neo.gantt.DependencyModel`) for `Neo.gantt.Container`.
 * @description Represents a precedence link between two tasks (`fromId` → `toId`) with dependency `type`
 * (`'FS'` Finish-to-Start, `'SS'` Start-to-Start, `'FF'` Finish-to-Finish, `'SF'` Start-to-Finish) and optional
 * `lag` (`lagUnit`: `'minute' | 'hour' | 'day'`).
 * @class Neo.gantt.DependencyModel
 * @extends Neo.data.Model
 * @see Neo.gantt.DependencyStore
 * @see Neo.gantt.DependencyLayer
 */
class DependencyModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.gantt.DependencyModel'
         * @protected
         */
        className: 'Neo.gantt.DependencyModel',
        /**
         * @member {String} ntype='gantt-dependency-model'
         * @protected
         */
        ntype: 'gantt-dependency-model',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'id'
        }, {
            name: 'fromId',
            type: 'String'
        }, {
            name: 'toId',
            type: 'String'
        }, {
            name        : 'type',
            type        : 'String',
            defaultValue: 'FS'
        }, {
            name        : 'lag',
            type        : 'Number',
            defaultValue: 0
        }, {
            name        : 'lagUnit',
            type        : 'String',
            defaultValue: 'minute'
        }]
    }
}

export default Neo.setupClass(DependencyModel);
