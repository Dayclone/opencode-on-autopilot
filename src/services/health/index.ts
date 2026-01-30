import * as vscode from 'vscode';
import { opencodeProcess, sessionReady, processingQueue, currentMessage, healthCheckTimer, setSessionReady, setOpenCodeProcess, setProcessingQueue, setCurrentMessage, setHealthCheckTimer } from '../../core/state';
import { debugLog } from '../../utils/logging';
import { updateWebviewContent, updateSessionState } from '../../ui/webview';
import { HEALTH_CHECK_INTERVAL_MS } from '../../core/constants';

export function isOpenCodeProcessHealthy(): boolean {
    if (!opencodeProcess) {
        return false;
    }
    
    if (opencodeProcess.killed || opencodeProcess.exitCode !== null) {
        debugLog('❌ OpenCode process is killed or exited');
        return false;
    }
    
    if (!opencodeProcess.stdin || opencodeProcess.stdin.destroyed || !opencodeProcess.stdin.writable) {
        debugLog('❌ OpenCode process stdin is not writable');
        return false;
    }
    
    return true;
}

export function startHealthCheck(): void {
    if (healthCheckTimer) {
        clearTimeout(healthCheckTimer);
    }
    
    const timer = setInterval(() => {
        if (sessionReady && !isOpenCodeProcessHealthy()) {
            debugLog('🩺 Health check failed - OpenCode process is unhealthy');
            
            setSessionReady(false);
            setOpenCodeProcess(null);
            
            if (processingQueue) {
                setProcessingQueue(false);
                
                if (currentMessage && currentMessage.status === 'processing') {
                    currentMessage.status = 'error';
                    currentMessage.error = 'OpenCode process became unhealthy';
                    setCurrentMessage(null);
                }
            }
            
            updateWebviewContent();
            updateSessionState();
            
            if (healthCheckTimer) {
                clearTimeout(healthCheckTimer);
                setHealthCheckTimer(null);
            }
            
            vscode.window.showWarningMessage('OpenCode process became unhealthy. Please restart the session.');
        }
    }, HEALTH_CHECK_INTERVAL_MS);
    
    setHealthCheckTimer(timer);
    debugLog('🩺 Started health monitoring for OpenCode process');
}

export function stopHealthCheck(): void {
    if (healthCheckTimer) {
        clearTimeout(healthCheckTimer);
        setHealthCheckTimer(null);
        debugLog('🩺 Stopped health monitoring');
    }
}