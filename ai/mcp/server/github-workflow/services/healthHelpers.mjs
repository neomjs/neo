/**
 * Pure helper functions for parsing `gh` CLI outputs.
 * These are deliberately free of any Neo/Base dependencies so they can be
 * unit-tested in isolation.
 */
export function combineOutput(stdout, stderr) {
  return `${stdout || ''}\n${stderr || ''}`;
}

export function parseAuthOutput(out) {
  // Returns { authenticated: boolean, error?: string }
  if (typeof out !== 'string') out = String(out || '');
  if (out.includes('Logged in to github.com')) {
    return { authenticated: true };
  }
  return { authenticated: false, error: 'Not logged in to github.com. Please run `gh auth login`.' };
}

export function parseVersionOutput(out, minVersion = '2.0.0') {
  // Returns { installed: boolean, versionOk: boolean, version: string|null, error?: string }
  if (typeof out !== 'string') out = String(out || '');

  const m = out.match(/gh version ([\d.]+)/);
  if (!m) {
    return { installed: false, versionOk: false, version: null, error: 'GitHub CLI is not installed. Please install it from https://cli.github.com/' };
  }
  const version = m[1];
  // Defer semver check to caller if they want; but provide a boolean using simple semver compare
  try {
    // lazy import semver to avoid adding runtime dependency here; caller likely already has it
    // but to keep this helper self-contained we implement a minimal compare
    const [majA, minA, patA] = version.split('.').map(n => parseInt(n || '0', 10));
    const [majB, minB, patB] = minVersion.split('.').map(n => parseInt(n || '0', 10));
    const versionOk = (majA > majB) || (majA === majB && (minA > minB || (minA === minB && patA >= patB)));

    if (versionOk) return { installed: true, versionOk: true, version };
    return { installed: true, versionOk: false, version, error: `gh version (${version}) is outdated. Please upgrade to at least ${minVersion}.` };
  } catch (e) {
    return { installed: true, versionOk: false, version, error: `Could not parse gh version: ${e.message}` };
  }
}

export function interpretExecError(err) {
  // Returns true if the error indicates gh is missing (ENOENT)
  if (!err) return false;
  if (err.code === 'ENOENT') return true;
  // some platforms may surface different messages
  const msg = String(err.message || err || '');
  if (/not found|ENOENT|is not recognized as an internal or external command/i.test(msg)) return true;
  return false;
}
