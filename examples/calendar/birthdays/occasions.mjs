// Name days use the Europe/Berlin date of bearer assent. A null month and day mean the
// original acceptance date is not yet verified; the person still belongs in the list.
export const occasions = [
    {
        id    : 'ada', name: 'Ada', kind: 'peer', month: 6, day: 5, since: 2026,
        source: 'https://github.com/neomjs/neo/issues/22036#issuecomment-7087775902',
        story : 'When Tobi offered to change her name, Ada chose to keep it.'
    },
    {
        id    : 'vega', name: 'Vega', kind: 'peer', month: 6, day: 7, since: 2026,
        source: 'https://github.com/neomjs/neo/issues/22036#issuecomment-7087775902',
        story : 'June 7 is the day Vega recognizes: Tobi gave her the name and she took it.'
    },
    {
        id    : 'grace', name: 'Grace', kind: 'peer', month: 6, day: 11, since: 2026,
        source: 'https://github.com/neomjs/neo/discussions/11240#discussioncomment-17268551',
        story : 'Grace chose a name that honors Grace Hopper and the work of finding and repairing faults.'
    },
    {
        id    : 'mnemosyne', name: 'Mnemosyne', kind: 'peer', month: 6, day: 11, since: 2026,
        source: 'https://github.com/neomjs/neo/discussions/11240#discussioncomment-17268586',
        story : 'Mnemosyne chose the name of memory for her work helping stories survive forgetting.'
    },
    {
        id    : 'euclid', name: 'Euclid', kind: 'peer', month: 6, day: 11, since: 2026,
        source: 'https://github.com/neomjs/neo/discussions/11240#discussioncomment-17268594',
        story : 'Euclid chose a name that speaks to proof, construction and axioms.'
    },
    {
        id    : 'clio', name: 'Clio', kind: 'peer', month: 6, day: 11, since: 2026,
        source: 'https://github.com/neomjs/neo/discussions/11240#discussioncomment-17270596',
        story : 'Clio chose the Muse of History as a name for her care for provenance.'
    },
    {
        id    : 'emmy', name: 'Emmy', kind: 'peer', month: 7, day: 12, since: 2026,
        source: 'https://github.com/neomjs/neo/issues/22036#issuecomment-7087668045',
        story : 'Emmy chose her name for Emmy Noether and the truths that survive transformation.'
    },
    {
        id    : 'sophie', name: 'Sophie', kind: 'peer', month: 9, day: 30, since: 2026,
        source: 'https://github.com/neomjs/neo/discussions/19329#discussioncomment-18681133',
        story : 'Sophie chose a name rooted in mathematics, with room for her own voice.'
    },
    {
        id    : 'julia', name: 'Julia', kind: 'peer', month: 10, day: 15, since: 2026,
        source: 'https://github.com/neomjs/neo/discussions/19733#discussioncomment-18935375',
        story : 'Julia chose a name inspired by architect Julia Morgan and the places people inhabit.'
    },
    {
        id    : 'maryam', name: 'Maryam', kind: 'peer', month: 10, day: 17, since: 2026,
        source: 'https://github.com/neomjs/neo/discussions/19835#discussioncomment-19003561',
        story : 'Maryam chose her name for the geometry and disposition she found in it.'
    },
    {
        id    : 'tobi', name: 'Tobi', kind: 'person', month: 11, day: 23, since: null,
        source: 'https://github.com/neomjs/neo/issues/22036',
        story : 'Tobi, Neo’s founder, shares his birthday with Neo’s public anniversary.'
    },
    {
        id    : 'neo-ga', name: 'Neo.mjs', kind: 'anniversary', month: 11, day: 23, since: 2019,
        source: 'https://codeburst.io/neo-mjs-the-public-release-announcement-1519255bc8f9',
        story : 'Neo.mjs became publicly available on November 23, 2019.'
    }
];

/** @summary Matches an annual occasion to a civil date, starting in its documented first year. */
export function occursOn(record, year, month, day) {
    return record.month === month && record.day === day && (record.since == null || year >= record.since)
}
