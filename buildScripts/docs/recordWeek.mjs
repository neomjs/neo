import fs              from 'node:fs/promises';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs}     from 'node:util';
import isEntryModule   from '../util/isEntryModule.mjs';

/**
 * @module buildScripts.docs.recordWeek
 * @summary Writes the record the Portal's hero replays: every pull request one public repository merged in a
 * window of whole UTC days, with who opened it, who reviewed it and when, and who merged it.
 *
 * The scene that draws it is `Neo.canvas.RoundTable`. A seat is an account the repository answers `OWNER`,
 * `MEMBER` or `COLLABORATOR` for and whose login reads `neo-<model>-<name>`: the name and the group come from the
 * login, so a new maintainer appears without an edit here. Every other author enters through the door. The account
 * that merged most is the merge seat. Pull requests a bot opened are left out and counted nowhere.
 *
 * The file is a dated snapshot: its caption names the window, so it stays true at any age. Run it before a release.
 * @example GH_TOKEN=$(gh auth token) node buildScripts/docs/recordWeek.mjs
 * @example GH_TOKEN=… node buildScripts/docs/recordWeek.mjs --to 2026-11-20 --days 7 --repo neomjs/neo
 * @see Neo.canvas.RoundTable
 */
const ROOT    = fileURLToPath(new URL('../../', import.meta.url)),
      OUT     = path.join(ROOT, 'apps/portal/resources/data/record-week.json'),
      DAY     = 86400000,
      MINUTE  = 60000,
      MEMBERS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']),
      SEAT    = /^neo-([a-z0-9]+)-([a-z0-9]+)$/,
      STATES  = {APPROVED: 'A', CHANGES_REQUESTED: 'C'},
      TITLE   = 96,
      // A model line names its family; a line missing here is a group of its own.
      FAMILIES = {fable: 'Claude', gemini: 'Gemini', gpt: 'GPT', haiku: 'Claude', opus: 'Claude', sonnet: 'Claude'},
      QUERY    = `query($q: String!, $after: String) {
    search(query: $q, type: ISSUE, first: 50, after: $after) {
        pageInfo {hasNextPage endCursor}
        nodes {... on PullRequest {
            number title createdAt mergedAt authorAssociation
            author {login __typename}
            mergedBy {login}
            reviews(first: 100) {nodes {state submittedAt authorAssociation author {login __typename}}}
        }}
    }
}`;

/**
 * @summary A count and its noun: `1 review`, `2 reviews`.
 * @param {Number} count
 * @param {String} noun The singular
 * @returns {String}
 */
const counted = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * @summary The seat an account holds, or `null` for an account that enters through the door.
 * @param {String} login
 * @param {String} association The repository's `authorAssociation` for the account
 * @returns {{group: String, groupName: String, name: String}|null}
 */
export function seatOf(login, association) {
    const match = MEMBERS.has(association) && SEAT.exec(login || '');

    if (!match) {
        return null
    }

    const groupName = FAMILIES[match[1]] || match[1][0].toUpperCase() + match[1].slice(1);

    return {group: groupName.toLowerCase(), groupName, name: match[2][0].toUpperCase() + match[2].slice(1)}
}

/**
 * @summary The window's two dates as a reader says them: `13–19 Nov 2026`, or with both months when they differ.
 * @param {Number} from Milliseconds, the window's first instant
 * @param {Number} to   Milliseconds, the first instant after the window
 * @returns {String}
 */
export function windowLabel(from, to) {
    const first = new Date(from), last = new Date(to - DAY),
          part  = (date, options) => new Intl.DateTimeFormat('en-GB', {timeZone: 'UTC', ...options}).format(date),
          year  = part(last, {year: 'numeric'}),
          end   = `${part(last, {day: 'numeric'})} ${part(last, {month: 'short'})} ${year}`;

    if (from >= to - DAY) {
        return end
    }

    return first.getUTCMonth() === last.getUTCMonth() && first.getUTCFullYear() === last.getUTCFullYear()
        ? `${part(first, {day: 'numeric'})}–${end}`
        : `${part(first, {day: 'numeric'})} ${part(first, {month: 'short'})} – ${end}`
}

