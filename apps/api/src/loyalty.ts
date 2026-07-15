import { PrismaClient } from '@prisma/client';

/**
 * Settle loyalty points for an order exactly once (idempotent).
 * Deducts redeemed points (clamped to the user's balance) and credits earned points.
 */
export async function settleOrderPoints(prisma: PrismaClient, orderId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.pointsSettled || !order.telegramUserId) return order;

    const user = await tx.user.findUnique({ where: { telegramUserId: order.telegramUserId } });
    if (user) {
      const redeem = Math.min(order.pointsRedeemed, user.loyaltyPoints);
      await tx.user.update({
        where: { telegramUserId: order.telegramUserId },
        data: { loyaltyPoints: user.loyaltyPoints - redeem + order.pointsEarned },
      });
    }
    return tx.order.update({ where: { id: orderId }, data: { pointsSettled: true } });
  });
}
