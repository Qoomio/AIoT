import qoomEvent from '../../../../../utils/qoomEvent.js';

const dom = {
    tabs: []
}
let state;
let html;


function activateTab(pane, tabId) {
    pane.activateTab(tabId);
}

function updateTab(tab) {
    const $tab = dom.tabs[tab.paneId][tab.id];
    if(!$tab) return;
    if (tab.modified) {
        $tab.classList.add('modified')
    } else {
        $tab.classList.remove('modified')
    }

    dom.tabs[tab.paneId].forEach($tab => $tab.classList.remove('active'))
    if (tab.active) {
        $tab.classList.add('active')
    }
}

function addTab(e) {
    const pane = e.detail;
    const paneId = pane.id;
    const $pane = document.querySelector(`[data-pane="${paneId}"]`);
    renderTabs($pane, paneId);
}

function closedTabs(e) {
    const pane = e.detail;
    const paneId = pane.id;
    const $pane = document.querySelector(`[data-pane="${paneId}"]`);
    renderTabs($pane, paneId);
}

function renderTabs($pane, paneIndex) {
    const $tabList = $pane.querySelector(".tab-list");
    $tabList.innerHTML = state.layout.panes[paneIndex].tabs.map((tab, tabIndex) => {
        return html.replaceAll('{{active}}', tab.active ? 'active' : '')
                   .replaceAll('{{modified}}', tab.modified ? 'modified' : '')
                   .replaceAll('{{id}}', tabIndex)
                   .replaceAll('{{filePath}}', tab.filePath)
                   .replaceAll('{{fileName}}', tab.fileName)
    }).join('\n');
    dom.tabs[paneIndex] = [...$tabList.querySelectorAll('.tab')];

    dom.tabs[paneIndex].forEach(($tab, i) => {
        $tab.addEventListener('click', () => activateTab($pane.pane, i));
        $tab.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const filePath = $tab.getAttribute('data-file-path')
            state.context.showTabMenu(e, paneIndex, i, filePath)
        })
        $tab.querySelector('.tab-close').addEventListener('click', (e) => {
            state.layout.panes[paneIndex].closeTab(i);
        })
    })

}

function addEventListeners() {
    qoomEvent.on('tabModified', (e) => updateTab(e.detail));
    qoomEvent.on('addNewTab', addTab);
    qoomEvent.on('closedTabs', closedTabs);
    qoomEvent.on('activeTabChangedInPane', (e) =>  updateTab(e.detail.activeTab));
}

async function injectCSS() {
    // Check if CSS is already loaded
    if (document.querySelector('link[href*="tab.css"]')) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = '/view/applets/editer/components/editorLayout/editorPane/editorTab/frontend/tab.css';

        link.onload = () => {
            resolve();
        };
        link.onerror = (e) => {
            console.error('Failed to load Tab CSS');
            reject(e);
        };

        document.head.appendChild(link);
    });
}

async function injectHTML() {
	try {
		const response = await fetch("/view/applets/editer/components/editorLayout/editorPane/editorTab/frontend/tab.html");
		html = await response.text();
		const $panes = [...document.querySelectorAll(".editor-pane")];
        $panes.forEach(($pane) => {
            const paneIndex = parseInt($pane.getAttribute('data-pane'));
            renderTabs($pane, paneIndex);
        })
	} catch (error) {
		console.error("Failed to load tab template:", error);
	}
}

async function initialize(_state) {
	state = _state;
    await injectCSS();
    await injectHTML();

    addEventListeners();

    console.log('Editor Tabs initialized');
}

export {
    initialize
}