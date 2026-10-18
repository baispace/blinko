import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const rows = await prisma.tag.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, name: true, parent: true, sortOrder: true } });
console.log('按 sortOrder,id 排序：');
console.table(rows);
await prisma.$disconnect();
