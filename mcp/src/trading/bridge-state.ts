import { AsyncLocalStorage } from "node:async_hooks";
import type { BridgeCheckpoint, BridgePlan, BridgeReceipt } from "@provablehq/aleo-bridge-sdk";
export type BridgeState = {
  version: 1;
  plan: BridgePlan;
  started: boolean;
  hookData?: string;
  checkpoint?: BridgeCheckpoint;
  receipt?: BridgeReceipt;
  unknownSubmission?: boolean;
};
export const bridgeContext = new AsyncLocalStorage<{ state: BridgeState; persist(): void; submission?: { chain: string; role: "source" | "approval" | "destination"; captured: boolean } }>();
