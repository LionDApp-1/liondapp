export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  AI: Ai;
  APP_ORIGIN: string;
  ADMIN_ORIGIN: string;
  ADMIN_PASSWORD_ORIGIN?: string;
  ENVIRONMENT: "devnet" | "mainnet-beta";
  AUTH_CHAIN_ID: "solana:devnet" | "solana:mainnet";
  RECOMMENDATION_DAYS: string;
  DEFAULT_RECOMMENDATION_PRICE: string;
  SKR_MINT: string;
  RECEIVER_ADDRESS: string;
  SKR_DECIMALS: string;
  SESSION_TTL_SECONDS: string;
  ABUSE_HASH_KEY: string;
  PAYMENT_MODE: "simulation" | "onchain";
  SOLANA_RPC_URL: string;
  DONATIONS_ENABLED?: string;
  DONATION_RPC_URL?: string;
  IDENTITY_RPC_URL_SECRET: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  ADMIN_EMAIL?: string;
}

export interface SessionIdentity {
  skrDomain: string;
  walletAddress: string;
}

export interface JsonMap {
  [key: string]: unknown;
}
