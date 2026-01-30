"use strict";
const Module = require('module');
const originalRequire = Module.prototype.require;
// Mock vscode module
const vscodeMock = {
    workspace: {
        getConfiguration: () => ({
            get: (key, defaultValue) => defaultValue,
            update: () => Promise.resolve()
        }),
        onDidChangeConfiguration: () => ({ dispose: () => { } })
    },
    window: {
        showWarningMessage: () => Promise.resolve(),
        showInformationMessage: () => Promise.resolve(),
        showErrorMessage: () => Promise.resolve()
    },
    commands: {
        executeCommand: () => Promise.resolve()
    }
};
Module.prototype.require = function (request) {
    if (request === 'vscode') {
        return vscodeMock;
    }
    return originalRequire.apply(this, arguments);
};
//# sourceMappingURL=setup.js.map