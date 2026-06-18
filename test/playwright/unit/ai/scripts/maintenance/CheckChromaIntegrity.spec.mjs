import {test, expect} from '@playwright/test';
import {
    classifySqliteCheck,
    countFailedApiSteps,
    resolveCollectionNames,
    resolveSqlitePath
} from '../../../../../../ai/scripts/maintenance/checkChromaIntegrity.mjs';

test.describe('checkChromaIntegrity maintenance helpers', () => {
    test('classifies SQLite pragma output strictly', () => {
        expect(classifySqliteCheck('ok\n')).toEqual({
            ok    : true,
            output: 'ok'
        });

        expect(classifySqliteCheck('malformed inverted index for FTS5 table main.embedding_fulltext_search\n')).toEqual({
            ok    : false,
            output: 'malformed inverted index for FTS5 table main.embedding_fulltext_search'
        });
    });

    test('resolves the default Chroma SQLite path from the Memory Core config', () => {
        const sqlitePath = resolveSqlitePath({
            memoryCoreConfig: {
                engines: {
                    chroma: {
                        dataDir: '/tmp/neo-chroma'
                    }
                }
            }
        });

        expect(sqlitePath).toBe('/tmp/neo-chroma/chroma.sqlite3');
    });

    test('uses the configured KB and MC collection names', () => {
        expect(resolveCollectionNames({
            knowledgeBaseConfig: {
                collectionName: 'kb'
            },
            memoryCoreConfig: {
                collections: {
                    memory : 'memory',
                    session: 'sessions',
                    graph  : 'graph'
                }
            }
        })).toEqual(['kb', 'memory', 'sessions', 'graph']);
    });

    test('counts failed API probe steps', () => {
        expect(countFailedApiSteps([{
            steps: [{ok: true}, {ok: false}]
        }, {
            steps: [{ok: false}, {ok: false}]
        }])).toBe(3);
    });
});
