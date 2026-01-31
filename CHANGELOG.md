# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-26

### Added

- `IframeChannel` for parent-child iframe communication
- `ServiceWorkerChannel` for page-to-Service Worker communication
- Point-to-point communication with dual-layer validation (physical + logical)
- Built-in debugger with `enableDebugger()` for development
- TypeScript type definitions with full IntelliSense support
- Promise-based `publish/subscribe` API
- Automatic message queuing until channel is ready
- Request timeout handling with configurable timeout
- Multiple build formats: ESM, CJS, UMD

### Security

- Origin validation for iframe messages
- Client ID validation for Service Worker messages
- Peer key validation for point-to-point communication
- `_senderKey` field to prevent message spoofing between channels

## [Unreleased]

### Added

- **Global Message Routing for Service Worker**: New static methods for efficient multi-client communication
  - `ServiceWorkerChannel.enableGlobalRouting(callback)` - Enable global message routing with a single listener
  - `ServiceWorkerChannel.disableGlobalRouting()` - Disable global routing
  - `ServiceWorkerChannel.hasChannel(clientId)` - Check if a channel exists for a client
  - `ServiceWorkerChannel.getChannelByClientId(clientId)` - Get channel instance by client ID
  - `ServiceWorkerChannel.getChannelCount()` - Get the number of active channels
- **Message Recovery**: New instance method `handleMessage(event)` for manually processing messages
  - Useful when creating channels after receiving a message (e.g., SW restart scenario)
- **UnknownClientCallback type**: Callback type for handling messages from unknown clients

### Changed

- Upgraded to Rollup 4, TypeScript 5, Jest 29 for better performance
- Build outputs now correctly match package.json exports (ESM/CJS/UMD)

### Fixed

- **Multi-client message routing**: Fixed issue where messages could be lost when Service Worker restarts
  - Previously, if SW restarted while clients were connected, their messages would not be processed
  - Now, with `enableGlobalRouting()`, messages from unknown clients can be automatically handled
