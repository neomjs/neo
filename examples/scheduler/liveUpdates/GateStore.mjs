import GateModel from './GateModel.mjs';
import Store     from '../../../src/data/Store.mjs';

export const GATES = [
    {id: 'g-01', name: 'Gate A1', pier: 'A'},
    {id: 'g-02', name: 'Gate A2', pier: 'A'},
    {id: 'g-03', name: 'Gate A3', pier: 'A'},
    {id: 'g-04', name: 'Gate A4', pier: 'A'},
    {id: 'g-05', name: 'Gate A5', pier: 'A'},
    {id: 'g-06', name: 'Gate B1', pier: 'B'},
    {id: 'g-07', name: 'Gate B2', pier: 'B'},
    {id: 'g-08', name: 'Gate B3', pier: 'B'},
    {id: 'g-09', name: 'Gate B4', pier: 'B'},
    {id: 'g-10', name: 'Gate B5', pier: 'B'},
    {id: 'g-11', name: 'Gate C1', pier: 'C'},
    {id: 'g-12', name: 'Gate C2', pier: 'C'},
    {id: 'g-13', name: 'Gate C3', pier: 'C'},
    {id: 'g-14', name: 'Gate C4', pier: 'C'}
];

/**
 * @summary Store of fourteen airport gates across Piers A, B, and C.
 * @class Neo.examples.scheduler.liveUpdates.GateStore
 * @extends Neo.data.Store
 */
class GateStore extends Store {
    static config = {
        className  : 'Neo.examples.scheduler.liveUpdates.GateStore',
        data       : GATES,
        keyProperty: 'id',
        model      : GateModel
    }
}

export default Neo.setupClass(GateStore);
