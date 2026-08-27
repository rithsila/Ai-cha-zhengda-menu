import { PrismaClient } from '@prisma/client';

/**
 * Settle loyalty points for an order exactly once (idempotent).
 *
 * Redeemed points were already deducted when the order was created (see
 * POST /api/orders), so settling only credits the points the order earned.
 */
export async function settleOrderPoints(prisma: PrismaClient, orderId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.pointsSettled || !order.telegramUserId) return order;

    const user = await tx.user.findUnique({ where: { telegramUserId: order.telegramUserId } });
    if (user && order.pointsEarned > 0) {
      await tx.user.update({
        where: { telegramUserId: order.telegramUserId },
        data: { loyaltyPoints: { increment: order.pointsEarned } },
      });
    }
    return tx.order.update({ where: { id: orderId }, data: { pointsSettled: true } });
  });
}

/**
 * Give back the points an order reserved, for orders that never complete
 * (cancelled). Idempotent: marking the order settled stops a second refund.
 */
export async function refundOrderPoints(prisma: PrismaClient, orderId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.pointsSettled || !order.telegramUserId) return order;

    if (order.pointsRedeemed > 0) {
      const user = await tx.user.findUnique({ where: { telegramUserId: order.telegramUserId } });
      if (user) {
        await tx.user.update({
          where: { telegramUserId: order.telegramUserId },
          data: { loyaltyPoints: { increment: order.pointsRedeemed } },
        });
      }
    }
    return tx.order.update({ where: { id: orderId }, data: { pointsSettled: true } });
  });
}

export {
  CONFIG_DEFAULTS,
  getConfigNumber,
  getConfigValue,
  getStoreStatus,
  getCambodiaTime,
  isTimeInRange,
  validateConfig,
} from './store-config';
