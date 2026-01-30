import { opencodePanel, opencodeOutputBuffer, opencodeCurrentScreen, opencodeOutputTimer, opencodeAutoClearTimer, lastOpenCodeOutputTime, setOpenCodeOutputBuffer, setOpenCodeCurrentScreen, setOpenCodeOutputTimer, setOpenCodeAutoClearTimer, setLastOpenCodeOutputTime } from '../../core/state';
import { OPENCODE_OUTPUT_THROTTLE_MS, OPENCODE_OUTPUT_AUTO_CLEAR_MS, OPENCODE_OUTPUT_MAX_BUFFER_SIZE, ANSI_CLEAR_SCREEN_PATTERNS } from '../../core/constants';
import { debugLog, formatTerminalOutput, sendToWebviewTerminal } from '../../utils/logging';
import { getMobileServer } from '../../services/mobile/index';

// Debouncing for repeated debug messages
let lastClearScreenLogTime = 0;
let clearScreenLogCount = 0;
const CLEAR_SCREEN_LOG_DEBOUNCE_MS = 1000;

// Track sent content to avoid duplicates
let lastExtractedContent = '';
let sentContentHashes = new Set<string>();
let lastSentTimestamp = 0;
const MIN_SEND_INTERVAL_MS = 1000; // Minimum 1 second between messages

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
 * Extract meaningful content blocks from OpenCode's TUI output
 * Returns an array of content sections that are worth displaying
 */
