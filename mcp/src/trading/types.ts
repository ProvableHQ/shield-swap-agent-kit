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
  apiToken?: SecretRef;
  metadata?: SecretRef;
  password?: SecretRef;
  keyShares?: SecretRef;
};
export type Policy = {
  swaps: boolean;
  claims: boolean;
  bridges: boolean;
  /** Record inventory maintenance (joins and splits). Absent in profiles written before 0.14.0; treated as false. */
  inventory?: boolean;
  /** Total network-fee ceiling in microcredits for one inventory rebalance operation; absent or zero prevents execution. */
  inventoryFeeLimit?: string;
  maxSlippageBps: number;
  swapLimits: Record<string, string>;
  bridgeLimits: Record<string, string>;
  /** Most swaps one execute may submit as a batch; each is capped by swapLimits. Absent means 20. */
  maxBatchSwaps?: number;
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
export type Kind = "swap" | "bridge" | "claim" | "inventory";
export type Status = "queued" | "running" | "submitted" | "pending" | "complete" | "uncertain" | "failed";
/** One swap of a batch. A swap operation's checkpoint is `{ swaps: SwapItem[] }`; a single swap is a batch of one. */
export type SwapItem = {
  index: number;
  status: "pending" | "submitted" | "uncertain" | "failed" | "complete";
  phase?: string;
  submissionBoundary?: number;
  counter?: number;
  swapId?: string;
  transactionId?: string;
  feeTransactionId?: string;
  claimable?: boolean;
  amountOut?: string;
  amountRemaining?: string;
  claimTransactionId?: string;
  error?: { code: string; message?: string; transactionId?: string; feeTransactionId?: string };
};
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
  /** Swaps requested by execute; absent on operations recorded before batches existed. */
  count?: number;
};
/** One token the maintainer keeps at a floor of records that each cover a human decimal minimum. */
export type MaintenanceTarget = { token: string; records: number; minRecordAmount: string };
/** Stored as `maintenance:<profileId>`; written by the maintainer process, read by the status tool. */
export type MaintenanceState = {
  profileId: string;
  pid: number;
  startedAt: number;
  intervalSeconds: number;
  targets: MaintenanceTarget[];
  running: boolean;
  lastPass?: { at: number; ready: Record<string, number>; action: "none" | "rebalanced" | "skipped"; operationId?: string; error?: string };
};
export type Progress = { status: Status; result: Summary; checkpoint?: unknown };
export interface ExecutionContext {
  checkpoint(value: unknown): void;
  operationId: string;
}
export interface TradingBackend {
  quote(kind: Kind, profile: Profile, input: Summary): Promise<{ plan: unknown; summary: Summary; expiresAt?: number }>;
  execute(quote: SavedQuote, context: ExecutionContext, count?: number): Promise<Progress>;
  read(action: string, profile: Profile, input: Summary): Promise<Summary>;
  reconcile(quote: SavedQuote, operation: Operation): Promise<Progress>;
  resume(quote: SavedQuote, operation: Operation, context: ExecutionContext): Promise<Progress>;
}
export class TradingError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "TradingError"; }
}
