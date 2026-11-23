/**
 * @module Neo.examples.scheduler.meridian.Night
 * @summary The simulated instrument limits, initial sequence and allocation rules for one observing night.
 * Both the projected and committed sequences use the native Gantt writer for dependent task dates.
 */

const epoch = Date.UTC(2026, 10, 23, 22);
export const occultation = {start: 14, end: 16, exposure: 4};

export const telescopes = [
    {id: 'north', name: 'North · 5 fps', fps: 5},
    {id: 'south', name: 'South · 2 fps', fps: 2}
];

/** @summary Converts minutes from 22:00 UTC to the Gantt and Scheduler time base. @param {Number} minute @returns {Date} */
export const at = minute => new Date(epoch + minute * 60000);

/** @summary Reads minutes past 22:00 UTC on this observing night. @param {Date|String} date @returns {Number} */
export const minuteOf = date => (new Date(date).getTime() - epoch) / 60000;

/** @summary Formats a fixture time as a UTC clock label. @param {Number} minute @returns {String} */
export const clock = minute => at(minute).toISOString().slice(11, 16);

/** @summary Paints the fixed physical event in the shared UTC coordinates of a native timeline row.
 * @param {Neo.timeline.TimeAxis} timeAxis @returns {Object}
 */
export const eventBand = timeAxis => {
    const left = timeAxis.dateToOffset(at(occultation.start));
    return {cls: ['meridian-event-window'], 'aria-hidden': 'true',
        style: {position: 'absolute', pointerEvents: 'none', left: left + 'px', width: (timeAxis.dateToOffset(at(occultation.end)) - left) + 'px'}}
};

/** @summary Returns separate geometry configs with matching UTC and snap for both native timeline views. @returns {Object} */
export const axis = () => ({
    timeAxis       : {start: at(8), end: at(36), timeZone: 'UTC', tickUnit: 'minute', tickStep: 4, pxPerMinute: 21, snapMinutes: 1},
    minimumDuration: 1, majorTickUnit: 'hour',
    majorFormatter : () => '23 NOV   /   UTC', minorFormatter: tick => tick.date.toISOString().slice(11, 16)
});

/** @summary Seeds the readout chain and the North mosaic's reduction chain. @returns {Object[]} */
export const initialTasks = () => [
    ['guide',   'Guide lock',      8, 10, null],
    ['arc17',   'ARC-17 exposure', 12, 16, null],
    ['readout', 'Detector read',   16, 20, null],
    ['mosaic',  'North mosaic',    13, 21, 'north'],
    ['stack',   'Stack frames',    21, 25, null]
].map(([id, title, start, end, resourceId]) => ({
    id, title, isLeaf: true, parentId: null, startDate: at(start), endDate: at(end), resourceId, durationUnit: 'minute'
}));

/** @summary Returns independent dependency data for the native chart. @returns {Object[]} */
export const initialLinks = () => [
    {id: 'guide-arc', fromId: 'guide', toId: 'arc17', type: 'FS', lag: 2, lagUnit: 'minute'},
    {id: 'arc-read', fromId: 'arc17', toId: 'readout', type: 'FS'},
    {id: 'mosaic-stack', fromId: 'mosaic', toId: 'stack', type: 'FS'}
];

/** @summary Seeds observing requests and the other programmes on the desk. @returns {Object[]} */
export const initialCards = () => [
    {id: 'bias', title: 'Bias library', status: 'queue', tags: ['Calibration'], color: '#9daabc'},
    {id: 'arc17', title: 'ARC-17', status: 'cleared', tags: ['Occultation', '4 min'], color: '#7ce5ce'},
    {id: 'mosaic', title: 'Galaxy mosaic', status: 'booked', tags: ['North'], color: '#f2bf75'},
    {id: 'standard', title: 'Flux standard', status: 'booked', tags: ['South'], color: '#a0a3ed'}
].map((card, order) => ({...card, order: (order + 1) * 1000}));

/**
 * @summary Evaluates this run's immutable shutter window and programme constraints at a candidate slot.
 * @param {Object} slot Resource and snapped start date
 * @param {Object} inputs Current guide end, crew clearance and North's unshifted mosaic reservation (minutes)
 * @returns {Object} Timing, samples during occultation and a human-readable disposition
 */
export function evaluateSlot({resourceId, startDate}, {cleared, guideEnd, mosaicStart, mosaicDuration}) {
    const scope    = telescopes.find(row => row.id === resourceId),
          start    = minuteOf(startDate), end = start + occultation.exposure, release = end + 4,
          overlap  = Math.max(0, Math.min(end, occultation.end) - Math.max(start, occultation.start)),
          samples  = Math.round(overlap * 60 * (scope?.fps || 0)),
          ingress  = start <= occultation.start && end >= occultation.end,
          conflict = resourceId === 'north' && start < mosaicStart + mosaicDuration && release > mosaicStart,
          delay    = conflict ? release - mosaicStart : 0,
          resource = scope?.name.split(' · ')[0] || 'Unknown';
    let reason;
    if (!scope || !Number.isInteger(start) || start < 8 || release > 36) reason = 'Outside this observing run';
    else if (!cleared) reason = 'Crew clearance required';
    else if (start < guideEnd) reason = 'Guide lock is still in progress';
    else if (resourceId === 'south' && start < 12) reason = 'Flux standard has the South camera until 22:12';
    else if (!ingress) reason = start > 14 ? 'Misses ingress at 22:14' : 'Ends before egress at 22:16';

    return {
        accepted: !reason, short: reason || `${resource} · ${samples} samples`, resource, resourceId,
        start, end, release, fps: scope?.fps || 0, samples, ingress, delay,
        detail: reason ? `${reason}. ${samples} of ${(scope?.fps || 0) * 120} event samples.` :
            `${clock(start)}–${clock(end)} UTC · ${scope.fps} fps · camera free ${clock(release)}. ` +
            (delay ? `North mosaic starts ${clock(mosaicStart + delay)}, ${delay} min later.` : 'North mosaic keeps its slot.')
    }
}

/**
 * @summary Places an accepted allocation using the same native task writer on either chart. Only the collision
 * policy is specific to the observatory. FS successors and the dependency lines follow the engine.
 * @param {Neo.gantt.Container} chart
 * @param {Object} proposal
 * @param {Number} mosaicStart The North programme's desired time before any displacement
 */
export function place(chart, proposal, mosaicStart) {
    const {resourceId, start, end, delay} = proposal,
          tasks                           = chart.store, links = chart.dependencyStore,
          mosaic                          = tasks.get('mosaic'), length = minuteOf(mosaic.endDate) - minuteOf(mosaic.startDate),
          readLink                        = links.get('read-mosaic');
    // Releasing North should return the mosaic to its preferred reservation.
    if (readLink) links.remove(readLink);
    links.get('guide-arc').set({lag: start - minuteOf(tasks.get('guide').endDate)});
    chart.moveTask('arc17', {startDate: at(start), endDate: at(end), fields: {resourceId}}, {source: 'allocation'});
    if (delay) links.add({id: 'read-mosaic', fromId: 'readout', toId: 'mosaic', type: 'FS'});
    chart.moveTask('mosaic', {startDate: at(mosaicStart + delay), endDate: at(mosaicStart + delay + length)}, {source: 'allocation'})
}
