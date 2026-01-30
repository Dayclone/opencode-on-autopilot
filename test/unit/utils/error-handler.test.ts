
import { expect } from 'chai';
import { getErrorMessage, formatErrorMessage, ErrorContext } from '../../../src/utils/error-handler';

describe('Error Handler Utils', () => {
    describe('getErrorMessage', () => {
        it('should extract message from Error object', () => {
            const error = new Error('Test error');
            expect(getErrorMessage(error)).to.equal('Test error');
        });

        it('should return string if error is a string', () => {
            expect(getErrorMessage('String error')).to.equal('String error');
        });

        it('should extract message from object with message property', () => {
            const error = { message: 'Object error' };
            expect(getErrorMessage(error)).to.equal('Object error');
        });

        it('should stringify other types', () => {
            expect(getErrorMessage(123)).to.equal('123');
        });
    });

    describe('formatErrorMessage', () => {
        it('should format error without context', () => {
            const error = new Error('Test error');
            expect(formatErrorMessage(error)).to.equal('Test error');
        });

        it('should format error with operation context', () => {
            const error = new Error('Test error');
            const context: ErrorContext = { operation: 'TestOp' };
            expect(formatErrorMessage(error, context)).to.equal('TestOp: Test error');
        });

        it('should format error with operation and details', () => {
            const error = new Error('Test error');
            const context: ErrorContext = { 
                operation: 'TestOp',
                details: { id: 123, type: 'test' }
            };
            const message = formatErrorMessage(error, context);
            expect(message).to.contain('TestOp: Test error');
            expect(message).to.contain('id=123');
            expect(message).to.contain('type=test');
        });
    });
});
