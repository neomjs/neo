/**
 * @module buildScripts/util/assertInteractivePrompt
 * @summary Fails fast before interactive CLI prompts when stdin is non-TTY and required flags are missing.
 */

/**
 * @summary Guards interactive CLI scripts against hanging indefinitely on non-TTY stdin.
 *
 * Interactive `buildScripts` entrypoints prompt via `inquirer` when required CLI options are omitted.
 * In non-TTY contexts (CI runners, background shells, coding-agent harnesses), `inquirer.prompt` blocks
 * indefinitely waiting for terminal input. Call this helper before invoking `inquirer.prompt` and before
 * creating any directories or files so unattended callers receive the exact flag invocation immediately.
 *
 * @param {Object} options
 * @param {String} options.command Example unattended CLI command supplying all required flags.
 * @param {Boolean} [options.isTTY=Boolean(process.stdin?.isTTY)] Whether stdin is attached to an interactive TTY.
 * @param {String[]} [options.missing] Explicit list of unresolved option names or flags.
 * @param {Array<{name: String}>} [options.questions] Inquirer question objects whose `.name` entries remain unresolved.
 * @returns {void}
 * @throws {Error} When unresolved prompts remain and `isTTY` is falsy.
 */
export function assertInteractivePrompt({
    command,
    isTTY = Boolean(process.stdin?.isTTY),
    missing,
    questions = []
} = {}) {
    const unresolved = missing ?? questions.map(question => question.name);

    if (unresolved.length === 0 || isTTY) {
        return;
    }

    throw new Error(
        `Unattended non-TTY execution cannot prompt for: ${unresolved.join(', ')}.\n` +
        `Pass explicit CLI flags instead: ${command}`
    );
}

export default assertInteractivePrompt;
