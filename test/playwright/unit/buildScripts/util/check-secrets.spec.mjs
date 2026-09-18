import {test, expect}            from '@playwright/test';
import {execFileSync, spawnSync} from 'node:child_process';
import fs                        from 'node:fs';
import os                        from 'node:os';
import path                      from 'node:path';
import {fileURLToPath}           from 'node:url';

import {PATTERNS, findSecrets} from '../../../../../buildScripts/util/check-secrets.mjs';

const
    REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..'),
    GUARD     = path.join(REPO_ROOT, 'buildScripts/util/check-secrets.mjs'),
    /**
     * @param {String} alphabet
     * @param {Number} n
     * @returns {String} n characters cycling through the alphabet
     */
    fill = (alphabet, n) => Array.from({length: n}, (_, i) => alphabet[i % alphabet.length]).join(''),
    ALNUM = 'aB3dE5gH7jK9mN1pQ2sT4vW6yZ8',
    UPPER = 'QWERTYUIOPASDFGHJKLZXCVBNM0123456789';

/**
 * @summary `check-secrets` finds each credential shape it knows and nothing that merely looks like one.
 *
 * Every planted credential is built at runtime from its prefix and a filler, so this file carries no credential-shaped
 * literal of its own, and the guard reads it clean without an allow marker.
 */
test.describe('check-secrets', () => {
    // One planted value per shape, each the length the real credential has
    const planted = {
        'google-api-key'     : 'AIza' + fill(ALNUM, 35),
        'google-oauth-token' : 'ya29.' + fill(ALNUM, 40),
        'openai-key'         : 'sk-proj-' + fill(ALNUM, 60),
        'anthropic-key'      : 'sk-ant-api03-' + fill(ALNUM, 90),
        'github-token'       : 'ghp_' + fill(ALNUM, 36),
        'github-fine-grained': 'github_pat_' + fill(ALNUM, 22) + '_' + fill(ALNUM, 59),
        'aws-access-key-id'  : 'AKIA' + fill(UPPER, 16)
    };

    test('every pattern has a planted credential here', () => {
        expect(Object.keys(planted).sort()).toEqual(PATTERNS.map(({kind}) => kind).sort())
    });

    for (const [kind, value] of Object.entries(planted)) {
        test(`a planted ${kind} is found, on its line`, () => {
            expect(findSecrets(`const config = {\n    key: '${value}'\n}`)).toEqual([{line: 2, kind}])
        })
    }

    test('the legacy OpenAI shape is found too', () => {
        expect(findSecrets(`OPENAI_API_KEY=sk-${fill(ALNUM, 48)}`)).toEqual([{line: 1, kind: 'openai-key'}])
    });

    test('prose about a credential is not one: an elision, a placeholder, a short sample, a wrong length', () => {
        expect(findSecrets([
            'The redaction test feeds it AIza… and expects a mask.',
            "googleMapsApiKey: 'YOUR_GOOGLE_MAPS_API_KEY'",
            `github_pat_   : github_pat_11AB${fill(ALNUM, 18)}…`,
            'AIza' + fill(ALNUM, 34),
            'AIza' + fill(ALNUM, 36),
            'ghp_' + fill(ALNUM, 35),
            'AKIA' + fill(UPPER, 15)
        ].join('\n'))).toEqual([])
    });

    test('an allow marker with a reason excuses its own line only, and one without a reason is a finding', () => {
        const key = planted['google-api-key'];

        expect(findSecrets([
            `'${key}' // secret-scan-ok: revoked format sample for the docs`,
            `'${key}'`,
            `'${key}' // secret-scan-ok:`
        ].join('\n'))).toEqual([
            {line: 2, kind: 'google-api-key'},
            {line: 3, kind: 'allow-marker-without-reason'}
        ])
    });

    test('the report names file, line and kind, and never the credential', () => {
        const
            dir  = fs.mkdtempSync(path.join(os.tmpdir(), 'check-secrets-')),
            file = path.join(dir, 'config.json'),
            key  = planted['github-token'];

        try {
            fs.writeFileSync(file, `{\n    "token": "${key}"\n}\n`);

            const {status, stdout, stderr} = spawnSync(process.execPath, [GUARD, file], {encoding: 'utf8'}),
                  output                   = stdout + stderr;

            expect(status).toBe(1);
            expect(output).toContain(`${file}:2  github-token`);
            expect(output).not.toContain(key);
            expect(output).not.toContain(key.slice(4))
        } finally {
            fs.rmSync(dir, {force: true, recursive: true})
        }
    });

    test('it would have caught the Maps key the tutorial carried until its removal', () => {
        // The commit that removed the key, and the tutorial line that held it in its parent
        const blob = 'cf8aead274^:learn/tutorials/Earthquakes.md';

        test.skip(spawnSync('git', ['cat-file', '-e', blob], {cwd: REPO_ROOT}).status !== 0,
            'the checkout is shallow, so the parent commit is not in it');

        const text = execFileSync('git', ['show', blob], {cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});

        expect(findSecrets(text)).toEqual([{line: 1207, kind: 'google-api-key'}])
    })
});
