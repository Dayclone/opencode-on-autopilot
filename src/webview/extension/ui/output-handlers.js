// Terminal and OpenCode output processing and rendering
import { 
    setDebugTerminalContent,
    resetOpenCodeOutputState,
    appendDebugTerminalContent,
    getDebugTerminalContent
} from '../core/state.js';
import { createSafeElement } from '../security/validation.js';
import { isDevelopmentMode } from '../core/state.js';

// Track message count for unique IDs
let messageCount = 0;

// Store terminal content separately
export function appendToTerminal(output) {
    try {
        const terminalContainer = document.getElementById('terminalContainer');
        let terminalOutput = terminalContainer.querySelector('.terminal-output');

        if (!terminalOutput) {
            terminalOutput = document.createElement('div');
            terminalOutput.className = 'terminal-output';
            terminalContainer.appendChild(terminalOutput);
        }

        // Clear the ready message on first output
        const readyMessage = terminalOutput.querySelector('.terminal-ready-message');
        if (readyMessage) {
            terminalOutput.innerHTML = '';
            setDebugTerminalContent('');
        }

        // Filter out OpenCode output debug messages (🤖 [CLAUDE timestamp])
        if (output.includes('🤖 [CLAUDE') && output.includes(']')) {
            return;
        }

        // Add to debug terminal content
        appendDebugTerminalContent(output);

        // Simple text display for terminal (no ANSI parsing needed - it's debug info)
        const cleanedOutput = cleanTerminalOutput(getDebugTerminalContent());
    
        terminalOutput.innerHTML = '';
        const outputElement = document.createElement('div');
        outputElement.style.cssText = 'white-space: pre-wrap; word-wrap: break-word; line-height: 1.4; font-family: inherit; font-size: 11px; color: #aaa;';
        outputElement.textContent = cleanedOutput;
        terminalOutput.appendChild(outputElement);

        // Auto-scroll to bottom
        terminalOutput.scrollTop = terminalOutput.scrollHeight;
    } catch (error) {
        console.error('Error appending to terminal:', error);
    }
}

/**
 * Clean terminal output for debug display
 */
