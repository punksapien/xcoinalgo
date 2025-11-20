# Strategy Sandbox Validation System

A comprehensive 3-tier validation system for safely testing and debugging trading strategy code in isolated Docker containers.

## 🎯 Features

### 1. Quick Syntax Validation (< 1 second)
- Fast Python syntax checking using `compile()`
- AST-based static analysis
- Detects dangerous imports (`os`, `subprocess`, `socket`, etc.)
- Identifies anti-patterns (infinite loops, bare except clauses)
- Shows inline errors in Monaco Editor

### 2. Docker Sandbox Execution (5-30 seconds)
- Full code execution in isolated containers
- Resource limits: 512MB RAM, 0.5 CPU cores
- 30-second timeout
- No network access (air-gapped)
- Tests class loading and instantiation
- Detailed execution metrics

### 3. Interactive Terminal (xterm.js)
- Live WebSocket connection to sandbox container
- Pre-loaded strategy code in `/workspace`
- Execute commands interactively
- 30-minute session timeout
- Full terminal emulation

---

## 📋 Setup Instructions

### Prerequisites

1. **Docker Desktop** must be installed and running
   ```bash
   docker --version
   # Should output: Docker version 20.x.x or higher
   ```

2. **Node.js dependencies** (already installed via npm install)
   - `dockerode`: Docker API client
   - `socket.io`: WebSocket server
   - `express-rate-limit`: Rate limiting
   - `xterm` (frontend): Terminal emulator

### Building the Sandbox Docker Image

The sandbox image will be built automatically on first use, but you can build it manually:

```bash
cd backend/docker/strategy-sandbox
docker build -t strategy-sandbox:latest .
```

**Build time:** ~2 minutes
**Image size:** ~500MB (includes Python 3.12 + pandas + numpy + ta)

---

## 🚀 Usage Guide

### For Users (Frontend)

#### 1. Quick Validation
**Location:** `/strategies/[id]/edit`
**Button:** "Validate Syntax" (blue)
**Keyboard:** `Cmd/Ctrl + K`

**What it does:**
- Checks Python syntax and indentation
- Detects dangerous imports
- Finds common anti-patterns
- Shows errors inline in editor

**Rate limit:** 20 requests/minute per user

#### 2. Sandbox Execution
**Location:** `/strategies/[id]/edit`
**Button:** "Run in Sandbox" (purple)
**Keyboard:** `Cmd/Ctrl + Shift + K`

**What it does:**
- Executes code in Docker container
- Tests if classes can be imported
- Shows which classes/methods were found
- Reports resource usage (CPU, RAM)

**Rate limit:** 5 requests/minute per user
**Timeout:** 30 seconds

#### 3. Interactive Terminal
**Location:** `/strategies/[id]/edit`
**Button:** "Open Terminal" (cyan)
**Keyboard:** `Cmd/Ctrl + \``

**What it does:**
- Opens live terminal in sandbox
- Strategy code pre-loaded in `/workspace/strategy.py`
- Run Python commands interactively
- Test imports, debug code

**Rate limit:** 3 sessions/5 minutes per user
**Session timeout:** 30 minutes of inactivity

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Quick validation |
| `Cmd/Ctrl + Shift + K` | Run in sandbox |
| `Cmd/Ctrl + S` | Save code |
| `Cmd/Ctrl + \`` | Toggle terminal |

---

## 🏗️ Architecture

### Backend Components

#### 1. Quick Validator
**File:** `backend/python/quick_validator.py`

```python
class QuickValidator:
    DANGEROUS_IMPORTS = ['os', 'subprocess', 'socket', ...]
    SAFE_IMPORTS = ['pandas', 'numpy', 'ta', ...]

    def validate(self) -> ValidationResult:
        - Check syntax with compile()
        - Parse AST for dangerous imports
        - Check for anti-patterns
```

**API Endpoint:** `POST /api/strategy-upload/:id/validate-quick`
**Rate limit:** 20 req/min
**Timeout:** 10 seconds

