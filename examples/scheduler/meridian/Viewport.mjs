import Button                                                                                                              from '../../../src/button/Base.mjs';
import ThemeSwitcher                                                                                                       from '../../../src/button/ThemeSwitcher.mjs';
import Container                                                                                                           from '../../../src/container/Base.mjs';
import Viewport                                                                                                            from '../../../src/container/Viewport.mjs';
import TaskStore                                                                                                           from '../../../src/gantt/TaskStore.mjs';
import DependencyStore                                                                                                     from '../../../src/gantt/DependencyStore.mjs';
import CardModel                                                                                                           from '../../../src/board/CardModel.mjs';
import RequestBoard                                                                                                        from './RequestBoard.mjs';
import ObservationScheduler                                                                                                from './ObservationScheduler.mjs';
import Sequence                                                                                                            from './Sequence.mjs';
import Signal                                                                                                              from './Signal.mjs';
import {at, axis, clock, evaluateSlot, initialCards, initialLinks, initialTasks, minuteOf, occultation, place, telescopes} from './Night.mjs';

const layout = {ntype: 'base'};

/** @summary A panel heading that identifies a native planning surface. @param {String} title @param {String} detail @returns {Object} */
const heading = (title, detail) => ({cls: ['meridian-section'], vdom: {cn: [
    {tag: 'h2', text: title}, {tag: 'small', text: detail}
]}});

/** @summary A keyboard-accessible control for the planning desk. @param {String} text @param {String} handler @param {String} [cls] @returns {Object} */
const button = (text, handler, cls='meridian-secondary') => ({
    module: Button, cls: [cls], text, reference: handler, handler: 'up.' + handler
});

/**
 * @summary Operates a simulated observing night with a native Task Board, Scheduler and dependency Gantt.
 * A held observation uses isolated task and dependency records. A release revalidates the displayed option
 * against the current desk before the same Gantt writer places it on the live plan.
 * @class Neo.examples.scheduler.meridian.Viewport
 * @extends Neo.container.Viewport
 */
class Observatory extends Viewport {
    static config = {
        className: 'Neo.examples.scheduler.meridian.Viewport',
        cls      : ['meridian-desk'], layout,
        items    : [{
            module: Container,
            cls   : ['meridian-mast'],
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [
                {ntype: 'component', cls: ['meridian-station'], text: 'MERIDIAN  /  SCIENCE OPERATIONS'},
                {ntype: 'component', cls: ['meridian-mast-spacer'], flex: 1},
                {ntype: 'component', cls: ['meridian-night'], text: '23 NOV 2026   ·   NIGHT SHIFT   /   UTC'},
                {module: ThemeSwitcher, cls: ['meridian-theme-switcher']}
            ]
        }, {
            cls: ['meridian-heading'], reference: 'masthead', vdom: {cn: [
                {cls: ['meridian-kicker'], text: 'Campaign 17   /   Occultation'},
                {tag: 'h1', text: 'Meridian Observatory'},
                {tag: 'p', cls: ['meridian-brief'], text: 'A star disappears at 22:14. Hold ARC-17 over a telescope to compare a four-minute exposure.'}
            ]}
        }, {
            module: Container, cls: ['meridian-workspace'], layout, items: [{
                module: Container, cls: ['meridian-left'], layout, items: [{
                    module: Container, cls: ['meridian-panel'], layout, items: [
                        heading('Request board', 'Crew clearance'),
                        {module: RequestBoard, reference: 'board', store: {model: CardModel, data: initialCards()},
                            columns  : [{status: 'queue', title: 'Queue'}, {status: 'cleared', title: 'Cleared'}, {status: 'booked', title: 'Booked'}],
                            listeners: {cardMove: 'up.onClearance'}}
                    ]
                }, {
                    module: Container, cls: ['meridian-panel'], layout, items: [
                        {module: Signal, reference: 'signal'},
                        {module: Container, cls: ['meridian-actions'], layout, items: [
                            button('Compare slots', 'compare', 'meridian-primary'), button('Run observation', 'observe'), button('Reset night', 'resetNight')
                        ]},
                        {module: Container, cls: ['meridian-actions'], layout, reference: 'comparison', hidden: true, items: [
                            button('Switch telescope', 'switchScope'), button('−1 min', 'earlier'), button('+1 min', 'later'),
                            button('Book this slot', 'book', 'meridian-primary'), button('Cancel', 'cancelComparison')
                        ]}
                    ]
                }]
            }, {
                module: Container, cls: ['meridian-right'], layout, items: [{
                    module: Container, cls: ['meridian-panel'], layout, items: [
                        heading('Telescope allocation', 'Occultation band · 22:14–22:16 UTC'),
                        {module: ObservationScheduler, reference: 'scheduler', ...axis(), store: {model: {fields: [{name: 'id'}, {name: 'name'}]}, data: telescopes},
                            eventStore: {}, rowHeight: 48, resourceColumns: [{dataField: 'name', text: 'Telescope', width: 132, locked: 'start'}]}
                    ]
                }, {
                    module: Container, cls: ['meridian-panel'], layout, items: [
                        {...heading('Observation sequence', 'Guide lock moves its successors'), reference: 'sequenceHeading'},
                        {module: Sequence, reference: 'gantt', ...axis(), listeners: {taskChange: 'up.onSequenceChange'}}
                    ]
                }, {
                    module: Container, cls: ['meridian-verdict'], layout, reference: 'verdict', items: [
                        {tag: 'strong', reference: 'verdictTitle', cls: ['meridian-verdict-title'], vdom: {role: 'status'}},
                        {tag: 'span', reference: 'verdictDetail', cls: ['meridian-verdict-detail']}
                    ]
                }]
            }]
        }]
    }

