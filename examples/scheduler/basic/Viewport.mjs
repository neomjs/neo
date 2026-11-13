import Button    from '../../../src/button/Base.mjs';
import Viewport  from '../../../src/container/Viewport.mjs';
import Label     from '../../../src/component/Label.mjs';
import Scheduler from '../../../src/scheduler/Container.mjs';
import Toolbar   from '../../../src/toolbar/Base.mjs';

const rooms = [
    {id: 'r-1', name: 'Recording studio'},
    {id: 'r-2', name: 'Mixing suite'},
    {id: 'r-3', name: 'Rehearsal room'},
    {id: 'r-4', name: 'Listening room'},
    {id: 'r-5', name: 'Vocal booth'},
    {id: 'r-6', name: 'Mastering room'},
    {id: 'r-7', name: 'Live room'}
];

const bookings = [
    ['ev-1', 'r-1', 'Quartet recording', '00:00', '04:00'],
    ['ev-2', 'r-1', 'Piano overdubs',    '01:00', '04:00'],
    ['ev-3', 'r-2', 'Score mix',         '05:00', '08:00'],
    ['ev-4', 'r-3', 'String rehearsal',  '02:00', '05:00'],
    ['ev-5', 'r-4', 'Album playback',    '04:00', '07:00'],
    ['ev-6', 'r-1', 'Voice session',     '08:00', '11:00'],
    ['ev-7', 'r-2', 'Orchestral mix',    '10:00', '14:00'],
    ['ev-8', 'r-3', 'Brass rehearsal',   '08:00', '12:00'],
    ['ev-9', 'r-4', 'Reference review',   '11:00', '14:00'],
    ['ev-10','r-5', 'Narration session',  '03:00', '07:00'],
    ['ev-11','r-5', 'Vocal tracking',     '09:00', '13:00'],
    ['ev-12','r-6', 'Album mastering',    '05:00', '11:00'],
    ['ev-13','r-7', 'Band recording',     '02:00', '08:00'],
    ['ev-14','r-7', 'Drum session',      '10:00', '15:00'],
    ['ev-15','r-1', 'Jazz session',      '16:00', '20:00'],
    ['ev-16','r-2', 'Film mix',          '18:00', '22:00'],
    ['ev-17','r-4', 'Client review',     '15:00', '18:00'],
    ['ev-18','r-5', 'Podcast edit',      '19:00', '23:00'],
    ['ev-19','r-7', 'Live tracking',     '08:00', '13:00', '2026-11-10'],
    ['ev-20','r-3', 'Ensemble rehearsal','10:00', '15:00', '2026-11-10']
].map(([id, resourceId, title, start, end, day='2026-11-09']) => ({
    id, resourceId, title, startDate: day + 'T' + start + ':00Z', endDate: day + 'T' + end + ':00Z'
}));

const storageKey = 'neo-examples-scheduler-studio-bookings-v1';

/**
 * @summary Displays studio bookings on a shared resource timeline and restores edits on reload.
 * @class Neo.examples.scheduler.basic.Viewport
 * @extends Neo.container.Viewport
 */
class StudioViewport extends Viewport {
    static config = {
        className: 'Neo.examples.scheduler.basic.Viewport',
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            module: Toolbar,
            cls   : ['studio-toolbar'],
            flex  : 'none',
            items : [
                {module: Label, cls: ['studio-title'], text: 'Studio bookings'},
                {module: Label, cls: ['studio-date'], text: 'Monday, 9 November · UTC'},
                '->',
                {module: Label, cls: ['studio-save-status'], reference: 'save-status', text: ''},
                {module: Button, cls: ['studio-zoom', 'studio-zoom-first'], reference: 'zoom-hour', text: 'Hour', pressed: false, handler: 'up.onHour'},
                {module: Button, cls: ['studio-zoom', 'studio-zoom-last'], reference: 'zoom-day', text: 'Day', pressed: true, handler: 'up.onDay'}
            ]
        }, {
            module             : Scheduler,
            reference          : 'scheduler',
            flex               : 1,
            rowHeight          : 64,
            resourceColumns    : [{dataField: 'name', text: 'Studio', width: 175, locked: 'start'}],
            store              : {model: {fields: [{name: 'id'}, {name: 'name'}]}, data: rooms},
            eventStore         : {},
            eventDragZoneConfig: {useProxy: true, moveInMainThread: false},
            barRenderer        : (bar, {vdom}) => {
                vdom.cls.push(`studio-booking-${(Number(String(bar.resourceId).split('-').pop()) - 1) % 3}`);
                return vdom
            },
            timeAxis       : {
                start   : '2026-11-09', end: '2026-11-11', timeZone: 'UTC',
                tickUnit: 'hour', tickStep: 2, pxPerMinute: 0.5, snapMinutes: 30
            },
            listeners: {eventChange: 'up.onBookingChange'}
        }]
    }

    #saved = new Map()
    #write = Promise.resolve()

    /** @summary Loads this browser's edits before exposing bookings for interaction. */
    onConstructed() {
        super.onConstructed();
        this.loadBookings()
    }

    /** @summary Rebuilds the store from the sample records and previously saved edits. */
    async loadBookings() {
        try {
            const {value} = await Neo.main.addon.LocalStorage.readLocalStorageItem({key: storageKey, windowId: this.windowId});
            if (value) {
                const rows = JSON.parse(value);
                if (Array.isArray(rows)) {
                    for (const row of rows) {
                        if (row && rooms.some(room => room.id === row.resourceId) &&
                            bookings.some(seed => seed.id === row.id) && Date.parse(row.endDate) >= Date.parse(row.startDate)) {
                            this.#saved.set(row.id, row)
                        }
                    }
                }
            }
        } catch {
            if (!this.isDestroyed) this.getReference('save-status').text = 'Browser storage unavailable'
        }
        if (!this.isDestroyed) {
            this.getReference('scheduler').eventStore.data = bookings.map(seed => ({...seed, ...this.#saved.get(seed.id)}))
        }
    }

    /** @summary Saves committed bookings in edit order so a subsequent reload restores the latest change. */
    onBookingChange({record}) {
        const {id, resourceId, title, startDate, endDate, description, percentDone} = record;
        this.#saved.set(id, {id, resourceId, title, startDate, endDate, description, percentDone});
        const value = JSON.stringify([...this.#saved.values()]), windowId = this.windowId;
        this.getReference('save-status').text = 'Saving…';
        const write = this.#write.then(() => Neo.main.addon.LocalStorage.updateLocalStorageItem({key: storageKey, value, windowId}));
        this.#write = write.catch(() => {});
        const latest = this.#write, status = text => {
            if (!this.isDestroyed && this.#write === latest) this.getReference('save-status').text = text
        };
        write.then(() => status('Saved on this device'), () => status('Changes could not be saved'))
    }

    /** @summary Shows a tighter time scale for individual bookings. */
    onHour() {
        this.getReference('scheduler').zoomTo('hour');
        this.getReference('zoom-hour').pressed = true;
        this.getReference('zoom-day').pressed = false
    }

    /** @summary Shows more of the day's bookings. */
    onDay() {
        this.getReference('scheduler').zoomTo('day');
        this.getReference('zoom-hour').pressed = false;
        this.getReference('zoom-day').pressed = true
    }
}

export default Neo.setupClass(StudioViewport);
