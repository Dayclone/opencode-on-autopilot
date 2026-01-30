
import { expect } from 'chai';
import { formatTerminalOutput } from '../../../src/utils/logging';

describe('Logging Utils', () => {
    describe('formatTerminalOutput', () => {
        it('should format opencode output correctly', () => {
            const output = formatTerminalOutput('Hello OpenCode', 'opencode');
            expect(output).to.contain('🤖 [CLAUDE');
            expect(output).to.contain('Hello OpenCode');
            expect(output).to.contain('>>> [END CLAUDE OUTPUT]');
        });

        it('should format debug output correctly', () => {
            const output = formatTerminalOutput('Debug info', 'debug');
            expect(output).to.contain('[DEBUG');
            expect(output).to.contain('Debug info');
        });

        it('should format error output correctly', () => {
            const output = formatTerminalOutput('Error happened', 'error');
            expect(output).to.contain('❌ [ERROR');
            expect(output).to.contain('Error happened');
        });

        it('should format info output correctly', () => {
            const output = formatTerminalOutput('Info message', 'info');
            expect(output).to.contain('ℹ️  [INFO');
            expect(output).to.contain('Info message');
        });

        it('should format success output correctly', () => {
            const output = formatTerminalOutput('Success!', 'success');
            expect(output).to.contain('✅ [SUCCESS');
            expect(output).to.contain('Success!');
        });

        it('should format default output correctly (when type is invalid but TS might allow cast)', () => {
            // @ts-expect-error: Mocking
            const output = formatTerminalOutput('Default msg', 'unknown');
            expect(output).to.contain('Default msg');
        });
    });
});
