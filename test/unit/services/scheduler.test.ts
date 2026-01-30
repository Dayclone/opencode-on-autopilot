
import { expect } from 'chai';
import * as vscode from 'vscode';
import { startScheduledSession, stopScheduledSession, isScheduled } from '../../../src/services/scheduler';

describe('Scheduler Service', () => {
    let originalGetConfiguration: any;

    before(() => {
        originalGetConfiguration = vscode.workspace.getConfiguration;
    });

    after(() => {
        (vscode.workspace as any).getConfiguration = originalGetConfiguration;
    });

    afterEach(() => {
        stopScheduledSession();
        (vscode.workspace as any).getConfiguration = originalGetConfiguration;
    });

    it('should not schedule if scheduledStartTime is empty (default)', () => {
        startScheduledSession(() => {});
        expect(isScheduled()).to.be.false;
    });

    it('should schedule if time is set', () => {
        (vscode.workspace as any).getConfiguration = () => ({
            get: (key: string, defaultValue: any) => {
                if (key === 'session.scheduledStartTime') return '23:59';
                if (key === 'session.autoStart') return false;
                return defaultValue;
            },
            update: () => Promise.resolve()
        });

        startScheduledSession(() => {});
        expect(isScheduled()).to.be.true;
    });

    it('should not schedule if autoStart is enabled', () => {
        (vscode.workspace as any).getConfiguration = () => ({
            get: (key: string, defaultValue: any) => {
                if (key === 'session.scheduledStartTime') return '23:59';
                if (key === 'session.autoStart') return true;
                return defaultValue;
            },
            update: () => Promise.resolve()
        });

        startScheduledSession(() => {});
        expect(isScheduled()).to.be.false;
    });
});
