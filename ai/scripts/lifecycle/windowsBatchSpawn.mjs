/**
 * @summary Repo-owned Windows batch wrapper spawn request helpers.
 *
 * Node cannot execute `.cmd` / `.bat` wrappers through direct `spawn(file, args)`
 * on Windows. Keep the required shell hop scoped to batch wrappers, and keep the
 * quoting logic local to Neo instead of adding a broad subprocess dependency.
 *
 * @see ai/scripts/lifecycle/resumeHarness.mjs
 * @plane in-plane
 */

/**
 * @summary Detect Windows batch wrappers that require `cmd.exe` dispatch.
 *
 * @param {string} cmd
 * @returns {boolean}
 */
export function isWindowsBatchCommand(cmd) {
    return /\.(?:cmd|bat)$/i.test(cmd);
}

/**
 * @summary Quote one argument for a `cmd.exe /c` batch-wrapper command line.
 *
 * Windows `.cmd` / `.bat` files require `cmd.exe` dispatch. We keep that shell
 * hop scoped to batch wrappers, normalize line breaks that `cmd.exe` treats as
 * command separators, and escape cmd metacharacters before joining the command
 * string so caller payloads remain data.
 *
 * @param {string} value
 * @returns {string}
 */
export function quoteWindowsBatchArgument(value) {
    const stringValue = String(value).replace(/[\r\n]/g, ' ');

    if (stringValue.length === 0) return '""';

    return `"${stringValue.replace(/[()%!^"<>&|]/g, match => `^${match}`)}"`;
}

/**
 * @summary Build the command string consumed by `cmd.exe /c` for batch wrappers.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @returns {string}
 */
export function buildWindowsBatchCommandLine(cmd, args) {
    return [cmd, ...args].map(quoteWindowsBatchArgument).join(' ');
}

/**
 * @summary Build a spawn request that can execute Windows `.cmd` / `.bat` wrappers.
 *
 * POSIX hosts and native Windows executables keep the direct spawn path. Windows
 * batch files dispatch through `cmd.exe /d /s /v:off /c` with repo-owned quoting
 * instead of relying on Node's deprecated `spawn(file, args, {shell: true})`
 * concatenation path.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {string} [hostPlatform=process.platform]
 * @returns {{cmd: string, args: string[], options: Object}}
 */
export function createSpawnRequest(cmd, args, hostPlatform = process.platform) {
    if (hostPlatform === 'win32' && isWindowsBatchCommand(cmd)) {
        return {
            cmd    : process.env.ComSpec || process.env.COMSPEC || 'cmd.exe',
            args   : [
                '/d',
                '/s',
                '/v:off',
                '/c',
                buildWindowsBatchCommandLine(cmd, args)
            ],
            options: {stdio: 'ignore'}
        };
    }

    return {
        cmd,
        args,
        options: {stdio: 'ignore'}
    };
}
