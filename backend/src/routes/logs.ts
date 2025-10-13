import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import prisma from '../utils/database'

const router = Router()

// GET /api/logs/strategy/:id?since=&limit=&level=
router.get('/strategy/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params
    const { since, limit = 200 } = req.query

    const sinceDate = since ? new Date(String(since)) : new Date(Date.now() - 24 * 3600 * 1000)
    const take = Math.min(Number(limit) || 200, 2000)

    // Use StrategyExecution as a proxy for logs for now
    const rows = await prisma.strategyExecution.findMany({
      where: { strategyId: id, executedAt: { gte: sinceDate } },
      orderBy: { executedAt: 'desc' },
      take,
      select: {
        executedAt: true,
        status: true,
        signalType: true,
        subscribersCount: true,
        tradesGenerated: true,
        duration: true,
        workerId: true,
        error: true,
      }
    })

    res.json({ logs: rows })
  } catch (e) {
    next(e)
  }
})

export { router as logsRoutes }


