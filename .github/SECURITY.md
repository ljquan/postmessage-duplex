# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

**Please do NOT create a public GitHub issue for security vulnerabilities.**

Instead, please report security vulnerabilities by emailing:

- **Email**: ljquan@qq.com
- **Subject**: [SECURITY] postmessage-duplex vulnerability report

### What to Include

Please include the following information in your report:

1. **Description**: Clear description of the vulnerability
2. **Impact**: Potential impact of the vulnerability
3. **Steps to Reproduce**: Detailed steps to reproduce the issue
4. **Proof of Concept**: Code or screenshots demonstrating the vulnerability
5. **Suggested Fix**: If you have ideas on how to fix it

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: Depends on severity
  - Critical: 24-48 hours
  - High: 7 days
  - Medium: 30 days
  - Low: Next release

### Disclosure Policy

- We will acknowledge receipt of your report
- We will investigate and determine the impact
- We will work on a fix and coordinate disclosure with you
- We will credit you in the security advisory (unless you prefer anonymity)

## Security Best Practices

When using postmessage-duplex, follow these security guidelines:

### Origin Validation

Always specify a specific origin instead of `'*'`:

```typescript
// Good: Specific origin
const channel = new IframeChannel(iframe)
// The library automatically validates event.origin

// Bad: Don't disable origin validation in production
```

### Message Validation

Always validate incoming message data:

```typescript
channel.subscribe('getData', async ({ data }) => {
  // Validate data before processing
  if (!data || typeof data.id !== 'number') {
    throw new Error('Invalid data format')
  }
  return await fetchData(data.id)
})
```

### Sensitive Data

- Avoid sending sensitive data through postMessage when possible
- Use HTTPS for pages that communicate via postMessage
- Consider encrypting sensitive payloads

### Service Worker Security

- Validate client IDs in Service Worker
- Use proper scope restrictions for Service Workers
- Keep Service Worker code up to date

## Known Security Considerations

### Cross-Origin Communication

This library is designed for cross-origin communication. Be aware that:

- Messages can be intercepted by malicious extensions
- Parent pages can access iframe content if same-origin
- Use HTTPS to prevent MITM attacks

### Message Size

- Large messages may impact performance
- Consider implementing message size limits in your application

### Rate Limiting

- Implement rate limiting for high-frequency message patterns
- Prevent denial-of-service through message flooding

## Security Updates

Security updates will be released as patch versions (e.g., 1.0.1).

Subscribe to our releases to stay informed:
- Watch the repository on GitHub
- Check the CHANGELOG.md for security-related updates
