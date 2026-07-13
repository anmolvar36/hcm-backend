// ============================================================
// Prisma Client - Singleton Instance
// ============================================================
// Prisma ko ek baar initialize karo aur poore app mein reuse karo
// Multiple instances se "too many connections" error aata hai

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
