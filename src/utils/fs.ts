import * as fs from 'fs';

export const fsUtils = {
    existsSync: fs.existsSync,
    statSync: fs.statSync,
    readFile: fs.readFile,
    readFileSync: fs.readFileSync,
    writeFile: fs.writeFile,
    writeFileSync: fs.writeFileSync,
    accessSync: fs.accessSync,
    constants: fs.constants,
    promises: fs.promises
};
