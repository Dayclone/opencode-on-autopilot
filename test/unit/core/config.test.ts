
import { expect } from 'chai';
import { validateConfig, OpenCodeAutopilotConfig, DEFAULT_CONFIG } from '../../../src/core/config';

describe('Config Core', () => {
    describe('validateConfig', () => {
        it('should return empty array for valid config', () => {
            const config: Partial<OpenCodeAutopilotConfig> = { ...DEFAULT_CONFIG };
            const errors = validateConfig(config);
            expect(errors).to.be.an('array').that.is.empty;
        });

        it('should validate developmentMode', () => {
            const config: any = { developmentMode: 'invalid' };
            const errors = validateConfig(config);
            expect(errors).to.have.lengthOf(1);
            expect(errors[0].path).to.equal('developmentMode');
        });

        it('should validate queue settings', () => {
            const config: any = { 
                queue: {
                    maxSize: 5 // Minimum is 10
                }
            };
            const errors = validateConfig(config);
            expect(errors).to.have.lengthOf(1);
            expect(errors[0].path).to.equal('queue.maxSize');
        });

        it('should validate session scheduledStartTime', () => {
            const config: any = {
                session: {
                    scheduledStartTime: '25:00' // Invalid time
                }
            };
            const errors = validateConfig(config);
            expect(errors).to.have.lengthOf(1);
            expect(errors[0].path).to.equal('session.scheduledStartTime');
        });

        it('should detect conflicting session settings', () => {
            const config: any = {
                session: {
                    autoStart: true,
                    scheduledStartTime: '09:00'
                }
            };
            const errors = validateConfig(config);
            expect(errors).to.have.lengthOf(1);
            expect(errors[0].path).to.equal('session.scheduledStartTime');
        });
    });
});
