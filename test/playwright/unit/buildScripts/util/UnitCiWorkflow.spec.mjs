import {test, expect}  from '@playwright/test';
import {spawnSync}     from 'node:child_process';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import * as yaml       from 'js-yaml';

const root     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const workflow = () => yaml.load(fs.readFileSync(path.join(root, '.github/workflows/test.yml'), 'utf8'));
const unit     = () => workflow().jobs.unit;
const step     = () => unit().steps.find(item => item.name === 'Run unit family');

/**
 * @summary Executes the workflow's own Bash with a fake npm that records calls and emits distinct reports.
 * @param {Object} options={} Probe selection and injected failure/report outcomes.
 * @returns {Object} Process result, recorded calls and retained per-invocation evidence.
 */
function exercise({suite = '', specs = '', repeat = '1', fail = '', missing = '', invalid = '', terminate = ''} = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-unit-family-')),
        bin   = path.join(dir, 'bin'),
        calls = path.join(dir, 'calls.jsonl');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'npm'), `#!/usr/bin/env node
const fs = require('fs');
const label = process.env.NEO_UNIT_TZ === 'Pacific/Kiritimati' ? 'plus14' :
    process.env.NEO_UNIT_TZ === 'Pacific/Niue' ? 'minus11' : 'main';
const output = process.argv.find(arg => arg.startsWith('--output='));
if (output) fs.mkdirSync(output.slice('--output='.length), {recursive: true});
fs.appendFileSync(process.env.CALLS, JSON.stringify({label, args: process.argv.slice(2), skip: process.env.NEO_TEST_SKIP_CI,
    jsonOverride: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME || process.env.PLAYWRIGHT_JSON_OUTPUT_FILE || null}) + '\\n');
if (process.env.MISSING !== label) {
    fs.mkdirSync('test/playwright/test-results/unit', {recursive: true});
    fs.writeFileSync('test/playwright/test-results/unit/test-results.json', process.env.INVALID === label ? '{' : JSON.stringify({label}));
}
console.log('report ' + label);
if (process.env.TERMINATE === label) process.kill(process.pid, 'SIGTERM');
process.exit(process.env.FAIL === label ? 1 : 0);
`, {mode: 0o755});
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', step().run], {
        cwd: dir, encoding: 'utf8', env: {...process.env, PATH: `${bin}:${process.env.PATH}`, CALLS: calls,
            PROBE_SUITE        : suite, PROBE_SPECS: specs, PROBE_REPEAT: repeat, IS_PROBE: 'true',
            NEO_TEST_SKIP_CI   : 'true', FAIL: fail, MISSING: missing, INVALID: invalid, TERMINATE: terminate,
            GITHUB_STEP_SUMMARY: path.join(dir, 'summary')}
    });
    const seen  = fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse) : [],
        output  = path.join(dir, 'test/playwright/test-results/unit-family'),
        reports = Object.fromEntries(['main', 'plus14', 'minus11'].map(label => {
            const folder = path.join(output, label), report = path.join(folder, 'results.json');
            return [label, {log: fs.existsSync(path.join(folder, 'output.log')),
                artifacts: fs.existsSync(path.join(folder, 'artifacts')),
                report   : fs.existsSync(report) ? JSON.parse(fs.readFileSync(report, 'utf8')) : null}]
        }));
    const outcomePath = path.join(output, 'outcomes.tsv'),
        outcomes      = fs.existsSync(outcomePath) ? fs.readFileSync(outcomePath, 'utf8').trim().split('\n') : [];
    fs.rmSync(dir, {recursive: true, force: true});
    return {result, seen, reports, outcomes}
}

