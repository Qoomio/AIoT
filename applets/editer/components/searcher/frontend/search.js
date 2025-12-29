import qoomEvent from '../../../utils/qoomEvent.js';

let searchResults = [];
let selectedMatches = new Set();
let container = null;
let currentSearchOptions = { wholeWord: false, caseSensitive: false };
let currentSearchTerm = ''; // Store current search term for highlighting

async function searchInFiles(searchTerm, options = {}) {
    try {
        const response = await fetch('/editer/search/_api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                searchTerm,
                caseSensitive: options.caseSensitive || false,
                wholeWord: options.wholeWord || false,
                regex: options.regex || false,
                includePattern: options.includePattern || '',
                excludePattern: options.excludePattern || ''
            })
        });

        if (!response.ok) {
            throw new Error('Search request failed');
        }

        return await response.json();
    } catch (error) {
        console.error('Search error:', error);
        return { success: false, error: error.message };
    }
}

async function replaceInFiles(replacements, replaceText) {
    try {
        const response = await fetch('/editer/search/_api/replace', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                replacements,
                replaceText
            })
        });

        if (!response.ok) {
            throw new Error('Replace request failed');
        }

        return await response.json();
    } catch (error) {
        console.error('Replace error:', error);
        return { success: false, error: error.message };
    }
}

