
import { expect } from 'chai';
import { setMessageQueue, messageQueue } from '../../../src/core/state';
import { getQueueMemoryStats, enforceMessageSizeLimits, enforceQueueSizeLimit, cleanupOldCompletedMessages } from '../../../src/queue/memory';
import { MessageItem } from '../../../src/core/types';
import { DEFAULT_CONFIG } from '../../../src/core/config';

describe('Queue Memory', () => {
    beforeEach(() => {
        setMessageQueue([]);
    });

    describe('getQueueMemoryStats', () => {
        it('should return zero stats for empty queue', () => {
            const stats = getQueueMemoryStats();
            expect(stats.totalMessages).to.equal(0);
            expect(stats.completedMessages).to.equal(0);
            expect(stats.pendingMessages).to.equal(0);
            expect(stats.memoryUsageBytes).to.equal(0);
            expect(stats.needsCleanup).to.be.false;
        });

        it('should calculate stats for mixed queue', () => {
            const messages: MessageItem[] = [
                { id: '1', text: 'test1', status: 'completed', timestamp: new Date().toISOString() },
                { id: '2', text: 'test2', status: 'pending', timestamp: new Date().toISOString() },
                { id: '3', text: 'test3', status: 'error', timestamp: new Date().toISOString() }
            ];
            setMessageQueue(messages);

            const stats = getQueueMemoryStats();
            expect(stats.totalMessages).to.equal(3);
            expect(stats.completedMessages).to.equal(1);
            expect(stats.pendingMessages).to.equal(1);
            // 200 overhead + length of text
            expect(stats.memoryUsageBytes).to.be.greaterThan(600);
        });
    });

    describe('enforceMessageSizeLimits', () => {
        it('should not modify message within limits', () => {
            const message: MessageItem = {
                id: '1',
                text: 'short text',
                status: 'pending',
                timestamp: new Date().toISOString()
            };
            const result = enforceMessageSizeLimits(message);
            expect(result.text).to.equal('short text');
        });

        it('should truncate message text exceeding limit', () => {
            const longText = 'a'.repeat(DEFAULT_CONFIG.queue.maxMessageSize + 1000);
            const message: MessageItem = {
                id: '1',
                text: longText,
                status: 'pending',
                timestamp: new Date().toISOString()
            };
            const result = enforceMessageSizeLimits(message);
            expect(result.text.length).to.be.lessThan(longText.length);
            expect(result.text).to.include('[truncated due to size limit]');
        });

        it('should truncate output exceeding limit', () => {
            const longOutput = 'a'.repeat(DEFAULT_CONFIG.queue.maxOutputSize + 1000);
            const message: MessageItem = {
                id: '1',
                text: 'test',
                output: longOutput,
                status: 'completed',
                timestamp: new Date().toISOString()
            };
            const result = enforceMessageSizeLimits(message);
            expect(result.output?.length).to.be.lessThan(longOutput.length);
            expect(result.output).to.include('[truncated due to size limit]');
        });
    });

    describe('enforceQueueSizeLimit', () => {
        it('should not remove messages if within limit', () => {
            const messages: MessageItem[] = Array.from({ length: 5 }, (_, i) => ({
                id: `${i}`,
                text: `msg ${i}`,
                status: 'completed',
                timestamp: new Date().toISOString()
            }));
            setMessageQueue(messages);
            enforceQueueSizeLimit();
            expect(messageQueue.length).to.equal(5);
        });
    });
    
    describe('cleanupOldCompletedMessages', () => {
        it('should remove old completed messages', () => {
             const oldDate = new Date();
             oldDate.setHours(oldDate.getHours() - (DEFAULT_CONFIG.queue.retentionHours + 1));
             
             const messages: MessageItem[] = [
                 { id: '1', text: 'old', status: 'completed', timestamp: oldDate.toISOString() },
                 { id: '2', text: 'new', status: 'completed', timestamp: new Date().toISOString() },
                 { id: '3', text: 'pending', status: 'pending', timestamp: oldDate.toISOString() } // Should keep pending
             ];
             setMessageQueue(messages);
             
             const removed = cleanupOldCompletedMessages();
             expect(removed).to.equal(1);
             expect(messageQueue.length).to.equal(2);
             expect(messageQueue.find(m => m.id === '1')).to.be.undefined;
        });
    });
});
