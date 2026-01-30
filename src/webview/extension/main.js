// Main entry point - initializes all modules and sets up event handlers
import { addMessage } from './ui/session-controls.js';
import { updateButtonStates } from './ui/queue-manager.js';
import { loadHistory } from './features/history-manager.js';
import { requestDevelopmentModeSetting } from './features/development-tools.js';
import { sendGetSkipPermissionsSetting, sendUpdateSkipPermissionsSetting, sendGetHistoryVisibilitySetting, sendGetQueue } from './communication/vscode-api.js';
import { requestWebServerStatus, startWebServerStatusPolling } from './features/web-interface.js';
import { setupMessageHandler } from './communication/message-handler.js';
import { 
    showFileAutocomplete, 
    hideFileAutocomplete, 
    updateFileAutocomplete, 
    handleAutocompleteNavigation,
    fileAutocompleteState 
} from './features/file-autocomplete.js';
import { sendOpenCodeKeypress } from './communication/vscode-api.js';
import { flushPendingOpenCodeOutput } from './ui/output-handlers.js';

// Initialize the application
function initialize() {
    // Set up message handler for VS Code communication
    setupMessageHandler();
  
    // Initialize button states and load history
    updateButtonStates();
    loadHistory();
  
    // Request current queue
    sendGetQueue();
  
    // Check if development mode is enabled
    requestDevelopmentModeSetting();
  
    // Request initial skip permissions setting
    sendGetSkipPermissionsSetting();
  
    // Request initial history visibility setting
    sendGetHistoryVisibilitySetting();
  
    // Request initial web server status and start polling
    requestWebServerStatus();
    startWebServerStatusPolling();
  
    // Set up keyboard event handlers
    setupKeyboardHandlers();
  
    // Set up OpenCode output keyboard navigation
    setupOpenCodeOutputNavigation();
  
    // Set up file autocomplete handlers
    setupFileAutocompleteHandlers();
  
    // Set up cleanup handlers
    setupCleanupHandlers();
  
    // Set up skip permissions change handler
    setupSkipPermissionsHandler();
}

function setupKeyboardHandlers() {
    // Handle Enter key in textarea
    document.getElementById('messageInput').addEventListener('keydown', function (event) {
    // Handle autocomplete navigation first
        if (handleAutocompleteNavigation(event)) {
            return;
        }
      
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            addMessage();
        }
    });
}

function setupOpenCodeOutputNavigation() {
    // Handle keyboard navigation in OpenCode output area
    const opencodeOutput = document.getElementById('opencodeOutputContainer');

    // Make the OpenCode output area focusable
    opencodeOutput.addEventListener('click', function () {
        const outputElement = opencodeOutput.querySelector('.opencode-live-output');
        if (outputElement) {
            outputElement.focus();
        }
    });

    // Handle keyboard navigation when OpenCode output is focused
    opencodeOutput.addEventListener('keydown', function (event) {
        const outputElement = opencodeOutput.querySelector('.opencode-live-output');
        if (!outputElement || document.activeElement !== outputElement) {
            return;
        }

        switch (event.key) {
        case 'ArrowUp':
            event.preventDefault();
            sendOpenCodeKeypress('up');
            break;
        case 'ArrowDown':
            event.preventDefault();
            sendOpenCodeKeypress('down');
            break;
        case 'ArrowLeft':
            event.preventDefault();
            sendOpenCodeKeypress('left');
            break;
        case 'ArrowRight':
            event.preventDefault();
            sendOpenCodeKeypress('right');
            break;
        case 'Enter':
            event.preventDefault();
            sendOpenCodeKeypress('enter');
            break;
        case 'Escape':
            event.preventDefault();
            sendOpenCodeKeypress('escape');
            break;
        }
    });
}

