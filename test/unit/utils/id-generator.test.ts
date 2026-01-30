
import { expect } from 'chai';
import { generateMessageId, isValidMessageId } from '../../../src/utils/id-generator';

describe('ID Generator Utils', () => {
    describe('generateMessageId', () => {
        it('should generate a string starting with msg_', () => {
            const id = generateMessageId();
            expect(id).to.be.a('string');
            expect(id.startsWith('msg_')).to.be.true;
        });

        it('should generate unique IDs', () => {
            const id1 = generateMessageId();
            const id2 = generateMessageId();
            expect(id1).to.not.equal(id2);
        });
    });

    describe('isValidMessageId', () => {
        it('should return true for valid IDs', () => {
            const id = generateMessageId();
            expect(isValidMessageId(id)).to.be.true;
        });

        it('should return false for invalid IDs', () => {
            expect(isValidMessageId('invalid_id')).to.be.false;
            expect(isValidMessageId('')).to.be.false;
            expect(isValidMessageId('msg_short')).to.be.false; // Assuming length check in implementation
            // The implementation checks for length > 10. 'msg_' is 4 chars.
        });
    });
});