function extractMeaningfulContent(text: string): string[] {
    if (!text) return [];
    
    const clean = stripAnsiAndTui(text);
    const lines = clean.split('\n');
    const contentBlocks: string[] = [];
    const currentBlock: string[] = [];
    
    // Patterns to completely skip
    const skipPatterns = [
        /^● Tip/i,
        /^v\d+\.\d+\.\d+/,
        /^Build\s/i,
        /^Proxy$/i,
        /^ctrl\+[a-z]/i,
        /^tab\s+agents/i,
        /^Ask anything\.\.\./i,
        /^# New session/i,
        /^Click to expand/i,
        /^esc.*interrupt/i,
        /^Writing command\.\.\./i,
        /^Running command\.\.\./i,
        /^\[retrying attempt/i,
        /^\d+,\d+\s+\d+%/,
        /^\d+\s+\d+\.\d+s\s*$/,
        /^ant_[\w-]+/i,
        /^gemini/i,
        /^\?\s*for\s+shortcuts/i,
        /^>\s*$/,
        /^QUEUED$/i,
        /^PENDING$/i,
        /^PROCESSING$/i,
        /^[→←✱~]\s*(Read|Edit|Grep|Write|Glob|Bash|Task)/i,
        /^(Read|Edit|Grep|Write|Glob|Bash)\s+["']?[\w./\\-]+/i,
        /^~\s*(Preparing|Searching|Loading|Analyzing)/i,
        /^\$\s+\w+/,
        /^[A-Z_]+\*?\s*$/,
        /^\s+at\s+\w+/,
        /^Error:/,
        /^\(\$[\d.]+\)/,
        /^\d+[,\d]*\s+tokens?/i,
        /^\[\d+/,
        /^Reply from/,
        /^time<\d+ms/,
        /^<system-reminder>/i,
        /^<\/system-reminder>/i,
    ];
    
    // Patterns that indicate meaningful content - be more inclusive
    const meaningfulPatterns = [
        /^Thinking:/i,
        /^I /i,  // Any sentence starting with "I "
        /^We /i,
        /^The /i,
        /^This /i,
        /^Let /i,
        /^Here/i,
        /^Now /i,
        /^Next /i,
        /^First/i,
        /^Finally/i,
        /^# /,  // Markdown headers
        /^## /,
        /^### /,
        /^- /,  // Bullet points
        /^\* /,
        /^\d+\. /,  // Numbered lists
        /^Goal:/i,
        /^Summary/i,
        /^Step/i,
        /^Task/i,
        /^Test/i,
        /^Config/i,
        /^Queue/i,
        /^Error/i,
        /^Success/i,
        /^Warning/i,
        /passing/i,
        /failing/i,
        /complete/i,
        /created/i,
        /updated/i,
        /Specification/i,
        /Pseudocode/i,
        /Architecture/i,
        /Refinement/i,
        /Completion/i,
        /Okay/i,
        /Alright/i,
        /Sure/i,
        /Great/i,
        /Perfect/i,
        /Done/i,
        /Finished/i,
        /Working/i,
        /Running/i,
        /Analyzing/i,
        /Reviewing/i,
        /Implementing/i,
        /Creating/i,
        /Updating/i,
    ];
    
    for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip empty or very short lines
        if (trimmed.length < 3) {
            // If we have a block building, add separator
            if (currentBlock.length > 0) {
                currentBlock.push('');
            }
            continue;
        }
        
        // Skip noise patterns
        if (skipPatterns.some(p => p.test(trimmed))) {
            continue;
        }
        
        // Skip lines that are mostly non-alphabetic (garbled)
        const letters = (trimmed.match(/[a-zA-Z]/g) || []).length;
        if (trimmed.length > 10 && letters / trimmed.length < 0.4) {
            continue;
        }
        
        // Skip lines that are just numbers or timers
        if (/^\d+\.?\d*s?$/.test(trimmed) || /^\d+$/.test(trimmed)) {
            continue;
        }
        
        // Check if this is meaningful content
        const isMeaningful = meaningfulPatterns.some(p => p.test(trimmed)) || 
                            (trimmed.length > 30 && /^[A-Za-z]/.test(trimmed));
        
        if (isMeaningful) {
            currentBlock.push(trimmed);
        } else if (currentBlock.length > 0 && trimmed.length > 15) {
            // Continue building block if we're in one and this looks like continuation
            currentBlock.push(trimmed);
        }
    }
    
    // Finalize current block
    if (currentBlock.length > 0) {
        const blockText = currentBlock
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        if (blockText.length > 20) {
            contentBlocks.push(blockText);
        }
    }
    
    return contentBlocks;
}

/**
 * Create a simple hash of content for deduplication
 */
function hashContent(content: string): string {
    // Simple hash based on content and length
    const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim();
    return `${normalized.length}_${normalized.slice(0, 50)}`;
}

/**
 * Check if content is new and worth sending
 */
function shouldSendContent(content: string): boolean {
    if (!content || content.length < 5) {
        debugLog(`🚫 Content too short: ${content?.length || 0} chars`);
        return false;
    }
    
    const now = Date.now();
    const timeSinceLastSent = now - lastSentTimestamp;
    if (timeSinceLastSent < 300) { // Reduced from 1000ms to 300ms for more responsive updates
        debugLog(`🚫 Too soon since last send: ${timeSinceLastSent}ms`);
        return false;
    }
    
    const hash = hashContent(content);
    if (sentContentHashes.has(hash)) {
        debugLog(`🚫 Duplicate content hash`);
        return false;
    }
    
    // Check if this is just a subset of what we already sent
    if (lastExtractedContent && lastExtractedContent.includes(content)) {
        debugLog(`🚫 Content is subset of last sent`);
        return false;
    }
    if (content === lastExtractedContent) {
        debugLog(`🚫 Content identical to last sent`);
        return false;
    }
    
    return true;
}

/**
 * Extract a readable summary from cleaned content when block extraction fails
 * This is a fallback to ensure the user always sees something
 */
function extractSummaryFromCleanedContent(content: string): string {
    if (!content || content.length < 50) return '';
    
    const lines = content.split('\n').filter(l => l.trim().length > 10);
    
    // Look for lines that start with meaningful patterns
    const meaningfulLines: string[] = [];
    
    for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip lines that look like noise
        if (/^\d+\s*$/.test(trimmed)) continue;
        if (/^[a-z]$/.test(trimmed)) continue;
        if (trimmed.length < 15) continue;
        
        // Check for meaningful sentence starts
        if (/^(I |I'm |I'll |I've |The |This |That |We |It |My |Our |To |For |In |On |At |By |With |From |About |After |Before |During |Through |Between |Among |Under |Over |Above |Below |Into |Out |Up |Down |Here |There |Now |Then |Also |However |Therefore |Moreover |Furthermore |Additionally |Meanwhile |Subsequently |Consequently |Accordingly |Thus |Hence |So |Because |Since |Although |Though |While |Whereas |If |Unless |Until |When |Where |What |Which |Who |Whom |Whose |Why |How |Let |Please |Could |Would |Should |Can |May |Might |Must |Will |Shall )/i.test(trimmed)) {
            meaningfulLines.push(trimmed);
        }
        // Check for task descriptions
        else if (/^(Thinking|Goal|Specification|Pseudocode|Architecture|Refinement|Completion|Summary|Next|Step|Task|Test|Config|Queue|Error|Success|Create|Update|Delete|Read|Write|Edit|Run|Build|Install|Check)/i.test(trimmed)) {
            meaningfulLines.push(trimmed);
        }
        // Check for status messages
        else if (/passing|failing|complete|success|error|warning|created|updated|deleted|finished|started|running|stopped/i.test(trimmed)) {
            meaningfulLines.push(trimmed);
        }
    }
    
    if (meaningfulLines.length === 0) {
        // Last resort: just take the first few substantial lines
        const substantialLines = lines.filter(l => l.trim().length > 30).slice(0, 5);
        return substantialLines.join('\n').trim();
    }
    
    // Return the last few meaningful lines (most recent context)
    return meaningfulLines.slice(-5).join('\n').trim();
}

/**
 * Track that we sent this content
 */
function trackSentContent(content: string): void {
    lastExtractedContent = content;
    lastSentTimestamp = Date.now();
    
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
            clearScreenLogCount = 0;
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
    lastExtractedContent = '';
    sentContentHashes.clear();
    lastSentTimestamp = 0;
    
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
    lastExtractedContent = '';
    sentContentHashes.clear();
    lastSentTimestamp = 0;
}
