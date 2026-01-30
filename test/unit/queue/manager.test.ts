
import { expect } from 'chai';
import { setMessageQueue, messageQueue } from '../../../src/core/state';
import { removeMessageFromQueue, clearMessageQueue, duplicateMessageInQueue, reorderQueue, editMessageInQueue } from '../../../src/queue/manager';
import { MessageItem } from '../../../src/core/types';

describe('Queue Manager', () => {
    beforeEach(() => {
        setMessageQueue([]);
    });

    describe('removeMessageFromQueue', () => {
        it('should remove existing message', () => {
            const message: MessageItem = { id: '1', text: 'test', status: 'pending', timestamp: new Date().toISOString() };
            setMessageQueue([message]);
            removeMessageFromQueue('1');
            expect(messageQueue.length).to.equal(0);
        });

        it('should handle non-existent message gracefully', () => {
            setMessageQueue([]);
            removeMessageFromQueue('1');
            expect(messageQueue.length).to.equal(0);
        });
    });

    describe('clearMessageQueue', () => {
        it('should clear all messages', () => {
            setMessageQueue([
                { id: '1', text: 'test1', status: 'pending', timestamp: new Date().toISOString() },
                { id: '2', text: 'test2', status: 'completed', timestamp: new Date().toISOString() }
            ]);
            clearMessageQueue();
            expect(messageQueue.length).to.equal(0);
        });
    });
    
    describe('duplicateMessageInQueue', () => {
        it('should duplicate message', () => {
            const message: MessageItem = { id: '1', text: 'test', status: 'completed', timestamp: new Date().toISOString() };
            setMessageQueue([message]);
            duplicateMessageInQueue('1');
            expect(messageQueue.length).to.equal(2);
            expect(messageQueue[1].text).to.equal('test');
            expect(messageQueue[1].status).to.equal('pending');
            expect(messageQueue[1].id).to.not.equal('1');
        });
    });

    describe('reorderQueue', () => {
        it('should move message to new position', () => {
             const messages: MessageItem[] = [
                { id: '1', text: 'test1', status: 'pending', timestamp: new Date().toISOString() },
                { id: '2', text: 'test2', status: 'pending', timestamp: new Date().toISOString() },
                { id: '3', text: 'test3', status: 'pending', timestamp: new Date().toISOString() }
            ];
            setMessageQueue(messages);
            reorderQueue(0, 2); // Move 1 to end
            expect(messageQueue[2].id).to.equal('1');
            expect(messageQueue[0].id).to.equal('2');
            expect(messageQueue[1].id).to.equal('3');
        });
    });
    
    describe('editMessageInQueue', () => {
        it('should update message text', () => {
            const message: MessageItem = { id: '1', text: 'old', status: 'pending', timestamp: new Date().toISOString() };
            setMessageQueue([message]);
            editMessageInQueue('1', 'new');
            expect(messageQueue[0].text).to.equal('new');
        });
    });
});
