import Model from './MainModel.mjs';
import Store from '../../../src/data/Store.mjs';

const CONTACTS = [
    ['p01', 'Amara',   'Okafor',       'Lagos',      'NG', 'Kora Diagnostics',    'VP Operations',       '2026-12-01', false],
    ['p02', 'Henrik',  'Lindqvist',    'Stockholm',  'SE', 'Nordic Grid Systems', 'Platform Architect',  '2026-12-08', true],
    ['p03', 'Mei-Ling','Chen',         'Taipei',     'TW', 'Formosa Photonics',   'Supply Director',     '2026-12-14', false],
    ['p04', 'Mateo',   'Alvarez',      'Madrid',     'ES', 'Iberia Solar Labs',   'Engineering Lead',    '2026-12-19', false],
    ['p05', 'Clara',   'Hofmann',      'Munich',     'DE', 'Isar MedTech',        'Quality Manager',     '2027-01-06', false],
    ['p06', 'David',   'Mensah',       'Accra',      'GH', 'Volta Freight Hub',   'Logistics Lead',      '2027-01-12', false],
    ['p07', 'Elena',   'Rostova',      'Tallinn',    'EE', 'Baltic Cloud Relay',  'Security Director',   '2027-01-18', false],
    ['p08', 'Sora',    'Takahashi',    'Osaka',      'JP', 'Kansai Robotics',     'Firmware Principal',  '2027-01-25', false],
    ['p09', 'Nadia',   'Benali',       'Lyon',       'FR', 'Rhone BioSynth',      'Clinical Liaison',    '2027-02-02', false],
    ['p10', 'Priya',   'Nair',         'Bengaluru',  'IN', 'Deccan Telemetry',    'Data Engineering VP', '2027-02-09', false],
    ['p11', 'Lukas',   'Novak',        'Prague',     'CZ', 'Vltava Optics',       'Manufacturing Lead',  '2027-02-15', false],
    ['p12', 'Freja',   'Holm',         'Copenhagen', 'DK', 'Oresund Wind Marine', 'Fleet Coordinator',   '2027-02-22', false],
    ['p13', 'Gabriel', 'Costa',        'Lisbon',     'PT', 'Tagus Oceanics',      'Sensor Lead',         '2027-03-01', false],
    ['p14', 'Hana',    'Kwon',         'Seoul',      'KR', 'Hanul Battery Works', 'Cell Programs Lead',  '2027-03-08', false],
    ['p15', 'Ibrahim', 'Diallo',       'Dakar',      'SN', 'Sahel AgroCold',      'Regional Director',   '2027-03-15', false],
    ['p16', 'Julia',   'Kowalski',     'Warsaw',     'PL', 'Vistula Rail Tech',   'Signaling Lead',      '2027-03-22', false],
    ['p17', 'Kenji',   'Watanabe',     'Tokyo',      'JP', 'Edo Precision',       'Optical Architect',   '2027-03-29', false],
    ['p18', 'Leila',   'Farouk',       'Cairo',      'EG', 'Delta Water Grid',    'Telemetry Lead',      '2027-04-05', false],
    ['p19', 'Marco',   'Bellini',      'Milan',      'IT', 'Lombardia Avionics',  'Systems Counsel',     '2027-04-12', false],
    ['p20', 'Nina',    'Bucher',       'Zurich',     'CH', 'Limmat Cryogenics',   'Partner Success',     '2027-04-19', false],
    ['p21', 'Omar',    'Haddad',       'Amman',      'JO', 'Levant Solar Water',  'Field Operations',    '2027-04-26', false],
    ['p22', 'Paula',   'Mendes',       'Sao Paulo',  'BR', 'Pinheiros BioEnergy', 'Procurement Lead',    '2027-05-03', false],
    ['p23', 'Quentin', 'Moreau',       'Montreal',   'CA', 'St. Lawrence AI',     'Compute Lead',        '2027-05-10', false],
    ['p24', 'Rania',   'Saleh',        'Dubai',      'AE', 'Gulf ColdChain',      'Port Systems Lead',   '2027-05-17', false],
    ['p25', 'Stefan',  'Bauer',        'Vienna',     'AT', 'Danube Acoustics',    'Hardware Director',   '2027-05-24', false],
    ['p26', 'Tessa',   'Van Dijk',     'Utrecht',    'NL', 'Randstad Transit',    'Dispatch Architect',  '2027-05-31', false],
    ['p27', 'Valeria', 'Soto',         'Bogota',     'CO', 'Andes Cold Storage',  'Account Director',    '2027-06-07', false],
    ['p28', 'Willem',  'De Vries',     'Monterrey',  'MX', 'Norte Industrial',    'Plant Integration',   '2027-06-14', false]
];

export const INITIAL_RECORDS = CONTACTS.map(([id, firstname, lastname, city, country, organization, role, date, selected]) => ({
    id,
    annotations: {selected},
    user       : {firstname, lastname},
    address    : {city, country},
    organization,
    role,
    date
}));

/**
 * @summary Deterministic 28-partner directory store with nested `user` and `address` objects for dialog row editing.
 * @class Neo.examples.grid.nestedRecordFields.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        className  : 'Neo.examples.grid.nestedRecordFields.MainStore',
        keyProperty: 'id',
        model      : Model,
        data       : Neo.clone(INITIAL_RECORDS, true)
    }
}

export default Neo.setupClass(MainStore);
