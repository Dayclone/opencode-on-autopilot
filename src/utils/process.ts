import * as cp from 'child_process';

export const processUtils = {
    spawn: cp.spawn,
    spawnSync: cp.spawnSync,
    exec: cp.exec
};
