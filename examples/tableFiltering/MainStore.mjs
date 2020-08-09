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
            {id:  1, country: 'Germany',       firstname: 'Tobias',  isOnline: true,  lastname: 'Uhlig',    specialDate: '2020-08-10'},
            {id:  2, country: 'United States', firstname: 'Rich',    isOnline: false, lastname: 'Waters',   specialDate: '2020-08-09'},
            {id:  3, country: 'Germany',       firstname: 'Nils',    isOnline: true,  lastname: 'Dehl',     specialDate: '2020-08-09'},
            {id:  4, country: 'United States', firstname: 'Gerard',  isOnline: true,  lastname: 'Horan',    specialDate: '2020-08-10'},
            {id:  5, country: 'Slovakia',      firstname: 'Jozef',   isOnline: false, lastname: 'Sakalos',  specialDate: '2020-08-08'},
            {id:  6, country: 'Germany',       firstname: 'Bastian', isOnline: false, lastname: 'Haustein', specialDate: '2020-08-10'},
            {id:  7, country: 'United States', firstname: 'Durlabh', isOnline: true,  lastname: 'Jain',     specialDate: '2020-08-08'},
            {id:  8, country: 'Canada',        firstname: 'Kevin',   isOnline: true,  lastname: 'Cassidy',  specialDate: '2020-08-10'},
            {id:  9, country: 'UK',            firstname: 'Nikola',  isOnline: true,  lastname: 'Markovic', specialDate: '2020-08-09'},
            {id: 10, country: 'United States', firstname: 'Hyle',    isOnline: false, lastname: 'Campbell', specialDate: '2020-08-10'}
        ]
    }}
}

Neo.applyClassConfig(MainStore);

export {MainStore as default};