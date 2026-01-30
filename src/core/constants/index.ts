export const TIMEOUT_MS = 60 * 60 * 60 * 1000; // 1 hour
export const HEALTH_CHECK_INTERVAL_MS = 30000; // Check OpenCode process health every 30 seconds
export const OPENCODE_OUTPUT_THROTTLE_MS = 2000; // 2000ms = more time to capture complete TUI renders
export const OPENCODE_OUTPUT_AUTO_CLEAR_MS = 30000; // 30 seconds - auto clear output buffer
export const OPENCODE_OUTPUT_MAX_BUFFER_SIZE = 100000; // 100KB max buffer size

// Task timeout - how long to wait for a single task to complete
// Default: 30 minutes (1800000ms) - increase for complex tasks
export const TASK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Queue memory management constants
export const MAX_QUEUE_SIZE = 1000; // Maximum number of messages in queue
export const MAX_MESSAGE_SIZE = 50000; // 50KB max per message text
export const MAX_OUTPUT_SIZE = 100000; // 100KB max per message output
export const MAX_ERROR_SIZE = 10000; // 10KB max per error message
export const QUEUE_CLEANUP_THRESHOLD = 500; // Start cleanup when queue exceeds this size
export const COMPLETED_MESSAGE_RETENTION_HOURS = 24; // Keep completed messages for 24 hours
export const MAX_HISTORY_RUNS = 20; // Reduced from 50 to prevent memory bloat

export const ANSI_CLEAR_SCREEN_PATTERNS = [
    '\x1b[2J',           // Clear entire screen
    '\x1b[H\x1b[2J',     // Move cursor to home + clear screen
    '\x1b[2J\x1b[H',     // Clear screen + move cursor to home
    '\x1b[1;1H\x1b[2J',  // Move cursor to 1,1 + clear screen
    '\x1b[2J\x1b[1;1H'   // Clear screen + move cursor to 1,1
];