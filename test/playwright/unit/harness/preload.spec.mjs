import {expect, test} from '@playwright/test';
import {readFile}     from 'node:fs/promises';
import vm             from 'node:vm';

const preloadPath = new URL('../../../../harness/preload.cjs', import.meta.url);
const mainPath    = new URL('../../../../harness/main.mjs', import.meta.url);

/**
 * @summary Executes the CommonJS preload against capability-shaped Electron mocks without booting
 * Electron. Timers and DOM diagnostics are retained as inert seams; the test owns only the exposed
 * bridge contract.
 * @returns {Promise<Object>}
 */
async function loadPreload() {
    const
        invokes = [],
        exposed = {},
        source  = await readFile(preloadPath, 'utf8');

    vm.runInNewContext(source, {
        clearInterval() {},
        Date,
        document: {
            querySelector() { return null },
            querySelectorAll() { return [] }
        },
        process: {versions: {electron: '42.0.0'}},
        require(name) {
            if (name !== 'electron') throw new Error(`unexpected preload dependency: ${name}`);

            return {
                contextBridge: {
                    exposeInMainWorld(name, value) {
                        exposed.name  = name;
                        exposed.value = value
                    }
                },
                ipcRenderer: {
                    invoke(...args) {
                        invokes.push(args);
                        return Promise.resolve({ok: true, result: []})
                    },
                    send() {}
                }
            }
        },
        setInterval() { return 1 },
        window: {addEventListener() {}}
    });

    return {exposed, invokes}
}

test.describe('Electron harness preload capability', () => {
    test('exposes one Fleet promise capability and no raw transport or secret facts', async () => {
        const
            {exposed, invokes} = await loadPreload(),
            request            = {method: 'listAgents', params: {}};

        expect(exposed.name).toBe('neoShell');
        expect(Object.keys(exposed.value).sort()).toEqual(['fleetRequest', 'shellVersion']);
        expect(exposed.value.shellVersion).toBe('42.0.0');
        expect(exposed.value).not.toHaveProperty('bearerToken');
        expect(exposed.value).not.toHaveProperty('defineFleetAgent');
        expect(exposed.value).not.toHaveProperty('endpoint');
        expect(exposed.value).not.toHaveProperty('ipcRenderer');
        expect(exposed.value).not.toHaveProperty('node');

        await expect(exposed.value.fleetRequest(request)).resolves.toEqual({ok: true, result: []});
        expect(invokes).toEqual([['fleet-request', request]])
    })

    test('keeps credential capture in the one main-owned channel with no renderer input surface', async () => {
        const
            mainSource    = await readFile(mainPath, 'utf8'),
            preloadSource = await readFile(preloadPath, 'utf8');

        expect(preloadSource).not.toContain('window.prompt');
        expect(preloadSource).not.toContain('fleet-define-agent');
        expect(mainSource).not.toContain('<input');
        expect(mainSource).not.toContain("ipcMain.handle('fleet-define-agent'");
        expect(mainSource.match(/ipcMain\.handle\('fleet-request'/g)).toHaveLength(1);
        expect(mainSource).toContain("webContents.on('before-input-event'");
        expect(mainSource).toContain('inputEvent.preventDefault()');
        expect(mainSource).toContain('clipboard.readText()')
    })
});
