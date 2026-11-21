import EventModel from '../../../src/timeline/model/Event.mjs';

/**
 * @summary Turnaround flight record extending `Neo.timeline.model.Event` with route, status, and two-stage live feed highlight state.
 * @class Neo.examples.scheduler.liveUpdates.FlightModel
 * @extends Neo.timeline.model.Event
 */
class FlightModel extends EventModel {
    static config = {
        className: 'Neo.examples.scheduler.liveUpdates.FlightModel',
        fields   : [
            {name: 'flightCode', type: 'String',  defaultValue: ''},
            {name: 'city',       type: 'String',  defaultValue: ''},
            {name: 'pier',       type: 'String',  defaultValue: 'A'},
            {name: 'slotHour',   type: 'Integer', defaultValue: 6},
            {name: 'status',     type: 'String',  defaultValue: 'scheduled'},
            {name: 'deltaText',  type: 'String',  defaultValue: ''},
            {name: 'feedMark',   type: 'String',  defaultValue: ''}
        ]
    }
}

export default Neo.setupClass(FlightModel);
