import * as vscode from 'vscode';
import { ChildProcess } from 'child_process';
import { MessageItem, HistoryRun } from '../../core/types';

export let opencodePanel: vscode.WebviewPanel | null = null;
export let isRunning = false;
export let messageQueue: MessageItem[] = [];
export let opencodeProcess: ChildProcess | null = null;
export let resumeTimer: NodeJS.Timeout | null = null;
export let countdownInterval: NodeJS.Timeout | null = null;
export let sleepPreventionProcess: ChildProcess | null = null;
export let sleepPreventionActive = false;
export let healthCheckTimer: NodeJS.Timeout | null = null;

export let sessionReady = false;
export let currentMessage: MessageItem | null = null;
export let processingQueue = false;
export let isResettingSession = false;
export let debugMode = process.env.DEBUG_MODE === 'true';

export let currentRun: HistoryRun | null = null;
export let extensionContext: vscode.ExtensionContext;

export let opencodeOutputBuffer: string = '';
export let opencodeCurrentScreen: string = '';
export let opencodeOutputTimer: NodeJS.Timeout | null = null;
export let opencodeAutoClearTimer: NodeJS.Timeout | null = null;
export let lastOpenCodeOutputTime: number = 0;

export function setOpenCodePanel(panel: vscode.WebviewPanel | null) {
    opencodePanel = panel;
}

export function setIsRunning(running: boolean) {
    isRunning = running;
    notifyMobileStatusUpdate();
}

export function setMessageQueue(queue: MessageItem[]) {
    messageQueue = queue;
    notifyMobileQueueUpdate();
}

export function setOpenCodeProcess(process: ChildProcess | null) {
    opencodeProcess = process;
}

export function setSessionReady(ready: boolean) {
    sessionReady = ready;
    notifyMobileStatusUpdate();
}

export function setCurrentMessage(message: MessageItem | null) {
    currentMessage = message;
}

export function setProcessingQueue(processing: boolean) {
    processingQueue = processing;
    notifyMobileStatusUpdate();
}

export function setIsResettingSession(resetting: boolean) {
    isResettingSession = resetting;
}

export function setCurrentRun(run: HistoryRun | null) {
    currentRun = run;
}

export function setExtensionContext(context: vscode.ExtensionContext) {
    extensionContext = context;
}

export function setSleepPreventionProcess(process: ChildProcess | null) {
    sleepPreventionProcess = process;
}

export function setSleepPreventionActive(active: boolean) {
    sleepPreventionActive = active;
}

export function setHealthCheckTimer(timer: NodeJS.Timeout | null) {
    healthCheckTimer = timer;
}

export function setResumeTimer(timer: NodeJS.Timeout | null) {
    resumeTimer = timer;
}

export function setCountdownInterval(interval: NodeJS.Timeout | null) {
    countdownInterval = interval;
}

export function setOpenCodeOutputTimer(timer: NodeJS.Timeout | null) {
    opencodeOutputTimer = timer;
}

export function setOpenCodeAutoClearTimer(timer: NodeJS.Timeout | null) {
    opencodeAutoClearTimer = timer;
}

export function setOpenCodeOutputBuffer(buffer: string) {
    opencodeOutputBuffer = buffer;
}

export function setOpenCodeCurrentScreen(screen: string) {
    opencodeCurrentScreen = screen;
}

export function setLastOpenCodeOutputTime(time: number) {
    lastOpenCodeOutputTime = time;
}

export function setDebugMode(debug: boolean) {
    debugMode = debug;
}

// Helper function to notify mobile clients of status updates
function notifyMobileStatusUpdate(): void {
    try {
        // Import here to avoid circular dependency
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { getMobileServer } = require('../services/mobile');
        const mobileServer = getMobileServer();
        if (mobileServer.isRunning()) {
            mobileServer.notifyStatusUpdate();
        }
    } catch {
        // Silently fail if mobile service isn't available
    }
}

// Helper function to notify mobile clients of queue updates
function notifyMobileQueueUpdate(): void {
    try {
        // Import here to avoid circular dependency
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { getMobileServer } = require('../services/mobile');
        const mobileServer = getMobileServer();
        if (mobileServer.isRunning()) {
            mobileServer.notifyQueueUpdate();
        }
    } catch {
        // Silently fail if mobile service isn't available
    }
}