function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `search-message search-message-${type}`;
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 16px;
        background-color: ${type === 'error' ? '#d32f2f' : '#2d2d30'};
        color: #ffffff;
        border-radius: 4px;
        z-index: 10000;
        font-size: 12px;
    `;
    document.body.appendChild(messageDiv);
    setTimeout(() => { messageDiv.remove(); }, 3000);
}

function displaySearchResults(results) {
    const resultsContainer = container.querySelector('.results-list');
    const statusContainer = container.querySelector('.search-status');
    
    if (!results || !results.success) {
        statusContainer.textContent = 'Search failed: ' + (results?.error || 'Unknown error');
        resultsContainer.innerHTML = '';
        return;
    }

    const files = results.data || [];
    if (files.length === 0) {
        statusContainer.textContent = 'No results found';
        resultsContainer.innerHTML = '';
        return;
    }

    const totalMatches = files.reduce((sum, file) => sum + file.matches.length, 0);
    statusContainer.textContent = `${totalMatches} results in ${files.length} files`;

    resultsContainer.innerHTML = '';

    files.forEach(file => {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'result-file';

        const headerDiv = document.createElement('div');
        headerDiv.className = 'result-file-header';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'result-file-icon';
        iconSpan.textContent = '📄';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'result-file-name';
        nameSpan.textContent = file.path;

        const countSpan = document.createElement('span');
        countSpan.className = 'result-file-count';
        countSpan.textContent = file.matches.length;

        headerDiv.appendChild(iconSpan);
        headerDiv.appendChild(nameSpan);
        headerDiv.appendChild(countSpan);

        headerDiv.addEventListener('click', () => {
            toggleFileResults(file.path);
        });

        const matchesDiv = document.createElement('div');
        matchesDiv.className = 'result-matches';
        matchesDiv.id = 'matches-' + file.path.replace(/[^a-zA-Z0-9]/g, '_');

        // Track displayed lines to avoid duplicate line display
        const displayedLines = new Set();
        
        // Display each match, but only show each line once
        file.matches.forEach(match => {
            const lineKey = `${file.path}:${match.line}`;
            
            // Skip if this line was already displayed
            if (displayedLines.has(lineKey)) {
                return;
            }
            
            // Mark this line as displayed
            displayedLines.add(lineKey);
            
            const matchDiv = document.createElement('div');
            matchDiv.className = 'result-match';
            matchDiv.setAttribute('data-file', file.path);
            matchDiv.setAttribute('data-line', match.line);
            matchDiv.setAttribute('data-column', match.column);

            matchDiv.addEventListener('click', (e) => {
                if (e.target.closest('.result-replace-btn')) return;
                selectMatch(file.path, match.line, match.column, match.match);
            });

            const lineNumberSpan = document.createElement('span');
            lineNumberSpan.className = 'result-line-number';
            lineNumberSpan.textContent = match.line;

            const lineContentSpan = document.createElement('span');
            lineContentSpan.className = 'result-line-content';
            // Highlight only this specific match with proper word boundary handling
            lineContentSpan.innerHTML = highlightMatch(match.content, match.match, currentSearchOptions.wholeWord, currentSearchOptions.caseSensitive);

            const replaceBtn = document.createElement('button');
            replaceBtn.className = 'result-replace-btn';
            replaceBtn.title = 'Replace this match';
            replaceBtn.textContent = '⚡';
            replaceBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                replaceMatch(e, file.path, match.line, match.column);
            });

            matchDiv.appendChild(lineNumberSpan);
            matchDiv.appendChild(lineContentSpan);
            matchDiv.appendChild(replaceBtn);

            matchesDiv.appendChild(matchDiv);
        });

        fileDiv.appendChild(headerDiv);
        fileDiv.appendChild(matchesDiv);

        resultsContainer.appendChild(fileDiv);
    });

    searchResults = results.data;
    updateReplaceButtons();
}

function highlightMatch(content, matchText, wholeWord = false, caseSensitive = false) {
    // Escape special regex characters
    const escapedText = escapeRegex(matchText);
    
    // Build regex pattern
    let pattern;
    if (wholeWord) {
        // Use word boundaries to match only complete words
        // \b matches word boundaries (between \w and \W)
        pattern = `\\b${escapedText}\\b`;
    } else {
        // Match the text anywhere
        pattern = escapedText;
    }
    
    // Create regex with appropriate flags
    const flags = caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(`(${pattern})`, flags);
    
    return content.replace(regex, '<span class="result-match-highlight">$1</span>');
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toggleFileResults(filePath) {
    const matchesContainer = container.querySelector('#matches-' + filePath.replace(/[^a-zA-Z0-9]/g, '_'));
    if (matchesContainer) {
        matchesContainer.classList.toggle('expanded');
    }
}

function selectMatch(filePath, line, column, matchText) {
    // Extract fileName from filePath
    const fileName = filePath.split('/').pop() || filePath;
    
    // Emit event to open file in editor at specific line with search term for highlighting
    qoomEvent.emit('openFileAtLine', { 
        fileName, 
        filePath, 
        line, 
        column,
        searchTerm: currentSearchTerm,
        searchOptions: currentSearchOptions,
        matchText
    });

    const matchKey = `${filePath}:${line}:${column}`;
    const matchElement = container.querySelector(`[data-file="${filePath}"][data-line="${line}"][data-column="${column}"]`);
    
    if (matchElement) {
        if (selectedMatches.has(matchKey)) {
            selectedMatches.delete(matchKey);
            matchElement.classList.remove('selected');
        } else {
            selectedMatches.add(matchKey);
            matchElement.classList.add('selected');
        }
    }
    
    updateReplaceButtons();
}

function updateReplaceButtons() {
    const replaceBtn = container.querySelector('.replace-btn');
    const replaceAllBtn = container.querySelector('.replace-all-btn');
    const hasResults = searchResults.length > 0;
    const hasSelected = selectedMatches.size > 0;
    
    if (replaceBtn) replaceBtn.disabled = !hasSelected;
    if (replaceAllBtn) replaceAllBtn.disabled = !hasResults;
}

async function replaceMatch(event, filePath, line, column) {
    event.stopPropagation();
    const replaceText = container.querySelector('.replace-input').value;
    
    const fileResult = searchResults.find(f => f.path === filePath);
    const match = fileResult?.matches.find(m => 
        m.line === line && m.column === column
    );
    
    const replacements = [{
        file: filePath,
        line: line,
        column: column,
        originalText: match?.match || '',
        matchLength: match?.match?.length || 0
    }];
    
    const result = await replaceInFiles(replacements, replaceText);
    if (result.success) {
        await performSearch();
        showMessage('Match replaced successfully', 'success');
    } else {
        showMessage('Failed to replace match: ' + result.error, 'error');
    }
}

async function replaceSelected() {
    const replaceText = container.querySelector('.replace-input').value;
    const replacements = Array.from(selectedMatches).map(matchKey => {
        const [filePath, line, column] = matchKey.split(':');
        
        const fileResult = searchResults.find(f => f.path === filePath);
        const match = fileResult?.matches.find(m => 
            m.line === parseInt(line) && m.column === parseInt(column)
        );
        
        return {
            file: filePath,
            line: parseInt(line),
            column: parseInt(column),
            originalText: match?.match || '',
            matchLength: match?.match?.length || 0
        };
    });
    
    const result = await replaceInFiles(replacements, replaceText);
    if (result.success) {
        selectedMatches.clear();
        await performSearch();
        showMessage(`${replacements.length} matches replaced successfully`, 'success');
    } else {
        showMessage('Failed to replace matches: ' + result.error, 'error');
    }
}

async function replaceAll() {
    const replaceText = container.querySelector('.replace-input').value;
    const replacements = [];
    
    searchResults.forEach(file => {
        file.matches.forEach(match => {
            replacements.push({
                file: file.path,
                line: match.line,
                column: match.column,
                originalText: match.match,
                matchLength: match.match.length
            });
        });
    });
    
    const result = await replaceInFiles(replacements, replaceText);
    if (result.success) {
        selectedMatches.clear();
        await performSearch();
        showMessage(`${replacements.length} matches replaced successfully`, 'success');
    } else {
        showMessage('Failed to replace all matches: ' + result.error, 'error');
    }
}

async function performSearch() {
    const searchTerm = container.querySelector('.search-input').value.trim();
    if (!searchTerm) {
        container.querySelector('.search-status').textContent = 'Enter search term to begin';
        container.querySelector('.results-list').innerHTML = '';
        currentSearchTerm = ''; // Clear search term
        return;
    }

    container.querySelector('.search-status').textContent = 'Searching...';
    container.querySelector('.results-list').innerHTML = '';

    const caseSensitiveEl = container.querySelector('.case-sensitive');
    const wholeWordEl = container.querySelector('.whole-word');
    const regexEl = container.querySelector('.regex');
    const fileFilterEl = container.querySelector('.file-filter');
    const excludeFilterEl = container.querySelector('.exclude-filter');
    
    const options = {
        caseSensitive: caseSensitiveEl ? caseSensitiveEl.checked : false,
        wholeWord: wholeWordEl ? wholeWordEl.checked : false,
        regex: regexEl ? regexEl.checked : false,
        includePattern: fileFilterEl ? fileFilterEl.value.trim() : '',
        excludePattern: excludeFilterEl ? excludeFilterEl.value.trim() : ''
    };
    
    console.log('Search options:', options);
    console.log('Search term:', searchTerm);
    console.log('Regex mode:', options.regex);

    // Store current search term and options for highlighting
    currentSearchTerm = searchTerm;
    currentSearchOptions = {
        wholeWord: options.wholeWord,
        caseSensitive: options.caseSensitive,
        regex: options.regex
    };
    
    const results = await searchInFiles(searchTerm, options);
    
    if (!results.success && results.error) {
        // Show error message to user
        const statusContainer = container.querySelector('.search-status');
        if (statusContainer) {
            statusContainer.textContent = `Error: ${results.error}`;
            statusContainer.style.color = '#dc3545';
        }
        console.error('Search error:', results.error);
    } else {
        displaySearchResults(results);
    }
}

function setupSearchInterface() {
    const optionsBtn = container.querySelector('.search-options-btn');
    const optionsPanel = container.querySelector('.search-options');
    
    if (optionsBtn && optionsPanel) {
        optionsBtn.addEventListener('click', () => {
            optionsPanel.classList.toggle('active');
        });
    }

    const searchBtn = container.querySelector('.search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', performSearch);
    }

    const replaceBtn = container.querySelector('.replace-btn');
    const replaceAllBtn = container.querySelector('.replace-all-btn');
    
    if (replaceBtn) {
        replaceBtn.addEventListener('click', replaceSelected);
    }
    if (replaceAllBtn) {
        replaceAllBtn.addEventListener('click', replaceAll);
    }

    const searchInput = container.querySelector('.search-input');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch();
            }
        });

        searchInput.addEventListener('input', () => {
            selectedMatches.clear();
            updateReplaceButtons();
        });
    }
}

async function initialize(_container) {
    container = _container;
    
    // Load CSS if not already loaded
    if (!document.querySelector('link[href*="search.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/view/applets/editer/components/searcher/frontend/search.css';
        document.head.appendChild(link);
    }
    
    setupSearchInterface();
    
    // Focus search input
    const searchInput = container.querySelector('.search-input');
    if (searchInput) {
        setTimeout(() => searchInput.focus(), 100);
    }
}

export {
    initialize,
    performSearch
};
