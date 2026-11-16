import {releaseTaskRows, workItemRows} from '../store/plan.mjs';

const msPerDay = 86_400_000;

/**
 * @module Workstation.view.planningCalendar
 * @summary The one calendar both planning panes draw on, so a date in the team's schedule stands over the
 * same date in the release plan.
 *
 * Stacked, the two panes promise that the eye can drop from a person's task to its phase. That holds only
 * while they share a start, a scale, a locked column width and one way of naming days, so those four live
 * here and nowhere else. The window starts on the Monday of the week the plan's earliest row starts in and
 * spans five whole weeks, which covers the plan on whatever weekday the plan day falls. Five weeks at
 * `pxPerDay` beside the locked column fill a 1600 px wide window; the seed's shortest bars are long enough
 * for their labels at that scale.
 */

/**
 * The pixels one day takes in both panes.
 * @type {Number}
 */
export const pxPerDay = 40;

/**
 * The width of each pane's locked column: the schedule's team and the plan's phases.
 * @type {Number}
 */
export const lockedWidth = 173;

/**
 * @summary The window over the plan: from the Monday of the week its earliest row starts in, five weeks.
 * @param {Date} baseDate Midnight UTC of the plan day
 * @returns {{start: Date, end: Date}}
 */
export function planWindow(baseDate) {
    const first = baseDate.getTime() + Math.min(...[...workItemRows, ...releaseTaskRows].map(row => row.start)) * msPerDay,
          start = first - (new Date(first).getUTCDay() + 6) % 7 * msPerDay;

    return {end: new Date(start + 35 * msPerDay), start: new Date(start)}
}

/**
 * @summary The configs each planning pane takes: the window as its `Neo.timeline.TimeAxis`, weeks over
 * days, and one label format for each row.
 * @param {Date} baseDate Midnight UTC of the plan day
 * @returns {Object}
 */
export function planningAxis(baseDate) {
    return {
        majorFormatter: tick => tick.date.toLocaleDateString('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'}),
        majorTickUnit : 'week',
        minorFormatter: tick => tick.date.toLocaleDateString('en-GB', {day: 'numeric', timeZone: 'UTC'}),
        timeAxis      : {...planWindow(baseDate), pxPerMinute: pxPerDay / 1440, snapMinutes: 1440, tickUnit: 'day', timeZone: 'UTC'}
    }
}