#### 2. Docker Sandbox Service
**File:** `backend/src/services/docker-sandbox.ts`

```typescript
class DockerSandboxService {
  async executeCode(code, requirements, config):
    - Create ephemeral container
    - Write code via tar stream
    - Execute with resource limits
    - Return stdout/stderr + metrics
    - Auto-cleanup
}
```

**Resource Limits:**
- Memory: 512MB (hard limit)
- CPU: 0.5 cores
- Network: Disabled
- Filesystem: Read-only except `/tmp`
- Timeout: 30 seconds

#### 3. Terminal Session Manager
**File:** `backend/src/services/terminal-session-manager.ts`

```typescript
class TerminalSessionManager {
  - WebSocket handler for terminal I/O
  - Session lifecycle management
  - Auto-cleanup of stale sessions (30 min)
  - One session per user per strategy
}
```

**WebSocket Events:**
- `terminal:start` - Create session
- `terminal:data` - Stream output
- `terminal:input` - Send commands
- `terminal:stop` - Terminate session

#### 4. Sandbox Executor
**File:** `backend/python/sandbox_executor.py`

```python
class SandboxExecutor:
    def execute(self):
        - Load module with importlib
        - Validate required classes exist
        - Test instantiation (if possible)
        - Check for common issues
        - Return JSON results
```

### Frontend Components

#### 1. ValidationPanel
**File:** `frontend/src/components/ValidationPanel.tsx`

Displays:
- Syntax errors with line numbers
- Dangerous imports
- Warnings and info messages
- Code statistics
- Click to jump to error line

#### 2. SandboxOutputPanel
**File:** `frontend/src/components/SandboxOutputPanel.tsx`

Displays:
- Success/failure status
- Classes and methods found
- Execution time and resource usage
- Error details with tracebacks
- Warnings and info

#### 3. SandboxTerminal
**File:** `frontend/src/components/SandboxTerminal.tsx`

Features:
- xterm.js terminal emulator
- WebSocket connection to backend
- Loading states: "Securing compute resources..."
- Maximize/minimize toggle
- Clear and stop buttons
- Auto-reconnect on disconnect

---

## 🔒 Security Features

### 1. Container Isolation
```yaml
Docker Security:
  - Read-only root filesystem
  - No network access (network_mode: none)
  - Dropped all capabilities (cap_drop: ALL)
  - No new privileges (no-new-privileges:true)
  - Resource limits enforced
  - Auto-cleanup after execution
```

### 2. Code Scanning
```typescript
Dangerous Patterns Detected:
  - os, subprocess, socket imports
  - eval(), exec(), compile() calls
  - File I/O operations (open)
  - Network access attempts
  - Infinite loops (while True without break)
```

### 3. Rate Limiting
```typescript
Limits:
  Quick Validation: 20 req/min
  Sandbox Execution: 5 req/min
  Terminal Sessions: 3 per 5 min
```

### 4. Audit Logging
All sandbox executions are logged to `SandboxExecutionLog` table:
- User ID, strategy ID
- Execution type (validation/terminal)
- Success/failure status
- Resource usage metrics
- Error/warning counts
- Full metadata (errors, warnings)

---

## 🐛 Troubleshooting

### "Docker not available"
**Problem:** Backend cannot connect to Docker

**Solutions:**
1. Start Docker Desktop
2. Check Docker daemon is running:
   ```bash
   docker info
   ```
3. Restart backend server

### "Sandbox execution timed out"
**Problem:** Code execution exceeded 30 seconds

**Possible causes:**
- Infinite loop in strategy code
- Heavy computation (ML model training)
- Large data processing

**Solutions:**
1. Optimize code for faster execution
2. Remove infinite loops
3. Use quick validation first to catch issues

### "Rate limit exceeded"
**Problem:** Too many validation requests

**Solutions:**
1. Wait 1 minute before retrying
2. Use quick validation (more lenient limit)
3. Check code locally before validating

### "Terminal connection failed"
**Problem:** WebSocket connection to terminal failed

