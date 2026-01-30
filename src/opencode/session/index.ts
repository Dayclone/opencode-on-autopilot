import * as vscode from 'vscode';
import { ChildProcess } from 'child_process';
import { processUtils } from '../../utils/process';
import { fsUtils } from '../../utils/fs';
import {
    opencodeProcess, sessionReady, currentMessage, processingQueue, isResettingSession,
    setOpenCodeProcess, setSessionReady, setCurrentMessage, setProcessingQueue, setIsResettingSession
} from '../../core/state';
import { debugLog, formatTerminalOutput, sendToWebviewTerminal } from '../../utils/logging';
import { getErrorMessage } from '../../utils/error-handler';
import { showInfo, showError, showErrorFromException, Messages } from '../../utils/notifications';
import { DebugEmojis, formatDebugMessage } from '../../core/constants/ui-strings';
import { updateWebviewContent, updateSessionState } from '../../ui/webview';
import { sendOpenCodeOutput, clearOpenCodeOutput } from '../../opencode/output';
import { handleUsageLimit, isCurrentUsageLimit } from '../../services/usage';
import { startHealthCheck, stopHealthCheck } from '../../services/health';
import { startSleepPrevention, stopSleepPrevention } from '../../services/sleep';
import { runDependencyCheck, showDependencyStatus } from '../../services/dependency-check';

