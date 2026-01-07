import { exec } from 'child_process';
import dotenv from 'dotenv';
dotenv.config();

const { GIT_TOKEN = '' } = process.env;
const GIT_USER = process.env.GIT_USER || 'git';
const REMOTE_URL = GIT_TOKEN
  ? `https://${encodeURIComponent(GIT_USER)}:${encodeURIComponent(GIT_TOKEN)}@github.com/Qoomio/qoom2.git`
  : 'https://github.com/Qoomio/qoom2.git';

function runCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, { cwd: process.cwd(), shell: '/bin/bash', env: process.env }, (err, stdout, stderr) => {
            if (err) {
                const errorMessage = [stderr, stdout, err.message]
                    .filter(Boolean)
                    .join('\n')
                    .trim();
                return reject(new Error(errorMessage));
            }
            resolve(stdout);
        });
    });
}

function isLocalChangesError(message) {
    if (!message) return false;
    const lower = message.toLowerCase();
    return (
        lower.includes('please commit your changes or stash them') ||
        lower.includes('would be overwritten by merge') ||
        lower.includes('untracked working tree files would be overwritten by merge') ||
        lower.includes('cannot pull with rebase') ||
        lower.includes('your local changes to the following files') ||
        lower.includes('local changes') ||
        lower.includes('cannot merge') ||
        lower.includes('unstaged changes')
    );
}

async function deployHandler(req, res) {
    try {
        const deployScript = 'bash ./scripts/deploy.sh'         
        await runCommand(deployScript);
        res.status(202).json({ success: true, message: 'Deployment started', script: deployScript });
    } catch (err) {
        res.status(500).json({ success: false, error: err?.message || String(err) });
    }
}

async function remoteHandler(req, res) {
    try {
        await runCommand('git init -q || true');
        await runCommand(`git remote set-url origin "${REMOTE_URL}" || git remote add origin "${REMOTE_URL}"`);
        await runCommand('git fetch origin -q || true');
        res.json({ success: true, message: 'Remote Success!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err?.message || String(err) });
    }
}

async function getHeadShort() {
    try { return (await runCommand('git rev-parse --short HEAD')).trim(); }
    catch { return 'unknown'; }
}

async function pullHandler(req, res) {
    const strategy = (req?.query?.strategy || req?.body?.strategy || 'normal').toString();
    const target = (req?.query?.target || req?.body?.target || 'master').toString();



    try {
        // pre-check: local changes → return 409 so frontend can prompt
        if (strategy === 'normal') {
            const statusOut = await runCommand('git status --porcelain');
            if (statusOut && statusOut.trim().length > 0) {
                return res.status(409).json({
                    success: false,
                    errorCode: 'LOCAL_CHANGES',
                    message: 'Uncommitted local changes prevent pull. Choose a strategy.'
                });
            }
        }

        const beforeHead = await getHeadShort();

        if (strategy === 'stash') {
            const stashOut = await runCommand('git stash push -u -m "qoom-updater-auto-stash"');
            const pullOut = await runCommand(`git pull origin ${target}`);
            const popOut = await runCommand('git stash pop || true');
            const afterHead = await getHeadShort();
            return res.json({
                success: true,
                updated: beforeHead !== afterHead,
                message: `Pull Success with stash! ${beforeHead} -> ${afterHead}`,
                output: { stashOut, pullOut, popOut }
            });
        }

        if (strategy === 'force') {
            const fetchOut = await runCommand(`git fetch origin ${target}`);
            const resetOut = await runCommand(`git reset --hard origin/${target}`);
            const afterHead = await getHeadShort();
            return res.json({
                success: true,
                updated: beforeHead !== afterHead,
                message: `Force update Success! ${beforeHead} -> ${afterHead}`,
                output: { fetchOut, resetOut }
            });
        }

        const pullOut = await runCommand(`git pull origin ${target}`);
        const afterHead = await getHeadShort();
        res.json({ success: true, updated: beforeHead !== afterHead, message: `Pull Success! ${beforeHead} -> ${afterHead}`, output: { pullOut } });
    } catch (err) {
        console.error('GIT PULL ERROR:', err.message, '\nSTDERR/STACK:\n', err.stack);
        const message = err?.message || String(err);
        if (isLocalChangesError(message)) {
            return res.status(409).json({
                success: false,
                errorCode: 'LOCAL_CHANGES',
                message: 'Uncommitted local changes prevent pull. Choose a strategy.'
            });
        }
        res.status(500).json({ success: false, error: message });
    }
}

function pingHandler(req, res) {
    res.json({ ok: true, applet: 'updater' });
}

export default {
    prefix: '/updater',
    routes: [
        { method: 'GET', path: '/ping', handler: pingHandler },
        { method: 'POST', path: '/git/remote', handler: remoteHandler },
        { method: 'POST', path: '/git/pull', handler: pullHandler }, 
        { method: 'POST', path: '/deploy', handler: deployHandler }
        
    ]
};