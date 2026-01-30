const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const production = process.env.NODE_ENV === 'production';
const watch = process.argv.includes('--watch');

async function main() {
    const ctx = await esbuild.context({
        entryPoints: ['src/extension.ts'],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outfile: 'out/extension.js',
        external: ['vscode'],
        logLevel: 'info',
        loader: {
            '.py': 'text',
        },
    });

    if (watch) {
        await ctx.watch();
    } else {
        await ctx.rebuild();
        await ctx.dispose();
    }

    // Copy assets
    copyAssets();
}

function copyAssets() {
    const outDir = path.resolve(__dirname, 'out');
    const srcDir = path.resolve(__dirname, 'src');

    // Ensure out dir exists
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir);
    }

    // Copy Python wrapper
    const pythonDest = path.join(outDir, 'opencode', 'session');
    fs.mkdirSync(pythonDest, { recursive: true });
    fs.copyFileSync(
        path.join(srcDir, 'opencode_pty_wrapper.py'),
        path.join(pythonDest, 'opencode_pty_wrapper.py')
    );

    // Copy Webview
    copyFolderRecursiveSync(
        path.join(srcDir, 'webview'),
        outDir
    );

    console.log('✅ Assets copied to out directory');
}

function copyFolderRecursiveSync(source, target) {
    let files = [];

    // Check if folder needs to be created or integrated
    const targetFolder = path.join(target, path.basename(source));
    if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder);
    }

    // Copy
    if (fs.lstatSync(source).isDirectory()) {
        files = fs.readdirSync(source);
        files.forEach(function (file) {
            const curSource = path.join(source, file);
            if (fs.lstatSync(curSource).isDirectory()) {
                copyFolderRecursiveSync(curSource, targetFolder);
            } else {
                fs.copyFileSync(curSource, path.join(targetFolder, file));
            }
        });
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
