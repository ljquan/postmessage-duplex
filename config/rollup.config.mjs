import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import replace from '@rollup/plugin-replace';
import stripBanner from 'rollup-plugin-strip-banner';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const input = path.resolve(__dirname, '../src/index.ts');

// 共享的插件配置
const createPlugins = (emitDeclarations = false) => [
    replace({
        values: {
            __PKG_VERSION__: JSON.stringify(pkg.version),
            __PKG_NAME__: JSON.stringify(pkg.name),
        },
        preventAssignment: true,
    }),
    stripBanner({
        include: '**/*.js',
        exclude: 'node_modules/**/*',
    }),
    nodeResolve(),
    typescript({
        tsconfig: './tsconfig.json',
        declaration: emitDeclarations,
        declarationDir: emitDeclarations ? './dist' : undefined,
        include: ['src/**/*.ts'],
        exclude: ['node_modules', 'test/**/*']
    }),
    terser({
        compress: {
            drop_console: false,
            passes: 3,
            pure_getters: true,
            unsafe_arrows: true,
            unsafe_methods: true,
            toplevel: true,
            booleans_as_integers: true
        },
        mangle: {
            properties: {
                regex: /^_[a-z]/  // Only mangle private properties starting with _lowercase
            },
            toplevel: true
        },
        format: {
            comments: false
        }
    }),
];

export default [
    // ESM build (for bundlers and modern environments)
    {
        input,
        output: {
            file: 'dist/index.esm.js',
            format: 'es',
            exports: 'named',
            sourcemap: true
        },
        plugins: createPlugins(true), // 只在 ESM 构建中生成声明文件
    },
    // CJS build (for Node.js require())
    {
        input,
        output: {
            file: 'dist/index.cjs.js',
            format: 'cjs',
            exports: 'named',
            sourcemap: true
        },
        plugins: createPlugins(false),
    },
    // UMD build (for browsers and CDN)
    {
        input,
        output: {
            file: 'dist/index.umd.js',
            format: 'umd',
            name: 'PostMessageChannel',
            exports: 'named',
            sourcemap: true
        },
        plugins: createPlugins(false),
    }
];
