export type Network = "testnet" | "mainnet";
export type SecretRef = { type: "env"; name: string } | { type: "stored"; id: string };
export type HostedWallet = {
  provider: "local" | "privy" | "dynamic";
  address: string;
  rpcUrl: string;
  key?: SecretRef;
  walletId?: string;
  appId?: SecretRef;
  appSecret?: SecretRef;
  authorizationKey?: SecretRef;
  environmentId?: string;
};
export type Policy = {
  swaps: boolean;
  claims: boolean;
  bridges: boolean;
  maxSlippageBps: number;
  swapLimits: Record<string, string>;
  bridgeLimits: Record<string, string>;
};
export type Profile = {
  id: string;
  network: Network;
  address: string;
  key: SecretRef;
  program?: string;
  networkUrl?: string;
  apiUrl?: string;
  useFeeMaster?: boolean;
  evm?: HostedWallet;
  solana?: HostedWallet;
  policy: Policy;
};
export type Kind = "swap" | "bridge" | "claim";
export type Status = "queued" | "running" | "submitted" | "pending" | "complete" | "uncertain" | "failed";
export type Summary = Record<string, unknown>;
export type SavedQuote = {
  id: string;
  kind: Kind;
  profile: Profile;
  scope: string;
  createdAt: number;
  expiresAt: number;
  plan: unknown;
  summary: Summary;
  operationId?: string;
};
export type Operation = {
  id: string;
  kind: Kind;
  profileId: string;
  scope: string;
  quoteId: string;
  requestKey: string;
  status: Status;
  createdAt: number;
  updatedAt: number;
  result: Summary;
  checkpoint?: unknown;
};
export type Progress = { status: Status; result: Summary; checkpoint?: unknown };
export interface ExecutionContext {
  checkpoint(value: unknown): void;
  operationId: string;
}
export interface TradingBackend {
  quote(kind: Kind, profile: Profile, input: Summary): Promise<{ plan: unknown; summary: Summary; expiresAt?: number }>;
  execute(quote: SavedQuote, context: ExecutionContext): Promise<Progress>;
  read(action: string, profile: Profile, input: Summary): Promise<Summary>;
  reconcile(quote: SavedQuote, operation: Operation): Promise<Progress>;
  resume(quote: SavedQuote, operation: Operation, context: ExecutionContext): Promise<Progress>;
}
export class TradingError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "TradingError"; }
}
