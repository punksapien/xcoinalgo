import { PrismaClient } from '@prisma/client';
import { createCacheSyncExtension } from '../services/prisma-cache-middleware';

declare global {
  var __prisma: any | undefined;
}

let prisma: any;

if (process.env.NODE_ENV === 'production') {
  const basePrisma = new PrismaClient();
  prisma = createCacheSyncExtension(basePrisma);
} else {
  if (!global.__prisma) {
    const basePrisma = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });
    global.__prisma = createCacheSyncExtension(basePrisma);
  }
  prisma = global.__prisma;
}

export default prisma;