function cleanTerminalOutput(text) {
    if (!text) return '';
    return text
        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
        .replace(/\[[\d;]+m/g, '')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * This function is called for live TUI updates - we now just ignore these
 * and only use the append function for meaningful content
 */
export function appendToOpenCodeOutput(output) {
    // We no longer use the replace mode - just ignore
    // All meaningful content comes through appendOpenCodeMessage
    if (isDevelopmentMode) {
        console.log('📤 Received opencodeOutput (ignored - using append mode only)');
    }
}

/**
 * Append a new OpenCode message to the output log (preserves history)
 * This is the ONLY way content gets added to the OpenCode Live Output panel
 */
export function appendOpenCodeMessage(content, timestamp) {
    console.log('📥 appendOpenCodeMessage called with:', content?.length, 'chars');
    console.log('📥 Content preview:', content?.substring(0, 200));
  
    try {
        const opencodeContainer = document.getElementById('opencodeOutputContainer');
        console.log('📥 opencodeContainer found:', !!opencodeContainer);
        if (!opencodeContainer) {
            console.error('❌ opencodeOutputContainer not found!');
            return;
        }
    
        let opencodeOutput = opencodeContainer.querySelector('.opencode-live-output');

        if (!opencodeOutput) {
            opencodeOutput = document.createElement('div');
            opencodeOutput.className = 'opencode-live-output';
            opencodeOutput.style.cssText = 'padding: 12px; max-height: 400px; overflow-y: auto;';
            opencodeContainer.appendChild(opencodeOutput);
        }

        // Clear the ready message on first output
        const readyMessage = opencodeOutput.querySelector('.opencode-ready-message');
        if (readyMessage) {
            opencodeOutput.innerHTML = '';
        }

        // Clean and format the content
        const cleanedContent = cleanMessageContent(content);
        console.log('📝 Cleaned content length:', cleanedContent?.length);
        console.log('📝 Cleaned preview:', cleanedContent?.substring(0, 200));
    
        // Skip if content is empty after cleaning (reduced threshold to show more output)
        if (!cleanedContent || cleanedContent.length < 5) {
            console.log('⚠️ Content too short after cleaning, skipping');
            return;
        }

        console.log('✅ Creating message entry...');

        messageCount++;
        console.log('📊 Message count:', messageCount);

        // Create a message entry
        const messageEntry = document.createElement('div');
        messageEntry.className = 'opencode-message-entry';
        messageEntry.id = `msg-${messageCount}`;
        messageEntry.style.cssText = `
      margin-bottom: 16px;
      padding: 12px 14px;
      background: linear-gradient(135deg, rgba(74, 158, 255, 0.08) 0%, rgba(74, 158, 255, 0.04) 100%);
      border-left: 3px solid #4a9eff;
      border-radius: 0 8px 8px 0;
      font-family: 'Segoe UI', 'SF Pro Display', -apple-system, sans-serif;
      font-size: 13px;
      line-height: 1.6;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    `;

        // Add timestamp header
        if (timestamp) {
            const timeLabel = document.createElement('div');
            timeLabel.style.cssText = `
        font-size: 10px;
        color: #666;
        margin-bottom: 8px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      `;
            timeLabel.textContent = `🤖 ${timestamp}`;
            messageEntry.appendChild(timeLabel);
        }

        // Add the formatted content
        const contentDiv = document.createElement('div');
        contentDiv.style.cssText = `
      white-space: pre-wrap;
      word-wrap: break-word;
      color: #e8e8e8;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.7;
    `;
    
        // Format the content with syntax highlighting
        const formattedContent = formatMessageContent(cleanedContent);
        contentDiv.innerHTML = formattedContent;
        messageEntry.appendChild(contentDiv);

        // Append to output
        opencodeOutput.appendChild(messageEntry);
        console.log('✅ Message appended to DOM');

        // Limit to last 50 messages to prevent memory bloat
        const allMessages = opencodeOutput.querySelectorAll('.opencode-message-entry');
        if (allMessages.length > 50) {
            allMessages[0].remove();
        }

        // Auto-scroll to bottom
        opencodeOutput.scrollTop = opencodeOutput.scrollHeight;

        // Brief highlight effect for new message
        messageEntry.style.background = 'linear-gradient(135deg, rgba(0, 255, 136, 0.15) 0%, rgba(0, 255, 136, 0.08) 100%)';
        setTimeout(() => {
            messageEntry.style.background = 'linear-gradient(135deg, rgba(74, 158, 255, 0.08) 0%, rgba(74, 158, 255, 0.04) 100%)';
            messageEntry.style.transition = 'background 0.5s ease';
        }, 400);

    } catch (error) {
        console.error('Error appending OpenCode message:', error);
    }
}

/**
 * Thoroughly clean message content - remove all TUI noise
 */
function cleanMessageContent(content) {
    if (!content) return '';
  
    let cleaned = content
    // Remove ANSI escape sequences (comprehensive)
        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
        .replace(/\x1b\][^\x07]*\x07/g, '')
        .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '')
        .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    // Remove leaked bracket sequences (cursor positioning, colors, modes)
        .replace(/\[\d+;\d+H/g, '')  // Cursor positioning [29;10H
        .replace(/\[\d+[A-Za-z]/g, '')  // Single number commands [2J
        .replace(/\[[\d;]+m/g, '')  // Color codes [38;2;10m
        .replace(/\[\?\d+[hl]/g, '')  // Mode settings [?2026h
    // Remove control characters
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Remove TUI characters
        .replace(/[✔✓✗✖✕✘☑☒☐█▀▄▌▐░▒▓■▣·⬝┃╹│┌┐└┘├┤┬┴┼╭╮╯╰●○◆◇▪▫⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷→←✱~]+/g, '')
    // Remove system reminder blocks - be very aggressive
        .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '')
        .replace(/# Interleaved Thinking[\s\S]*?Ultrathink/gi, '')  // Remove even partial matches
        .replace(/You MUST emit a thinking block[\s\S]*?Never skip thinking[^.]*\./gi, '')
    // Remove HTML-like tags
        .replace(/<[^>]+>/g, '')
    // Remove status words
        .replace(/\b(QUEUED|PENDING|PROCESSING)\b/gi, '')
    // Remove model identifiers
        .replace(/ant_[\w-]+/gi, '')
        .replace(/\bgemini[\w-]*/gi, '')
        .replace(/\bopencode[\w-]*/gi, '')
    // Remove tool invocation lines
        .replace(/^[→←✱~]?\s*(Read|Edit|Grep|Write|Glob|Bash|Task)\s+["']?[\w./\\-]+["']?.*$/gm, '')
        .replace(/^Reading file\.\.\.$/gm, '')
        .replace(/^Preparing (write|edit)\.\.\.$/gm, '')
    // Remove shell commands
        .replace(/^\$\s+[\w-]+.*$/gm, '')
    // Remove npm/mocha output lines
        .replace(/^>\s*[\w@.-]+\s+\w+$/gm, '')
        .replace(/^>\s*mocha\s+.*$/gm, '')
    // Remove timer/stats lines
        .replace(/^\d+\s+\d+\.\d+s\s*$/gm, '')
        .replace(/^\d+,\d+\s+\d+%.*$/gm, '')
        .replace(/^\(\$[\d.]+\)$/gm, '')
    // Remove standalone numbers
        .replace(/^\d+\s*$/gm, '')
    // Remove lines starting with color code remnants
        .replace(/^\d+;[\d;]+m.*$/gm, '')
        .replace(/^[\d;]+m\s*/gm, '')
    // Remove error stack traces
        .replace(/^\s+at\s+\w+.*$/gm, '')
    // Remove diff artifacts
        .replace(/^\d+\s*[-+]\s+/gm, '')
    // Clean up excessive whitespace
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+$/gm, '')
        .trim();

    // Split into lines and filter out garbage
    const lines = cleaned.split('\n');
    const goodLines = lines.filter(line => {
        const trimmed = line.trim();
        if (trimmed.length < 2) return trimmed === ''; // Keep empty lines for paragraph breaks
    
        // Filter out garbled lines (low letter ratio) - only for longer content
        const letters = (trimmed.match(/[a-zA-Z]/g) || []).length;
        if (trimmed.length > 30 && letters / trimmed.length < 0.25) return false;
    
        // Filter out lines that are mostly repeated characters
        if (/(.)\\1{10,}/.test(trimmed)) return false;
    
        // Filter out lines that look like garbled code
        if (/^[\d;]+[mH]/.test(trimmed)) return false;
    
        // Filter out version/build lines
        if (/^v\d+\.\d+\.\d+$/.test(trimmed)) return false;
    
        return true;
    });

    return goodLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Format message content with nice styling
 */
function formatMessageContent(content) {
    if (!content) return '';
  
    // Escape HTML first
    let formatted = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
  
    // Highlight "Thinking:" sections
    formatted = formatted.replace(
        /^(Thinking:)\s*(.*)$/gm,
        '<div style="color: #ffd700; font-weight: 600; margin: 8px 0 4px 0;">💭 $1</div><div style="color: #ccc; margin-left: 20px;">$2</div>'
    );
  
    // Highlight SPARC phases
    formatted = formatted.replace(
        /^([SPARC])\s*[-–—]\s*(Specification|Pseudocode|Architecture|Refinement|Completion)/gm,
        '<div style="color: #4a9eff; font-weight: 600; margin: 12px 0 4px 0;">📋 $1 — $2</div>'
    );
  
    // Highlight file operations
    formatted = formatted.replace(
        /# Wrote\s+([\w./\\-]+)/gi,
        '<span style="color: #00ff88; font-weight: 600;">📝 Wrote $1</span>'
    );
  
    // Highlight success messages
    formatted = formatted.replace(
        /(Successfully|Created|Updated|Completed)/gi,
        '<span style="color: #00ff88;">$1</span>'
    );
  
    // Highlight "I will", "I'm going to", "Let me" statements
    formatted = formatted.replace(
        /^(I will|I'll|I'm going to|I'm now|Let me)\s+/gm,
        '<span style="color: #88c0ff; font-weight: 500;">$1 </span>'
    );
  
    // Highlight file names
    formatted = formatted.replace(
        /\b([\w-]+\.(ts|js|py|json|md|html|css|tsx|jsx|txt))\b/gi,
        '<span style="color: #4a9eff;">$1</span>'
    );
  
    // Highlight code blocks (backticks)
    formatted = formatted.replace(
        /`([^`]+)`/g,
        '<code style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 3px; font-size: 11px;">$1</code>'
    );
  
    return formatted;
}

// Legacy functions - kept for compatibility but simplified
export function renderOpenCodeOutput() {
    // No longer used - we use append-only mode
}

export function performOpenCodeRender(output) {
    // No longer used - we use append-only mode
}

export function clearOpenCodeOutput() {
    try {
        const opencodeContainer = document.getElementById('opencodeOutputContainer');
        let opencodeOutput = opencodeContainer.querySelector('.opencode-live-output');
        if (opencodeOutput) {
            opencodeOutput.innerHTML = '';
            messageCount = 0;
      
            const readyMessage = createSafeElement('div', '', 'opencode-ready-message');
            readyMessage.style.cssText = 'padding: 20px; text-align: center; color: #666;';
      
            const pulseDiv = createSafeElement('div', '', 'pulse-dot');
            pulseDiv.style.cssText = 'display: inline-block; width: 8px; height: 8px; background: #4a9eff; border-radius: 50%; margin-right: 8px; animation: pulse 2s infinite;';
      
            const messageSpan = createSafeElement('span', 'Ready for OpenCode output...', '');
      
            const contentDiv = document.createElement('div');
            contentDiv.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 8px;';
            contentDiv.appendChild(pulseDiv);
            contentDiv.appendChild(messageSpan);
            readyMessage.appendChild(contentDiv);
            opencodeOutput.appendChild(readyMessage);
      
            resetOpenCodeOutputState();
        }
    } catch (error) {
        console.error('Error clearing OpenCode output:', error);
    }
}

export function clearOpenCodeOutputUI() {
    clearOpenCodeOutput();
    if (isDevelopmentMode) {
        console.log('OpenCode output cleared');
    }
}

export function flushPendingOpenCodeOutput() {
    // No longer needed in append-only mode
}