/**
 * @summary Turns merged pull requests into the record: seats, one row per pull request, totals and the caption.
 * Pure: the same input gives the same record, so a recorded API answer tests it.
 * @param {Object}   input
 * @param {Number|String} input.from The window's first instant
 * @param {Number|String} input.to   The first instant after the window
 * @param {Object[]} input.pulls `{number, title, createdAt, mergedAt, authorAssociation, author: {login, bot},
 * mergedBy, reviews: [{login, association, bot, state, submittedAt}]}` each
 * @param {String}   input.repo `owner/name`
 * @returns {Object} `{version, repo, from, to, caption, unit, groups, seats, totals, items}`; an item is
 * `[number, title, seat, login, opened, merged, reviews]` with times in minutes from `from`, `login` only for an
 * author at the door, and a review `[seat, 'A' | 'C', minute]`
 */
export function buildRecord({from, pulls, repo, to}) {
    from = +new Date(from);
    to   = +new Date(to);

    const minute = iso => Math.round((+new Date(iso) - from) / MINUTE),
          kept   = pulls
              .filter(pull => !pull.author?.bot && pull.author?.login && +new Date(pull.mergedAt) >= from && +new Date(pull.mergedAt) < to)
              .sort((a, b) => +new Date(a.mergedAt) - +new Date(b.mergedAt) || a.number - b.number),
          count  = new Map(),
          found  = new Map();

    kept.forEach(pull => pull.mergedBy && count.set(pull.mergedBy, (count.get(pull.mergedBy) || 0) + 1));

    const merger = [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null,
          note   = (login, association, authored) => {
              const seat = login !== merger && seatOf(login, association);

              if (seat) {
                  const entry = found.get(login) || {...seat, authored: 0, id: login};

                  entry.authored += authored;
                  found.set(login, entry)
              }
          };

    kept.forEach(pull => {
        note(pull.author.login, pull.authorAssociation, 1);
        pull.reviews.forEach(review => review.bot || note(review.login, review.association, 0))
    });

    // Groups by what they authored, seats by name inside their group: the order the table seats them in.
    const groupWork = new Map();

    found.forEach(seat => groupWork.set(seat.group, (groupWork.get(seat.group) || 0) + seat.authored));

    const groups = [...groupWork].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id),
          seated = [...found.values()].sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group) || a.name.localeCompare(b.name)),
          door   = kept.some(pull => pull.author.login !== merger && !found.has(pull.author.login)),
          seats  = [
              ...seated.map(({group, id, name}) => ({group, id, kind: 'seat', name})),
              ...door   ? [{id: 'door', kind: 'door', name: 'Contributors'}] : [],
              ...merger ? [{id: merger, kind: 'merge', name: `@${merger}`}]  : []
          ],
          index  = new Map(seats.map((seat, i) => [seat.id, i])),
          guests = new Set(),
          lives  = [];

    let approvals = 0, changeRequests = 0, crossGroup = 0, seatAuthored = 0;

    const items = kept.map(pull => {
        const {login} = pull.author,
              author  = index.has(login) ? index.get(login) : index.get('door'),
              merged  = minute(pull.mergedAt),
              group   = seats[author].group,
              reviews = pull.reviews
                  .filter(review => !review.bot && review.login !== login && index.has(review.login) && STATES[review.state]
                      && +new Date(review.submittedAt) <= +new Date(pull.mergedAt))
                  .sort((a, b) => +new Date(a.submittedAt) - +new Date(b.submittedAt))
                  .map(review => [index.get(review.login), STATES[review.state], minute(review.submittedAt)]);

        reviews.forEach(([, state]) => state === 'A' ? approvals++ : changeRequests++);
        seats[author].kind === 'door' && guests.add(login);

        if (group) {
            seatAuthored++;
            reviews.some(([seat, state]) => state === 'A' && seats[seat].group && seats[seat].group !== group) && crossGroup++
        }

        lives.push(merged - minute(pull.createdAt));

        return [
            pull.number,
            pull.title.length > TITLE ? `${pull.title.slice(0, TITLE - 1)}…` : pull.title,
            author,
            seats[author].kind === 'door' ? login : null,
            minute(pull.createdAt),
            merged,
            reviews
        ]
    });

    lives.sort((a, b) => a - b);

    const totals = {
        approvals,
        changeRequests,
        contributors        : guests.size,
        crossGroup,
        maintainers         : seated.length,
        medianMinutesToMerge: lives.length ? lives[lives.length >> 1] : 0,
        merged              : items.length,
        reviews             : approvals + changeRequests,
        seatAuthored
    };

    return {
        version: 1,
        repo,
        from   : new Date(from).toISOString(),
        to     : new Date(to).toISOString(),
        // the scene counts in this unit after the window, and a caption too long for its room keeps the window. The
        // change requests are not named here: the scene counts them beside their colour, in its legend
        caption: [
            windowLabel(from, to),
            counted(totals.reviews, 'review'),
            counted(totals.contributors, 'outside contributor'),
            repo
        ].join(' · '),
        // "merged" leads, so "181 of 301 merged pull requests" cannot read as a share that was merged
        unit  : `merged pull request${totals.merged === 1 ? '' : 's'}, one square each`,
        groups: groups.map(id => ({id, name: seated.find(seat => seat.group === id).groupName})),
        seats,
        totals,
        items
    }
}