test('unit is one classifier-gated job with stale-head and failure artifacts', async () => {
    const job = unit();
    expect(job.name).toBe('unit');
    expect(job.strategy?.matrix).toBeUndefined();
    expect(job.needs).toContain('changes');
    expect(job.if).toContain('run_unit');
    expect(job.if).toContain('components');
    const selected = new Function('needs', 'github', 'inputs', `return ${job.if.slice(3, -2)}`);
    for (const runUnit of ['true', 'false']) {
        for (const eventName of ['pull_request', 'push', 'workflow_dispatch']) {
            for (const suite of ['', 'unit', 'unit-tz', 'components']) {
                expect(selected({changes: {outputs: {run_unit: runUnit}}}, {event_name: eventName}, {suite}))
                    .toBe(runUnit === 'true' && (eventName !== 'workflow_dispatch' || suite !== 'components'));
            }
        }
    }
    const head          = job.steps.find(item => item.id === 'head');
    const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor,
        run = new AsyncFunction('context', 'github', 'core', head.with.script);
    for (const [live, expected] of [['abc', 'true'], ['new', 'false']]) {
        const outputs = {}, summary = {addHeading() { return this }, addRaw() { return this }, async write() {}};
        await run({eventName: 'pull_request', repo: {owner: 'o', repo: 'r'}, payload: {pull_request: {number: 1, head: {sha: 'abc'}}}},
            {rest: {pulls: {get: async () => ({data: {head: {sha: live}}})}}},
            {setOutput: (key, value) => { outputs[key] = value }, notice() {}, summary});
        expect(outputs.current).toBe(expected)
    }
    expect(step().if).toContain('steps.head.outputs.current');
    expect(step().env).toMatchObject({NEO_TEST_SKIP_CI: 'true'});
    for (const key of ['PROBE_SUITE', 'PROBE_SPECS', 'PROBE_REPEAT', 'IS_PROBE']) expect(step().env).toHaveProperty(key);
    const artifact = job.steps.find(item => item.uses?.startsWith('actions/upload-artifact@'));
    expect(artifact.if).toContain('failure()');
    expect(artifact.with.path).toContain('test/playwright/test-results/unit-family')
});

test('ordinary selection executes all three in order and retains independent outputs', () => {
    const {result, seen, reports} = exercise();
    expect(result.status, result.stderr).toBe(0);
    expect(seen.map(item => item.label)).toEqual(['main', 'plus14', 'minus11']);
    for (const item of seen) expect(item).toMatchObject({skip: 'true', jsonOverride: null});
    for (const [label, retained] of Object.entries(reports)) {
        expect(retained).toEqual({log: true, artifacts: true, report: {label}})
    }
});

test('dispatch selects the requested tier and keeps spec tokens literal', () => {
    const main = exercise({suite: 'unit', specs: 'one.spec.mjs $(touch_INJECTION)', repeat: '3'}),
        tz     = exercise({suite: 'unit-tz'});
    expect(main.result.status, main.result.stderr).toBe(0);
    expect(main.seen.map(item => item.label)).toEqual(['main']);
    expect(main.seen[0].args).toContain('$(touch_INJECTION)');
    expect(main.seen[0].args).toContain('--repeat-each=3');
    expect(tz.result.status, tz.result.stderr).toBe(0);
    expect(tz.seen.map(item => item.label)).toEqual(['plus14', 'minus11'])
});

test('a failing, reportless or invalid-report task fails the step but does not suppress later tasks', () => {
    for (const options of [{fail: 'main'}, {fail: 'plus14'}, {fail: 'minus11'},
        {missing: 'plus14'}, {invalid: 'plus14'}]) {
        const {result, seen, outcomes} = exercise(options);
        expect(result.status).not.toBe(0);
        expect(seen.map(item => item.label)).toEqual(['main', 'plus14', 'minus11']);
        expect(outcomes).toHaveLength(3);
        expect(outcomes.some(row => row.endsWith('\t1'))).toBe(true)
    }
});

test('option-like spec tokens are refused before npm executes', () => {
    const {result, seen} = exercise({specs: '--list'});
    expect(result.status).not.toBe(0);
    expect(seen).toEqual([])
});

test('a killed invocation cannot leave a green aggregate even if its report exists', () => {
    const {result, seen, reports, outcomes} = exercise({terminate: 'plus14'});
    expect(result.status).not.toBe(0);
    expect(seen.map(item => item.label)).toEqual(['main', 'plus14', 'minus11']);
    expect(reports.plus14.report).toEqual({label: 'plus14'});
    expect(outcomes).toEqual(['main\t0', 'plus14\t143', 'minus11\t0']);
});
