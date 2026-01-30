
import { expect } from 'chai';
import { saveWorkspaceHistory, loadWorkspaceHistory, startNewHistoryRun, endCurrentHistoryRun } from '../../../src/queue/processor/history';
import { setExtensionContext, setCurrentRun, currentRun, setOpenCodePanel } from '../../../src/core/state';
import { HistoryRun } from '../../../src/core/types';

describe('Queue History', () => {
    let mockContext: any;
    let storage: { [key: string]: any } = {};

    beforeEach(() => {
        storage = {};
        mockContext = {
            globalState: {
                get: (key: string, defaultValue: any) => storage[key] || defaultValue,
                update: (key: string, value: any) => {
                    storage[key] = value;
                    return Promise.resolve();
                }
            }
        };
        setExtensionContext(mockContext);
        setOpenCodePanel(null); // Ensure no panel interaction unless mocked
    });

    describe('History Management', () => {
        it('should start a new history run', () => {
            startNewHistoryRun();
            expect(currentRun).to.not.be.null;
            expect(currentRun?.id).to.include('run_');
            expect(currentRun?.messages).to.be.empty;
        });

        it('should save history', () => {
            startNewHistoryRun();
            saveWorkspaceHistory();
            
            // Check storage
            // The key is dynamic based on workspace path, which is mocked or empty
            const keys = Object.keys(storage);
            // We expect at least one key for history
            const historyKey = keys.find(k => k.includes('opencodeautopilot_history'));
            expect(historyKey).to.not.be.undefined;
            
            const history = storage[historyKey!] as HistoryRun[];
            expect(history).to.have.lengthOf(1);
            expect(history[0].id).to.equal(currentRun?.id);
        });

        it('should end current history run', () => {
            startNewHistoryRun();
            endCurrentHistoryRun();
            
            expect(currentRun?.endTime).to.not.be.undefined;
            
            // Verify it was saved
            const keys = Object.keys(storage);
            const historyKey = keys.find(k => k.includes('opencodeautopilot_history'));
            const history = storage[historyKey!] as HistoryRun[];
            expect(history[0].endTime).to.not.be.undefined;
        });
    });
});