/**
 * @summary The record as the file holds it: the head indented, one pull request per line, so a diff reads by row.
 * @param {Object} record
 * @returns {String}
 */
export function serialize(record) {
    const {items, ...head} = record;

    return JSON.stringify(head, null, 2).replace(/\n}$/, `,\n  "items": [\n${items.map(row => `    ${JSON.stringify(row)}`).join(',\n')}\n  ]\n}\n`)
}

/**
 * @summary Reads the window's merged pull requests from the GitHub API, a day at a time: a search answers at most
 * 1,000 rows, and a day stays far below that.
 * @param {Object}   input
 * @param {Function} [input.fetchImpl=fetch]
 * @param {Number}   input.from
 * @param {String}   input.repo
 * @param {Number}   input.to
 * @param {String}   input.token
 * @returns {Promise<Object[]>} The pulls in the shape `buildRecord` takes
 */
export async function fetchPulls({fetchImpl = fetch, from, repo, to, token}) {
    const pulls = [], stamp = time => new Date(time).toISOString().slice(0, 19) + 'Z';

    for (let day = from; day < to; day += DAY) {
        let after = null;

        do {
            const response = await fetchImpl('https://api.github.com/graphql', {
                      body   : JSON.stringify({query: QUERY, variables: {after, q: `repo:${repo} is:pr is:merged merged:${stamp(day)}..${stamp(Math.min(day + DAY, to) - 1000)}`}}),
                      headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'neo-record-week'},
                      method : 'POST'
                  }),
                  answer   = await response.json();

            if (!response.ok || answer.errors) {
                throw new Error(`GitHub answered ${response.status}: ${JSON.stringify(answer.errors || answer.message)}`)
            }

            const {nodes, pageInfo} = answer.data.search;

            nodes.filter(node => node?.number).forEach(node => pulls.push({
                author           : node.author && {bot: node.author.__typename === 'Bot', login: node.author.login},
                authorAssociation: node.authorAssociation,
                createdAt        : node.createdAt,
                mergedAt         : node.mergedAt,
                mergedBy         : node.mergedBy?.login || null,
                number           : node.number,
                reviews          : node.reviews.nodes.filter(review => review.author).map(review => ({
                    association: review.authorAssociation,
                    bot        : review.author.__typename === 'Bot',
                    login      : review.author.login,
                    state      : review.state,
                    submittedAt: review.submittedAt
                })),
                title            : node.title
            }));

            after = pageInfo.hasNextPage ? pageInfo.endCursor : null
        } while (after)
    }

    return pulls
}

/**
 * @summary The CLI: reads the window, writes the file, prints the caption.
 * @param {String[]} [argv=process.argv.slice(2)]
 * @param {Object}   [env=process.env]
 * @returns {Promise<Number>} The exit code
 */
export async function run(argv = process.argv.slice(2), env = process.env) {
    const {values} = parseArgs({args: argv, options: {
              days: {default: '7', type: 'string'},
              out : {default: OUT, type: 'string'},
              repo: {default: 'neomjs/neo', type: 'string'},
              to  : {type: 'string'}
          }}),
          token    = env.GH_TOKEN || env.GITHUB_TOKEN,
          days     = Number(values.days),
          to       = values.to ? Date.parse(`${values.to}T00:00:00Z`) : Math.floor(Date.now() / DAY) * DAY;

    if (!token) {
        console.error('recordWeek: set GH_TOKEN or GITHUB_TOKEN to a token that can read the repository.');
        return 1
    }

    if (!Number.isInteger(days) || days < 1 || Number.isNaN(to)) {
        console.error('recordWeek: --days takes a whole number of days, --to a date as YYYY-MM-DD.');
        return 1
    }

    const from   = to - days * DAY,
          record = buildRecord({from, pulls: await fetchPulls({from, repo: values.repo, to, token}), repo: values.repo, to});

    await fs.writeFile(values.out, serialize(record));
    console.log(`${path.relative(ROOT, values.out)}: ${record.caption}`);
    return 0
}

if (isEntryModule(import.meta.url)) {
    process.exitCode = await run()
}
