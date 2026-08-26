export interface ABAConfig {
  readonly merchantId: string;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly webhookSecret?: string;
}

export interface PurchaseItem {
  readonly name: string;
  readonly quantity: number;
  readonly price: number;
}

export interface PurchaseRequest {
  readonly transactionId: string;
  readonly amount: number;
  readonly currency: "USD" | "KHR";
  /**
   * ABA expects `items` as a base64-encoded JSON array. Pass an array and the
   * SDK encodes it for you; pass a string and it is sent through untouched
   * (assumed already encoded, or a plain label).
   */
  readonly items?: string | readonly PurchaseItem[];
  readonly firstName?: string;
  readonly lastName?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly returnUrl?: string;
  readonly cancelUrl?: string;
  readonly continueSuccessUrl?: string;
  readonly returnDeeplink?: string;
  readonly paymentOption?: string;
  readonly customFields?: string;
  readonly returnParams?: string;
}

export interface PurchaseResponse {
  readonly success: boolean;
  readonly transactionId: string;
  readonly checkoutUrl?: string;
  readonly abapayDeeplink?: string;
  readonly qrString?: string;
  readonly amount: number;
  readonly currency: string;
  readonly expiresAt?: string;
  readonly error?: string;
  readonly errorCode?: string;
}

export type PaymentStatus =
  | "PENDING"
  | "APPROVED"
  | "DECLINED"
  | "REFUNDED"
  | "ERROR";

export interface StatusResponse {
  readonly success: boolean;
  readonly transactionId: string;
  readonly status: PaymentStatus;
  readonly amount?: number;
  readonly currency?: string;
  readonly paymentTime?: string;
  readonly error?: string;
}

export interface KHQROptions {
  readonly emvData: string;
  readonly amount: number;
  readonly currency: "USD" | "KHR";
  readonly merchantName: string;
  readonly logoUrl?: string;
  readonly headerColor?: string;
}

export interface HashParams {
  readonly req_time: string;
  readonly merchant_id: string;
  readonly tran_id: string;
  readonly amount?: string;
  readonly items?: string;
  readonly shipping?: string;
  readonly ctid?: string;
  readonly pwt?: string;
  readonly firstname?: string;
  readonly lastname?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly type?: string;
  readonly payment_option?: string;
  readonly return_url?: string;
  readonly cancel_url?: string;
  readonly continue_success_url?: string;
  readonly return_deeplink?: string;
  readonly currency?: string;
  readonly custom_fields?: string;
  readonly return_params?: string;
}