**Solutions:**
1. Check backend server is running
2. Verify WebSocket port (3001) is accessible
3. Check browser console for errors
4. Try refreshing the page

### "Image build failed"
**Problem:** Docker image failed to build

**Solutions:**
1. Check internet connection (needs to download Python packages)
2. Verify Docker has enough disk space
3. Manually build with verbose output:
   ```bash
   cd backend/docker/strategy-sandbox
   docker build -t strategy-sandbox:latest . --no-cache
   ```

---

## 📊 Performance Metrics

### Quick Validation
- **Speed:** < 1 second
- **Resource:** Minimal (runs in Node.js process)
- **Accuracy:** High for syntax errors, moderate for runtime issues

### Sandbox Execution
- **Speed:** 5-30 seconds (depends on code complexity)
- **Resource:** 512MB RAM, 0.5 CPU per execution
- **Accuracy:** High (actually runs code)

### Terminal Sessions
- **Startup:** ~3-5 seconds
- **Resource:** 512MB RAM, 0.5 CPU per session
- **Concurrent limit:** Based on Docker host resources

---

## 🎓 Best Practices

### For Users

1. **Validate Early and Often**
   - Run quick validation after major changes
   - Use sandbox execution before saving
   - Check terminal for debugging

2. **Understand Error Messages**
   - Red = Errors (must fix)
   - Yellow = Warnings (should fix)
   - Blue = Info (good to know)

3. **Resource Awareness**
   - Sandbox has limited resources (512MB RAM)
   - Keep code lightweight for faster validation
   - Avoid heavy computations in validation

### For Developers

1. **Error Handling**
   - Always catch and log sandbox errors
   - Provide user-friendly error messages
   - Don't fail silently

2. **Resource Management**
   - Clean up Docker containers after use
   - Monitor container count (`docker ps`)
   - Set up automated cleanup jobs

3. **Monitoring**
   - Check audit logs regularly
   - Monitor rate limit violations
   - Track resource usage trends

---

## 📝 API Reference

### POST /api/strategy-upload/:id/validate-quick

**Request:**
```json
{
  "code": "Python code string"
}
```

**Response:**
```json
{
  "success": true,
  "validation": {
    "valid": boolean,
    "syntaxErrors": [...],
    "warnings": [...],
    "dangerousImports": [...],
    "info": [...],
    "codeStats": {
      "lines": number,
      "classes": number,
      "functions": number,
      "imports": number
    }
  }
}
```

### POST /api/strategy-upload/:id/validate-sandbox

**Request:**
```json
{
  "code": "Python code string",
  "requirements": "requirements.txt content"
}
```

**Response:**
```json
{
  "success": true,
  "validation": {
    "success": boolean,
    "errors": [...],
    "warnings": [...],
    "classesFound": ["CoinDCXClient", "Trader", ...],
    "methodsFound": { "Trader": ["execute", ...] },
    "executionTime": number (ms),
    "resourceUsage": {
      "memoryUsedMB": number,
      "cpuPercent": number
    },
    "timedOut": boolean
  }
}
```

---

## 🔄 Future Enhancements

### Planned Features

1. **Real-time Collaboration**
   - Share terminal sessions between users
   - Live code editing with multiple cursors

2. **Advanced Metrics**
   - Code complexity scoring
   - Performance profiling
   - Memory leak detection

3. **Custom Validation Rules**
   - User-defined linting rules
   - Team-specific coding standards
   - Auto-fix suggestions

4. **Integration Testing**
   - Mock CoinDCX API responses
   - Test with historical data
   - Automated test suites

---

## 📞 Support

For issues or questions:
- **GitHub Issues:** Report bugs and feature requests
- **Documentation:** Check this README first
- **Logs:** Check `backend/logs/` for error details

---

## 📜 License

Proprietary - XCoinAlgo Trading Platform

---

**Last Updated:** 2025-01-12
**Version:** 1.0.0
**Maintained by:** XCoinAlgo Development Team
