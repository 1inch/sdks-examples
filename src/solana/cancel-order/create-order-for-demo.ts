/**
 * Helper: Create Order for Demonstration
 *
 * This module creates and submits an order to demonstrate the cancellation flow.
 * In production, you would retrieve an existing order from your storage instead.
 */

import { PublicKey, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { Connection, Keypair } from "@solana/web3.js";
import { Address, FusionSwapContract, Sdk } from "@1inch/solana-fusion-sdk";
import type { FusionOrder } from "@1inch/solana-fusion-sdk";
import { TOKENS, formatSol } from "../utils/connection.js";

// ============================================================================
// CONFIGURATION
// ============================================================================

const ORDER_CONFIG = {
  // Order for demonstration purposes
  srcToken: Address.NATIVE,
  dstToken: new Address(TOKENS.JUP),
  // 0.1 SOL (minimum for reliable quotes)
  amount: BigInt(0.1 * LAMPORTS_PER_SOL)
};

// ============================================================================
// TYPES
// ============================================================================

export interface OrderResult {
  order: FusionOrder;
  orderHash: string;
}

// ============================================================================
// HELPER FUNCTION
// ============================================================================

/**
 * Creates and submits an order to demonstrate the cancellation flow.
 *
 * This function:
 * 1. Checks wallet balance
 * 2. Creates an order via the SDK
 * 3. Submits it to create an on-chain escrow
 *
 * @param sdk - The Fusion SDK instance
 * @param connection - Solana connection
 * @param wallet - Wallet keypair for signing
 * @param makerAddress - Address of the order maker
 * @returns The created order and its hash
 */
export async function createOrderForDemo(
  sdk: Sdk,
  connection: Connection,
  wallet: Keypair,
  makerAddress: Address
): Promise<OrderResult> {
  // Check balance first
  console.log("\n💰 Checking SOL balance...");
  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`   Balance: ${formatSol(balance)} SOL`);

  const estimatedFees = BigInt(0.02 * LAMPORTS_PER_SOL);
  const totalNeeded = ORDER_CONFIG.amount + estimatedFees;

  if (BigInt(balance) < totalNeeded) {
    throw new Error(`Insufficient balance. Need at least ${formatSol(totalNeeded)} SOL`);
  }

  // Create order via SDK
  console.log("\n📝 Creating order to demonstrate cancellation...");
  const order = await sdk.createOrder(ORDER_CONFIG.srcToken, ORDER_CONFIG.dstToken, ORDER_CONFIG.amount, makerAddress);

  const orderHash = order.getOrderHashBase58();
  console.log(`   Order hash: ${orderHash}`);

  // Submit to create on-chain escrow
  console.log("\n🔐 Creating on-chain escrow...");
  const contract = FusionSwapContract.default();

  const createInstruction = contract.create(order, {
    maker: makerAddress,
    srcTokenProgram: Address.TOKEN_PROGRAM_ID
  });

  const createTx = new Transaction().add({
    programId: new PublicKey(createInstruction.programId.toBuffer()),
    keys: createInstruction.accounts.map((account) => ({
      pubkey: new PublicKey(account.pubkey.toBuffer()),
      isSigner: account.isSigner,
      isWritable: account.isWritable
    })),
    data: Buffer.from(createInstruction.data)
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  createTx.recentBlockhash = blockhash;
  createTx.lastValidBlockHeight = lastValidBlockHeight;
  createTx.feePayer = wallet.publicKey;
  createTx.sign(wallet);

  const createSig = await connection.sendRawTransaction(createTx.serialize());
  console.log(`   Create tx: ${createSig}`);
  console.log("   Waiting for confirmation...");

  const createConfirm = await connection.confirmTransaction(
    { signature: createSig, blockhash, lastValidBlockHeight },
    "confirmed"
  );

  if (createConfirm.value.err) {
    throw new Error(`Create failed: ${JSON.stringify(createConfirm.value.err)}`);
  }
  console.log("   ✅ Escrow created!");

  return { order, orderHash };
}
