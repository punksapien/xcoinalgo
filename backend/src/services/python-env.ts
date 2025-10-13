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

  computeRequirementsHash(requirements: string, pythonVersion = process.version): string {
    const h = crypto.createHash('sha256')
    h.update(requirements.trim())
    h.update('|python:')
    h.update(pythonVersion)
    return h.digest('hex').slice(0, 16)
  }

  ensureDir(dir: string) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  hasUv(): boolean {
    const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['uv'], { encoding: 'utf-8' })
    return which.status === 0
  }

  /**
   * Ensure a uv venv exists for the given requirements and return its python path
   */
  ensureEnv(requirements: string): { pythonPath: string; created: boolean } {
    const hash = this.computeRequirementsHash(requirements)
    const envDir = path.join(this.cacheRoot, hash)
    const pythonBin = path.join(envDir, 'bin', 'python')

    this.ensureDir(envDir)

    if (!this.hasUv()) {
      // uv not available; fallback to system python
      return { pythonPath: 'python3', created: false }
    }

    const marker = path.join(envDir, '.ready')
    if (fs.existsSync(marker) && fs.existsSync(pythonBin)) {
      return { pythonPath: pythonBin, created: false }
    }

    // Create venv
    const venv = spawnSync('uv', ['venv', envDir], { stdio: 'inherit' })
    if (venv.status !== 0) {
      return { pythonPath: 'python3', created: false }
    }

    // Write requirements to temp file
    const reqFile = path.join(envDir, 'requirements.txt')
    fs.writeFileSync(reqFile, requirements)

    // Install deps
    const pip = spawnSync('uv', ['pip', 'install', '-r', reqFile], { stdio: 'inherit' })
    if (pip.status !== 0) {
      return { pythonPath: 'python3', created: false }
    }

    fs.writeFileSync(marker, new Date().toISOString())
    return { pythonPath: pythonBin, created: true }
  }
}

export const uvEnvManager = new UvEnvManager()


