
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { processUtils } from '../../../../src/utils/process';
import { fsUtils } from '../../../../src/utils/fs';
import * as path from 'path';
import { getGitStatus } from '../../../../src/services/git/status';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

describe('Git Status Service', () => {
    let spawnStub: sinon.SinonStub;
    let fsExistsSyncStub: sinon.SinonStub;
    let fsStatSyncStub: sinon.SinonStub;

    beforeEach(() => {
        // Setup vscode workspace mock
        // @ts-expect-error: Mocking
        vscode.workspace.workspaceFolders = [{
            uri: { fsPath: '/mock/workspace' },
            index: 0,
            name: 'mock-workspace'
        }];

        spawnStub = sinon.stub(processUtils, 'spawn');
        fsExistsSyncStub = sinon.stub(fsUtils, 'existsSync');
        fsStatSyncStub = sinon.stub(fsUtils, 'statSync');
    });

    afterEach(() => {
        sinon.restore();
        // @ts-expect-error: Mocking
        delete vscode.workspace.workspaceFolders;
    });

    function mockSpawnProcess(stdoutData: string, exitCode: number = 0) {
        const mockProcess = new EventEmitter();
        // @ts-expect-error: Mocking
        mockProcess.stdout = new PassThrough();
        // @ts-expect-error: Mocking
        mockProcess.stderr = new PassThrough();
        // @ts-expect-error: Mocking
        mockProcess.kill = sinon.stub();
        
        spawnStub.returns(mockProcess as any);
        
        setTimeout(() => {
            if (stdoutData) {
                // @ts-expect-error: Mocking
                mockProcess.stdout.emit('data', stdoutData);
            }
            mockProcess.emit('close', exitCode);
        }, 10);
        
        return mockProcess;
    }

    it('should throw error if no workspace', async () => {
        // @ts-expect-error: Mocking
        vscode.workspace.workspaceFolders = undefined;
        try {
            await getGitStatus();
            expect.fail('Should have thrown error');
        } catch (err: any) {
            expect(err.message).to.equal('No workspace available');
        }
    });

    it('should throw error if not a git repo', async () => {
        fsExistsSyncStub.callsFake((p: string) => {
            return !p.endsWith('.git');
        });
        
        try {
            await getGitStatus();
            expect.fail('Should have thrown error');
        } catch (err: any) {
            expect(err.message).to.equal('Not a git repository');
        }
    });

    it('should return clean status', async () => {
        fsExistsSyncStub.returns(true);
        mockSpawnProcess(''); // Empty status output

        const result = await getGitStatus();
        expect(result.files).to.be.empty;
        expect(result.isClean).to.be.true;
    });

    it('should parse modified file', async () => {
        fsExistsSyncStub.returns(true);
        
        // Mock fs.statSync to return file (not directory)
        fsStatSyncStub.returns({
            isDirectory: () => false
        });

        // We need to handle multiple calls to spawn:
        // 1. git status
        // 2. git diff (for stats)
        
        const process1 = new EventEmitter();
        // @ts-expect-error: Mocking
        process1.stdout = new PassThrough();
        // @ts-expect-error: Mocking
        process1.stderr = new PassThrough();
        // @ts-expect-error: Mocking
        process1.kill = sinon.stub();
        
        const process2 = new EventEmitter();
        // @ts-expect-error: Mocking
        process2.stdout = new PassThrough();
        // @ts-expect-error: Mocking
        process2.stderr = new PassThrough();
        // @ts-expect-error: Mocking
        process2.kill = sinon.stub();

        spawnStub.onCall(0).returns(process1 as any);
        spawnStub.onCall(1).returns(process2 as any);

        const promise = getGitStatus();

        // status output: M  file.txt
        setTimeout(() => {
             // @ts-expect-error: Mocking
            process1.stdout.emit('data', ' M file.txt\0');
            process1.emit('close', 0);
        }, 10);

        // diff output: 5\t2\tfile.txt
        setTimeout(() => {
             // @ts-expect-error: Mocking
            process2.stdout.emit('data', '5\t2\tfile.txt\n');
            process2.emit('close', 0);
        }, 20);

        const result = await promise;
        
        expect(result.files).to.have.lengthOf(1);
        expect(result.files[0].path).to.equal('file.txt');
        expect(result.files[0].status).to.equal('modified');
        expect(result.files[0].additions).to.equal(5);
        expect(result.files[0].deletions).to.equal(2);
    });
});
