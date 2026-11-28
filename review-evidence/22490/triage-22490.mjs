// #22490: give every row of a release-compare report a verdict. Rules are ordered; the first match wins, and a row
// no rule matches is printed as UNCLASSIFIED, so a new run shows what the table does not yet cover.
// Usage: node triage-22490.mjs <run-dir>  → prints the verdict table and writes <run-dir>/verdicts.json
import fs   from 'node:fs';
import path from 'node:path';

const runDir = process.argv[2],
      report = JSON.parse(fs.readFileSync(path.join(runDir, 'report.json'), 'utf8'));

const LIVE    = /apps\/workstation|dashboard\/sortable|grid\/cellTypes|grid\/streaming/,
      GRIDISH = /gantt|scheduler|timeline|grid\/|board\/|dashboard\/planning|apps\/legit|apps\/workstation/,
      HUE     = new Map([ // the 14.0 neutral and its hue-270 successor, per role
          ['rgba(211, 215, 210, 1)', 'rgba(211, 214, 222, 1)'], ['rgba(69, 75, 66, 1)', 'rgba(62, 68, 88, 1)'],
          ['rgba(182, 189, 180, 1)', 'rgba(181, 186, 201, 1)'], ['rgba(221, 221, 221, 1)', 'rgba(211, 214, 222, 1)']
      ]);

