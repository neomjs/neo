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
            {id:  1, country: 'Germany',       firstname: 'Tobias',  githubId: 'tobiu',         isOnline: true,  lastname: 'Uhlig'},
            {id:  2, country: 'United States', firstname: 'Rich',    githubId: 'rwaters',       isOnline: false, lastname: 'Waters'},
            {id:  3, country: 'Germany',       firstname: 'Nils',    githubId: 'mrsunshine',    isOnline: true,  lastname: 'Dehl'},
            {id:  4, country: 'United States', firstname: 'Gerard',  githubId: 'camtnbikerrwc', isOnline: true,  lastname: 'Horan'},
            {id:  5, country: 'Slovakia',      firstname: 'Jozef',   githubId: 'jsakalos',      isOnline: false, lastname: 'Sakalos'},
            {id:  6, country: 'Germany',       firstname: 'Bastian', githubId: 'bhaustein',     isOnline: false, lastname: 'Haustein'},
            {id:  7, country: 'United States', firstname: 'Durlabh', githubId: 'durlabhjain',   isOnline: true,  lastname: 'Jain'},
            {id:  8, country: 'Canada',        firstname: 'Kevin',   githubId: 'keckeroo',      isOnline: true,  lastname: 'Cassidy'},
            {id:  9, country: 'UK',            firstname: 'Nikola',  githubId: 'boemska-nik',   isOnline: true,  lastname: 'Markovic'},
            {id: 10, country: 'United States', firstname: 'Hyle',    githubId: 'hylec',         isOnline: false, lastname: 'Campbell'}
        ]
    }}
}

Neo.applyClassConfig(MainStore);

export {MainStore as default};