"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const config_1 = require("../../../src/core/config");
describe('Config Core', () => {
    describe('validateConfig', () => {
        it('should return empty array for valid config', () => {
            const config = { ...config_1.DEFAULT_CONFIG };
            const errors = (0, config_1.validateConfig)(config);
            (0, chai_1.expect)(errors).to.be.an('array').that.is.empty;
        });
        it('should validate developmentMode', () => {
            const config = { developmentMode: 'invalid' };
            const errors = (0, config_1.validateConfig)(config);
            (0, chai_1.expect)(errors).to.have.lengthOf(1);
            (0, chai_1.expect)(errors[0].path).to.equal('developmentMode');
        });
        it('should validate queue settings', () => {
            const config = {
                queue: {
                    maxSize: 5 // Minimum is 10
                }
            };
            const errors = (0, config_1.validateConfig)(config);
            (0, chai_1.expect)(errors).to.have.lengthOf(1);
            (0, chai_1.expect)(errors[0].path).to.equal('queue.maxSize');
        });
        it('should validate session scheduledStartTime', () => {
            const config = {
                session: {
                    scheduledStartTime: '25:00' // Invalid time
                }
            };
            const errors = (0, config_1.validateConfig)(config);
            (0, chai_1.expect)(errors).to.have.lengthOf(1);
            (0, chai_1.expect)(errors[0].path).to.equal('session.scheduledStartTime');
        });
        it('should detect conflicting session settings', () => {
            const config = {
                session: {
                    autoStart: true,
                    scheduledStartTime: '09:00'
                }
            };
            const errors = (0, config_1.validateConfig)(config);
            (0, chai_1.expect)(errors).to.have.lengthOf(1);
            (0, chai_1.expect)(errors[0].path).to.equal('session.autoStart + session.scheduledStartTime');
        });
    });
});
//# sourceMappingURL=config.test.js.map