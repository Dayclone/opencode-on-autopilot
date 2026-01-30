import { opencodePanel, opencodeOutputBuffer, opencodeCurrentScreen, opencodeOutputTimer, opencodeAutoClearTimer, lastOpenCodeOutputTime, setOpenCodeOutputBuffer, setOpenCodeCurrentScreen, setOpenCodeOutputTimer, setOpenCodeAutoClearTimer, setLastOpenCodeOutputTime } from '../../core/state';
import { OPENCODE_OUTPUT_THROTTLE_MS, OPENCODE_OUTPUT_AUTO_CLEAR_MS, ANSI_CLEAR_SCREEN_PATTERNS } from '../../core/constants';
import { debugLog, formatTerminalOutput, sendToWebviewTerminal } from '../../utils/logging';
import { getMobileServer } from '../../services/mobile/index';

// Debouncing for repeated debug messages
let lastClearScreenLogTime = 0;
const CLEAR_SCREEN_LOG_DEBOUNCE_MS = 1000;

// Track sent content to avoid duplicates
let sentContentHashes = new Set<string>();

/**
 * Simple hash function for content deduplication
 */
function hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
}

/**
 * Check if content should be sent (not a duplicate)
 */
function shouldSendContent(content: string): boolean {
    const hash = hashContent(content);
    return !sentContentHashes.has(hash);
}

/**
 * Comprehensive ANSI and TUI cleaning
 * Exported for use by mobile WebSocket manager
 */
