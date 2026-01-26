// 版本信息（构建时由 Rollup 注入）
declare const __PKG_NAME__: string;
declare const __PKG_VERSION__: string;

export const PKG_NAME = typeof __PKG_NAME__ !== 'undefined' ? __PKG_NAME__ : 'postmessage-duplex';
export const PKG_VERSION = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : '0.0.0-dev';

// 兼容 Service Worker 环境
const globalScope = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : {}) as any;

// 注册版本信息到全局对象
if (!globalScope.__POSTMESSAGE_DUPLEX__) {
  globalScope.__POSTMESSAGE_DUPLEX__ = {};
}
globalScope.__POSTMESSAGE_DUPLEX__.version = PKG_VERSION;
globalScope.__POSTMESSAGE_DUPLEX__.name = PKG_NAME;