function setupFileAutocompleteHandlers() {
    // Handle input changes to detect @ symbol and update autocomplete
    document.getElementById('messageInput').addEventListener('input', function (event) {
        const textarea = event.target;
        const cursorPosition = textarea.selectionStart;
        const textBeforeCursor = textarea.value.substring(0, cursorPosition);
      
        // Find the last @ symbol before cursor
        const lastAtIndex = textBeforeCursor.lastIndexOf('@');
      
        if (lastAtIndex !== -1) {
            // Check if @ is at start or preceded by whitespace
            const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' ';
            if (charBeforeAt === ' ' || charBeforeAt === '\n' || charBeforeAt === '\t' || lastAtIndex === 0) {
                // Extract query after @
                const queryAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
              
                // Check if query contains spaces or newlines (invalid for file reference)
                if (!queryAfterAt.includes(' ') && !queryAfterAt.includes('\n') && !queryAfterAt.includes('\t')) {
                    if (!fileAutocompleteState.isOpen) {
                        showFileAutocomplete(textarea, lastAtIndex);
                    } else if (queryAfterAt !== fileAutocompleteState.query) {
                        updateFileAutocomplete(queryAfterAt);
                    }
                    return;
                }
            }
        }
      
        // Hide autocomplete if conditions not met
        if (fileAutocompleteState.isOpen) {
            hideFileAutocomplete();
        }
    });

    // Hide autocomplete when clicking outside
    document.addEventListener('click', function (event) {
        const autocompleteContainer = document.getElementById('fileAutocompleteContainer');
        const messageInput = document.getElementById('messageInput');
      
        if (fileAutocompleteState.isOpen && 
          !autocompleteContainer?.contains(event.target) && 
          event.target !== messageInput) {
            hideFileAutocomplete();
        }
    });
}

function setupCleanupHandlers() {
    // Cleanup function to flush any pending OpenCode output before page closes
    window.addEventListener('beforeunload', function() {
        flushPendingOpenCodeOutput();
    });
}

function setupSkipPermissionsHandler() {
    // Handle changes to the skip permissions checkbox
    const skipPermissionsCheckbox = document.getElementById('skipPermissions');
    if (skipPermissionsCheckbox) {
        skipPermissionsCheckbox.addEventListener('change', function(event) {
            sendUpdateSkipPermissionsSetting(event.target.checked);
        });
    }
}


// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initialize);

// Import all modules needed for global access
import { startProcessing, stopProcessing, interruptOpenCode, resetSession, openSettings } from './ui/session-controls.js';
import { clearQueue, handleDragStart, handleDragOver, handleDrop } from './ui/queue-manager.js';
import { clearOpenCodeOutput } from './ui/output-handlers.js';
import { filterHistory, deleteAllHistory } from './features/history-manager.js';
import { simulateUsageLimit, clearAllTimers, debugQueueState, toggleDebugMode } from './features/development-tools.js';
import { startWebInterface, stopWebInterface, showWebInterfaceQR, openWebInterface } from './features/web-interface.js';

// Export commonly used functions for global access (for HTML onclick handlers)
window.addMessage = addMessage;
window.startProcessing = startProcessing;
window.stopProcessing = stopProcessing;
window.interruptOpenCode = interruptOpenCode;
window.resetSession = resetSession;
window.openSettings = openSettings;
window.clearQueue = clearQueue;
window.clearOpenCodeOutput = clearOpenCodeOutput;
window.loadHistory = loadHistory;
window.filterHistory = filterHistory;
window.deleteAllHistory = deleteAllHistory;
window.simulateUsageLimit = simulateUsageLimit;
window.clearAllTimers = clearAllTimers;
window.debugQueueState = debugQueueState;
window.toggleDebugMode = toggleDebugMode;
window.startWebInterface = startWebInterface;
window.stopWebInterface = stopWebInterface;
window.showWebInterfaceQR = showWebInterfaceQR;
window.openWebInterface = openWebInterface;
window.handleDragStart = handleDragStart;
window.handleDragOver = handleDragOver;
window.handleDrop = handleDrop;