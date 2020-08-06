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
            {country: 'Germany',  firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig'},
            {country: 'USA',      firstname: 'Rich',    githubId: 'rwaters',       lastname: 'Waters'},
            {country: 'Germany',  firstname: 'Nils',    githubId: 'mrsunshine',    lastname: 'Dehl'},
            {country: 'USA',      firstname: 'Gerard',  githubId: 'camtnbikerrwc', lastname: 'Horan'},
            {country: 'Slovakia', firstname: 'Jozef',   githubId: 'jsakalos',      lastname: 'Sakalos'},
            {country: 'Germany',  firstname: 'Bastian', githubId: 'bhaustein',     lastname: 'Haustein'},
            {country: 'USA',      firstname: 'Durlabh', githubId: 'durlabhjain',   lastname: 'Jain'},
            {country: 'Canada',   firstname: 'Kevin',   githubId: 'keckeroo',      lastname: 'Cassidy'},
            {country: 'UK',       firstname: 'Nikola',  githubId: 'boemska-nik',   lastname: 'Markovic'},
            {country: 'USA',      firstname: 'Hyle',    githubId: 'hylec',         lastname: 'Campbell'}
        ]
    }}
}

Neo.applyClassConfig(MainStore);

export {MainStore as default};