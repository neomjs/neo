import GlassGrid from './GlassGrid.mjs';
import Store     from '../../../../src/data/Store.mjs';

/**
 * @summary The Reports app: this week's usage per team, with the shares as progress columns.
 * @class WebDesktop.view.apps.Reports
 * @extends WebDesktop.view.apps.GlassGrid
 */
class Reports extends GlassGrid {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.apps.Reports'
         * @protected
         */
        className: 'WebDesktop.view.apps.Reports',
        /**
         * @member {String[]} cls=['webdesktop-reports']
         */
        cls: ['webdesktop-reports'],
        /**
         * @member {Object[]} columns
         */
        columns: [
            {dataField: 'team',     text: 'Team',            flex : 1},
            {dataField: 'sessions', text: 'Sessions',        width: 96, renderer: ({value}) => value.toLocaleString('en-US')},
            {dataField: 'adoption', text: 'Apps in use',     width: 150, type: 'progress'},
            {dataField: 'tasks',    text: 'Tasks done',      width: 150, type: 'progress'},
            {dataField: 'support',  text: 'Questions',       width: 96}
        ],
        /**
         * This week's figures, invented for the demo; `adoption` and `tasks` are percentages
         * @member {Object} store
         */
        store: {
            module: Store,
            model : {
                fields: [
                    {name: 'adoption', type: 'Integer'},
                    {name: 'id',       type: 'Integer'},
                    {name: 'sessions', type: 'Integer'},
                    {name: 'support',  type: 'Integer'},
                    {name: 'tasks',    type: 'Integer'},
                    {name: 'team',     type: 'String'}
                ]
            },
            data: [
                {id: 1, team: 'Platform', sessions: 312, adoption: 92, tasks: 81, support: 3},
                {id: 2, team: 'Runtime',  sessions: 241, adoption: 85, tasks: 74, support: 2},
                {id: 3, team: 'Design',   sessions: 198, adoption: 97, tasks: 88, support: 1},
                {id: 4, team: 'Data',     sessions: 176, adoption: 71, tasks: 63, support: 5},
                {id: 5, team: 'Security', sessions: 129, adoption: 64, tasks: 90, support: 2},
                {id: 6, team: 'Support',  sessions: 148, adoption: 78, tasks: 69, support: 5}
            ]
        }
    }
}

export default Neo.setupClass(Reports);