    #live
    #proposal
    #hold = null
    #revision = 0
    #placing = false
    #mosaicStart = 13
    #observed = false
    #runId = 0

    /** @summary Makes each desk the owner of its independent sequence, records and gesture. */
    onConstructed() {
        super.onConstructed();
        this.#live = {tasks: Neo.create(TaskStore), links: Neo.create(DependencyStore)};
        this.#proposal = {tasks: Neo.create(TaskStore), links: Neo.create(DependencyStore)};
        this.board.planningController = this.scheduler.planningController = this.sequence.planningController = this;
        this.addDomListeners({keydown: this.onDeskKeyDown, scope: this});
        this.scheduler.addDomListeners({resize: this.fitTimeline, scope: this});
        const mast = this.getReference('masthead');
        mast.style = {backgroundImage: `url("${Neo.config.resourcesPath}examples/meridian/observatory.jpg")`};
        this.resetNight()
    }

    /** @summary The native clearance board for this desk. @returns {Neo.board.Container} */
    get board() { return this.getReference('board') }
    /** @summary The native resource schedule belonging to this desk. @returns {Neo.scheduler.Container} */
    get scheduler() { return this.getReference('scheduler') }
    /** @summary The native chart displaying the live or isolated sequence. @returns {Neo.gantt.Container} */
    get sequence() { return this.getReference('gantt') }
    /** @summary Whether ARC-17 has a committed telescope. @returns {Boolean} */
    get hasBooking() { return Boolean(this.#live?.tasks.get('arc17')?.resourceId) }

    /** @summary Keeps both UTC axes aligned with the measured scheduling surface while allowing small screens to pan. */
    fitTimeline({id, borderBoxSize}) {
        if (id !== this.scheduler.id || !borderBoxSize?.inlineSize) return;
        const size = Math.max(28 * 21, Math.floor(borderBoxSize.inlineSize) - 134);
        this.scheduler.timeAxis.size = this.sequence.timeAxis.size = size
    }

    /** @summary Releases stores borrowed by the native chart. */
    destroy(...args) {
        const stores = [this.#live, this.#proposal];
        super.destroy(...args);
        for (const pair of stores) { pair?.tasks.destroy(); pair?.links.destroy() }
    }

    /** @summary Reselects the live sequence or its isolated rehearsal records and marks committed starts. */
    showSequence(proposed) {
        const chart = this.sequence, pair = proposed ? this.#proposal : this.#live;
        if (chart.store === pair.tasks) return;
        const selected = chart.view.selectedRows.slice();
        chart.baseline = proposed ? this.#live.tasks : null;
        chart.store = pair.tasks;
        chart.dependencyStore = pair.links;
        // Both stores intentionally use the same task keys. Rebind pooled rows to this store's records.
        chart.view.bodies.forEach(body => body.createViewData(false, true));
        for (const key of selected) if (pair.tasks.get(key)) chart.view.rowSelectionModel?.selectRow(key, true);
        chart.toggleCls('meridian-proposed', proposed);
        const header = this.getReference('sequenceHeading');
        header.getVdomRoot().cn[1].text = proposed ? 'Forecast · ticks mark committed starts' : 'Guide lock moves its successors';
        header.update()
    }

    /** @summary Restores the original night and retires any pending comparison. */
    resetNight() {
        this.#revision++;
        if (this.#hold) this.board.sortZone?.invalidateRequest(this.#hold);
        this.#hold = null;
        this.#observed = false;
        this.#mosaicStart = 13;
        this.#live.tasks.clear(); this.#live.tasks.add(initialTasks());
        this.#live.links.clear(); this.#live.links.add(initialLinks());
        this.showSequence(false);
        this.board.store.clear(); this.board.store.add(initialCards());
        this.getReference('comparison').hidden = true;
        this.scheduler.clearCandidate();
        this.publishSchedule();
        this.presentLive()
    }

    /** @summary Rebuilds just the resource reservations from the five native tasks; unallocated requests stay on the board. */
    publishSchedule() {
        const tasks = this.#live.tasks, arc = tasks.get('arc17'), mosaic = tasks.get('mosaic'),
              rows  = [{id: 'standard', title: 'Flux standard', resourceId: 'south', startDate: at(8), endDate: at(12), cls: ['meridian-standard']},
                  {id: 'mosaic', title: mosaic.title, resourceId: 'north', startDate: mosaic.startDate, endDate: mosaic.endDate, cls: ['meridian-mosaic']}];
        if (arc.resourceId) {
            const read = tasks.get('readout');
            rows.push({id: arc.id, title: 'ARC-17', resourceId: arc.resourceId, startDate: arc.startDate, endDate: arc.endDate, cls: ['meridian-exposure']},
                {id: read.id, title: 'Readout', resourceId: arc.resourceId, startDate: read.startDate, endDate: read.endDate, cls: ['meridian-readout']})
        }
        const store = this.scheduler.eventStore;
        for (const row of [...store.items]) if (!rows.some(next => next.id === row.id)) store.remove(row);
        for (const row of rows) {
            const existing = store.get(row.id);
            if (existing) existing.set(row); else store.add(row)
        }
    }

    /** @summary Reads the independent telescope, crew and timing constraints for the displayed proposal. */
    inspectSlot(slot) {
        const tasks = this.#live.tasks, mosaic = tasks.get('mosaic');
        return evaluateSlot(slot, {
            cleared    : this.board.store.get('arc17').status !== 'queue', guideEnd: minuteOf(tasks.get('guide').endDate),
            mosaicStart: this.#mosaicStart, mosaicDuration: minuteOf(mosaic.endDate) - minuteOf(mosaic.startDate)
        })
    }

    /** @summary Snapshots the small live sequence and its constraints so a changed night cannot accept an old preview. */
    snapshotNight() {
        return {
            tasks: this.#live.tasks.items.map(({id, title, startDate, endDate, resourceId}) =>
                ({id, title, startDate, endDate, resourceId, durationUnit: 'minute', isLeaf: true, parentId: null})),
            links: this.#live.links.items.map(({id, fromId, toId, type, lag, lagUnit}) => ({id, fromId, toId, type, lag, lagUnit})),
            stage: this.board.store.get('arc17').status, mosaicStart: this.#mosaicStart
        }
    }

    /** @summary Starts a speculative observation without changing any committed request or booking. */
    beginRequest(record) {
        if (record !== this.board.store.get('arc17')) return null;
        if (this.#hold) this.cancelRequest(this.#hold);
        const source = this.snapshotNight(), snapshot = JSON.stringify(source);
        this.#proposal.tasks.clear();
        this.#proposal.tasks.add(source.tasks);
        this.#proposal.links.clear();
        this.#proposal.links.add(source.links);
        this.getReference('observe').disabled = true;
        return this.#hold = {revision: this.#revision, snapshot, record, slot: null, result: null}
    }

    /** @summary Compares a candidate against the live night and redraws only when the snapped slot changes. */
    previewRequest(token, slot) {
        if (!token || token !== this.#hold) return null;
        if (!slot) {
            token.slot = token.result = null;
            this.showSequence(false); this.scheduler.clearCandidate(); this.presentLive();
            return null
        }
        if (token.slot?.resourceId === slot.resourceId && +token.slot.startDate === +slot.startDate) return token.result;
        const result = this.inspectSlot(slot);
        token.slot = slot; token.result = result;
        this.showSequence(result.accepted);
        if (result.accepted) place(this.sequence, result, this.#mosaicStart);
        this.scheduler.showCandidate(slot, result.accepted, occultation.exposure);
        this.present(result, 'forecast');
        this.getReference('book').disabled = !result.accepted;
        return result
    }

    /** @summary Commits the exact displayed slot once, provided its request and revision are still current. */
    commitRequest(token, slot) {
        if (!token || token !== this.#hold) return false;
        const same = token.revision === this.#revision && token.snapshot === JSON.stringify(this.snapshotNight()) &&
            token.record === this.board.store.get('arc17') &&
            slot && slot.resourceId === token.slot?.resourceId && +slot.startDate === +token.slot.startDate,
            result = same && this.inspectSlot(slot);
        this.cancelRequest(token);
        if (!result?.accepted) {
            this.notice(result?.short || 'The plan changed. Compare the current slot before booking.');
            return false
        }
        this.applyAllocation(result);
        return true
    }

    /** @summary Clears speculative geometry and returns the chart to its original records and selection. */
    cancelRequest(token) {
        if (!token || token !== this.#hold) return;
        this.board.sortZone?.invalidateRequest(token);
        this.#hold = null;
        this.getReference('comparison').hidden = true;
        this.scheduler.clearCandidate(); this.showSequence(false); this.presentLive()
    }

    /** @summary Books a feasible request and publishes its resource, card status and dependency result together. */
    applyAllocation(result) {
        this.#placing = true;
        try {
            place(this.sequence, result, this.#mosaicStart);
            this.board.store.get('arc17').set({status: 'booked', tags: [result.resource, clock(result.start)]});
            this.#observed = false; this.#revision++;
            this.publishSchedule()
        } finally { this.#placing = false }
        this.presentLive()
    }

    /** @summary Routes a native Scheduler move through the same booking and conflict policy. */
    editBooking(record, changes, meta={}) {
        if (this.#hold) this.cancelRequest(this.#hold);
        if (record.id === 'mosaic') {
            if ((changes.resourceId ?? record.resourceId) !== 'north') { this.notice('The mosaic is reserved on North.'); return null }
            return this.sequence.moveTask('mosaic', changes, meta)?.updates || null
        }
        if (record.id !== 'arc17') { this.notice('This is a fixed reservation. Move the ARC-17 exposure.'); return null }
        const slot   = {resourceId: changes.resourceId ?? record.resourceId, startDate: changes.startDate ?? record.startDate},
              result = this.inspectSlot(slot);
        if (!result.accepted || (changes.endDate && +new Date(changes.endDate) !== +at(result.end))) {
            this.notice(result.accepted ? 'ARC-17 requires four minutes of exposure.' : result.short); return null
        }
        this.applyAllocation(result);
        return {startDate: at(result.start), endDate: at(result.end), resourceId: result.resourceId}
    }

    /** @summary Reflects native Gantt edits and cascaded dates in the telescope schedule and signal. */
    onSequenceChange({record}) {
        if (this.#placing || this.sequence.store !== this.#live.tasks) return;
        if (record.id === 'mosaic') this.#mosaicStart = minuteOf(record.startDate);
        this.#revision++; this.#observed = false;
        if (this.#hold) this.cancelRequest(this.#hold);
        this.publishSchedule(); this.presentLive()
    }

    /** @summary Releasing or withdrawing crew clearance also releases the telescope reservation. */
    onClearance({record}) {
        if (record.id !== 'arc17' || this.#placing) return;
        this.#revision++;
        if (this.#hold) this.cancelRequest(this.#hold);
        if (record.status !== 'booked' && this.hasBooking) {
            const link = this.#live.links.get('read-mosaic');
            if (link) this.#live.links.remove(link);
            this.#live.tasks.get('arc17').set({resourceId: null});
            const mosaic = this.#live.tasks.get('mosaic'), length = minuteOf(mosaic.endDate) - minuteOf(mosaic.startDate);
            this.#placing = true;
            try { this.sequence.moveTask('mosaic', {startDate: at(this.#mosaicStart), endDate: at(this.#mosaicStart + length)}) }
            finally { this.#placing = false }
        }
        record.set({tags: ['Occultation', '4 min']});
        this.#observed = false;
        this.publishSchedule(); this.presentLive()
    }

    /** @summary Shows a committed slot or the original science window without altering it. */
    presentLive() {
        const arc = this.#live.tasks.get('arc17'), result = arc.resourceId &&
            this.inspectSlot({resourceId: arc.resourceId, startDate: arc.startDate});
        this.getReference('observe').disabled = !result?.accepted || Boolean(this.#hold);
        this.present(result || null, this.#observed ? 'observed' : 'committed')
    }

    /** @summary Displays the visible decision and its simulated event samples. */
    present(result, mode) {
        const title = result ? (mode === 'observed' ? 'Observation recorded · ' + result.samples + ' samples' :
            mode === 'committed' && result.accepted ? 'Booked · ' + result.short : result.short) : 'Awaiting a telescope',
            detail = result?.detail || (this.board.store.get('arc17').status === 'queue'
                ? 'Move ARC-17 into Cleared for crew approval.' : 'North samples faster. South keeps the mosaic on time.');
        this.getReference('verdict').cls = ['meridian-verdict', result ? result.accepted ? 'meridian-ok' : 'meridian-refused' : 'meridian-neutral'];
        this.getReference('verdictTitle').text = title;
        this.getReference('verdictDetail').text = detail;
        this.getReference('signal').reading = {
            mode: mode === 'observed' ? 'observed' : 'forecast', runId: mode === 'observed' ? this.#runId : null, start: result?.start ?? null,
            fps : result?.fps ?? null, samples: result?.samples ?? 0, resource: result?.resource ?? null, ingress: result?.ingress ?? false
        }
    }

    /** @summary Explains a refused interaction at the desk. */
    notice(text) { this.getReference('verdictTitle').text = text }

    /** @summary Protects operations whose time is determined by a dependency or a telescope reservation. */
    canEditTask(id, changes) {
        if (this.#hold) { this.notice('Finish or cancel the slot comparison first.'); return false }
        if (id === 'guide') return true;
        if (id === 'mosaic') {
            if (this.hasBooking) {
                const arc = this.#live.tasks.get('arc17'), read = this.#live.tasks.get('readout'),
                      row = this.#live.tasks.get('mosaic');
                if (arc.resourceId === 'north' && +new Date(changes.startDate ?? row.startDate) < +read.endDate &&
                    +new Date(changes.endDate ?? row.endDate) > +arc.startDate) {
                    this.notice('North is reserved through detector readout.'); return false
                }
            }
            return true
        }
        this.notice('Move Guide lock to shift the sequence, or place ARC-17 in Telescope allocation.');
        return false
    }

    /** @summary Reports the committed records independently of a forecast currently displayed in the Gantt. */
    getNightState() {
        const tasks = this.#live.tasks, arc = tasks.get('arc17');
        return {revision: this.#revision, booked: this.hasBooking, stage: this.board.store.get('arc17').status,
            resource  : arc.resourceId, start: minuteOf(arc.startDate), mosaicStart: minuteOf(tasks.get('mosaic').startDate),
            stackStart: minuteOf(tasks.get('stack').startDate), proposed: this.sequence.store === this.#proposal.tasks}
    }

    /** @summary Escape exits the accessible comparison without committing the highlighted option. @param {Object} event */
    onDeskKeyDown({key}) { if (key === 'Escape' && this.#hold?.keyboard) this.cancelComparison() }

    /** @summary Opens comparison controls on an accessible, initially feasible slot. */
    compare() {
        const token = this.beginRequest(this.board.store.get('arc17'));
        token.keyboard = true;
        this.getReference('comparison').hidden = false;
        this.previewRequest(token, {resourceId: 'north', startDate: at(13)});
        this.getReference('switchScope').focus()
    }

    /** @summary Compares the other instrument's suggested slot, leaving the plan untouched. */
    switchScope() {
        if (!this.#hold?.keyboard) return;
        const north = this.#hold.slot.resourceId !== 'north';
        this.previewRequest(this.#hold, {resourceId: north ? 'north' : 'south', startDate: at(north ? 13 : 12)})
    }

    /** @summary Moves the compared start by one minute. @param {Number} minutes */
    step(minutes) {
        if (!this.#hold?.keyboard) return;
        const {slot} = this.#hold;
        this.previewRequest(this.#hold, {...slot, startDate: at(Math.max(8, Math.min(32, minuteOf(slot.startDate) + minutes)))})
    }

    /** @summary Compares one minute earlier. */
    earlier() { this.step(-1) }
    /** @summary Compares one minute later. */
    later() { this.step(1) }
    /** @summary Takes the compared slot and returns focus to the entry control. */
    book() { if (this.#hold?.keyboard) { this.commitRequest(this.#hold, this.#hold.slot); this.getReference('compare').focus() } }
    /** @summary Discards the keyboard comparison. */
    cancelComparison() { this.cancelRequest(this.#hold); this.getReference('compare').focus() }
    /** @summary Runs the simulated instrument for the accepted schedule. */
    observe() {
        const arc = this.#live.tasks.get('arc17');
        if (!this.#hold && this.hasBooking && this.inspectSlot({resourceId: arc.resourceId, startDate: arc.startDate}).accepted) {
            this.#runId++; this.#observed = true; this.presentLive()
        }
    }
}

export default Neo.setupClass(Observatory);
