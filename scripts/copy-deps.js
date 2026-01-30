const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'out');

console.log('Starting copy-deps script...');

// Ensure out dir exists
if (!fs.existsSync(outDir)) {
    console.error('Error: "out" directory does not exist. Please run "npm run compile" first.');
    process.exit(1);
}

// Remove out/node_modules
const outNodeModules = path.join(outDir, 'node_modules');
if (fs.existsSync(outNodeModules)) {
    console.log('Removing existing node_modules in out directory...');
    fs.rmSync(outNodeModules, { recursive: true, force: true });
}

// Create minimal package.json in out
console.log('Creating minimal package.json in out directory...');
const pkg = {
    name: "opencode-autopilot-dist",
    version: "1.0.0",
    description: "Distribution dependencies",
    license: "MIT"
};
fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(pkg, null, 2));

// Get dependencies from root package.json
const rootPkg = require(path.join(rootDir, 'package.json'));
const deps = rootPkg.dependencies || {};
const depList = Object.keys(deps).map(dep => `${dep}@${deps[dep]}`).join(' ');

if (depList) {
    console.log(`Installing production dependencies: ${depList}`);
    try {
        // Using shell: true to support command execution on Windows
        execSync(`npm install --production ${depList}`, { 
            cwd: outDir, 
            stdio: 'inherit',
            shell: true 
        });
        console.log('Dependencies installed successfully.');
    } catch (e) {
        console.error('Failed to install dependencies:', e.message);
        process.exit(1);
    }
} else {
    console.log('No dependencies found to install.');
}
