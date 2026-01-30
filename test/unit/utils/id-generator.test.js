"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const id_generator_1 = require("../../../src/utils/id-generator");
describe('ID Generator Utils', () => {
    describe('generateMessageId', () => {
        it('should generate a string starting with msg_', () => {
            const id = (0, id_generator_1.generateMessageId)();
            (0, chai_1.expect)(id).to.be.a('string');
            (0, chai_1.expect)(id.startsWith('msg_')).to.be.true;
        });
        it('should generate unique IDs', () => {
            const id1 = (0, id_generator_1.generateMessageId)();
            const id2 = (0, id_generator_1.generateMessageId)();
            (0, chai_1.expect)(id1).to.not.equal(id2);
        });
    });
    describe('isValidMessageId', () => {
        it('should return true for valid IDs', () => {
            const id = (0, id_generator_1.generateMessageId)();
            (0, chai_1.expect)((0, id_generator_1.isValidMessageId)(id)).to.be.true;
        });
        it('should return false for invalid IDs', () => {
            (0, chai_1.expect)((0, id_generator_1.isValidMessageId)('invalid_id')).to.be.false;
            (0, chai_1.expect)((0, id_generator_1.isValidMessageId)('')).to.be.false;
            (0, chai_1.expect)((0, id_generator_1.isValidMessageId)('msg_short')).to.be.false; // Assuming length check in implementation
            // The implementation checks for length > 10. 'msg_' is 4 chars.
        });
    });
});
//# sourceMappingURL=id-generator.test.js.map