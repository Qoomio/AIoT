/**
 * Navigater API Routes
 * Provides environment info for navigation bar
 */

function handleEnv(req, res) {
    const nodeEnv = process.env.NODE_ENV || 'development';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ env: nodeEnv }));
}

const api = {
    routes: [
        { path: '/env', method: 'GET', handler: handleEnv }
    ]
};

export default api;

