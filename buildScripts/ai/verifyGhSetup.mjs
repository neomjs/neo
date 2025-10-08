import { exec } from 'child_process';
import os from 'os';

const MIN_GH_VERSION = '2.0.0';

function runCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject({ error, stdout, stderr });
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

function getInstallInstructions() {
    switch (os.platform()) {
        case 'darwin':
            return 'Please install it with "brew install gh".';
        case 'linux':
            return 'Please install it using the instructions for your distribution: https://github.com/cli/cli#linux';
        case 'win32':
            return 'Please install it with "winget install --id GitHub.cli".';
        default:
            return 'Please install the GitHub CLI from https://cli.github.com/';
    }
}

async function checkGhInstalled() {
    try {
        await runCommand('gh --version');
        return true;
    } catch (e) {
        console.error('GitHub CLI is not installed.');
        console.error(getInstallInstructions());
        return false;
    }
}

async function checkGhAuth() {
    try {
        await runCommand('gh auth status');
        console.log('GitHub CLI is authenticated.');
        return true;
    } catch (e) {
        console.error('You are not logged into GitHub.');
        console.error('Please run "gh auth login" to authenticate.');
        return false;
    }
}

async function checkGhVersion() {
    try {
        const { stdout } = await runCommand('gh --version');
        const versionMatch = stdout.match(/gh version ([\d.]+)/);
        if (versionMatch) {
            const currentVersion = versionMatch[1];
            if (currentVersion >= MIN_GH_VERSION) {
                console.log(`GitHub CLI version is up to date (${currentVersion}).`);
                return true;
            } else {
                console.error(`Your gh version (${currentVersion}) is outdated. Please upgrade to at least ${MIN_GH_VERSION}.`);
                return false;
            }
        }
        return false;
    } catch (e) {
        return false;
    }
}

async function main() {
    if (await checkGhInstalled()) {
        await checkGhAuth();
        await checkGhVersion();
    }
}

main();
