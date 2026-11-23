import Button         from '../../../src/button/Base.mjs';
import GridContainer  from '../../../src/grid/Container.mjs';
import Label          from '../../../src/component/Label.mjs';
import TimeAxis       from '../../../src/timeline/TimeAxis.mjs';
import TimelineColumn from '../../../src/timeline/Column.mjs';
import EventStore     from '../../../src/timeline/store/Events.mjs';
import ThemeSwitcher  from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar        from '../../../src/toolbar/Base.mjs';
import Viewport       from '../../../src/container/Viewport.mjs';

const resources = [
    {id: 'r-1', name: 'Design Team'},
    {id: 'r-2', name: 'Core Engine'},
    {id: 'r-3', name: 'UI Components'},
    {id: 'r-4', name: 'Documentation'},
    {id: 'r-5', name: 'QA & Testing'},
    {id: 'r-6', name: 'DevOps & CI'},
    {id: 'r-7', name: 'Community'}
];

// The bookings and the axis use the same current UTC day.
const day = new Date().toISOString().slice(0, 10);


const events = [
    {id: 'ev-1',  resourceId: 'r-1', title: 'Sprint Planning',   startDate: `${day}T08:00:00Z`, endDate: `${day}T11:00:00Z`},
    {id: 'ev-2',  resourceId: 'r-1', title: 'Design Review',     startDate: `${day}T13:00:00Z`, endDate: `${day}T16:00:00Z`},
    {id: 'ev-3',  resourceId: 'r-2', title: 'Architecture Sync', startDate: `${day}T09:00:00Z`, endDate: `${day}T12:00:00Z`},
    {id: 'ev-4',  resourceId: 'r-2', title: 'VDOM Optimization', startDate: `${day}T14:00:00Z`, endDate: `${day}T18:00:00Z`},
    {id: 'ev-5',  resourceId: 'r-3', title: 'Timeline Testing',  startDate: `${day}T10:00:00Z`, endDate: `${day}T13:00:00Z`},
    {id: 'ev-6',  resourceId: 'r-3', title: 'Component Review',  startDate: `${day}T15:00:00Z`, endDate: `${day}T17:30:00Z`},
    {id: 'ev-7',  resourceId: 'r-4', title: 'Guide Writing',     startDate: `${day}T08:30:00Z`, endDate: `${day}T12:00:00Z`},
    {id: 'ev-8',  resourceId: 'r-4', title: 'API Reference',     startDate: `${day}T13:30:00Z`, endDate: `${day}T16:30:00Z`},
    {id: 'ev-9',  resourceId: 'r-5', title: 'Integration Tests', startDate: `${day}T09:00:00Z`, endDate: `${day}T14:00:00Z`},
    {id: 'ev-10', resourceId: 'r-6', title: 'Build Ratchet',     startDate: `${day}T11:00:00Z`, endDate: `${day}T15:00:00Z`},
    {id: 'ev-11', resourceId: 'r-7', title: 'Issue Triage',      startDate: `${day}T10:00:00Z`, endDate: `${day}T13:00:00Z`},
    {id: 'ev-12', resourceId: 'r-7', title: 'Release Notes',     startDate: `${day}T15:00:00Z`, endDate: `${day}T18:00:00Z`}
];

/**
 * @summary Demonstrates a plain grid container mounting Neo.timeline.Column.
 * @class Neo.examples.timeline.basic.Viewport
 * @extends Neo.container.Viewport
 */
class TimelineViewport extends Viewport {
    static config = {
        className: 'Neo.examples.timeline.basic.Viewport',
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            module: Toolbar,
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [
                {module: Label, text: 'Resource Timeline'},
                '->',
                {
                    module : Button,
                    text   : 'Shift Selected Interval (+1h)',
                    handler: 'up.onShiftInterval'
                },
                {module: ThemeSwitcher}
            ]
        }, {
            module: Label,
            cls   : ['neo-timeline-example-caption'],
            flex  : 'none',
            text  : 'A time axis is a column. The rest is a grid.'
        }, {
            module   : GridContainer,
            reference: 'grid',
            flex     : 1,
            rowHeight: 48,
            store    : {
                model: {fields: [{name: 'id'}, {name: 'name'}]},
                data : resources
            },
            columns: [
                {
                    dataField: 'name',
                    text     : 'Resource',
                    width    : 156,
                    locked   : 'start'
                },
                {
                    module   : TimelineColumn,
                    ntype    : 'timeline-header',
                    dataField: 'timeline',
                    text     : 'Schedule',
                    timeAxis : {
                        module     : TimeAxis,
                        start      : events[0].startDate,
                        end        : `${day}T20:00:00Z`,
                        timeZone   : 'UTC',
                        tickUnit   : 'hour',
                        tickStep   : 2,
                        pxPerMinute: 1,
                        snapMinutes: 30
                    },
                    eventStore: {
                        module: EventStore,
                        data  : events
                    }
                }
            ]
        }]
    }

    /** @summary Moves one interval an hour later through its record. */
    onShiftInterval() {
        const grid        = this.getItem('grid'),
              column      = grid.columns.get('timeline'),
              eventStore  = column?.eventStore,
              selection   = grid.view.selectionModel?.getRowRecord(grid.view.selectionModel.selectedRows[0])?.id,
              selectedRow = selection || 'r-1',
              event       = eventStore?.items.find(r => r.resourceId === selectedRow) || eventStore?.items[0];

        if (event) {
            const start = new Date(event.startDate),
                end     = new Date(event.endDate);

            start.setUTCHours(start.getUTCHours() + 1);
            end.setUTCHours(end.getUTCHours() + 1);

            event.set({
                startDate: start.toISOString(),
                endDate  : end.toISOString()
            })
        }
    }
}

export default Neo.setupClass(TimelineViewport);
