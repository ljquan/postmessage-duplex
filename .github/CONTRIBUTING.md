# Contributing to postmessage-duplex

Thank you for your interest in contributing to postmessage-duplex! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/postmessage-duplex.git
   cd postmessage-duplex
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run tests to ensure everything is working:
   ```bash
   npm test
   ```

## Development Workflow

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Build and start development server |
| `npm run build` | Build for production |
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Lint and fix code |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run validate` | Run all validations (typecheck + lint + test) |

### Code Style

- We use TypeScript with strict mode enabled
- ESLint is configured for code linting
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Write tests for new features and bug fixes

### Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types:
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code changes that neither fix bugs nor add features
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat(iframe): add support for custom headers
fix(sw): resolve memory leak in message handler
docs: update API documentation
```

## Pull Request Process

1. Create a new branch for your feature or bug fix:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. Make your changes and commit them with clear commit messages

3. Ensure all tests pass:
   ```bash
   npm run validate
   ```

4. Push your branch and create a Pull Request

5. Fill out the PR template with:
   - Description of changes
   - Type of change
   - Related issues (if any)
   - Screenshots (if applicable)

6. Wait for review and address any feedback

## Testing Guidelines

- Write tests for all new features
- Maintain or improve code coverage
- Test edge cases and error conditions
- Use descriptive test names in Chinese or English

Example test structure:
```typescript
describe('IframeChannel', () => {
  describe('publish', () => {
    it('should send message to iframe', () => {
      // Test implementation
    })

    it('should queue message when not ready', () => {
      // Test implementation
    })
  })
})
```

## Reporting Issues

When reporting issues, please include:

1. **Description**: Clear description of the issue
2. **Steps to Reproduce**: Step-by-step instructions
3. **Expected Behavior**: What you expected to happen
4. **Actual Behavior**: What actually happened
5. **Environment**: Browser, Node.js version, OS
6. **Code Example**: Minimal reproduction code

## Feature Requests

Feature requests are welcome! Please:

1. Check if the feature has already been requested
2. Describe the use case and benefits
3. Provide examples of how the feature would be used

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Questions?

If you have questions, feel free to:

- Open a [GitHub Discussion](https://github.com/ljquan/postmessage-duplex/discussions)
- Open an issue with the `question` label

Thank you for contributing!
