export type CustomerTier = 'standard' | 'gold';

export type CustomerSummary = {
  telegramUserId: string;
  phoneNumber?: string | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  contactName?: string | null;
  building?: string | null;
  roomNumber?: string | null;
  tier: CustomerTier;
  loyaltyPoints: number;
  luckyTickets: number;
  trustNotes?: string | null;
  createdAt: string;
  updatedAt: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate?: string | null;
};

export type CustomerDetailOrder = {
  id: string;
  totalAmount: number;
  status: string;
  paymentMethod: string;
  createdAt: string;
  items?: Array<{
    id: string;
    quantity: number;
    price: number;
    modifiers: string;
    menuItem: {
      name: string;
      brand: string;
    };
  }>;
};

export type PrizeClaimItem = {
  id: string;
  code: string;
  telegramUserId: string;
  prizeId?: string | null;
  prizeName: string;
  prizeIcon: string;
  prizeType: string;
  status: 'pending' | 'claimed' | 'expired';
  source: string;
  expiresAt?: string | null;
  claimedAt?: string | null;
  claimedByStaffId?: string | null;
  claimedByStaffName?: string | null;
  notes?: string | null;
  createdAt: string;
  user?: {
    telegramUserId: string;
    firstName?: string | null;
    lastName?: string | null;
    contactName?: string | null;
    phoneNumber?: string | null;
    username?: string | null;
    tier?: CustomerTier;
    building?: string | null;
    roomNumber?: string | null;
  };
};

export type CustomerDetail = CustomerSummary & {
  orders: CustomerDetailOrder[];
  prizeClaims?: PrizeClaimItem[];
};

export type CustomersResponse = {
  customers: CustomerSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: {
    totalCustomers: number;
    standardCount: number;
    goldCount: number;
    totalStamps: number;
    totalLuckyTickets: number;
  };
};

export type SystemConfigItem = {
  id: string;
  key: string;
  value: string;
};

export type LuckyDrawWinner = {
  telegramUserId: string;
  phoneNumber?: string | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  contactName?: string | null;
  tier: CustomerTier;
  luckyTickets: number;
};

export type LuckyDrawResult = {
  winner: LuckyDrawWinner;
  prizeName: string | null;
  claimCode?: string | null;
  claimId?: string | null;
  expiresAt?: string | null;
  totalParticipants: number;
  totalTickets: number;
};

