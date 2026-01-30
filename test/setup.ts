
const Module = require('module');

const originalRequire = Module.prototype.require;

// Mock vscode module
const vscodeMock = {
    workspace: {
        getConfiguration: () => ({
            get: (key: string, defaultValue: any) => defaultValue,
            update: () => Promise.resolve()
        }),
        onDidChangeConfiguration: () => ({ dispose: () => {} })
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

Module.prototype.require = function(request: string) {
    if (request === 'vscode') {
        return vscodeMock;
    }
    // eslint-disable-next-line prefer-rest-params
    return originalRequire.apply(this, arguments);
};
