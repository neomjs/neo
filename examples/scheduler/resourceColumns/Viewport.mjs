import Component     from '../../../src/component/Base.mjs';
import EventModel    from '../../../src/timeline/model/Event.mjs';
import EventStore    from '../../../src/timeline/store/Events.mjs';
import Label         from '../../../src/component/Label.mjs';
import Model         from '../../../src/data/Model.mjs';
import Scheduler     from '../../../src/scheduler/Container.mjs';
import Store         from '../../../src/data/Store.mjs';
import ThemeSwitcher from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar       from '../../../src/toolbar/Base.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

const
    OPEN_AT   = 8 * 60, // Monday 08:00 in minutes from the axis start, past the empty night
    WEEK_DAYS = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'],
    // A day's plan letter: D a full day, A the morning, P the afternoon, B both halves as two jobs, - free
    SLOTS     = {A: [['08:00', '12:00']], B: [['08:00', '12:00'], ['12:30', '16:30']], D: [['08:00', '16:00']], P: [['12:30', '16:30']]},
    SKILLS    = {
        'Heat pumps': {barCls: 'neo-scheduler-bar-emerald', jobs: ['Install', 'Service', 'Check']},
        Electrical  : {barCls: 'neo-scheduler-bar-amber',   jobs: ['Charger', 'Panel', 'Inspect']},
        Plumbing    : {barCls: 'neo-scheduler-bar-violet',  jobs: ['Boiler', 'Leak', 'Drains']},
        Fiber       : {barCls: null,                        jobs: ['Hook-up', 'Splice', 'Cabinet']}
    };

// [name, skill, region, the week Monday to Friday]
const TEAM = [
    ['Amira Haddad',  'Heat pumps', 'Harbour',   'DDBDA'],
    ['Bruno Costa',   'Electrical', 'Old Town',  'A-P-A'],
    ['Chen Wei',      'Plumbing',   'Riverside', 'BDD-P'],
    ['Dara Nolan',    'Fiber',      'Hillside',  'P-A--'],
    ['Elif Yilmaz',   'Heat pumps', 'Old Town',  'DBDBD'],
    ['Felix Brandt',  'Electrical', 'Harbour',   'DA-PD'],
    ['Gita Rao',      'Plumbing',   'Hillside',  'A-A-A'],
    ['Hugo Martin',   'Fiber',      'Riverside', 'DDDA-'],
    ['Ines Duarte',   'Heat pumps', 'Hillside',  '-P-P-'],
    ['Jonas Weber',   'Electrical', 'Riverside', 'BBDDA'],
    ['Kofi Mensah',   'Plumbing',   'Harbour',   'P-DA-'],
    ['Lena Fischer',  'Fiber',      'Old Town',  'DDB-D'],
    ['Mateo Ruiz',    'Heat pumps', 'Riverside', 'A--P-'],
    ['Nadia Petrova', 'Electrical', 'Hillside',  'DD-DD'],
    ['Omar Farouk',   'Plumbing',   'Old Town',  'ABAPA'],
    ['Priya Nair',    'Fiber',      'Harbour',   '-A-D-'],
    ['Quinn Walsh',   'Heat pumps', 'Harbour',   'PDP-A'],
    ['Rosa Lindgren', 'Electrical', 'Riverside', '--A--'],
    ['Samir Kaya',    'Plumbing',   'Old Town',  'DBDBB'],
    ['Tara Byrne',    'Fiber',      'Hillside',  'A-PDA'],
    ['Umar Siddiqui', 'Heat pumps', 'Old Town',  'D-D-D'],
    ['Vera Novak',    'Electrical', 'Harbour',   'PA-AP'],
    ['Wim de Vries',  'Plumbing',   'Hillside',  'DDDD-'],
    ['Yara Salem',    'Fiber',      'Riverside', 'BD-A-']
];

const JOBS = TEAM.flatMap(([, skill, , week], techIndex) => [...week].flatMap((letter, day) =>
    (SLOTS[letter] || []).map(([from, to], part) => ({
        id        : `job-${techIndex + 1}-${day + 1}-${part + 1}`,
        endDate   : `${WEEK_DAYS[day]}T${to}:00Z`,
        resourceId: `tech-${techIndex + 1}`,
        skill,
        startDate : `${WEEK_DAYS[day]}T${from}:00Z`,
        title     : SKILLS[skill].jobs[(techIndex + day + part) % 3]
    }))
));

// Booked hours come from the jobs themselves, so the column cannot disagree with the bars
const HOURS = JOBS.reduce((hours, job) => {
    hours[job.resourceId] = (hours[job.resourceId] || 0) + (Date.parse(job.endDate) - Date.parse(job.startDate)) / 3.6e6;
    return hours
}, {});

/**
 * @summary A field technician with the skill, region and hours a dispatcher reads before taking a call.
 * @class Neo.examples.scheduler.resourceColumns.TechnicianModel
 * @extends Neo.data.Model
 */
class TechnicianModel extends Model {
    static config = {
        className: 'Neo.examples.scheduler.resourceColumns.TechnicianModel',
        fields   : [
            {name: 'id',     type: 'String'},
            {name: 'hours',  type: 'Number'},
            {name: 'name',   type: 'String'},
            {name: 'region', type: 'String'},
            {name: 'skill',  type: 'String'}
        ]
    }
}
TechnicianModel = Neo.setupClass(TechnicianModel);

/**
 * @summary A booked job, extending `Neo.timeline.model.Event` with the skill that colours its bar.
 * @class Neo.examples.scheduler.resourceColumns.JobModel
 * @extends Neo.timeline.model.Event
 */
