import * as vscode from 'vscode';
import { MessageItem } from '../../core/types';
import { messageQueue, opencodeProcess, sessionReady, processingQueue, _currentMessage, setCurrentMessage, setProcessingQueue, setIsRunning, _isResettingSession, _setIsResettingSession } from '../../core/state';
import { debugLog } from '../../utils/logging';
import { getErrorMessage } from '../../utils/error-handler';
import { updateWebviewContent, updateSessionState } from '../../ui/webview';
import { saveWorkspaceHistory, ensureHistoryRun, updateMessageStatusInHistory, checkAndEndHistoryRunIfComplete, savePendingQueue } from '../../queue/processor/history';
import { _TIMEOUT_MS, ANSI_CLEAR_SCREEN_PATTERNS, TASK_TIMEOUT_MS } from '../../core/constants';
import { startOpenCodeSession, resetOpenCodeSession } from '../../opencode/session';
import { _getMobileServer } from '../../services/mobile/index';
import { getValidatedConfig } from '../../core/config';

// Debouncing for repeated debug messages
const _lastOutputLogTime = 0;
const _OUTPUT_LOG_DEBOUNCE_MS = 1000;

export async function processNextMessage(): Promise<void> {
    debugLog('--- PROCESSING NEXT MESSAGE ---');
    
    if (!processingQueue) {
        debugLog('Processing stopped by user');
        updateWebviewContent();
        updateSessionState();
        return;
    }
    
    const message = messageQueue.find(m => m.status === 'pending');
    if (!message) {
        debugLog('No pending messages found - queue complete');
        checkAndEndHistoryRunIfComplete();
        setProcessingQueue(false);
        setIsRunning(false);
        updateWebviewContent();
        updateSessionState();
        vscode.window.showInformationMessage('All tasks completed successfully.');
        return;
    }

    const config = getValidatedConfig();
    const useFreshSession = config.session.freshSessionPerMessage;

    if (useFreshSession && opencodeProcess) {
        debugLog('♻️ Fresh session mode - recycling session');
        resetOpenCodeSession(true);
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (!opencodeProcess) {
        debugLog('🚀 Starting session for next message');
        await startOpenCodeSession(config.session.skipPermissions);
        
        let waitCount = 0;
        while (!sessionReady && waitCount < 60) {
            await new Promise(resolve => setTimeout(resolve, 500));
            waitCount++;
        }
        
        if (!sessionReady) {
            debugLog('❌ Session failed to become ready');
            message.status = 'error';
            message.error = 'Failed to start OpenCode session';
            updateWebviewContent();
            return;
        }
    }

    debugLog(`📋 Processing message #${message.id}: ${message.text.substring(0, 50)}...`);
    message.status = 'processing';
    message.processingStartedAt = new Date().toISOString();
    updateMessageStatusInHistory(message.id, 'processing');
    setCurrentMessage(message);
    updateWebviewContent();
    saveWorkspaceHistory();
    
    try {
        // Wait for session to settle
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        await sendMessageToOpenCodeProcess(message);
        
        debugLog('⏰ Waiting for task completion...');
        await waitForPrompt();
        
        debugLog(`✓ Message #${message.id} completed`);
        message.status = 'completed';
        message.completedAt = new Date().toISOString();
        updateMessageStatusInHistory(message.id, 'completed');
        
        if (useFreshSession) {
            debugLog('♻️ Fresh session mode - killing session after message completion');
            resetOpenCodeSession(true);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        updateWebviewContent();
        saveWorkspaceHistory();
        savePendingQueue();
        
        setTimeout(() => {
            processNextMessage();
        }, 1000);
        
    } catch (error) {
        debugLog(`❌ Error: ${error}`);
        message.status = 'error';
        message.error = getErrorMessage(error);
        updateMessageStatusInHistory(message.id, 'error', undefined, message.error);
        
        if (useFreshSession) resetOpenCodeSession(true);
        
        updateWebviewContent();
        saveWorkspaceHistory();
        savePendingQueue();
        
        setTimeout(() => {
            processNextMessage();
        }, 1000);
    }
}

export async function sendMessageToOpenCodeProcess(message: MessageItem): Promise<void> {
    if (!opencodeProcess || !opencodeProcess.stdin) {
        throw new Error('OpenCode process not available');
    }

    debugLog(`📝 Sending message (${message.text.length} chars)`);
    
    // Chunked sending for reliability
    const text = message.text;
    const CHUNK_SIZE = 512;
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
        const chunk = text.substring(i, Math.min(i + CHUNK_SIZE, text.length));
        await new Promise<void>((resolve, reject) => {
            opencodeProcess!.stdin!.write(chunk, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Send enter key separately
    await new Promise<void>((resolve, reject) => {
        opencodeProcess!.stdin!.write('\r', (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
    
    debugLog(`✓ Message sent successfully`);
}

function waitForPrompt(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!opencodeProcess || !opencodeProcess.stdout) {
            reject(new Error('Process unavailable'));
            return;
        }

        // Use a line-based buffer for better performance and reliability
        const MAX_ANALYSIS_LINES = 100; 
        let lineBuffer: string[] = [];
        let lastMeaningfulOutputTime = Date.now();
        let lastCleanSnapshot = '';
        let lastCleanContent = '';
        let lastCleanLength = 0;
        let screenAnalysisTimer: NodeJS.Timeout | null = null;
        let promptDetectedTime = 0; // Track when prompt was first detected
        let completionPhraseDetectedTime = 0; // Track when completion phrase was detected
        let lastDataReceivedTime = Date.now(); // Track when any data was last received
        const analysisStartTime = Date.now(); // Track when analysis started
        
        const SCREEN_ANALYSIS_INTERVAL_MS = 250;
        const STABILITY_THRESHOLD_MS = 2000;  // Increased from 1500
        const PROMPT_GRACE_PERIOD_MS = 8000; // If prompt detected, allow 8s grace period (increased from 3s)
        const COMPLETION_PHRASE_GRACE_PERIOD_MS = 10000; // If completion phrase detected, wait 10s (increased from 5s)
        const NO_OUTPUT_TIMEOUT_MS = 15000; // If no new output for 15s after activity, consider complete (increased from 8s)
        const CONTENT_CHANGE_TOLERANCE = 50; // Ignore changes smaller than 50 chars (TUI noise)
        const MIN_TASK_TIME_MS = 30000; // Minimum 30 seconds before allowing task completion (increased from 15s)
        const _MIN_OUTPUT_FOR_THINKING = 200; // Minimum cleaned output length to consider "thinking started"

        const stripAnsi = (str: string) => str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
        
        const cleanForStability = (text: string): string => {
            return stripAnsi(text)
                .replace(/[▣·⬝■●┃╹│┌┐└┘├┤┬┴┼→←✱~]/g, '') // Remove TUI characters
                .replace(/\d+\.\d+s/g, '') // Remove duration timers
                .replace(/\d+,\d+\s+\d+%/g, '') // Remove usage stats like "14,575 82%"
                .replace(/\$\d+\.\d+/g, '') // Remove cost stats like "$0.05"
                .replace(/\(\$[\d.]+\)/g, '') // Remove cost in parentheses
                .replace(/\d+:\d+:\d+/g, '') // Remove timestamps
                .replace(/\d+:\d+\s*(AM|PM)/gi, '') // Remove time displays
                .replace(/Reply from.*?time<\d+ms/g, '') // Remove ping responses
                .replace(/ant_[\w-]+/g, '') // Remove model identifiers
                .replace(/Build\s+/g, '') // Remove build label
                .replace(/esc.*?interrupt/gi, '') // Remove interrupt hints
                .replace(/\s+/g, ' ')
                .trim();
        };
        
        // Patterns that indicate OpenCode has completed a task
        const completionPhrases = [
            'I have created',
            'I\'ve created',
            'I have written',
            'I\'ve written',
            'File created',
            'Successfully created',
            'Done!',
            'Task complete',
            'has been created',
            'has been written',
            '# Wrote',
            'I have updated',
            'I\'ve updated',
            'Changes applied',
            'Update complete',
            // Test completion patterns
            'passing',
            'tests passed',
            'All tests',
            'test suite',
            'Next Steps',
            'Summary',
            'Completion',
            'I have completed',
            'I\'ve completed',
            'The task is complete',
            'work is complete',
            'implementation is complete',
            'has been completed'
        ];
        
        // Patterns that indicate OpenCode is actively working
        const activeWorkPatterns = [
            '→ Read',
            '→ Edit',
            '→ Grep',
            '→ Write',
            '← Edit',
            '← Read',
            '~ Preparing',
            '~ Searching',
            '✱ Grep',
            '$ ls',
            '$ cat',
            '$ grep',
            'Preparing edit',
            'Preparing write',
            'Searching content',
            'Reading file'
        ];

        const permissionPrompts = [
            'Do you want to make this edit to',
            'Do you want to create',
            'Do you want to delete',
            'Do you want to read',
            'Would you like to',
            'Proceed with',
            'Continue?'
        ];

        // Patterns that indicate OpenCode has actually started processing (not just TUI noise)
        const realWorkPatterns = [
            'Thinking:',
            'I will',
            'I\'ll',
            'Let me',
            'Writing command',
            '→ Read',
            '→ Edit', 
            '→ Grep',
            '→ Write',
            '→ Bash',
            '→ Task',
            '← Read',
            '← Edit',
            '← Grep',
            '← Write',
            '✱ Grep',
            '~ Preparing',
            '~ Searching',
            '# Wrote',
            'I have created',
            'I\'ve created',
            'I have written',
            'Specification',
            'Pseudocode',
            'Architecture',
            'Refinement',
            'Goal:',
            // Test/npm related patterns
            '$ npm',
            '$ mocha',
            'passing',
            'failing',
            'test',
            'Config Core',
            'Queue Manager',
            'Error Handler',
            'Next Steps',
            // General work indicators
            'I\'m going to',
            'I\'m now',
            'I am',
            'Currently',
            'Working on',
            'Analyzing',
            'Reviewing',
            'Implementing',
            'Creating',
            'Updating',
            'Modifying'
        ];

        let hasStartedThinking = false;
        let hasSeenRealWork = false; // More strict - seen actual work patterns

        const analyze = () => {
            const now = Date.now();
            const timeSinceChange = now - lastMeaningfulOutputTime;
            const timeSinceLastData = now - lastDataReceivedTime;
            const timeSinceStart = now - analysisStartTime;
            
            // Join only the recent lines for analysis
            const currentContent = lineBuffer.join('\n');
            const plain = stripAnsi(currentContent);
            const currentClean = cleanForStability(currentContent);
            const currentCleanLength = currentClean.length;
            
            if (!hasStartedThinking) {
                // ONLY trigger hasStartedThinking on actual work patterns, NOT just content changes
                // This prevents premature completion when OpenCode is just rendering its TUI
                const hasRealWorkPattern = realWorkPatterns.some(pattern => plain.includes(pattern));
                
                if (hasRealWorkPattern) {
                    debugLog('📡 Real work pattern detected - agent is working');
                    hasStartedThinking = true;
                    hasSeenRealWork = true;
                    lastMeaningfulOutputTime = now;
                }
                // Also check for significant content growth (>500 chars) as backup indicator
                else if (currentCleanLength > 500 && currentCleanLength - lastCleanLength > 200) {
                    debugLog('📡 Significant content growth detected - agent may be working');
                    hasStartedThinking = true;
                    lastMeaningfulOutputTime = now;
                }
            } else {
                // Check if we've now seen real work (upgrade from just content to real work)
                if (!hasSeenRealWork) {
                    const hasRealWorkPattern = realWorkPatterns.some(pattern => plain.includes(pattern));
                    if (hasRealWorkPattern) {
                        debugLog('🔧 Now seeing real work patterns');
                        hasSeenRealWork = true;
                    }
                }
                
                // Only reset timer if change is significant (more than tolerance threshold)
                const lengthDiff = Math.abs(currentCleanLength - lastCleanLength);
                if (currentClean !== lastCleanSnapshot && lengthDiff > CONTENT_CHANGE_TOLERANCE) {
                    lastMeaningfulOutputTime = now;
                    debugLog(`📊 Significant content change detected (${lengthDiff} chars)`);
                }
            }
            
            lastCleanSnapshot = currentClean;
            lastCleanLength = currentCleanLength;

            const lastLines = lineBuffer.slice(-15).join('\n'); // Check more lines for patterns
            const lastLinesPlain = stripAnsi(lastLines).trim();
            
            // More strict prompt detection - must end with > and NOT contain active work indicators
            // Also must NOT have received recent data (indicating still working)
            const hasRecentData = timeSinceLastData < 2000; // Data received in last 2 seconds
            const hasPromptChar = lastLinesPlain.endsWith('>') && 
                                  !lastLinesPlain.includes('→') && 
                                  !lastLinesPlain.includes('~') &&
                                  !lastLinesPlain.includes('✱') &&
                                  !hasRecentData;  // Only count prompt if no recent data
            const hasReadyText = (lastLinesPlain.includes('Ask anything...') || lastLinesPlain.includes('ctrl+p commands')) && !hasRecentData;
            const hasPermissionPrompt = permissionPrompts.some(prompt => plain.includes(prompt));
            
            // Check for active work indicators - if present in RECENT output, OpenCode is NOT ready
            // Only check the last few lines, not the entire buffer (old commands shouldn't block completion)
            // Be strict: only match if patterns appear at start of line
            const recentLines = lineBuffer.slice(-5).map(l => stripAnsi(l).trim());
            const isActivelyWorking = recentLines.some(line => 
                activeWorkPatterns.some(pattern => line.startsWith(pattern))
            ) || hasRecentData;  // Also consider actively working if receiving data
            
            // Check for completion phrases in the FULL output (they can appear anywhere)
            const hasCompletionPhrase = completionPhrases.some(phrase => plain.includes(phrase));
            
            // Check for idle timer pattern (like "11.1s" at end of output indicating OpenCode is waiting)
            const hasIdleTimer = /\d+\.\d+s\s*$/.test(lastLinesPlain) || /\d+\s+\d+\.\d+s/.test(lastLinesPlain);

            // Only consider ready if not actively working AND we've seen real work
            // This prevents completing on just TUI content changes
            const isReady = hasStartedThinking && hasSeenRealWork && (hasPromptChar || hasReadyText) && !hasPermissionPrompt && !isActivelyWorking;
            
            // Alternative completion: OpenCode said it's done and output has stabilized AND not actively working
            const isLikelyComplete = hasStartedThinking && hasSeenRealWork && hasCompletionPhrase && !hasPermissionPrompt && !isActivelyWorking;
            
            // No output timeout: if no new data received for a while after activity, likely complete
            // But require minimum time since start AND real work to avoid premature completion
            const noOutputTimeout = hasStartedThinking && hasSeenRealWork &&
                                    timeSinceLastData >= NO_OUTPUT_TIMEOUT_MS && 
                                    timeSinceStart >= MIN_TASK_TIME_MS;

            if (plain.includes('Error: Unable to connect') || plain.includes('quota exceeded')) {
                cleanup();
                reject(new Error('CLI reported a connection or quota error'));
                return;
            }
            
            // Track when prompt is first detected (only if not actively working)
            if (isReady && promptDetectedTime === 0) {
                promptDetectedTime = now;
                debugLog('🎯 Prompt detected, starting grace period');
            } else if (isActivelyWorking && promptDetectedTime > 0) {
                // Reset if we detect active work after prompt was detected
                promptDetectedTime = 0;
                debugLog('🔄 Active work detected, resetting prompt detection');
            }
            
            // Track when completion phrase is first detected (only if not actively working)
            if (isLikelyComplete && completionPhraseDetectedTime === 0) {
                completionPhraseDetectedTime = now;
                debugLog('✍️ Completion phrase detected, starting grace period');
            } else if (isActivelyWorking && completionPhraseDetectedTime > 0) {
                // Reset if we detect active work after completion was detected
                completionPhraseDetectedTime = 0;
                debugLog('🔄 Active work detected, resetting completion detection');
            }
            
            const threshold = hasPromptChar ? 1500 : STABILITY_THRESHOLD_MS;
            const timeSincePromptDetected = promptDetectedTime > 0 ? now - promptDetectedTime : 0;
            const timeSinceCompletionPhrase = completionPhraseDetectedTime > 0 ? now - completionPhraseDetectedTime : 0;
            
            // Ensure minimum task time has passed before allowing completion
            const minTimeElapsed = timeSinceStart >= MIN_TASK_TIME_MS;
            
            // For long-running tasks (5+ minutes), be more lenient with completion detection
            const isLongRunningTask = timeSinceStart >= 300000; // 5 minutes
            const longRunningComplete = isLongRunningTask && hasCompletionPhrase && !isActivelyWorking && timeSinceChange >= STABILITY_THRESHOLD_MS;
            
            // Complete if any of these conditions are met (and minimum time has passed AND we've seen real work):
            const shouldComplete = minTimeElapsed && !isActivelyWorking && (
                // Standard completion with real work verification
                (hasSeenRealWork && isReady && timeSinceChange >= threshold) ||
                (hasSeenRealWork && isReady && timeSincePromptDetected >= PROMPT_GRACE_PERIOD_MS) ||
                (hasSeenRealWork && isLikelyComplete && timeSinceCompletionPhrase >= COMPLETION_PHRASE_GRACE_PERIOD_MS) ||
                (hasSeenRealWork && noOutputTimeout && (isLikelyComplete || hasIdleTimer)) ||
                (hasSeenRealWork && hasStartedThinking && hasIdleTimer && timeSinceChange >= STABILITY_THRESHOLD_MS) ||
                // Long-running task fallback (doesn't require hasSeenRealWork)
                longRunningComplete
            );
            
            if (shouldComplete) {
                let completionReason = 'Unknown';
                if (longRunningComplete) {
                    completionReason = `Long-running task complete: ${Math.round(timeSinceStart / 1000)}s, stable: ${timeSinceChange}ms`;
                } else if (hasSeenRealWork && isReady && timeSinceChange >= threshold) {
                    completionReason = `Stability: ${timeSinceChange}ms`;
                } else if (hasSeenRealWork && isReady && timeSincePromptDetected >= PROMPT_GRACE_PERIOD_MS) {
                    completionReason = `Prompt grace: ${timeSincePromptDetected}ms`;
                } else if (hasSeenRealWork && isLikelyComplete && timeSinceCompletionPhrase >= COMPLETION_PHRASE_GRACE_PERIOD_MS) {
                    completionReason = `Completion phrase grace: ${timeSinceCompletionPhrase}ms`;
                } else if (noOutputTimeout) {
                    completionReason = `No output timeout: ${timeSinceLastData}ms`;
                } else if (hasIdleTimer) {
                    completionReason = `Idle timer detected, stable: ${timeSinceChange}ms`;
                }
                debugLog(`✅ Task complete (${completionReason})`);
                cleanup();
                resolve();
            } else {
                // Add periodic debug logging for long-running tasks
                if (timeSinceStart > 60000 && timeSinceStart % 30000 < SCREEN_ANALYSIS_INTERVAL_MS) {
                    debugLog(`⏳ Task still running: ${Math.round(timeSinceStart / 1000)}s, hasSeenRealWork=${hasSeenRealWork}, hasCompletionPhrase=${hasCompletionPhrase}, isActivelyWorking=${isActivelyWorking}`);
                }
                screenAnalysisTimer = setTimeout(analyze, SCREEN_ANALYSIS_INTERVAL_MS);
            }
        };

        const onData = (data: Buffer) => {
            const chunk = data.toString();
            lastDataReceivedTime = Date.now(); // Track that we received data
            
            // Check for clear screen to reset context if needed
            for (const p of ANSI_CLEAR_SCREEN_PATTERNS) {
                if (chunk.includes(p)) { 
                    lineBuffer = [];
                    break; 
                }
            }
            
            // Split into lines and append
            const lines = chunk.split('\n');
            if (lines.length > 0) {
                // If the last line in buffer didn't end with \n, append the first new line to it
                if (lineBuffer.length > 0 && !lineBuffer[lineBuffer.length - 1].endsWith('\n') && !chunk.startsWith('\n')) {
                    lineBuffer[lineBuffer.length - 1] += lines.shift();
                }
                
                // Filter out noise lines BEFORE adding to buffer
                const cleanLines = lines.filter(line => !line.includes('Reply from ::1: time<'));
                lineBuffer.push(...cleanLines);
            }

            // Keep buffer size manageable
            if (lineBuffer.length > MAX_ANALYSIS_LINES) {
                lineBuffer = lineBuffer.slice(-MAX_ANALYSIS_LINES);
            }

            // Check for meaningful changes in the active window
            const activeWindow = lineBuffer.join('\n');
            const currentClean = cleanForStability(activeWindow);
            const currentLength = currentClean.length;
            
            // Only update meaningful output time if change is significant
            const lengthDiff = Math.abs(currentLength - lastCleanLength);
            if (currentClean !== lastCleanContent && lengthDiff > CONTENT_CHANGE_TOLERANCE) {
                lastMeaningfulOutputTime = Date.now();
                lastCleanContent = currentClean;
                lastCleanLength = currentLength;
            } else if (currentClean !== lastCleanContent) {
                // Small change - update content but NOT the timestamp
                lastCleanContent = currentClean;
                lastCleanLength = currentLength;
            }
        };

        screenAnalysisTimer = setTimeout(analyze, SCREEN_ANALYSIS_INTERVAL_MS);
        opencodeProcess.stdout.on('data', onData);

        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Task timed out'));
        }, TASK_TIMEOUT_MS); // 30 minutes (configurable in constants)

        const cleanup = () => {
            if (opencodeProcess?.stdout) opencodeProcess.stdout.removeListener('data', onData);
            if (screenAnalysisTimer) clearTimeout(screenAnalysisTimer);
            clearTimeout(timeout);
        };
    });
}

export async function startProcessingQueue(skipPermissions: boolean = true): Promise<void> {
    debugLog(`🚀 Starting queue processing (skipPermissions=${skipPermissions})`);
    ensureHistoryRun();
    setProcessingQueue(true);
    setIsRunning(true);
    updateSessionState();
    
    // Explicitly check for session and pass skipPermissions
    const config = getValidatedConfig();
    if (!opencodeProcess) {
        await startOpenCodeSession(skipPermissions);
    }
    
    processNextMessage();
}

export function stopProcessingQueue(): void {
    setProcessingQueue(false);
    setIsRunning(false);
    setCurrentMessage(null);
    if (opencodeProcess?.stdin) opencodeProcess.stdin.write('\x1b');
    updateWebviewContent();
    updateSessionState();
}
