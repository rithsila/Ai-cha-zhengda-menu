export interface LuckyWheelPrize {
  id: string;
  label: string;
  name: string;
  icon: string;
  color: string;
  type: 'points' | 'tickets' | 'item';
  value: number;
  weight: number;
  segmentIndex: number;
}

export const LUCKY_WHEEL_PRIZES: LuckyWheelPrize[] = [
  {
    id: 'points_10',
    label: '+10 Pts',
    name: '+10 Loyalty Points',
    icon: '⭐',
    color: '#F59E0B',
    type: 'points',
    value: 10,
    weight: 30,
    segmentIndex: 0,
  },
  {
    id: 'tickets_1',
    label: '+1 Ticket',
    name: '+1 Bonus Lucky Ticket',
    icon: '🎟️',
    color: '#EF4444',
    type: 'tickets',
    value: 1,
    weight: 20,
    segmentIndex: 1,
  },
  {
    id: 'points_20',
    label: '+20 Pts',
    name: '+20 Loyalty Points',
    icon: '⭐',
    color: '#10B981',
    type: 'points',
    value: 20,
    weight: 25,
    segmentIndex: 2,
  },
  {
    id: 'discount_50c',
    label: '$0.50 Off',
    name: '$0.50 Discount (50 Points)',
    icon: '🏷️',
    color: '#3B82F6',
    type: 'points',
    value: 50,
    weight: 10,
    segmentIndex: 3,
  },
  {
    id: 'blind_box',
    label: 'Blind Box',
    name: 'Mystery Blind Box Toy',
    icon: '🎁',
    color: '#8B5CF6',
    type: 'item',
    value: 0,
    weight: 5,
    segmentIndex: 4,
  },
  {
    id: 'points_50',
    label: '+50 Pts',
    name: '+50 Loyalty Points',
    icon: '✨',
    color: '#EC4899',
    type: 'points',
    value: 50,
    weight: 10,
    segmentIndex: 5,
  },
  {
    id: 'snack_voucher',
    label: 'Fried Chicken',
    name: 'Zhengda Fried Chicken Voucher',
    icon: '🍗',
    color: '#F97316',
    type: 'item',
    value: 0,
    weight: 5,
    segmentIndex: 6,
  },
  {
    id: 'free_drink',
    label: 'Free Drink',
    name: 'Free Drink (100 Points)',
    icon: '🧋',
    color: '#14B8A6',
    type: 'points',
    value: 100,
    weight: 5,
    segmentIndex: 7,
  },
];

import type { PrismaClient } from '@prisma/client';
import { getConfigString } from './store-config';

export async function getLuckyWheelPrizes(prisma: PrismaClient): Promise<LuckyWheelPrize[]> {
  try {
    const raw = await getConfigString(prisma, 'luckyWheelPrizes', '');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length >= 1) {
        return parsed.map((p, idx) => ({
          id: p.id || `prize_${idx}`,
          label: String(p.label || `Prize ${idx + 1}`),
          name: String(p.name || p.label || `Prize ${idx + 1}`),
          icon: String(p.icon || '🎁'),
          color: String(p.color || '#F59E0B'),
          type: p.type === 'tickets' ? 'tickets' : p.type === 'item' ? 'item' : 'points',
          value: Number.isFinite(Number(p.value)) ? Math.max(0, Number(p.value)) : 0,
          weight: Number.isFinite(Number(p.weight)) ? Math.max(1, Number(p.weight)) : 10,
          segmentIndex: idx,
        }));
      }
    }
  } catch (err) {
    console.error('Failed to parse luckyWheelPrizes config:', err);
  }
  return LUCKY_WHEEL_PRIZES;
}

export function pickRandomPrize(prizes: LuckyWheelPrize[] = LUCKY_WHEEL_PRIZES): LuckyWheelPrize {
  const totalWeight = prizes.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;
  for (const prize of prizes) {
    if (random < prize.weight) {
      return prize;
    }
    random -= prize.weight;
  }
  return prizes[0];
}

import { randomBytes } from 'crypto';

/** Generates a secure, readable claim code like LUCKY-9K2M4P */
export function generateClaimCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // base32 without 0, 1, I, O
  const bytes = randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return `LUCKY-${code}`;
}

export async function createPrizeClaimRecord(
  prisma: PrismaClient,
  opts: {
    telegramUserId: string;
    prizeId?: string;
    prizeName: string;
    prizeIcon?: string;
    prizeType?: string;
    source?: 'wheel_spin' | 'manager_draw';
    validityDays?: number;
  }
) {
  const validityDays = opts.validityDays ?? 30;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + validityDays);

  // Generate unique code with collision fallback
  let code = generateClaimCode();
  let attempts = 0;
  while (attempts < 5) {
    const existing = await prisma.prizeClaim.findUnique({ where: { code } });
    if (!existing) break;
    code = generateClaimCode();
    attempts++;
  }

  return prisma.prizeClaim.create({
    data: {
      code,
      telegramUserId: opts.telegramUserId,
      prizeId: opts.prizeId || null,
      prizeName: opts.prizeName,
      prizeIcon: opts.prizeIcon || '🎁',
      prizeType: opts.prizeType || 'item',
      status: 'pending',
      source: opts.source || 'wheel_spin',
      expiresAt,
    },
  });
}

