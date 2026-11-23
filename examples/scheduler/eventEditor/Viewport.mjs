import AppointmentEditor from './AppointmentEditor.mjs';
import Component         from '../../../src/component/Base.mjs';
import EventStore        from '../../../src/timeline/store/Events.mjs';
import Label             from '../../../src/component/Label.mjs';
import RoomModel         from './RoomModel.mjs';
import Scheduler         from '../../../src/scheduler/Container.mjs';
import Store             from '../../../src/data/Store.mjs';
import ThemeSwitcher     from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar           from '../../../src/toolbar/Base.mjs';
import Viewport          from '../../../src/container/Viewport.mjs';

const
    DAY  = '2026-11-24',
    TIME = new Intl.DateTimeFormat('en-GB', {hour: '2-digit', minute: '2-digit', timeZone: 'UTC'}),
    // [id, name, bar colour]
    ROOMS = [
        ['room-1', 'Hygiene 1',    'neo-scheduler-bar-emerald'],
        ['room-2', 'Hygiene 2',    'neo-scheduler-bar-emerald'],
        ['room-3', 'Restorative',  'neo-scheduler-bar-amber'],
        ['room-4', 'Orthodontics', 'neo-scheduler-bar-violet'],
        ['room-5', 'Surgery',      null]
    ],
    BAR_CLS = Object.fromEntries(ROOMS.map(([id, , cls]) => [id, cls]));

// [room, treatment, start, end]: six appointments already sit at the 30-minute minimum
const APPOINTMENTS = [
    ['room-1', 'Exam',                 '08:00', '08:30'],
    ['room-1', 'Cleaning',             '08:45', '09:30'],
    ['room-1', 'Deep cleaning',        '10:00', '11:30'],
    ['room-1', 'Exam',                 '13:00', '13:30'],
    ['room-1', 'Cleaning',             '14:00', '14:45'],
    ['room-2', 'Cleaning',             '08:15', '09:00'],
    ['room-2', 'Exam',                 '09:15', '09:45'],
    ['room-2', 'Fluoride',             '10:00', '10:30'],
    ['room-2', 'Cleaning',             '11:00', '11:45'],
    ['room-2', 'Deep cleaning',        '14:30', '16:00'],
    ['room-3', 'Filling',              '08:00', '09:00'],
    ['room-3', 'Filling',              '09:15', '10:00'],
    ['room-3', 'Crown preparation',    '10:30', '12:00'],
    ['room-3', 'Inlay fitting',        '13:30', '14:30'],
    ['room-3', 'Filling',              '15:00', '15:45'],
    ['room-4', 'Brace fitting',        '08:30', '10:00'],
    ['room-4', 'Review',               '10:15', '10:45'],
    ['room-4', 'Brace adjustment',     '11:00', '12:00'],
    ['room-4', 'Retainer fitting',     '14:00', '15:00'],
    ['room-4', 'Review',               '15:00', '15:30'],
    ['room-5', 'Extraction',           '08:00', '09:00'],
    ['room-5', 'Root canal',           '09:30', '11:30'],
    ['room-5', 'Implant consult',      '13:00', '14:00'],
    ['room-5', 'Wisdom tooth removal', '14:00', '15:30'],
    ['room-5', 'Extraction',           '16:00', '16:45']
].map(([resourceId, title, start, end], index) => ({
    id       : `appt-${index + 1}`,
    endDate  : `${DAY}T${end}:00Z`,
    resourceId,
    startDate: `${DAY}T${start}:00Z`,
    title
}));

/**
 * @summary A dental practice's day in five treatment rooms. An appointment opens in its editor on a double-click, or
 * on Enter once it has focus. Appointments last at least 30 minutes, and the editor refuses a shorter one.
 * @class Neo.examples.scheduler.eventEditor.Viewport
 * @extends Neo.container.Viewport
 */
class PracticeViewport extends Viewport {
    static config = {
        className: 'Neo.examples.scheduler.eventEditor.Viewport',
        cls      : ['dp-viewport'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            module: Toolbar,
            cls   : ['dp-toolbar'],
            flex  : 'none',
            items : [{
                module: Label,
                cls   : ['dp-title'],
                text  : 'Dental practice · Tuesday, 24 November'
            }, {
                module: Component,
                cls   : ['dp-hint'],
                vdom  : {
                    tag: 'div',
                    cn : [
                        {tag: 'span', cls: ['dp-hint-wide'],   text: 'Double-click an appointment, or Tab to it and press Enter.'},
                        {tag: 'span', cls: ['dp-hint-narrow'], text: 'Double-click an appointment to edit it.'},
                        {tag: 'span', cls: ['dp-hint-narrow'], text: 'Scroll sideways for the rest of the day.'},
                        {tag: 'span', cls: ['dp-minimum'],     text: 'Appointments last at least 30 minutes.'}
                    ]
                }
            }, '->', {
                module   : Label,
                cls      : ['dp-status'],
                reference: 'status',
                text     : ''
            }, {
                module: ThemeSwitcher
            }]
        }, {
            module      : Scheduler,
            barDraggable: false,
            barRenderer : (barDescriptor, {vdom}) => {
                const cls = BAR_CLS[barDescriptor.bar.resourceId];

                cls && vdom.cls.push(cls);
                return vdom
            },
            editorConfig: {
                module: AppointmentEditor,
                title : 'Edit appointment'
            },
            eventStore: {
                module: EventStore,
                data  : APPOINTMENTS
            },
            flex           : 1,
            listeners      : {eventChange: 'up.onAppointmentChange'},
            minimumDuration: 30,
            reference      : 'scheduler',
            resizableBars  : false,
            resourceColumns: [{dataField: 'name', text: 'Room', width: 112, locked: 'start'}],
            rowHeight      : 80,
            store          : {
                module: Store,
                model : RoomModel,
                data  : ROOMS.map(([id, name]) => ({id, name}))
            },
            timeAxis: {
                end        : `${DAY}T17:00:00Z`,
                now        : '2026-10-01T00:00:00Z',
                pxPerMinute: 2.45, // 08:00 to 17:00 fills 1440 px beside the rooms
                snapMinutes: 15,
                start      : `${DAY}T08:00:00Z`,
                tickStep   : 1,
                tickUnit   : 'hour',
                timeZone   : 'UTC'
            }
        }]
    }

    /**
     * @summary Opens the Surgery appointment on first mount. Its bar remains visible below the editor.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        const scheduler = this.getReference('scheduler');
        if (value && !scheduler.eventEditor) {
            scheduler.openEventEditor(APPOINTMENTS.find(appointment => appointment.title === 'Root canal').id)
        }
    }

    /**
     * @summary Names the appointment a save or a keyboard move wrote, with its room and its new times.
     * @param {Object} data
     * @param {Neo.data.Model} data.record
     */
    onAppointmentChange({record}) {
        const room = this.getReference('scheduler').store.get(record.resourceId)?.name;

        this.getReference('status').text =
            `Saved: ${record.title}, ${room}, ${TIME.format(record.startDate)}–${TIME.format(record.endDate)}`
    }
}

export default Neo.setupClass(PracticeViewport);
