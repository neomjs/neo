import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {pruneOldDailyLogs, rotateLogFileIfNewDay} from '../../../../../../ai/daemons/orchestrator/Orchestrator.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

function tmpDir() {
    const dir = path.join(os.tmpdir(), `neo-orch-logrotate-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.ensureDirSync(dir);
    return dir;
}

test.describe('Neo.ai.daemons.Orchestrator log rotation', () => {
    test('rotateLogFileIfNewDay renames a prior-day log to <file>.YYYY-MM-DD; a today log + a missing file are no-ops', () => {
        const dir = tmpDir();

        // Prior-day file → rotated to `<file>.<prior-day>` (use 2 days to stay clear of midnight boundaries).
        const oldLog  = path.join(dir, 'orchestrator.log');
        fs.writeFileSync(oldLog, 'prior-day line\n');
        const priorMs  = Date.now() - 2 * DAY_MS;
        const priorDay = new Date(priorMs).toISOString().split('T')[0];
        fs.utimesSync(oldLog, new Date(priorMs), new Date(priorMs));

        rotateLogFileIfNewDay(oldLog);

        expect(fs.existsSync(oldLog)).toBe(false);
        expect(fs.existsSync(`${oldLog}.${priorDay}`)).toBe(true);

        // Today file (fresh mtime) → untouched, no archive created.
        const todayLog = path.join(dir, 'today.log');
        fs.writeFileSync(todayLog, 'today line\n');
        rotateLogFileIfNewDay(todayLog);
        expect(fs.existsSync(todayLog)).toBe(true);
        expect(fs.readdirSync(dir).filter(f => f.startsWith('today.log.'))).toEqual([]);

        // Missing file → no-op, no throw.
        expect(() => rotateLogFileIfNewDay(path.join(dir, 'nope.log'))).not.toThrow();

        fs.removeSync(dir);
    });

    test('pruneOldDailyLogs deletes archives older than retention, keeps recent + never touches the active file', () => {
        const dir      = tmpDir();
        const baseName = 'orchestrator.log';

        const active  = path.join(dir, baseName);
        const oldArch = path.join(dir, `${baseName}.2020-01-01`);
        const newArch = path.join(dir, `${baseName}.${new Date().toISOString().split('T')[0]}`);

        fs.writeFileSync(active, 'active\n');
        fs.writeFileSync(oldArch, 'old archive\n');
        fs.writeFileSync(newArch, 'recent archive\n');
        const oldMs = Date.now() - 60 * DAY_MS;
        fs.utimesSync(oldArch, new Date(oldMs), new Date(oldMs));

        pruneOldDailyLogs({dir, baseName, retentionDays: 30});

        expect(fs.existsSync(oldArch)).toBe(false); // older than 30d → pruned
        expect(fs.existsSync(newArch)).toBe(true);  // recent → kept
        expect(fs.existsSync(active)).toBe(true);   // active file → never pruned

        fs.removeSync(dir);
    });

    test('rotate-before-append keeps a prior-day log from becoming a mixed old+new active file (two-writer / restart edge)', () => {
        const dir = tmpDir();
        const log = path.join(dir, 'orchestrator.log');

        // A file left over from a prior day — e.g. across a restart at the day boundary, or written
        // by the daemon.mjs wrapper writer. Both writers now rotate-before-append, so neither can
        // advance the mtime past the boundary and leave a mixed old+new active file.
        fs.writeFileSync(log, 'prior-day line\n');
        const priorMs  = Date.now() - 2 * DAY_MS;
        const priorDay = new Date(priorMs).toISOString().split('T')[0];
        fs.utimesSync(log, new Date(priorMs), new Date(priorMs));

        // The rotate-before-append contract shared by Orchestrator.writeLog AND daemon.mjs::writeLog:
        // whichever writer fires first on the new day rotates, THEN appends to a fresh file.
        rotateLogFileIfNewDay(log);
        fs.appendFileSync(log, 'current-day line\n');

        expect(fs.readFileSync(log, 'utf8')).toBe('current-day line\n');             // active file: only new content
        expect(fs.readFileSync(`${log}.${priorDay}`, 'utf8')).toBe('prior-day line\n'); // prior day archived, not mixed

        fs.removeSync(dir);
    });
});
