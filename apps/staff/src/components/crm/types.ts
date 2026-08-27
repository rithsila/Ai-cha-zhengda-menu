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

export type CustomerDetail = CustomerSummary & {
  orders: CustomerDetailOrder[];
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
  totalParticipants: number;
  totalTickets: number;
};
