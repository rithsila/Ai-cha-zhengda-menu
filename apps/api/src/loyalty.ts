import { PrismaClient } from '@prisma/client';
import { CONFIG_DEFAULTS } from './store-config';

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
    if (user) {
      const pointsDelta = order.pointsEarned > 0 ? order.pointsEarned : 0;

      const totalPaidOrders = await tx.order.count({
        where: {
          telegramUserId: order.telegramUserId,
          status: { in: ['paid', 'completed'] },
        },
      });

      const thresholdRow = await tx.systemConfig.findUnique({ where: { key: 'goldMinOrdersThreshold' } });
      const threshold = thresholdRow ? Number(thresholdRow.value) : CONFIG_DEFAULTS.goldMinOrdersThreshold;

      const luckyDrawEnabledRow = await tx.systemConfig.findUnique({ where: { key: 'luckyDrawEnabled' } });
      const luckyDrawEnabled = luckyDrawEnabledRow ? luckyDrawEnabledRow.value : String(CONFIG_DEFAULTS.luckyDrawEnabled);

      const goldTicketsRow = await tx.systemConfig.findUnique({ where: { key: 'luckyTicketsPerGoldOrder' } });
      const goldTickets = goldTicketsRow ? Number(goldTicketsRow.value) : CONFIG_DEFAULTS.luckyTicketsPerGoldOrder;

      const stdTicketsRow = await tx.systemConfig.findUnique({ where: { key: 'luckyTicketsPerStandardOrder' } });
      const stdTickets = stdTicketsRow ? Number(stdTicketsRow.value) : CONFIG_DEFAULTS.luckyTicketsPerStandardOrder;

      let newTier = user.tier;
      if (threshold > 0 && totalPaidOrders >= threshold && user.tier === 'standard') {
        newTier = 'gold';
      }

      let ticketsDelta = 0;
      if (luckyDrawEnabled !== '0') {
        ticketsDelta = newTier === 'gold'
          ? (Number.isFinite(goldTickets) ? goldTickets : 2)
          : (Number.isFinite(stdTickets) ? stdTickets : 1);
      }

      await tx.user.update({
        where: { telegramUserId: order.telegramUserId },
        data: {
          ...(pointsDelta > 0 ? { loyaltyPoints: { increment: pointsDelta } } : {}),
          ...(newTier !== user.tier ? { tier: newTier } : {}),
          ...(ticketsDelta > 0 ? { luckyTickets: { increment: ticketsDelta } } : {}),
        },
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
  getConfigString,
  getConfigValue,
  getStoreStatus,
  getCambodiaTime,
  isTimeInRange,
  validateConfig,
} from './store-config';

