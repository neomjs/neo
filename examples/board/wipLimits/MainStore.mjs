import CardModel from './CardModel.mjs';
import Store     from '../../../src/data/Store.mjs';

// [status, title, ticketNote, assignee, tag, progress, color]
// 16 repairs across 4 stages: Waiting (6), On the bench (4, over limit 3), Testing (2, at limit 2), Ready for pickup (4)
const REPAIRS = [
    // On the bench (4 cards — exceeds WIP limit of 3 on the first frame)
    ['bench',   'Linn Sondek LP12 motor supply',   'R. Vance · 33 rpm speed drift after warm-up',     'Maya Lin',    'turntable', 65, '#38bdf8'],
    ['bench',   'Leica M6 shutter curtain timing', 'H. Lindqvist · 1/1000s capping on right edge',    'Tomas Novak', 'optics',    50, '#38bdf8'],
    ['bench',   'La Marzocco Linea boiler probe',  'Cafe Nord · steam group over-pressurizing',       'Elena Rost',  'espresso',  80, '#38bdf8'],
    ['bench',   'Fender Twin Reverb bias recap',   'J. Okafor · 60 Hz hum on vibrato channel',        'Maya Lin',    'tube-amp',  35, '#38bdf8'],

    // Testing (2 cards — at its WIP limit of 2, not marked overloaded)
    ['testing', 'Rolex Cal. 3135 amplitude check', 'S. Patel · 24h 5-position timing run on Witschi', 'Tomas Novak', 'horology',  90, '#a78bfa'],
    ['testing', 'Nagra IV-S pinch roller tension', 'Archive West · wow & flutter soak test',          'Elena Rost',  'tape-deck', 95, '#a78bfa'],

    // Waiting (6 cards — intake queue, no WIP limit)
    ['waiting', 'Hasselblad 500C/M film back',     'K. Sato · frame spacing overlap on roll 4..6',    null,          'optics',     0, null],
    ['waiting', 'Juno-106 voice chip #4 swap',     'M. Alverez · hanging unison note on patch A3',    null,          'synth',      0, null],
    ['waiting', 'Mazzer Major burr carrier align', 'Roastery 9 · uneven espresso grind distribution', null,          'grinder',    0, null],
    ['waiting', 'McIntosh MC275 output socket',    'D. Becker · intermittent left KT88 filament',     null,          'tube-amp',   0, null],
    ['waiting', 'Omega Speedmaster pusher seal',   'L. Chen · reset crispness + pressure test',       null,          'horology',   0, null],
    ['waiting', 'Technics SL-1200 tonearm gimbal', 'Club Midi · horizontal play in anti-skate ring',  null,          'turntable',  0, null],

    // Ready for pickup (4 cards — completed, no WIP limit)
    ['pickup',  'Olympus OM-1 prism desilvering',  'A. Moreau · new penta-prism + light seals',       'Tomas Novak', 'optics',   100, '#34d399'],
    ['pickup',  'Revox B77 capstan servo rebuild', 'Studio K · calibrated to +4 dBu NAB reference',   'Elena Rost',  'tape-deck',100, '#34d399'],
    ['pickup',  'Breville Dual Boiler triac board','P. Hoffman · 4-hour thermal load test passed',    'Elena Rost',  'espresso', 100, '#34d399'],
    ['pickup',  'Moog Prodigy pitch wheel pot',    'N. Haddad · deadband zeroed + octave scale set',  'Maya Lin',    'synth',    100, '#34d399']
];

/**
 * @summary Store of 16 workshop repairs seeded across four Kanban stages.
 * @description Seeds 6 repairs in `Waiting`, 4 in `On the bench` (over its WIP limit of 3), 2 in `Testing` (at its
 * WIP limit of 2), and 4 in `Ready for pickup`.
 * @class Neo.examples.board.wipLimits.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.board.wipLimits.MainStore'
         * @protected
         */
        className: 'Neo.examples.board.wipLimits.MainStore',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=CardModel
         */
        model: CardModel
    }

    /**
     * @summary Seeds the 16 workshop repair records once on construction unless external data was supplied.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        if (!this.items?.length) {
            this.add(REPAIRS.map(([status, title, ticketNote, assignee, tag, progress, color], index) => ({
                id       : `repair-${index + 1}`,
                assignees: assignee ? [assignee] : [],
                color,
                progress,
                status,
                tags     : [tag],
                ticketNote,
                title
            })))
        }
    }
}

export default Neo.setupClass(MainStore);
