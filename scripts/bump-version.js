#!/usr/bin/env node
/**
 * Version Bump Script
 * 
 * Usage:
 *   node scripts/bump-version.js patch   # 0.1.7 -> 0.1.8
 *   node scripts/bump-version.js minor   # 0.1.7 -> 0.2.0
 *   node scripts/bump-version.js major   # 0.1.7 -> 1.0.0
 *   node scripts/bump-version.js 0.2.0   # Set specific version
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const currentVersion = packageJson.version;
const bumpType = process.argv[2];

if (!bumpType) {
    console.error('Usage: node scripts/bump-version.js <patch|minor|major|x.x.x>');
    process.exit(1);
}

function bumpVersion(version, type) {
    const [major, minor, patch] = version.split('.').map(Number);
    
    switch (type) {
        case 'major':
            return `${major + 1}.0.0`;
        case 'minor':
            return `${major}.${minor + 1}.0`;
        case 'patch':
            return `${major}.${minor}.${patch + 1}`;
        default:
            // Assume it's a specific version
            if (/^\d+\.\d+\.\d+$/.test(type)) {
                return type;
            }
            throw new Error(`Invalid version type: ${type}`);
    }
}

try {
    const newVersion = bumpVersion(currentVersion, bumpType);
    
    console.log(`Bumping version: ${currentVersion} -> ${newVersion}`);
    
    // Update package.json
    packageJson.version = newVersion;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    
    console.log(`Updated package.json`);
    console.log('');
    console.log('Next steps:');
    console.log(`  1. Commit the change: git commit -am "chore: bump version to ${newVersion}"`);
    console.log(`  2. Create a tag: git tag v${newVersion}`);
    console.log(`  3. Push with tags: git push && git push --tags`);
    console.log('');
    console.log('The release workflow will automatically create a GitHub release with the .vsix file.');
    
} catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
}
