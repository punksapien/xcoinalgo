import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'

/**
 * UV Python environment manager for per-strategy backtests
 * Caches virtual envs by requirements hash under .cache/xcoin/uv/<hash>
 */
export class UvEnvManager {
  private cacheRoot: string

  constructor(cacheRoot?: string) {
    this.cacheRoot = cacheRoot || path.join(process.cwd(), '.cache', 'xcoin', 'uv')
  }

  /**
   * Extract Python version requirement from requirements.txt
   * Looks for lines like: # python>=3.12 or # python==3.11
   */
  extractPythonVersion(requirements: string): string | null {
    const lines = requirements.split('\n')
    for (const line of lines) {
      const match = line.match(/^#\s*python\s*([>=<]+)\s*(\d+\.\d+(?:\.\d+)?)/i)
      if (match) {
        return match[2] // Return version number (e.g., "3.12")
      }
    }
    return null
  }

  computeRequirementsHash(requirements: string, pythonVersion?: string): string {
    const pyVer = pythonVersion || this.extractPythonVersion(requirements) || 'system'
    const h = crypto.createHash('sha256')
    h.update(requirements.trim())
    h.update('|python:')
    h.update(pyVer)
    return h.digest('hex').slice(0, 16)
  }

  ensureDir(dir: string) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  hasUv(): boolean {
    // Check common uv installation paths
    const uvPaths = [
      path.join(process.env.HOME || '/home/ubuntu', '.local/bin/uv'),
      path.join(process.env.HOME || '/home/ubuntu', '.cargo/bin/uv'),
      'uv' // fallback to PATH
    ]

    // Try direct file check first
    for (const uvPath of uvPaths) {
      if (fs.existsSync(uvPath)) {
        return true
      }
    }

    // Fallback to which command
    const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['uv'], { encoding: 'utf-8' })
    return which.status === 0
  }

  /**
   * Ensure a uv venv exists for the given requirements and return its python path
   */
  ensureEnv(requirements: string): { pythonPath: string; created: boolean } {
    const pythonVersion = this.extractPythonVersion(requirements)
    const hash = this.computeRequirementsHash(requirements)
    const envDir = path.join(this.cacheRoot, hash)
    const pythonBin = process.platform === 'win32'
      ? path.join(envDir, 'Scripts', 'python.exe')
      : path.join(envDir, 'bin', 'python')

    this.ensureDir(envDir)

    const marker = path.join(envDir, '.ready')
    if (fs.existsSync(marker) && fs.existsSync(pythonBin)) {
      return { pythonPath: pythonBin, created: false }
    }

    // Preferred path: uv
    if (this.hasUv()) {
      // Find uv executable
      const uvCmd = fs.existsSync(path.join(process.env.HOME || '/home/ubuntu', '.local/bin/uv'))
        ? path.join(process.env.HOME || '/home/ubuntu', '.local/bin/uv')
        : fs.existsSync(path.join(process.env.HOME || '/home/ubuntu', '.cargo/bin/uv'))
        ? path.join(process.env.HOME || '/home/ubuntu', '.cargo/bin/uv')
        : 'uv'

      // Use --python flag if version specified, otherwise uv uses system default
      const venvArgs = pythonVersion
        ? ['venv', '--python', pythonVersion, envDir]
        : ['venv', envDir]

      const venv = spawnSync(uvCmd, venvArgs, { stdio: 'inherit' })
      if (venv.status === 0) {
        const reqFile = path.join(envDir, 'requirements.txt')
        fs.writeFileSync(reqFile, requirements)
        // uv pip install requires --python flag to specify target venv
        const pip = spawnSync(uvCmd, ['pip', 'install', '--python', pythonBin, '-r', reqFile], { stdio: 'inherit' })
        if (pip.status === 0 && fs.existsSync(pythonBin)) {
          fs.writeFileSync(marker, new Date().toISOString())
          return { pythonPath: pythonBin, created: true }
        }
      }
      // fall through to non-uv fallback if uv failed
    }

    // Fallback: python3 -m venv + pip
    const py = process.env.PYTHON || 'python3'
    const create = spawnSync(py, ['-m', 'venv', envDir], { stdio: 'inherit' })
    if (create.status !== 0) {
      return { pythonPath: 'python3', created: false }
    }
    const pipBin = process.platform === 'win32'
      ? path.join(envDir, 'Scripts', 'pip')
      : path.join(envDir, 'bin', 'pip')
    const reqFile = path.join(envDir, 'requirements.txt')
    fs.writeFileSync(reqFile, requirements)
    spawnSync(pipBin, ['install', '--upgrade', 'pip', 'setuptools', 'wheel'], { stdio: 'inherit' })
    const install = spawnSync(pipBin, ['install', '-r', reqFile], { stdio: 'inherit' })
    if (install.status !== 0) {
      return { pythonPath: 'python3', created: false }
    }
    fs.writeFileSync(marker, new Date().toISOString())
    return { pythonPath: pythonBin, created: true }
  }
}

export const uvEnvManager = new UvEnvManager()