class JobModel extends EventModel {
    static config = {
        className: 'Neo.examples.scheduler.resourceColumns.JobModel',
        fields   : [
            {name: 'skill', type: 'String'}
        ]
    }
}
JobModel = Neo.setupClass(JobModel);

/**
 * @summary A field-service week: four locked resource columns (name, skill, region, booked hours), each sortable,
 * beside the team's jobs.
 * @description Below 720px only the name column stays locked; the other three scroll with the timeline, through the
 * grid's `responsiveLockPolicy`.
 * @class Neo.examples.scheduler.resourceColumns.Viewport
 * @extends Neo.container.Viewport
 */
class FieldServiceViewport extends Viewport {
    static config = {
        className: 'Neo.examples.scheduler.resourceColumns.Viewport',
        cls      : ['fs-viewport'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            module: Toolbar,
            cls   : ['fs-toolbar'],
            flex  : 'none',
            items : [{
                module: Label,
                cls   : ['fs-title'],
                text  : 'Field service · week of 23 Nov'
            }, {
                module: Component,
                cls   : ['fs-legend'],
                vdom  : {
                    tag: 'div',
                    cn : Object.keys(SKILLS).map(skill => ({
                        tag : 'span',
                        cls : ['fs-legend-item', `fs-legend-${skill.toLowerCase().replace(/\s+/g, '-')}`],
                        text: skill
                    }))
                }
            }, '->', {
                module: Component,
                cls   : ['fs-hint'],
                vdom  : {
                    tag: 'div',
                    cn : [
                        {tag: 'span', cls: ['fs-hint-wide'],   text: 'Sort by Booked to see who has room'},
                        {tag: 'span', cls: ['fs-hint-narrow'], text: 'Swipe right for skill, region and booked hours'}
                    ]
                }
            }, {
                module: ThemeSwitcher
            }]
        }, {
            module      : Scheduler,
            barDraggable: false,
            barRenderer : (barDescriptor, {vdom}) => {
                const cls = SKILLS[barDescriptor.bar.skill]?.barCls;

                cls && vdom.cls.push(cls);
                return vdom
            },
            editable  : false,
            eventStore: {
                module: EventStore,
                model : JobModel,
                data  : JOBS
            },
            flex           : 1,
            majorTickStep  : 1,
            majorTickUnit  : 'day',
            reference      : 'scheduler',
            resizableBars  : false,
            resourceColumns: [
                {dataField: 'name',   text: 'Technician', width: 150, locked: 'start'},
                {dataField: 'skill',  text: 'Skill',      width: 110, locked: 'start'},
                {dataField: 'region', text: 'Region',     width: 100, locked: 'start'},
                {dataField: 'hours',  text: 'Booked',     width: 92,  locked: 'start', cellAlign: 'right', renderer: ({value}) => `${value} h`}
            ],
            responsiveLockPolicy: {
                breakpoints: [
                    {maxWidth: 720,    columns: {hours: null,    region: null,    skill: null}},
                    {maxWidth: 100000, columns: {hours: 'start', region: 'start', skill: 'start'}}
                ]
            },
            rowHeight: 44,
            store    : {
                module : Store,
                model  : TechnicianModel,
                sorters: [{property: 'name', direction: 'ASC'}],
                data   : TEAM.map(([name, skill, region], index) => ({
                    id   : `tech-${index + 1}`,
                    hours: HOURS[`tech-${index + 1}`] || 0,
                    name,
                    region,
                    skill
                }))
            },
            timeAxis: {
                end        : '2026-11-28',
                now        : '2026-10-01T00:00:00Z',
                pxPerMinute: 0.3,
                start      : WEEK_DAYS[0],
                tickStep   : 4,
                tickUnit   : 'hour',
                timeZone   : 'UTC'
            }
        }]
    }

    /**
     * True once the plan has opened at Monday 08:00 after the body's first measurement.
     * @member {Boolean} #opened=false
     */
    #opened = false

    /**
     * @summary Opens the plan at Monday 08:00 whenever the column layout changes, including the narrow breakpoint.
     */
    onConstructed() {
        super.onConstructed();

        const scheduler = this.getReference('scheduler');

        if (scheduler) {
            const {body} = scheduler;

            // Once the body is measured, then on every new column layout: availableWidth follows the new positions
            this.observeConfig(body, 'containerWidth', width => {
                if (width > 0 && !this.#opened) {
                    this.#opened = true;
                    this.openAtWorkday()
                }
            });
            this.observeConfig(body, 'availableWidth', () => this.#opened && this.openAtWorkday())
        }
    }

    /**
     * @summary Scrolls the plan to Monday 08:00 through the grid's horizontal scrollbar. Below 720px the unlocked
     * columns sit before the plan, so the visitor first sees names beside jobs and swipes right for the table.
     * @returns {Promise<void>}
     */
    async openAtWorkday() {
        const
            scheduler = this.getReference('scheduler'),
            position  = scheduler?.body.columnPositions.get(scheduler.timelineColumn?.dataField);

        if (!position) {
            return
        }

        // The scrollbar sizes its spacer in its own update; a scroll sent before that lands is clamped to 0
        await scheduler.horizontalScrollbar.promiseUpdate();

        Neo.main.DomAccess.scrollTo({
            direction: 'left',
            id       : scheduler.horizontalScrollbar.id,
            value    : position.x + OPEN_AT * scheduler.timeAxis.pxPerMinute,
            windowId : scheduler.windowId
        })
    }
}

export default Neo.setupClass(FieldServiceViewport);
