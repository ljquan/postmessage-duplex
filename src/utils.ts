/**
 * Common utility functions for postmessage-duplex library.
 * These functions are shared across multiple modules to reduce code duplication.
 * @module utils
 */

/**
 * Global scope type that works in both browser and Service Worker environments.
 * Record type is used to allow flexible property access.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GlobalScope = Record<string, any>

/**
 * Gets the global scope object, compatible with both browser window and Service Worker environments.
 * 
 * @returns The global scope object (window in browser, self in Service Worker)
 * @example
 * const global = getGlobalScope()
 * global.__MY_LIB__ = { version: '1.0.0' }
 */
export function getGlobalScope(): GlobalScope {
  if (typeof window !== 'undefined') {
    return window as GlobalScope
  }
  if (typeof self !== 'undefined') {
    return self as GlobalScope
  }
  return {}
}

/**
 * Deep clones a message object using JSON serialization.
 * This ensures the data is safely cloneable for postMessage transfer.
 * 
 * @template T - The type of the data to clone
 * @param data - The data object to clone
 * @returns A deep clone of the data
 * @throws {Error} If the data contains non-serializable values (functions, circular references, etc.)
 * 
 * @example
 * const original = { name: 'test', nested: { value: 123 } }
 * const cloned = cloneMessage(original)
 * cloned.nested.value = 456  // original is unchanged
 */
export function cloneMessage<T>(data: T): T {
  return JSON.parse(JSON.stringify(data))
}

/**
 * Generates a unique identifier string with the given prefix.
 * Uses crypto API when available for better randomness, falls back to Math.random.
 * 
 * @param prefix - Prefix string for the ID (e.g., 'iframe_', 'sw_')
 * @returns A unique identifier string ending with underscore
 * 
 * @example
 * const id = generateUniqueId('iframe_')
 * // Returns something like: 'iframe_m1abc123xyz_'
 * 
 * @example
 * const id = generateUniqueId('sw_')
 * // Returns something like: 'sw_m1def456uvw_'
 */
export function generateUniqueId(prefix: string): string {
  const timestamp = Date.now().toString(36)
  let random: string
  
  // Use crypto for better randomness when available
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint32Array(2)
    crypto.getRandomValues(array)
    random = array[0].toString(36) + array[1].toString(36)
  } else {
    random = Math.floor(Math.random() * 1e10).toString(36)
  }
  
  return `${prefix}${timestamp}${random}_`
}

/**
 * Safely serializes data for logging, handling non-serializable values.
 * 
 * @template T - The type of the data
 * @param data - The data to serialize
 * @returns Serialized data or '[Unserializable]' if serialization fails
 */
export function safeSerialize<T>(data: T): T | string {
  try {
    return JSON.parse(JSON.stringify(data))
  } catch {
    return '[Unserializable]'
  }
}
