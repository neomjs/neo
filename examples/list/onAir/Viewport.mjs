import Button        from '../../../src/button/Base.mjs';
import Container     from '../../../src/container/Base.mjs';
import StateProvider from '../../../src/state/Provider.mjs';
import BaseViewport  from '../../../src/container/Viewport.mjs';
import Monitor       from './Monitor.mjs';
import Presenter     from './Presenter.mjs';
import Rundown       from './Rundown.mjs';
import ThemeSwitcher from '../../../src/button/ThemeSwitcher.mjs';

const titlesDuration = 10,
      guestReadyAt   = 90,
      openingTime    = 20 * 3600 - titlesDuration;

/** @summary Formats elapsed show seconds as the studio's 24-hour clock. @param {Number} elapsed @returns {String} */
function studioTime(elapsed) {
    return new Date((openingTime + elapsed) * 1000).toISOString().slice(11, 19)
}

/**
 * @summary A replayable transmission desk. The director can hold the rehearsal clock while planning,
 * play it in real time, or take the next cue at its boundary. All three paths use the same rundown.
 * @class Neo.examples.list.onAir.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        className    : 'Neo.examples.list.onAir.Viewport',
        cls          : ['air-desk'],
        layout       : {ntype: 'base'},
        stateProvider: {module: StateProvider, data: {clock: studioTime(0), cue: '', detail: '', result: ''}},
        items        : [{
            module: Container, cls: ['air-mast'], layout: 'base',
            items : [
                {cls: ['air-station'], text: 'Channel 08   /   Transmission control'},
                {module: Container, cls: ['air-mast-end'], layout: 'base', items: [
                    {module: Container, cls: ['air-clock'], layout: 'base', items: [
                        {tag: 'span', text: 'Studio clock'}, {tag: 'strong', bind: {text: 'clock'}}
                    ]},
                    {module: ThemeSwitcher, showText: false}
                ]}
            ]
        }, {
            cls : ['air-heading'],
            vdom: {cn: [
                {cls: ['air-kicker'], text: 'Director’s desk   /   Evening broadcast'},
                {tag: 'h1', text: 'On Air at Eight'},
                {tag: 'p', cls: ['air-brief'], text: 'Ten seconds of titles left. Your guest line is down. Can you keep the show on air?'}
            ]}
        }, {
            module: Container, cls: ['air-layout'], layout: {ntype: 'base'},
            items : [{
                module: Container, cls: ['air-vision'], layout: {ntype: 'base'},
                items : [
                    {module: Monitor, reference: 'monitor'},
                    {module: Presenter},
                    {module: Container, cls: ['air-monitor-actions'], layout: {ntype: 'base'}, items: [
                        {module: Button, cls: ['air-quiet'], text: 'Open presenter window', iconCls: 'fa-solid fa-up-right-from-square', handler: 'up.openPresenter'}
                    ]}
                ]
            }, {
                module: Container, cls: ['air-rundown'], layout: {ntype: 'base'},
                items : [{
                    cls: ['air-section'], vdom: {cn: [
                        {cls: ['air-kicker'], text: 'Transmission order'},
                        {tag: 'h2', text: 'Rundown'},
                        {tag: 'p', cls: ['air-helper'], text: 'Drag a segment into the first slot to cue it.'}
                    ]}
                }, {
                    module: Rundown, reference: 'rundown'
                }, {
                    module: Container, cls: ['air-transport'], layout: {ntype: 'base'},
                    items : [
                        {module: Button, cls: ['air-secondary'], reference: 'swap', text: 'Cue film first', handler: 'up.swapCues'},
                        {module: Button, cls: ['air-primary'], reference: 'take', text: 'Take next cue', iconCls: 'fa-solid fa-forward-step', handler: 'up.takeNext'},
                        {module: Button, cls: ['air-quiet'], reference: 'play', text: 'Run clock', handler: 'up.toggleClock'},
                        {module: Button, cls: ['air-quiet'], text: 'Replay', handler: 'up.replay'}
                    ]
                }, {
                    cls: ['air-result'], bind: {text: 'result'}, role: 'status'
                }, {
                    cls: ['air-plan'], reference: 'timing'
                }]
            }]
        }]
    }

    #elapsed = 0
    #end = titlesDuration
    #timer = null
    #origin = 0

    /** @summary Seeds this desk's store and listens once per committed reorder. */
    onConstructed() {
        super.onConstructed();
        this.getReference('rundown').store.on({rowsChange: this.onReorder, scope: this});
        this.replay()
    }

    /** @summary Stops the rehearsal clock when the director leaves. */
    destroy() {
        clearInterval(this.#timer);
        super.destroy()
    }

    /** @summary Returns titles, clock and remaining segments to their opening positions. */
    replay() {
        clearInterval(this.#timer);
        this.#timer   = null;
        this.#elapsed = 0;
        this.#end     = titlesDuration;
        this.getReference('monitor').feed = 'titles';
        this.getReference('rundown').resetSegments();
        this.onReorder()
    }

    /** @summary Reprojects the two planned time slots against the fixed moment the remote line opens. */
    onReorder() {
        const plan = this.getReference('timing'), records = this.getReference('rundown').store.items;
        if (records.length !== 2) return;

        const span        = records.reduce((sum, record) => sum + record.duration, 0),
              guestOffset = records[0].id === 'guest' ? 0 : records[0].duration,
              margin      = titlesDuration + guestOffset - guestReadyAt,
              available   = studioTime(guestReadyAt),
              difference  = new Date(Math.abs(margin) * 1000).toISOString().slice(14, 19),
              slots       = records.map(({id, duration}) => ({
                  cls: ['air-slot', 'air-slot-' + id], style: {flexGrow: duration}, text: id === 'film' ? 'Film' : 'Guest'
              }));

        plan.cls = ['air-plan', margin < 0 ? 'air-risk' : 'air-safe'];
        plan.getVdomRoot().cn = [
            {cls: ['air-plan-heading'], text: 'Transmission timing'},
            {cls: ['air-track'], cn: [...slots, {
                cls  : ['air-line-marker'], title: 'Guest line opens at ' + available,
                style: {left: ((guestReadyAt - titlesDuration) * 100 / span) + '%'}
            }]},
            {cls: ['air-axis'], cn: [
                {tag: 'span', text: studioTime(titlesDuration).slice(0, 5)},
                {tag: 'span', text: 'Line opens ' + available},
                {tag: 'span', text: studioTime(titlesDuration + span)}
            ]},
            {cls: ['air-margin'], text: margin < 0 ? 'Guest slot is ' + difference + ' early' : 'Guest line ready with ' + difference + ' to spare'}
        ];
        plan.update();
        this.updateDesk()
    }

    /** @summary Provides a keyboard-operable equivalent to moving the second segment ahead of the first. */
    swapCues() {
        const list            = this.getReference('rundown'),
              [first, second] = list.store.items;

        if (second) list.dragZone?.moveRecord(second, first, true)
    }

    /** @summary Opens a presenter-only view linked to this desk. */
    async openPresenter() {
        if (!await Presenter.openWindow(this) && !this.isDestroyed) {
            this.stateProvider.setData('result', 'The presenter window could not open. The cue is also shown below Program.')
        }
    }

    /** @summary Plays or holds the show clock. An elapsed-time origin keeps background ticks in time. */
    toggleClock() {
        if (this.#timer) {
            this.advanceTo(Math.floor((Date.now() - this.#origin) / 1000));
            clearInterval(this.#timer);
            this.#timer = null
        } else if (this.#end !== null) {
            this.#origin = Date.now() - this.#elapsed * 1000;
            this.#timer  = setInterval(() => this.advanceTo(Math.floor((Date.now() - this.#origin) / 1000)), 250)
        }
        this.updateDesk()
    }

    /** @summary Skips the rest of this segment and takes the next item at its scheduled broadcast time. */
    takeNext() {
        if (this.#end !== null) {
            this.advanceTo(this.#end);
            this.#origin = Date.now() - this.#elapsed * 1000
        }
    }

    /**
     * @summary Takes each segment that elapsed while the clock ran, including after a background pause.
     * A take consumes its store record. An unavailable line at that instant produces dead air.
     * @param {Number} seconds Show time measured from the start of the opening titles
     */
    advanceTo(seconds) {
        if (seconds <= this.#elapsed || this.#end === null) return;

        const store = this.getReference('rundown').store, monitor = this.getReference('monitor');

        while (this.#end !== null && seconds >= this.#end) {
            const next = store.items[0];
            this.#elapsed = this.#end;
            if (!next || (next.id === 'guest' && this.#elapsed < guestReadyAt)) {
                monitor.feed = next ? 'black' : 'end';
                this.#end = null;
                clearInterval(this.#timer);
                this.#timer = null
            } else {
                monitor.feed = next.id;
                this.#end += next.duration;
                store.remove(next)
            }
        }
        if (this.#end !== null) this.#elapsed = seconds;
        this.updateDesk()
    }

    /** @summary Projects the current rundown and clock into the program desk and both presenter views. */
    updateDesk() {
        const list     = this.getReference('rundown'),
              monitor  = this.getReference('monitor'),
              next     = list.store.items[0],
              stopped  = this.#end === null,
              waiting  = this.#elapsed < guestReadyAt,
              clock    = studioTime(this.#elapsed),
              filmNext = next?.id === 'film';

        this.getReference('take').disabled = stopped;
        this.getReference('play').disabled = stopped;
        this.getReference('play').text     = this.#timer ? 'Hold clock' : 'Run clock';
        list.draggable = !stopped && list.store.getCount() > 1;
        this.getReference('swap').disabled = !list.draggable;
        this.getReference('swap').text     = filmNext ? 'Cue guest first' : 'Cue film first';

        let cue, detail, result;
        if (monitor.feed === 'black') {
            cue = 'Hold for signal'; detail = 'The remote line missed its slot.';
            result = 'Dead air at ' + clock + '. Replay and cue the recorded film first.'
        } else if (monitor.feed === 'end') {
            cue = 'Clear studio'; detail = 'The transmission has ended.';
            result = 'Show complete. Both segments aired without a gap.'
        } else {
            cue    = filmNext ? 'Roll Night Service' : next ? 'Introduce Mara Lin' : 'Close the show';
            detail = filmNext ? 'Film ready  /  01:30' : next && waiting ? 'Remote line opens at 20:01:20' : next ? 'Remote line connected' : 'Stand by for sign-off';
            result = monitor.feed === 'film' ? 'Film on air. The guest will be ready for the next cue.'
                : monitor.feed === 'guest' ? 'Mara is on air. You made the handoff.'
                : filmNext ? 'Film is cued. Take the next cue or let the titles run out.'
                : 'Titles end at 20:00:00. The ninety-second film is ready.'
        }
        this.stateProvider.setData({clock, cue, detail, result})
    }
}

export default Neo.setupClass(Viewport);
