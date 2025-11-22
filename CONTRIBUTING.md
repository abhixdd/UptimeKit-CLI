# Contributing to UptimeKit

Thank you for your interest in contributing to UptimeKit! We welcome contributions from the community.

## Getting Started

### Prerequisites

- Node.js 16 or higher
- npm or yarn
- Git

### Setting Up Development Environment

1. **Fork the repository**
   ```bash
   # Click the "Fork" button on GitHub
   ```

2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/UptimeKit-CLI.git
   cd UptimeKit-CLI
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Build the project**
   ```bash
   npm run build
   ```

5. **Link for local testing**
   ```bash
   npm link
   ```

6. **Test your changes**
   ```bash
   upkit start
   upkit add https://google.com -t http -i 30
   upkit st
   ```

## Development Workflow

### Project Structure

```
uptimekit-cli/
├── src/
│   ├── commands/     # CLI command implementations
│   ├── core/         # Database and shared logic
│   ├── daemon/       # Background worker process
│   └── ui/           # Terminal UI components (Ink/React)
├── dist/             # Compiled output (generated)
└── README.md
```

### Making Changes

1. **Create a new branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow the existing code style
   - Keep changes focused and atomic
   - Write clear, descriptive commit messages

3. **Build and test**
   ```bash
   npm run build
   upkit start
   # Test your changes
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

### Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

**Examples:**
```
feat: add support for TCP port monitoring
fix: resolve daemon crash on Windows
docs: update installation instructions
```

## Submitting Changes

1. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create a Pull Request**
   - Go to the original repository on GitHub
   - Click "New Pull Request"
   - Select your fork and branch
   - Fill in the PR template with details about your changes

3. **PR Guidelines**
   - Provide a clear description of the changes
   - Reference any related issues
   - Ensure all checks pass
   - Be responsive to feedback

## Code Style

- Use **ES6+ syntax**
- Use **2 spaces** for indentation
- Use **meaningful variable names**
- Add **comments** for complex logic only
- Keep functions **small and focused**

## Adding New Features

### Adding a New Monitor Type

1. Update `src/daemon/worker.js` with the new monitor logic
2. Update `src/commands/add.js` to accept the new type
3. Update documentation in README files

### Adding a New Command

1. Create a new file in `src/commands/`
2. Export a `register{Command}Command` function
3. Register it in `src/index.js`
4. Update documentation

## Testing

Currently, UptimeKit uses manual testing. When adding features:

1. Test on multiple platforms (Windows, Linux, macOS if possible)
2. Test edge cases
3. Verify daemon behavior
4. Check UI rendering

## Reporting Issues

### Bug Reports

When reporting bugs, please include:

- UptimeKit version (`upkit -v`)
- Node.js version (`node -v`)
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Error messages or logs

### Feature Requests

When requesting features:

- Describe the use case
- Explain why it would be valuable
- Provide examples if possible

## Questions?

- Open an issue for questions
- Check existing issues and PRs first
- Be respectful and constructive

## License

By contributing to UptimeKit, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to UptimeKit! 🚀
