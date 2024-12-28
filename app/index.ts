import VestingDappIDL from "./vesting_dapp.json";
import { VestingDapp } from "./vesting_dapp";

import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Cluster, PublicKey } from "@solana/web3.js";

// Re-export the generated IDL and type
export { VestingDapp, VestingDappIDL };

// The programId is imported from the program IDL.
export const VESTING_PROGRAM_ID = new PublicKey(VestingDappIDL.address);

// This is a helper function to get the Vesting Anchor program.
export function getVestingProgram(provider: AnchorProvider) {
  return new Program(VestingDappIDL as VestingDapp, provider);
}

// This is a helper function to get the program ID for the Vesting program depending on the cluster.
export function getVestingProgramId(cluster: Cluster) {
  switch (cluster) {
    case "devnet":
    case "testnet":
      // This is the program ID for the Vesting program on devnet and testnet.
      return new PublicKey("8RBLvGLkXZkTXuA6WJhKTC1F7raEqfhBL69BkcaYTZL1");
    case "mainnet-beta":
    default:
      return VESTING_PROGRAM_ID;
  }
}