export async function startOpenCodeSession(skipPermissions: boolean = true): Promise<void> {
    debugLog('=== STARTING OPENCODE SESSION ===');
    
    try {
        if (opencodeProcess) {
            showInfo(Messages.SESSION_ALREADY_RUNNING);
            debugLog('OpenCode session already running - aborting');
            return;
        }

        // Check dependencies before starting
        debugLog(formatDebugMessage(DebugEmojis.SEARCH, 'Checking dependencies...'));
        let dependencyResults: Awaited<ReturnType<typeof runDependencyCheck>>;
        try {
            dependencyResults = await runDependencyCheck();
        } catch (error) {
            debugLog(formatDebugMessage(DebugEmojis.ERROR, `Failed to check dependencies: ${error}`));
            showErrorFromException(error, 'Failed to check dependencies');
            return;
        }
        
        // Check if all critical dependencies are ready
        const allReady = dependencyResults.opencode.available && 
                        dependencyResults.python.available && 
                        dependencyResults.wrapper.available;
        
        debugLog(`🔍 Dependency check results:
  OpenCode CLI: ${dependencyResults.opencode.available ? '✅' : '❌'} ${dependencyResults.opencode.available ? dependencyResults.opencode.version : dependencyResults.opencode.error}
  Python: ${dependencyResults.python.available ? '✅' : '❌'} ${dependencyResults.python.available ? dependencyResults.python.version : dependencyResults.python.error}
  PTY Wrapper: ${dependencyResults.wrapper.available ? '✅' : '❌'} ${dependencyResults.wrapper.available ? dependencyResults.wrapper.version : dependencyResults.wrapper.error}`);
        
        if (!allReady) {
            debugLog('❌ BLOCKING SESSION START - Dependencies not satisfied');
            showDependencyStatus(dependencyResults);
            debugLog('❌ SESSION START ABORTED - Returning early due to missing dependencies');
            return;
        }
        
        debugLog('✅ All dependencies satisfied, proceeding with session start');

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const cwd = workspaceFolder?.uri.fsPath || process.cwd();
        
        debugLog(`Working directory: ${cwd}`);
        debugLog('Spawning OpenCode process...');
        
        // Use the detected Python path
        const pythonPath = dependencyResults.python.path || 'python3';
        
        // Verify wrapper file exists
        const wrapperPath = dependencyResults.wrapper.path;
        if (!wrapperPath) {
            const errorMsg = 'OpenCode PTY wrapper not found. Please reinstall the extension.';
            showError(errorMsg);
            debugLog('❌ PTY wrapper file not found');
            throw new Error(errorMsg);
        }
        
        // Verify wrapper file is readable
        try {
            if (!fsUtils.existsSync(wrapperPath)) {
                throw new Error('Wrapper file does not exist');
            }
            fsUtils.accessSync(wrapperPath, fsUtils.constants.R_OK);
        } catch (error) {
            const errorMsg = `Cannot access PTY wrapper: ${getErrorMessage(error)}`;
            showError(errorMsg);
            debugLog(formatDebugMessage(DebugEmojis.ERROR, `Cannot access wrapper file: ${error}`));
            throw new Error(errorMsg);
        }
    
        // On Windows, we need to run the Python wrapper through WSL since PTY requires Unix-like system calls
        let command: string;
        let args: string[];
        
        if (process.platform === 'win32') {
            // Convert Windows path to WSL path
            // Handle both absolute and relative paths, and all drive letters
            let wslWrapperPath = wrapperPath;
            
            // Convert drive letter (e.g., C: -> /mnt/c, D: -> /mnt/d)
            wslWrapperPath = wslWrapperPath.replace(/^([A-Za-z]):/, (match, driveLetter) => {
                return `/mnt/${driveLetter.toLowerCase()}`;
            });
            
            // Convert backslashes to forward slashes
            wslWrapperPath = wslWrapperPath.replace(/\\/g, '/');
            
            command = 'wsl';
            args = ['--', 'python3', wslWrapperPath];
            if (skipPermissions) {
                args.push('--skip-permissions');
            }
            debugLog(`Original path: ${wrapperPath}`);
            debugLog(`WSL path: ${wslWrapperPath}`);
            debugLog(`Executing: ${command} ${args.join(' ')}`);
        } else {
            command = pythonPath;
            args = [wrapperPath];
            if (skipPermissions) {
                args.push('--skip-permissions');
            }
            debugLog(`Using Python: ${pythonPath}`);
            debugLog(`Using wrapper: ${wrapperPath}`);
        }
        
        let spawnedProcess: ChildProcess;
        try {
            spawnedProcess = processUtils.spawn(command, args, {
                cwd: cwd,
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { 
                    ...process.env,
                    TERM: 'xterm-256color',
                    COLUMNS: '120',
                    LINES: '30'
                }
            });
        } catch (error) {
            const errorMsg = `Failed to spawn OpenCode process: ${getErrorMessage(error)}`;
            showError(errorMsg);
            debugLog(formatDebugMessage(DebugEmojis.ERROR, `Process spawn error: ${error}`));
            throw new Error(errorMsg);
        }

        if (!spawnedProcess || !spawnedProcess.pid) {
            const errorMsg = 'Failed to start OpenCode process - no process ID';
            showError(errorMsg);
            debugLog('❌ Failed to start OpenCode process - no PID');
            throw new Error(errorMsg);
        }

    setOpenCodeProcess(spawnedProcess);
    debugLog(`✓ OpenCode process started successfully`);
    debugLog(`Process PID: ${spawnedProcess.pid}`);
    
    spawnedProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        
        sendOpenCodeOutput(output);
        
        if (output.includes('usage limit reached') || output.includes('rate limit')) {
            debugLog('⚠️ POTENTIAL USAGE LIMIT DETECTED');
            debugLog(`📋 Usage limit output: ${output}`);
            if (currentMessage && isCurrentUsageLimit(output)) {
                debugLog('✅ Confirmed: This is a current usage limit');
                handleUsageLimit(output, currentMessage);
            } else {
                debugLog('⚠️ Skipped: Usage limit is old or not within 6-hour window');
            }
            return;
        }
        
        const authErrors = [
            'authentication failed',
            'Please authenticate',
            'API key'
        ];
        const isAuthError = authErrors.some(authError => output.toLowerCase().includes(authError.toLowerCase()));
        
        if (isAuthError) {
            debugLog('🔐 AUTHENTICATION ERROR detected');
            setSessionReady(false);
            if (currentMessage) {
                currentMessage.status = 'error';
                currentMessage.error = 'CLI authentication failed';
                updateWebviewContent();
            }
            vscode.window.showErrorMessage('OpenCode CLI authentication failed');
            return;
        }
        
        const permissionPrompts = [
            'Do you want to make this edit to',
            'Do you want to create',
            'Do you want to delete',
            'Do you want to read',
            'Would you like to',
            'Proceed with',
            'Continue?'
        ];
        
        const hasPermissionPrompt = permissionPrompts.some(prompt => output.includes(prompt));
        
        // Detect the CLI ready prompt either by the textual hint or the ANSI-styled prompt line
        const shortcutsPromptRegex = /\\u001b\[39m\\u001b\[22m\s>\s\\u001b\[7mT\\u001b\[27m/;
        const isReady = output.includes('? for shortcuts') || 
                        output.includes('Ask anything...') || 
                        output.includes('ctrl+p commands') ||
                        shortcutsPromptRegex.test(JSON.stringify(output));

        if (hasPermissionPrompt && !sessionReady) {
            debugLog('🛡️ Permission prompt detected during startup - session ready for user interaction');
            setSessionReady(true);
            startHealthCheck();
            startSleepPrevention();
            updateSessionState();
            
            // Check for pending messages to auto-start
            setTimeout(async () => {
                const { tryAutoStartProcessing } = await import('../../queue/manager');
                tryAutoStartProcessing();
            }, 500);
            
            vscode.window.showInformationMessage('OpenCode is asking for permission. Use the OpenCode output area to navigate and select your choice.');
        } else if (isReady && !sessionReady) {
            debugLog('✅ OpenCode ready prompt detected during startup');
            setSessionReady(true);
            startHealthCheck();
            startSleepPrevention();
            updateSessionState();
            
            // Check for pending messages to auto-start
            setTimeout(async () => {
                const { tryAutoStartProcessing } = await import('../../queue/manager');
                tryAutoStartProcessing();
            }, 500);
            
            vscode.window.showInformationMessage('OpenCode session started and ready! You can now process the message queue.');
        }
    });

    spawnedProcess.stderr?.on('data', (data: Buffer) => {
        const error = data.toString();
        debugLog(`📥 STDERR: ${error}`);
        
        const formattedError = formatTerminalOutput(error, 'error');
        sendToWebviewTerminal(formattedError);
    });

    spawnedProcess.on('close', (code: number | null) => {
        debugLog(`🔚 PROCESS CLOSED with code: ${code} (PID: ${spawnedProcess.pid})`);
        
        // Always force UI sync on reset
        if (isResettingSession) {
            clearOpenCodeOutput();
        }
        
        // Only update state if this is the active process
        if (opencodeProcess === spawnedProcess) {
            setSessionReady(false);
            stopHealthCheck();
            stopSleepPrevention();
            
            const wasProcessing = processingQueue;
            const resetting = isResettingSession;
            
            // Reset the flag immediately
            setIsResettingSession(false);
            
            if (!resetting) {
                setProcessingQueue(false);
            }
            
            const closeMessage = formatTerminalOutput(`OpenCode process closed with code: ${code}`, 'info');
            sendToWebviewTerminal(closeMessage);
            
            if (currentMessage && currentMessage.status === 'processing') {
                if (resetting) {
                    // Do nothing, the next message handler will take over
                } else {
                    debugLog(`❌ Current message #${currentMessage.id} marked as error due to process closure`);
                    currentMessage.status = 'error';
                    currentMessage.error = `OpenCode process closed unexpectedly (code: ${code})`;
                    setCurrentMessage(null);
                }
            }
            
            setOpenCodeProcess(null);
            updateWebviewContent();
            updateSessionState();
            
            if (!resetting) {
                if (wasProcessing) {
                    vscode.window.showWarningMessage('OpenCode process closed unexpectedly while processing. You can restart the session.');
                } else {
                    vscode.window.showInformationMessage('OpenCode session ended');
                }
            }
        } else {
            debugLog(`ℹ️  Ignoring close event for inactive process (PID: ${spawnedProcess.pid})`);
        }
        debugLog('=== OPENCODE SESSION ENDED ===');
    });

    spawnedProcess.on('error', (error: Error) => {
        debugLog(`💥 PROCESS ERROR: ${error.message}`);
        
        setSessionReady(false);
        stopHealthCheck();
        stopSleepPrevention();
        
        // Output flushing handled elsewhere
        
        const wasProcessing = processingQueue;
        setProcessingQueue(false);
        
        const errorMessage = formatTerminalOutput(`OpenCode process error: ${error.message}`, 'error');
        sendToWebviewTerminal(errorMessage);
        
        if (currentMessage && currentMessage.status === 'processing') {
            debugLog(`❌ Current message #${currentMessage.id} marked as error due to process error`);
            currentMessage.status = 'error';
            currentMessage.error = `OpenCode process error: ${error.message}`;
            setCurrentMessage(null);
        }
        
        setOpenCodeProcess(null);
        
        updateWebviewContent();
        updateSessionState();
        
        if (wasProcessing) {
            vscode.window.showErrorMessage(`OpenCode process error while processing: ${error.message}`);
        } else {
            vscode.window.showErrorMessage(`OpenCode process error: ${error.message}`);
        }
        debugLog('=== OPENCODE SESSION ENDED WITH ERROR ===');
    });

    } catch (error) {
        // Global catch block for any unexpected errors during session startup
        const errorMsg = `Failed to start OpenCode session: ${getErrorMessage(error)}`;
        debugLog(formatDebugMessage(DebugEmojis.ERROR, `OpenCode session startup failed: ${error}`));
        vscode.window.showErrorMessage(errorMsg);
        
        // Clean up any partial state
        if (opencodeProcess) {
            try {
                opencodeProcess.kill();
            } catch (killError) {
                debugLog(`❌ Error killing process during cleanup: ${killError}`);
            }
            setOpenCodeProcess(null);
        }
        
        setSessionReady(false);
        stopHealthCheck();
        stopSleepPrevention();
        updateSessionState();
        
        throw error; // Re-throw to allow callers to handle
    }
}

export function resetOpenCodeSession(keepProcessing: boolean = false): void {
    if (opencodeProcess) {
        if (keepProcessing) {
            setIsResettingSession(true);
        }
        opencodeProcess.kill();
        setOpenCodeProcess(null);
        setSessionReady(false);
    }
    
    stopSleepPrevention();
    setCurrentMessage(null);
    
    if (!keepProcessing) {
        setProcessingQueue(false);
    }
    
    updateWebviewContent();
    updateSessionState();
    if (!keepProcessing) {
        vscode.window.showInformationMessage('OpenCode session reset. You can now start a new session.');
    }
}

export function handleOpenCodeKeypress(key: string): void {
    if (!opencodeProcess || !opencodeProcess.stdin) {
        debugLog(`❌ Cannot send keypress: OpenCode process not available`);
        vscode.window.showWarningMessage('OpenCode process not available for keypress input');
        return;
    }

    debugLog(`⌨️  Sending keypress: ${key}`);
    
    try {
        switch (key) {
            case 'up':
                opencodeProcess.stdin.write('\x1b[A');
                break;
            case 'down':
                opencodeProcess.stdin.write('\x1b[B');
                break;
            case 'left':
                opencodeProcess.stdin.write('\x1b[D');
                break;
            case 'right':
                opencodeProcess.stdin.write('\x1b[C');
                break;
            case 'enter':
                opencodeProcess.stdin.write('\r');
                break;
            case 'escape':
                opencodeProcess.stdin.write('\x1b');
                break;
            default:
                debugLog(`❌ Unknown key: ${key}`);
                vscode.window.showWarningMessage(`Unknown key command: ${key}`);
                return;
        }
    } catch (error) {
        const errorMsg = `Failed to send keypress '${key}': ${getErrorMessage(error)}`;
        debugLog(formatDebugMessage(DebugEmojis.ERROR, `Keypress error: ${error}`));
        vscode.window.showErrorMessage(errorMsg);
    }
}
