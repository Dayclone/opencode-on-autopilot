"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const error_handler_1 = require("../../../src/utils/error-handler");
describe('Error Handler Utils', () => {
    describe('getErrorMessage', () => {
        it('should extract message from Error object', () => {
            const error = new Error('Test error');
            (0, chai_1.expect)((0, error_handler_1.getErrorMessage)(error)).to.equal('Test error');
        });
        it('should return string if error is a string', () => {
            (0, chai_1.expect)((0, error_handler_1.getErrorMessage)('String error')).to.equal('String error');
        });
        it('should extract message from object with message property', () => {
            const error = { message: 'Object error' };
            (0, chai_1.expect)((0, error_handler_1.getErrorMessage)(error)).to.equal('Object error');
        });
        it('should stringify other types', () => {
            (0, chai_1.expect)((0, error_handler_1.getErrorMessage)(123)).to.equal('123');
        });
    });
    describe('formatErrorMessage', () => {
        it('should format error without context', () => {
            const error = new Error('Test error');
            (0, chai_1.expect)((0, error_handler_1.formatErrorMessage)(error)).to.equal('Test error');
        });
        it('should format error with operation context', () => {
            const error = new Error('Test error');
            const context = { operation: 'TestOp' };
            (0, chai_1.expect)((0, error_handler_1.formatErrorMessage)(error, context)).to.equal('TestOp: Test error');
        });
        it('should format error with operation and details', () => {
            const error = new Error('Test error');
            const context = {
                operation: 'TestOp',
                details: { id: 123, type: 'test' }
            };
            const message = (0, error_handler_1.formatErrorMessage)(error, context);
            (0, chai_1.expect)(message).to.contain('TestOp: Test error');
            (0, chai_1.expect)(message).to.contain('id=123');
            (0, chai_1.expect)(message).to.contain('type=test');
        });
    });
});
//# sourceMappingURL=error-handler.test.js.map