/**
 * @module Neo.examples.stateProvider.advanced.memberDefaults
 * @summary Seed team member records and pure formatting helpers shared by all example surfaces.
 */

export const MEMBER_DEFAULTS = [
    {
        id        : 'maya',
        name      : 'Maya Lin',
        role      : 'Staff Systems Engineer',
        location  : 'Zürich · CET (UTC+1)',
        statusNote: 'Available for architecture review'
    },
    {
        id        : 'jonas',
        name      : 'Jonas Berg',
        role      : 'Principal Product Designer',
        location  : 'Stockholm · CET (UTC+1)',
        statusNote: 'In design critique until 16:00'
    },
    {
        id        : 'priya',
        name      : 'Priya Nair',
        role      : 'Runtime Lead',
        location  : 'Bengaluru · IST (UTC+5:30)',
        statusNote: 'Pairing on SharedWorker scheduling'
    }
];

/**
 * @summary Computes up to two uppercase initials from a full name.
 * @param {String} [name='']
 * @returns {String}
 */
export function initialsOf(name = '') {
    return String(name || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0].toUpperCase())
        .join('') || '?'
}

/**
 * @summary Clones the seed member dataset so each app boot starts with clean records.
 * @returns {Object[]}
 */
export function seedMembers() {
    return MEMBER_DEFAULTS.map(member => ({...member}))
}

/**
 * @summary Restores `record` in place to its seed values when an matching id exists.
 * @param {Neo.data.Record|null} record
 * @returns {Boolean}
 */
export function resetMemberRecord(record) {
    if (!record?.isRecord) return false;

    const seed = MEMBER_DEFAULTS.find(entry => entry.id === record.id);
    if (!seed) return false;

    record.set({
        location  : seed.location,
        name      : seed.name,
        role      : seed.role,
        statusNote: seed.statusNote
    });

    return true
}
