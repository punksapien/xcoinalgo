# Prisma Schema Addition for Sandbox Audit Logging

Add this model to your `prisma/schema.prisma` file to enable audit logging for sandbox executions.

## Schema Model

```prisma
model SandboxExecutionLog {
  id              String   @id @default(uuid())
  userId          String
  strategyId      String
  executionType   String   // 'VALIDATION' | 'TERMINAL'
  success         Boolean
  executionTime   Int      // milliseconds
  memoryUsed      Int?     // MB
  cpuUsage        Float?   // percentage
  timedOut        Boolean  @default(false)
  errorCount      Int      @default(0)
  warningCount    Int      @default(0)
  classesFound    String?  // comma-separated list
  metadata        String?  @db.Text  // JSON string with detailed info
  createdAt       DateTime @default(now())

  // Relations
  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  strategy Strategy  @relation(fields: [strategyId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([strategyId])
  @@index([createdAt])
  @@map("sandbox_execution_logs")
}
```

## Update User Model

Add this relation to your `User` model:

```prisma
model User {
  // ... existing fields

  sandboxExecutions SandboxExecutionLog[]
}
```

## Update Strategy Model

Add this relation to your `Strategy` model:

```prisma
model Strategy {
  // ... existing fields

  sandboxExecutions SandboxExecutionLog[]
}
```

## Migration

After adding the model to your schema, create and apply the migration:

```bash
# Generate migration
npx prisma migrate dev --name add_sandbox_execution_log

# Apply migration
npx prisma migrate deploy

# Generate Prisma Client
npx prisma generate
```

## Querying Sandbox Logs

### Get recent sandbox executions for a user

```typescript
const logs = await prisma.sandboxExecutionLog.findMany({
  where: { userId: 'user-id' },
  orderBy: { createdAt: 'desc' },
  take: 10,
  include: {
    strategy: {
      select: { name: true }
    }
  }
});
```

### Get sandbox execution stats for a strategy

```typescript
const stats = await prisma.sandboxExecutionLog.aggregate({
  where: { strategyId: 'strategy-id' },
  _count: true,
  _avg: {
    executionTime: true,
    memoryUsed: true,
    cpuUsage: true
  },
  _sum: {
    errorCount: true,
    warningCount: true
  }
});
```

### Find failed executions in the last hour

```typescript
const failedExecutions = await prisma.sandboxExecutionLog.findMany({
  where: {
    success: false,
    createdAt: {
      gte: new Date(Date.now() - 60 * 60 * 1000)
    }
  },
  include: {
    user: {
      select: { email: true }
    },
    strategy: {
      select: { name: true }
    }
  }
});
```

### Get execution trends over time

```typescript
const executionsByDay = await prisma.$queryRaw`
  SELECT
    DATE(created_at) as date,
    COUNT(*) as total,
    SUM(CASE WHEN success = true THEN 1 ELSE 0 END) as successful,
    AVG(execution_time) as avg_time,
    AVG(memory_used) as avg_memory
  FROM sandbox_execution_logs
  WHERE created_at >= NOW() - INTERVAL '7 days'
  GROUP BY DATE(created_at)
  ORDER BY date DESC
`;
```

## Dashboard Query Examples

### User Sandbox Usage Statistics

```typescript
async function getUserSandboxStats(userId: string) {
  const [total, success, avgTime] = await Promise.all([
    prisma.sandboxExecutionLog.count({
      where: { userId }
    }),
    prisma.sandboxExecutionLog.count({
      where: { userId, success: true }
    }),
    prisma.sandboxExecutionLog.aggregate({
      where: { userId },
      _avg: { executionTime: true }
    })
  ]);

  return {
    totalExecutions: total,
    successRate: (success / total) * 100,
    avgExecutionTime: avgTime._avg.executionTime
  };
}
```

### Strategy Health Metrics

```typescript
async function getStrategyHealthMetrics(strategyId: string) {
  const logs = await prisma.sandboxExecutionLog.findMany({
    where: { strategyId },
    orderBy: { createdAt: 'desc' },
    take: 100
  });

  const successRate = logs.filter(l => l.success).length / logs.length;
  const avgErrors = logs.reduce((sum, l) => sum + l.errorCount, 0) / logs.length;
  const avgWarnings = logs.reduce((sum, l) => sum + l.warningCount, 0) / logs.length;

  return {
    successRate: successRate * 100,
    avgErrors,
    avgWarnings,
    lastValidated: logs[0]?.createdAt,
    totalValidations: logs.length
  };
}
```

## Cleanup Old Logs

Consider adding a cleanup job to delete old logs (e.g., older than 90 days):

```typescript
// Run daily via cron job
async function cleanupOldSandboxLogs() {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const result = await prisma.sandboxExecutionLog.deleteMany({
    where: {
      createdAt: {
        lt: ninetyDaysAgo
      }
    }
  });

  console.log(`Deleted ${result.count} old sandbox execution logs`);
}
```

## Monitoring Alerts

### Alert on high failure rate

```typescript
async function checkSandboxHealthAlert() {
  const last100 = await prisma.sandboxExecutionLog.findMany({
    where: {
      createdAt: {
        gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
      }
    },
    select: { success: true }
  });

  const failureRate = last100.filter(l => !l.success).length / last100.length;

  if (failureRate > 0.3) {
    // Send alert: More than 30% of validations failing
    console.error(`⚠️ HIGH FAILURE RATE: ${(failureRate * 100).toFixed(1)}%`);
  }
}
```

## Notes

- The `metadata` field stores JSON with detailed errors/warnings
- Indexes on `userId`, `strategyId`, and `createdAt` improve query performance
- Cascade delete ensures logs are cleaned up when users/strategies are deleted
- Consider partitioning the table if it grows very large (millions of rows)
