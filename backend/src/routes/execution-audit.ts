import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import prisma from '../utils/database'

const router = Router()

// GET /api/execution/audit?strategyId=&limit=
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { strategyId, limit = 50 } = req.query
    if (!strategyId) return res.status(400).json({ error: 'strategyId is required' })

    const rows = await prisma.trade.findMany({
      where: { subscription: { strategyId: String(strategyId) } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 50, 200)
    })

    const executions = await prisma.strategyExecution.findMany({
      where: { strategyId: String(strategyId) },
      orderBy: { executedAt: 'desc' },
      take: 100
    })

    res.json({ trades: rows, executions })
  } catch (e) {
    next(e)
  }
})

export { router as executionAuditRoutes }

