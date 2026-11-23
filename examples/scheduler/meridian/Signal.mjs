import Component            from '../../../src/component/Base.mjs';
import {createSeededRandom} from '../../../src/util/Random.mjs';
import {clock, occultation} from './Night.mjs';

const left = 44, right = 425, top = 17, bottom = 109;

/**
 * @summary The fictional source's normalized aperture flux. Contact lasts three seconds at either edge.
 * @param {Number} minute Minutes past 22:00 UTC
 * @returns {Number}
 */
function modelFlux(minute) {
    return 1 - 0.86 * Math.max(0, Math.min(1, (minute - occultation.start) * 20, (occultation.end - minute) * 20))
}

/**
 * @summary A four-minute exposure of the model at the chosen frame rate. Each dot is one deterministic
 * simulated reading at the centre of its integration. One SVG path carries all the samples.
 * @param {Number} start Minutes past 22:00 UTC
 * @param {Number} fps Frames per second
 * @param {Function} x Maps a time to a plot coordinate
 * @param {Function} y Maps a normalized flux to a plot coordinate
 * @returns {String} SVG path data
 */
function samplePath(start, fps, x, y) {
    const random = createSeededRandom(Math.round(start * 60 * fps) + 41), points = [];
    for (let frame = 0; frame < occultation.exposure * 60 * fps; frame++) {
        const minute = start + (frame + 0.5) / (60 * fps),
              flux   = modelFlux(minute) + (random() + random() - 1) * 0.065;
        points.push(`M${x(minute).toFixed(2)} ${y(flux).toFixed(2)}h0.02`)
    }
    return points.join('')
}

/**
 * @summary The observing desk's simulated light curve. The model and event window stay visible in a forecast;
 * a completed acquisition adds the detector samples within its actual recording span.
 * @class Neo.examples.scheduler.meridian.Signal
 * @extends Neo.component.Base
 */
class Signal extends Component {
    static config = {
        /** @member {String} className='Neo.examples.scheduler.meridian.Signal' @protected */
        className: 'Neo.examples.scheduler.meridian.Signal',
        /** @member {String[]} cls */
        cls: ['meridian-signal'],
        /**
         * A forecast or observed reading, with start in minutes past 22:00 UTC, frame rate and in-event sample count.
         * @member {Object} reading_
         * @reactive
         */
        reading_: {mode: 'forecast', start: null, fps: null, samples: 0}
    }

    /**
     * @summary Plots the predicted contacts and the operator's recording span on the same UTC axis.
     * @param {Object} reading
     */
    afterSetReading(reading) {
        const {mode, start, fps, resource, runId, samples} = reading,
              {start: ingress, end: egress, exposure}      = occultation,
              allocated                                    = Number.isFinite(start) && (fps === 2 || fps === 5),
              observed                                     = allocated && mode === 'observed',
              from                                         = allocated ? Math.min(10, 2 * Math.floor(start / 2)) : 10,
              to                                           = allocated ? Math.max(20, 2 * Math.ceil((start + exposure) / 2)) : 20,
              x                                            = minute => left + (minute - from) * (right - left) / (to - from),
              y                                            = flux => bottom - (bottom - top) * flux / 1.15,
              curve                                        = [from, ingress, ingress + 0.05, egress - 0.05, egress, to]
                  .map(minute => `${x(minute).toFixed(2)},${y(modelFlux(minute)).toFixed(2)}`).join(' '),
              tickStep  = to - from > 14 ? 4 : 2,
              axis      = [];

        for (const flux of [0, 0.5, 1]) {
            axis.push({tag: 'line', cls: ['meridian-gridline'], x1: left, x2: right, y1: y(flux), y2: y(flux)},
                {tag: 'text', cls: ['meridian-axis-y'], x: left - 6, y: y(flux) + 3, text: flux.toFixed(1)})
        }
        for (let minute = from; minute <= to; minute += tickStep) {
            axis.push({tag: 'line', cls: ['meridian-tick'], x1: x(minute), x2: x(minute), y1: bottom + 2, y2: bottom + 6},
                {tag: 'text', cls: ['meridian-axis-x'], x: x(minute), y: bottom + 19, text: clock(minute)})
        }
        const plot = [
            {tag: 'rect', cls: ['meridian-event-band'], x: x(ingress), y: top, width: x(egress) - x(ingress), height: bottom - top},
            ...axis,
            {tag: 'text', cls: ['meridian-plot-units'], x: 10, y: 64, transform: 'rotate(-90 10 64)', text: 'Normalized flux'},
            {tag: 'line', cls: ['meridian-contact'], x1: x(ingress), x2: x(ingress), y1: top - 2, y2: bottom},
            {tag: 'line', cls: ['meridian-contact'], x1: x(egress), x2: x(egress), y1: top - 2, y2: bottom},
            {tag: 'text', cls: ['meridian-ingress'], x: x(ingress), y: 10, text: 'Ingress'},
            {tag: 'text', cls: ['meridian-egress'], x: x(egress), y: 10, text: 'Egress'},
            {tag: 'polyline', cls: ['meridian-model-line'], points: curve}
        ];
        if (allocated) {
            plot.push({tag: 'line', cls: ['meridian-recording-line'],
                x1: x(start), x2: x(start + exposure), y1: bottom + 1, y2: bottom + 1})
        }
        if (observed) {
            plot.push({tag: 'path', id: `${this.id}__exposure-${runId}`, cls: ['meridian-samples'], d: samplePath(start, fps, x, y)})
        }

        const modeLabel = observed ? 'Simulated observation' : 'Simulated forecast',
              summary   = allocated
                  ? `${resource} · ${clock(start)}–${clock(start + exposure)} UTC · ${fps} fps · ${samples} in-event frames`
                  : 'Choose a telescope and time to see the exposure.';
        this.getVdomRoot().cn = [
            {cls: ['meridian-signal-head'], cn: [
                {tag: 'h2', text: 'Occultation light curve'},
                {tag: 'span', cls: ['meridian-signal-mode'], text: modeLabel}
            ]},
            {tag: 'svg', cls: ['meridian-plot'], viewBox: '0 0 447 135', role: 'img',
                'aria-label': `${modeLabel}. Normalized flux against UTC. Occultation ${clock(ingress)}–${clock(egress)}. ${summary}`,
                cn          : plot},
            {cls: ['meridian-legend'], cn: [
                {tag: 'span', cls: ['meridian-key-model'], text: 'Predicted flux'},
                ...(allocated ? [{tag: 'span', cls: ['meridian-key-recording'], text: 'Recording interval'}] : []),
                ...(observed ? [{tag: 'span', cls: ['meridian-key-samples'], text: 'Sampled flux'}] : [])
            ]},
            {tag: 'p', cls: ['meridian-signal-summary'], text: summary}
        ];
        this.update()
    }
}

export default Neo.setupClass(Signal);
