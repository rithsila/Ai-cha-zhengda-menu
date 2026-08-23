export type OrderItem = {
  id: string;
  quantity: number;
  price: number;
  modifiers: string;
  menuItem: {
    name: string;
    /** "ai-cha" or "zhengda" — decides which station makes this line. */
    brand: string;
  };
};

export type Order = {
  id: string;
  totalAmount: number;
  paymentMethod: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  pickupCode: string | null;
  /**
   * When the KHQR code stops being payable. ISO timestamp, null for cash orders
   * and for KHQR orders whose QR was never issued (ABA unreachable at checkout).
   */
  paymentExpiresAt: string | null;
  orderType: string;
  deliveryAddress: string | null;
  deliveryBuilding: string | null;
  deliveryRoom: string | null;
  contactName: string | null;
  contactPhone: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  /** Included by GET /api/orders; only rendered while viewing all branches. */
  branch?: { id: string; name: string } | null;
  cancelReason?: string | null;
  items: OrderItem[];
};

export type Branch = { id: string; name: string };

export type ConnectionState = 'live' | 'retrying' | 'offline';
