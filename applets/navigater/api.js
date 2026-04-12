/**
 * Navigater API Routes
 * Returns env for nav bar. Driven by CHALLENGER_ROLE in ecosystem.config.cjs (env):
 * - CHALLENGER_ROLE=student → env "student" → nav hides "Students" button only
 * - CHALLENGER_ROLE=teacher → env "teacher" → nav hides "Challenges" button only
 * - otherwise → both buttons shown (other nav buttons unchanged)
 */

function handleEnv(req, res) {
    const challengerRole = process.env.CHALLENGER_ROLE;
    const env = (challengerRole === 'student' || challengerRole === 'teacher') ? challengerRole : (process.env.NODE_ENV || 'user');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ env }));
}

const api = {
    routes: [
        { path: '/env', method: 'GET', handler: handleEnv }
    ]
};

export default api;

