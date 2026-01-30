
import { expect } from 'chai';
import { isOpenCodeProcessHealthy } from '../../../src/services/health';
import { setOpenCodeProcess } from '../../../src/core/state';
import { ChildProcess } from 'child_process';

// Mock ChildProcess type
type MockChildProcess = ChildProcess & {
    killed: boolean;
    exitCode: number | null;
    stdin: {
        destroyed: boolean;
        writable: boolean;
    } | null;
};

describe('Health Service', () => {
    // Reset process state after each test
    afterEach(() => {
        setOpenCodeProcess(null);
    });

    describe('isOpenCodeProcessHealthy', () => {
        it('should return false if no process', () => {
            setOpenCodeProcess(null);
            expect(isOpenCodeProcessHealthy()).to.be.false;
        });

        it('should return false if process killed', () => {
            const mockProcess = { killed: true, exitCode: null, stdin: { destroyed: false, writable: true } } as unknown as MockChildProcess;
            setOpenCodeProcess(mockProcess);
            expect(isOpenCodeProcessHealthy()).to.be.false;
        });
        
        it('should return false if process exitCode is set', () => {
            const mockProcess = { killed: false, exitCode: 1, stdin: { destroyed: false, writable: true } } as unknown as MockChildProcess;
            setOpenCodeProcess(mockProcess);
            expect(isOpenCodeProcessHealthy()).to.be.false;
        });

        it('should return false if stdin is missing', () => {
             const mockProcess = { killed: false, exitCode: null, stdin: null } as unknown as MockChildProcess;
             setOpenCodeProcess(mockProcess);
             expect(isOpenCodeProcessHealthy()).to.be.false;
        });

        it('should return false if stdin is destroyed', () => {
             const mockProcess = { killed: false, exitCode: null, stdin: { destroyed: true, writable: true } } as unknown as MockChildProcess;
             setOpenCodeProcess(mockProcess);
             expect(isOpenCodeProcessHealthy()).to.be.false;
        });

        it('should return false if stdin is not writable', () => {
             const mockProcess = { killed: false, exitCode: null, stdin: { destroyed: false, writable: false } } as unknown as MockChildProcess;
             setOpenCodeProcess(mockProcess);
             expect(isOpenCodeProcessHealthy()).to.be.false;
        });

        it('should return true if process is healthy', () => {
             const mockProcess = { 
                 killed: false, 
                 exitCode: null, 
                 stdin: { destroyed: false, writable: true } 
             } as unknown as MockChildProcess;
             setOpenCodeProcess(mockProcess);
             expect(isOpenCodeProcessHealthy()).to.be.true;
        });
    });
});