export function stripAnsiAndTui(text: string): string {
    if (!text) return '';
    
    return text
        // Strip all ANSI escape sequences (multiple patterns for comprehensive coverage)
        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
        .replace(/\x1b\][^\x07]*\x07/g, '')
        .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '')
        .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
        // Remove leaked bracket sequences like [29;10H (cursor positioning) or [38;2;10m (colors)
        // These patterns capture the [ that may appear without ESC
        .replace(/\[\d+;\d+[A-Za-z]/g, '')  // Cursor positioning [29;10H, [22;6H, etc.
        .replace(/\[\d+[A-Za-z]/g, '')  // Single number commands like [2J, [25l
        .replace(/\[\?[\d;]+[A-Za-z]/g, '')  // Mode settings [?2026h, [?2026l
        // Remove color code remnants (e.g., ;2;128;128;128m at start of content)
        .replace(/^[;\d]+m/gm, '')  // Lines starting with color remnants
        .replace(/;[\d;]+m/g, '')  // Color codes like ;2;128;128;128m anywhere
        .replace(/\[[\d;]+m/g, '')  // Full color codes [38;2;10m
        // Remove system reminder blocks - be very aggressive
        .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '')
        .replace(/# Interleaved Thinking[\s\S]*?Ultrathink/gi, '')
        .replace(/You MUST emit a thinking block[\s\S]*?Never skip thinking[^.]*\./gi, '')
        // Remove any other HTML-like tags
        .replace(/<[^>]+>/g, '')
        // Remove control characters except newline/tab
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        // Remove TUI decorative characters - including Unicode ellipsis and box drawing
        .replace(/[✔✓✗✖✕✘☑☒☐█▀▄▌▐░▒▓■▣·⬝┃╹│┌┐└┘├┤┬┴┼╭╮╯╰●○◆◇▪▫⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷→←✱~]+/g, '')
        // Remove Unicode ellipsis (U+2026) which appears as loading dots
        .replace(/…+/g, '')
        // Remove special control sequences that leak through
        .replace(/0q\$p(\$p)+/g, '')  // 0q$p$p$p pattern
        .replace(/\[\?[ul]/g, '')  // [?u, [?l patterns
        // Remove standalone numbers that are artifacts
        .replace(/^\d{3,}\s*$/gm, '')
        // Remove lines that are mostly numbers with optional letters (artifact lines)
        .replace(/^\d+[a-zA-Z]?\s*$/gm, '')
        // Remove lines that are just punctuation/symbols
        .replace(/^[^a-zA-Z\n]*$/gm, '')
        // Remove lines that are just dashes or equals
        .replace(/^[-=]{3,}\s*$/gm, '')
        // Clean up excessive whitespace
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\s*\n/gm, '\n')  // Remove lines that are just spaces
        .trim();
}

/**
 * Track that we sent this content
 */
function trackSentContent(content: string): void {
    const hash = hashContent(content);
    sentContentHashes.add(hash);
    
    // Limit hash set size
    if (sentContentHashes.size > 100) {
        const arr = Array.from(sentContentHashes);
        sentContentHashes = new Set(arr.slice(-50));
    }
}

export function sendOpenCodeOutput(output: string): void {
    setOpenCodeOutputBuffer(opencodeOutputBuffer + output);
    
    // Aggressive buffer management: limit global buffer to 50k chars
    if (opencodeOutputBuffer.length > 50000) {
        setOpenCodeOutputBuffer(opencodeOutputBuffer.substring(opencodeOutputBuffer.length - 50000));
    }
    
    let foundClearScreen = false;
    let lastClearScreenIndex = -1;
    
    for (const pattern of ANSI_CLEAR_SCREEN_PATTERNS) {
        const index = opencodeOutputBuffer.lastIndexOf(pattern);
        if (index > lastClearScreenIndex) {
            lastClearScreenIndex = index;
            foundClearScreen = true;
        }
    }
    
    if (foundClearScreen) {
        const now = Date.now();
        if (now - lastClearScreenLogTime >= CLEAR_SCREEN_LOG_DEBOUNCE_MS) {
            debugLog(`🖥️  Clear screen detected - reset screen buffer`);
            lastClearScreenLogTime = now;
        }
        
        const newScreen = opencodeOutputBuffer.substring(lastClearScreenIndex);
        setOpenCodeCurrentScreen(newScreen);
        setOpenCodeOutputBuffer(opencodeCurrentScreen);
    } else {
        setOpenCodeCurrentScreen(opencodeOutputBuffer);
    }
    
    const now = Date.now();
    const timeSinceLastOutput = now - lastOpenCodeOutputTime;
    
    if (timeSinceLastOutput >= OPENCODE_OUTPUT_THROTTLE_MS) {
        flushOpenCodeOutput();
    } else {
        if (!opencodeOutputTimer) {
            const delay = OPENCODE_OUTPUT_THROTTLE_MS - timeSinceLastOutput;
            setOpenCodeOutputTimer(setTimeout(() => {
                flushOpenCodeOutput();
            }, delay));
        }
    }
    
    if (!opencodeAutoClearTimer) {
        setOpenCodeAutoClearTimer(setTimeout(() => {
            clearOpenCodeOutput();
        }, OPENCODE_OUTPUT_AUTO_CLEAR_MS));
    }
}

export function flushOpenCodeOutput(): void {
    if (opencodeCurrentScreen.length === 0) {
        return;
    }
    
    const rawOutput = opencodeCurrentScreen;
    
    setLastOpenCodeOutputTime(Date.now());
    
    if (opencodeOutputTimer) {
        clearTimeout(opencodeOutputTimer);
        setOpenCodeOutputTimer(null);
    }
    
    // Clean the output - SIMPLIFIED: just use cleaned content directly
    // This avoids fragmentation from complex block extraction
    const cleanedContent = stripAnsiAndTui(rawOutput);
    
    debugLog(`📤 Sending OpenCode output (${cleanedContent.length} cleaned chars)`);
    
    if (opencodePanel) {
        try {
            let contentToSend = '';
            
            // TUI interface patterns to skip - these are UI chrome, not agent responses
            const tuiInterfacePatterns = [
                /^Ask anything\.\.\.$/i,
                /^ctrl\+[a-z]\s+\w+$/i,
                /^tab\s+agents$/i,
                /^Tip\s+Press/i,
                /^\d+\.\d+\.\d+$/,  // Version numbers like 1.1.44
                /^Proxy$/i,
            ];
            
            // Process content - be less aggressive to ensure API responses flow through
            if (cleanedContent.length > 0) {
                const compressedContent = cleanedContent.replace(/[ \t]+/g, ' ');
                
                // Split on newlines
                const chunks: string[] = [];
                
                // First try natural line breaks
                const rawLines = compressedContent.split('\n').map(l => l.trim()).filter(l => l.length > 3);
                
                // If we only got 1-2 very long lines, try to split them further
                for (const line of rawLines) {
                    if (line.length > 200) {
                        // Split on sentence boundaries or logical breaks
                        const subChunks = line.split(/(?<=[.!?])\s+|(?<=\s{2,})/g).filter(c => c.trim().length > 3);
                        chunks.push(...subChunks);
                    } else {
                        chunks.push(line);
                    }
                }
                
                // Filter out only the most obvious TUI interface chrome
                const goodLines = chunks.filter(chunk => {
                    const trimmed = chunk.trim();
                    if (trimmed.length < 5) return false;
                    
                    // Skip TUI interface patterns
                    if (tuiInterfacePatterns.some(p => p.test(trimmed))) return false;
                    
                    // Skip lines that are mostly non-alphabetic (garbled) - only for longer content
                    const letters = (trimmed.match(/[a-zA-Z]/g) || []).length;
                    const compressedLen = trimmed.replace(/\s+/g, '').length;
                    if (compressedLen > 20 && letters / compressedLen < 0.2) return false;
                    
                    // Skip pure number/timer artifacts
                    if (/^\d+\s*$/.test(trimmed)) return false;
                    if (/^\d+,\d+\s+\d+%/.test(trimmed)) return false;
                    
                    return true;
                });
                
                contentToSend = goodLines.slice(-20).join('\n').trim();
                debugLog(`📋 Extracted: ${contentToSend?.length || 0} chars from ${goodLines.length} lines (${chunks.length} chunks)`);
            }
            
            // Send if we have any meaningful content (lowered threshold)
            if (contentToSend && contentToSend.length > 10) {
                // Log what we're about to send
                debugLog(`📋 Content check: length=${contentToSend.length}`);
                debugLog(`📋 First 200 chars: ${contentToSend.substring(0, 200).replace(/\n/g, '\\n')}`);
                
                // Check if content is new
                if (shouldSendContent(contentToSend)) {
                    trackSentContent(contentToSend);
                    
                    debugLog(`📨 SENDING content to webview (${contentToSend.length} chars)`);
                    
                    try {
                        opencodePanel.webview.postMessage({
                            command: 'opencodeOutputAppend',
                            output: contentToSend,
                            timestamp: new Date().toLocaleTimeString()
                        });
                        debugLog(`✅ postMessage sent successfully`);
                    } catch (postError) {
                        debugLog(`❌ postMessage failed: ${postError}`);
                    }
                } else {
                    debugLog(`⚠️ Content filtered by deduplication check`);
                }
            } else {
                debugLog(`⚠️ No content to send (length: ${contentToSend?.length || 0})`);
            }
        } catch (error) {
            debugLog(`❌ Failed to send OpenCode output to webview: ${error}`);
        }
    }
    
    // Still send to terminal output for debugging
    const formattedOutput = formatTerminalOutput(cleanedContent || rawOutput, 'opencode');
    sendToWebviewTerminal(formattedOutput);
    
    // Notify mobile clients if mobile server is running
    try {
        const mobileServer = getMobileServer();
        if (mobileServer.isRunning()) {
            mobileServer.notifyOutputUpdate();
        }
    } catch (error) {
        debugLog(`⚠️ Failed to notify mobile server of output update: ${error}`);
    }
}

export function clearOpenCodeOutput(): void {
    debugLog(`🧹 Auto-clearing OpenCode output buffer (${opencodeCurrentScreen.length} chars)`);
    
    setOpenCodeOutputBuffer('');
    setOpenCodeCurrentScreen('');
    
    // Reset tracking when output is cleared
    sentContentHashes.clear();
    
    if (opencodeOutputTimer) {
        clearTimeout(opencodeOutputTimer);
        setOpenCodeOutputTimer(null);
    }
    if (opencodeAutoClearTimer) {
        clearTimeout(opencodeAutoClearTimer);
        setOpenCodeAutoClearTimer(null);
    }
}

/**
 * Reset output tracking (call when starting a new task)
 */
export function resetOutputTracking(): void {
    sentContentHashes.clear();
}
