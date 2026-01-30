const globals = require('globals');
const pluginJs = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = [
  {
    ignores: ["out/**", "node_modules/**", "dist/**", "coverage/**", ".nyc_output/**"]
  },
  {
    // ES6 modules (most files in web/js/)
    files: ["src/webview/web/js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        WebSocket: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        navigator: "readonly",
        URLSearchParams: "readonly",
        confirm: "readonly",
        getComputedStyle: "readonly",
        requestAnimationFrame: "readonly"
      }
    },
    rules: {
      "indent": ["error", 4],
      "quotes": ["error", "single"],
      "semi": ["error", "always"],
      "no-unused-vars": "warn",
      "no-console": "warn",
      "no-undef": "error"
    }
  },
  {
    // Script files (extension/script.js and others)
    files: ["src/webview/extension/**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        WebSocket: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        acquireVsCodeApi: "readonly",
        navigator: "readonly",
        URLSearchParams: "readonly",
        confirm: "readonly",
        getComputedStyle: "readonly",
        requestAnimationFrame: "readonly"
      }
    },
    rules: {
      "indent": ["error", 4],
      "quotes": ["error", "single"],
      "semi": ["error", "always"],
      "no-unused-vars": "warn",
      "no-console": "off",
      "no-undef": "error"
    }
  },
  // TypeScript Configuration
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ["src/**/*.ts", "test/**/*.ts", "scripts/**/*.ts"],
  })),
  {
    files: ["src/**/*.ts", "test/**/*.ts", "scripts/**/*.ts"],
    languageOptions: {
        globals: {
            ...globals.node,
            ...globals.es2021
        }
    },
    rules: {
        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
        "no-console": "off", // VS Code extensions often use console for logging to Output channel
        "@typescript-eslint/no-var-requires": "off" // Common in VS Code extensions
    }
  },
  // Test specific overrides
  {
    files: ["test/**/*.ts"],
    rules: {
        "@typescript-eslint/no-unused-expressions": "off",
        "@typescript-eslint/no-require-imports": "off",
        "@typescript-eslint/no-explicit-any": "off"
    }
  }
];
