import Model from './MainModel.mjs';
import Store from '../../../src/data/Store.mjs';

const PATTERNS = [
    ['07–15', '07–15', '07–15', '07–15', 'Off',     'Off',     '07–15'],
    ['15–23', '15–23', 'Off',   '15–23', '15–23',   '15–23',   'Off'],
    ['Off',   '07–15', '07–15', 'Off',   '07–15',   '07–15',   '07–15'],
    ['23–07', '23–07', '23–07', 'Off',   'Off',     '23–07',   '23–07'],
    ['07–15', 'On call', '07–15', '07–15', '07–15', 'Off',     'Off'],
    ['Off',   '15–23', '15–23', '15–23', 'Off',     'On call', '15–23'],
    ['07–19', '07–19', 'Off',   'Off',   '07–19',   'Off',     'Off'],
    ['Off',   'Off',   '19–07', '19–07', 'Off',     '19–07',   'Off']
];

const STAFF = [
    ['c01', 'Amara Okafor',      'ICU',        'Charge RN'],
    ['c02', 'Henrik Lindqvist',  'Emergency',  'Attending'],
    ['c03', 'Mei-Ling Chen',     'Trauma',     'ICU RN'],
    ['c04', 'Mateo Alvarez',     'Cardiology', 'Resident'],
    ['c05', 'Priya Nair',        'Surgery',    'PA-C'],
    ['c06', 'Lukas Novak',       'Telemetry',  'Triage RN'],
    ['c07', 'Sora Takahashi',    'Radiology',  'Tech'],
    ['c08', 'Nadia Benali',      'Pediatrics', 'Charge RN'],
    ['c09', 'Clara Hofmann',     'ICU',        'Pharmacist'],
    ['c10', 'David Mensah',      'Emergency',  'Triage RN'],
    ['c11', 'Elena Rostova',     'Trauma',     'Attending'],
    ['c12', 'Tariq Al-Mansoor',  'Cardiology', 'PA-C'],
    ['c13', 'Freja Holm',        'Surgery',    'Charge RN'],
    ['c14', 'Gabriel Costa',     'Telemetry',  'Resident'],
    ['c15', 'Hana Kwon',         'ICU',        'ICU RN'],
    ['c16', 'Ibrahim Diallo',    'Emergency',  'PA-C'],
    ['c17', 'Julia Kowalski',    'Radiology',  'Attending'],
    ['c18', 'Kenji Watanabe',    'Pediatrics', 'Resident'],
    ['c19', 'Leila Farouk',      'Trauma',     'Triage RN'],
    ['c20', 'Marco Bellini',     'Cardiology', 'Charge RN'],
    ['c21', 'Nina Petrovic',     'Surgery',    'Attending'],
    ['c22', 'Omar Haddad',       'Telemetry',  'Pharmacist'],
    ['c23', 'Paula Mendes',      'ICU',        'ICU RN'],
    ['c24', 'Quentin Moreau',    'Emergency',  'Resident'],
    ['c25', 'Rania Saleh',       'Pediatrics', 'PA-C'],
    ['c26', 'Stefan Bauer',      'Radiology',  'Tech'],
    ['c27', 'Tessa Van Dijk',    'Trauma',     'Charge RN'],
    ['c28', 'Usman Tariq',       'Cardiology', 'ICU RN'],
    ['c29', 'Valeria Soto',      'Surgery',    'Triage RN'],
    ['c30', 'Willem De Vries',   'Telemetry',  'Attending'],
    ['c31', 'Ximena Vargas',     'ICU',        'Resident'],
    ['c32', 'Yusuf Demir',       'Emergency',  'Charge RN'],
    ['c33', 'Zoe Papadopoulos',  'Pediatrics', 'Attending'],
    ['c34', 'Adrian Popescu',    'Radiology',  'PA-C'],
    ['c35', 'Beatriz Silva',     'Trauma',     'ICU RN'],
    ['c36', 'Caleb Osei',        'Cardiology', 'Tech'],
    ['c37', 'Daria Morozova',    'Surgery',    'Pharmacist'],
    ['c38', 'Elias Korhonen',    'Telemetry',  'Triage RN'],
    ['c39', 'Fatima Zahra',      'ICU',        'Attending'],
    ['c40', 'Gideon Ndlovu',     'Emergency',  'ICU RN'],
    ['c41', 'Helena Lindholm',   'Pediatrics', 'Triage RN'],
    ['c42', 'Ivan Kovalenko',    'Trauma',     'Resident']
];

const ROSTER_DATA = STAFF.map(([id, staff, unit, role], index) => {
    const [mon, tue, wed, thu, fri, sat, sun] = PATTERNS[index % PATTERNS.length];

    return {id, staff, unit, role, mon, tue, wed, thu, fri, sat, sun}
});

/**
 * @summary Deterministic 42-clinician weekly hospital shift roster for demonstrating grid selection modes.
 * @class Neo.examples.grid.container.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        className  : 'Neo.examples.grid.container.MainStore',
        keyProperty: 'id',
        model      : Model,
        data       : ROSTER_DATA
    }
}

export default Neo.setupClass(MainStore);
