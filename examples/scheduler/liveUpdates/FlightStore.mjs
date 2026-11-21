import EventStore  from '../../../src/timeline/store/Events.mjs';
import FlightModel from './FlightModel.mjs';
import {GATES}     from './GateStore.mjs';

export const OPEN_SLOTS = new Set([
    'g-01:7', 'g-02:6', 'g-03:8', 'g-04:7', 'g-05:6', 'g-05:10',
    'g-06:7', 'g-06:11', 'g-07:6', 'g-07:9', 'g-08:8', 'g-08:11',
    'g-09:6', 'g-09:10', 'g-10:7', 'g-10:9', 'g-11:6', 'g-11:9',
    'g-12:8', 'g-12:11', 'g-13:7', 'g-13:10', 'g-14:8', 'g-14:11'
]);

export const ROUTE_CATALOG = [
    ['NX', 'London'],     ['AV', 'Paris'],      ['SK', 'Oslo'],       ['HL', 'Vienna'],
    ['MR', 'Madrid'],     ['NR', 'Dublin'],     ['AL', 'Milan'],      ['BL', 'Lisbon'],
    ['CR', 'Copenhagen'], ['DN', 'Amsterdam'],  ['ER', 'Prague'],     ['FL', 'Geneva'],
    ['GR', 'Athens'],     ['HN', 'Stockholm'],  ['IR', 'Brussels'],   ['JL', 'Warsaw'],
    ['KR', 'Munich'],     ['LN', 'Barcelona'],  ['MN', 'Helsinki'],   ['OR', 'Hamburg'],
    ['PR', 'Porto'],      ['QN', 'Bergen'],     ['RN', 'Florence'],   ['SL', 'Lyon'],
    ['TR', 'Tallinn'],    ['UN', 'Riga'],       ['VR', 'Split'],      ['WL', 'Bilbao'],
    ['XR', 'Bologna'],    ['YN', 'Graz']
];

function pad2(value) {
    return String(value).padStart(2, '0')
}

/**
 * @summary Builds the deterministic 60-flight morning schedule (`06:00`–`12:00` UTC across 14 gates, leaving 24 open gate-hour slots).
 * @returns {Object[]}
 */
export function buildInitialFlights() {
    const rows = [];
    let   seq  = 101;

    for (const gate of GATES) {
        for (let hour = 6; hour <= 11; hour++) {
            if (OPEN_SLOTS.has(`${gate.id}:${hour}`)) {
                continue
            }

            const
                idx             = seq - 101,
                [carrier, city] = ROUTE_CATALOG[idx % ROUTE_CATALOG.length],
                flightCode      = `${carrier} ${seq}`,
                startIso        = `2026-11-09T${pad2(hour)}:05:00Z`,
                endIso          = `2026-11-09T${pad2(hour)}:45:00Z`;

            rows.push({
                city,
                deltaText : '',
                endDate   : endIso,
                feedMark  : '',
                flightCode,
                id        : `fl-${seq}`,
                pier      : gate.pier,
                resourceId: gate.id,
                slotHour  : hour,
                startDate : startIso,
                status    : 'scheduled',
                title     : `${flightCode} · ${city}`
            });

            seq++
        }
    }

    return rows
}

/**
 * @summary Event store holding the 60-flight turnaround plan updated by the live simulated feed.
 * @class Neo.examples.scheduler.liveUpdates.FlightStore
 * @extends Neo.timeline.store.Events
 */
class FlightStore extends EventStore {
    static config = {
        className  : 'Neo.examples.scheduler.liveUpdates.FlightStore',
        data       : buildInitialFlights(),
        keyProperty: 'id',
        model      : FlightModel
    }
}

export default Neo.setupClass(FlightStore);
