import Store from '../../src/data/Store.mjs';
import Model from './MainModel.mjs';

/**
 * @class TableFiltering.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static getConfig() {return {
        className: 'TableFiltering.MainStore',
        ntype    : 'main-store',

        keyProperty: 'id',
        model      : Model,

        data: [
            {id:  1, country: 'Germany',       firstname: 'Tobias',  isOnline: true,  lastname: 'Uhlig'},
            {id:  2, country: 'United States', firstname: 'Rich',    isOnline: false, lastname: 'Waters'},
            {id:  3, country: 'Germany',       firstname: 'Nils',    isOnline: true,  lastname: 'Dehl'},
            {id:  4, country: 'United States', firstname: 'Gerard',  isOnline: true,  lastname: 'Horan'},
            {id:  5, country: 'Slovakia',      firstname: 'Jozef',   isOnline: false, lastname: 'Sakalos'},
            {id:  6, country: 'Germany',       firstname: 'Bastian', isOnline: false, lastname: 'Haustein'},
            {id:  7, country: 'United States', firstname: 'Durlabh', isOnline: true,  lastname: 'Jain'},
            {id:  8, country: 'Canada',        firstname: 'Kevin',   isOnline: true,  lastname: 'Cassidy'},
            {id:  9, country: 'UK',            firstname: 'Nikola',  isOnline: true,  lastname: 'Markovic'},
            {id: 10, country: 'United States', firstname: 'Hyle',    isOnline: false, lastname: 'Campbell'}
        ]
    }}
}

Neo.applyClassConfig(MainStore);

export {MainStore as default};