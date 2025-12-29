/**
 * Interactive JavaScript for Web Project
 */

/**
 * Initialize the application
 */
function initializeApp() {
    setupGreeting();
    setupAPITest();
    
    // Add some visual feedback
    console.log('✅ App initialized');
}

/**
 * Setup greeting functionality
 */
function setupGreeting() {
    const nameInput = document.getElementById('nameInput');
    const greetBtn = document.getElementById('greetBtn');
    const greeting = document.getElementById('greeting');
    
    // Add event listeners
    greetBtn.addEventListener('click', showGreeting);
    nameInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            showGreeting();
        }
    });
    
    function showGreeting() {
        const name = nameInput.value.trim();
        
        if (name) {
            greeting.textContent = `Hello, ${name}! Welcome to your web project! 🎉`;
            greeting.style.display = 'block';
            
            // Add some animation
            greeting.style.animation = 'none';
            setTimeout(() => {
                greeting.style.animation = 'fadeIn 0.3s ease';
            }, 10);
        } else {
            alert('Please enter your name first!');
            nameInput.focus();
        }
    }
}

/**
 * Setup API test functionality
 */
function setupAPITest() {
    const apiTestBtn = document.getElementById('apiTestBtn');
    const apiResult = document.getElementById('apiResult');
    
    apiTestBtn.addEventListener('click', testAPI);
    
    async function testAPI() {
        apiTestBtn.disabled = true;
        apiTestBtn.textContent = 'Testing...';
        
        try {
            // Test the backend API
            const response = await fetch('/api/hello');
            
            if (response.ok) {
                const data = await response.json();
                showAPIResult(JSON.stringify(data, null, 2), 'success');
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('API Test Error:', error);
            showAPIResult(`Error: ${error.message}`, 'error');
        } finally {
            apiTestBtn.disabled = false;
            apiTestBtn.textContent = 'Test API';
        }
    }
    
    function showAPIResult(result, type) {
        apiResult.textContent = result;
        apiResult.className = type;
        apiResult.style.display = 'block';
    }
}

/**
 * Utility function to format timestamps
 */
function formatTimestamp(date = new Date()) {
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

/**
 * Example async function for API calls
 */
async function makeAPICall(endpoint, options = {}) {
    try {
        const response = await fetch(endpoint, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API Call Error:', error);
        throw error;
    }
}

initializeApp();

export {
    initializeApp,
    setupGreeting,
    setupAPITest,
    formatTimestamp,
    makeAPICall
};