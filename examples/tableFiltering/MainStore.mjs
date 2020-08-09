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

        keyProperty: 'githubId',
        model      : Model,

        data: [
            {country: 'Germany',       firstname: 'Tobias',  githubId: 'tobiu',         isOnline: true,  lastname: 'Uhlig'},
            {country: 'United States', firstname: 'Rich',    githubId: 'rwaters',       isOnline: false, lastname: 'Waters'},
            {country: 'Germany',       firstname: 'Nils',    githubId: 'mrsunshine',    isOnline: true,  lastname: 'Dehl'},
            {country: 'United States', firstname: 'Gerard',  githubId: 'camtnbikerrwc', isOnline: true,  lastname: 'Horan'},
            {country: 'Slovakia',      firstname: 'Jozef',   githubId: 'jsakalos',      isOnline: false, lastname: 'Sakalos'},
            {country: 'Germany',       firstname: 'Bastian', githubId: 'bhaustein',     isOnline: false, lastname: 'Haustein'},
            {country: 'United States', firstname: 'Durlabh', githubId: 'durlabhjain',   isOnline: true,  lastname: 'Jain'},
            {country: 'Canada',        firstname: 'Kevin',   githubId: 'keckeroo',      isOnline: true,  lastname: 'Cassidy'},
            {country: 'UK',            firstname: 'Nikola',  githubId: 'boemska-nik',   isOnline: true,  lastname: 'Markovic'},
            {country: 'United States', firstname: 'Hyle',    githubId: 'hylec',         isOnline: false, lastname: 'Campbell'}
        ]
    }}
}

Neo.applyClassConfig(MainStore);

export {MainStore as default};