// [id, verdict, decision, predicate(row, surface, scheme)]
const RULES = [
    ['segmented-label', 'broken', 'BUG_SEGMENTED',
        (w, s) => s === 'examples/board/cardDesigns' && w.group === 'button' && /font-(size|weight)/.test(w.property)],
    ['segmented-control', 'intentional', '#22234: the density toggle is a `Segmented` control, which is a toolbar',
        (w, s) => s === 'examples/board/cardDesigns' && w.property === '(element)'],
    ['live-rekey', 'noise', 'live data re-keys the element: the same element with other numbers',
        (w, s) => w.property === '(element)' && LIVE.test(s)],
    ['form-card', 'intentional', '#22456 (PR #22459): the form examples sit on a native card',
        (w, s) => w.property === '(element)' && /form\/(checkout|validation)/.test(s)],
    ['capture-state', 'noise', 'captured mid-job or before the app enables its buttons; enabled ~2s later on `dev`',
        (w, s) => /worker\/task|apps\/legit|data\/pipeline/.test(s) && /181, 186, 201|211, 214, 222, 1\)$|241, 242, 245/.test(w.dev) && /14, 15, 13|0, 0, 0, 0|211, 215, 210|62, 99, 221|255, 255, 255/.test(w.released)],
    ['icon-only', 'unpainted', 'an icon-only button\'s own `color`; its glyph reads its own variable, and nothing paints with it',
        (w, s) => w.group === 'button' && w.property === 'color' && w.released === 'rgba(0, 0, 0, 1)' && w.dev === 'rgba(255, 255, 255, 1)' && /#\d+$/.test(w.key.trim())],
    ['form', 'intentional', '#22368 (PR #22445): fields read the control font size, `border-strong`, `background-field` and `radius-small`; dark fieldsets are raised (3,526 differences declared)',
        (w, s) => w.group === 'field' || w.group === 'fieldset'],
    ['dialog-footer', 'intentional', '#22463 (PR #22466): the dialog example\'s actions dock as its footer, whose compact buttons #22393 binds to `control-height-small`',
        (w, s) => s === 'examples/dialog' && (w.property === 'height' || (w.group === 'toolbar' && /^(padding-(top|left)|border-top-(color|style|width))$/.test(w.property)))],
    ['grid-header', 'intentional', '#22389 (PR #22431): header caption size, semibold, `0 10px`, raised fill, muted label, `border-default` separator; rules 16–18',
        (w, s) => w.group === 'grid-header'],
    ['grid-header-cell', 'intentional', '#22389 (PR #22431): the header cells are buttons; same table',
        (w, s) => w.group === 'button' && GRIDISH.test(s) && (
            (w.property === 'padding-left' && w.released === '12px' && w.dev === '10px') ||
            (w.property === 'font-size' && /^(11|13)px$/.test(w.released) && w.dev === '12px') ||
            (w.property === 'font-weight' && w.released === '400' && w.dev === '600') ||
            /93, 131, 167|24, 36, 73|240, 241, 244|255, 255, 255, 1\)$/.test(w.released) && /255, 255, 255|37, 41, 52|151, 158, 178|62, 68, 88/.test(w.dev))],
    ['grid-body', 'intentional', '#22389 (PR #22431): grid text reads `control-font-size-medium` (13→14px, declared) and `text-default`; no zebra',
        (w, s) => w.group === 'grid-row' && w.property !== '(element)'],
    ['grid-header-bar', 'intentional', '#22389 (PR #22431): the header bar inherits the grid font and reads the raised fill and muted label',
        (w, s) => w.group === 'toolbar' && GRIDISH.test(s) && (
            (w.property === 'font-size' && w.released === '13px' && w.dev === '14px') ||
            /255, 255, 255, 1\)$|240, 241, 244/.test(w.released) && /62, 68, 88|151, 158, 178/.test(w.dev))],
    ['dialog', 'intentional', '#22393 (PR #22436): title and header tools read neutral text, bars raised, edge `border-default`, `elevation-3`; rules 17–19',
        (w, s) => /^examples\/(dialog|gantt\/taskEditor|scheduler\/eventEditor)$/.test(s) && (/dialog/.test(w.group) || /67, 93, 177|84, 114, 228/.test(w.released) || w.property === 'box-shadow' || /221, 221, 221|29, 46, 98/.test(w.released))],
    ['accordion', 'intentional', '#22443 (PR #22446): accordion headers read `control-height-large` (50→48px, declared) and `text-default`',
        (w, s) => s === 'examples/container/accordion' && w.group === 'toolbar' && (w.property === 'height' || w.released === 'rgba(0, 0, 0, 1)')],
    ['container', 'intentional', '#22443 (PR #22446): panel header text `text-muted`, header border `border-default`, container fill `background-surface`',
        (w, s) => (w.group === 'panel' || w.group === 'toolbar') && (
            (w.property === 'color' && w.released === 'rgba(102, 102, 102, 1)') ||
            (w.property === 'border-top-color' && w.released === 'rgba(221, 221, 221, 1)') ||
            (w.property === 'background-color' && /0, 0, 0, 0\)$/.test(w.released) && /249, 250, 251|14, 15, 19/.test(w.dev)))],
    ['bar-raised', 'intentional', '#22397 (PR #22435): bars read `background-surface-raised` and separators `border-default`; rule 18',
        (w, s) => (w.group === 'toolbar' || w.group === 'dialog-header') && (
            (w.property === 'background-color' && w.released === 'rgba(13, 15, 18, 1)' && w.dev === 'rgba(37, 41, 52, 1)') ||
            w.property === 'box-shadow')],
    ['switcher-selector', 'intentional', '#22326 (PR #22327): the example\'s own switcher rule matches the renamed class',
        (w, s) => s === 'examples/board/dueDates' && w.property === 'color'],
    ['button-selected', 'intentional', 'rule 15: `background-selected` sits one grade past `accent-subtle` (light `#c4d6ff`, dark `#233c8f`)',
        (w, s) => w.group === 'button' && w.property === 'background-color' && /214, 225, 255|24, 36, 73/.test(w.released) && /196, 214, 255|35, 60, 143/.test(w.dev)],
    ['button-disabled', 'intentional', '#22351 (PR #22420): disabled paint reads the disabled roles; rule 6',
        (w, s) => /182, 189, 180|94, 103, 129/.test(w.released) && /181, 186, 201|102, 111, 137/.test(w.dev)],
    ['button-border', 'intentional', 'rule 4 (PR #22452): a button\'s border is the `border-default` hairline, 14.0\'s weight at hue 270',
        (w, s) => w.property === 'border-top-color' && w.released === 'rgba(211, 215, 210, 1)' && w.dev === 'rgba(211, 214, 222, 1)'],
    ['tertiary', 'intentional', '#22351 (PR #22420): a tertiary button reads `text-accent`, dark `accent-400`',
        (w, s) => /84, 114, 228/.test(w.released) && /116, 153, 251/.test(w.dev)],
    ['hue-270', 'intentional', 'PR #22352 (step 5): the neutral ramp moves to hue 270; same role, same weight',
        (w, s) => HUE.get(w.released) === w.dev || (w.released === 'rgba(0, 0, 0, 1)' && w.dev === 'rgba(14, 15, 19, 1)')],
    ['app-wins', 'intentional', '#22297 and #22349 (PR #22358): the app\'s or example\'s own rules and `--neo-*` declarations now apply; in 14.0 the theme\'s rule or an unread name hid them',
        (w, s) => /dashboard\/(desk|tearOut|choreography|crossWindow)|apps\/workstation/.test(s) && (/^(padding-(left|top)|height)$/.test(w.property) || /apps\/workstation/.test(s) && /color/.test(w.property) || w.released === 'rgba(13, 15, 18, 1)' && w.dev === 'rgba(20, 26, 35, 1)')],
    ['classic-scope', 'equal-paint', 'a classic-theme scope inside the page; the frames match pixel for pixel',
        (w, s) => s === 'examples/tab/container']
];

const table = new Map(), unclassified = [];

for (const run of report.runs) {
    for (const w of run.rows || []) {
        const rule = RULES.find(([, , , test]) => test(w, run.surface, run.scheme));
        if (!rule) {unclassified.push(`${run.surface} ${run.scheme.slice(14)} | ${w.key.slice(0, 40)} | ${w.property} ${w.released} -> ${w.dev}`); continue}
        const [id, verdict, decision] = rule, e = table.get(id) || {id, verdict, decision, rows: 0, surfaces: new Set()};
        e.rows++; e.surfaces.add(run.surface); table.set(id, e)
    }
}

const rows = [...table.values()].sort((a, b) => b.rows - a.rows);
fs.writeFileSync(path.join(runDir, 'verdicts.json'), JSON.stringify(rows.map(e => ({...e, surfaces: [...e.surfaces]})), null, 1));

for (const e of rows) console.log(`${String(e.rows).padStart(5)} ${e.verdict.padEnd(11)} ${e.id.padEnd(18)} ${e.surfaces.size} surfaces | ${e.decision}`);
console.log(`total ${rows.reduce((n, e) => n + e.rows, 0)} classified, ${unclassified.length} unclassified`);
unclassified.forEach(line => console.log('  UNCLASSIFIED', line));
