export interface User {
  id: string;
  email: string;
  name?: string;
  walletAddressId: string;    walletAddress: string;      kycStatus: 'pending' | 'verified' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserRequest {
  email: string;
  name?: string;
  password: string;
}

export interface UserRegistrationResponse {
  user: {
    id: string;
    email: string;
    name?: string;
    walletAddress: string;
    kycStatus: string;
  };
  wallet: {
    address: string;
    balance: string;
  };
}

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  walletAddress: string;
  walletBalance: {
    native: string;
    nativeInUSD: string;
    tokens: Array<{
      symbol: string;
      balance: string;
      balanceInUSD: string;
    }>;
  };
  invoiceStats: {
    totalIssued: number;
    totalPaid: number;
    totalReceived: number;
    pendingAmount: string;
  };
  kycStatus: string;
  createdAt: Date;
}
