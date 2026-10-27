import { Prisma } from "@prisma/client";
/** Serialize visitor facts across processes; lock lasts only for the transaction. */
export async function lockBlogVisitor(
  tx: Prisma.TransactionClient,
  accountId: number,
  deviceId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`blog-visitor:${accountId}:${deviceId}`}, 0))`;
}
