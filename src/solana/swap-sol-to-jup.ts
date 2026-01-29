/**
 * 1inch Intent Swap Example: SOL to JUP on Solana
 *
 * This example demonstrates how to swap native SOL for JUP tokens
 * using the 1inch Solana Fusion SDK.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HOW SOLANA FUSION DIFFERS FROM EVM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SOLANA APPROACH:
 * - Orders are placed ON-CHAIN via escrow creation transaction
 * - User pays transaction fee (~0.00001 SOL) to create the escrow
 * - Resolvers then fill the escrow-backed order
 * - User must SIGN and BROADCAST a transaction (unlike EVM's off-chain signing)
 *
 * EVM APPROACH (for comparison):
 * - Orders are signed off-chain
 * - Submitted to relayer network (no gas from user)
 * - Truly gasless from user perspective
 *
 * WHY THE DIFFERENCE?
 * Solana's architecture requires on-chain state for order matching.
 * The escrow contract locks your funds until the order is filled or cancelled.
 * Transaction fees on Solana are very low (~$0.001) so this is still economical.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FLOW OVERVIEW
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. Initialize SDK and wallet
 * 2. Check SOL balance (need swap amount + tx fees)
 * 3. Create FusionOrder object via SDK
 * 4. Build escrow creation transaction using FusionSwapContract
 * 5. Sign and broadcast to Solana network
 * 6. Poll for resolver to fill the order
 *
 * Example: Swap 0.1 SOL to JUP on Solana mainnet
 */

import { PublicKey, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Address, FusionSwapContract } from "@1inch/solana-fusion-sdk";
import { loadConfig, createSolanaSDK, TOKENS, sleep, formatSol } from "./utils/connection.js";

// ============================================================================
// CONFIGURATION - Modify these values for your swap
// ============================================================================

const SWAP_CONFIG = {
  // ─────────────────────────────────────────────────────────────────────────
  // SOURCE TOKEN: NATIVE SOL
  // ─────────────────────────────────────────────────────────────────────────
  // Address.NATIVE is a special constant representing native SOL
  // (similar to 0xEeee... on EVM chains)
  srcToken: Address.NATIVE,
  srcTokenDecimals: 9, // SOL uses 9 decimals (1 SOL = 1,000,000,000 lamports)
  srcTokenSymbol: "SOL",

  // ─────────────────────────────────────────────────────────────────────────
  // DESTINATION TOKEN: JUP (Jupiter token)
  // ─────────────────────────────────────────────────────────────────────────
  // SPL tokens on Solana are identified by their mint address
  // JUP is the governance token for Jupiter Exchange
  dstToken: new Address(TOKENS.JUP),
  dstTokenDecimals: 6,
  dstTokenSymbol: "JUP",

  // ─────────────────────────────────────────────────────────────────────────
  // SWAP AMOUNT
  // ─────────────────────────────────────────────────────────────────────────
  // Amount in lamports (smallest unit of SOL)
  // 0.1 SOL = 0.1 * 1,000,000,000 = 100,000,000 lamports
  // Using LAMPORTS_PER_SOL constant for clarity
  amount: BigInt(0.1 * LAMPORTS_PER_SOL),

  // ─────────────────────────────────────────────────────────────────────────
  // TIMING CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────
  orderTimeout: 300_000, // 5 minutes
  pollInterval: 2_000 // 2 seconds (Solana has faster block times than EVM)
};

// ============================================================================
// MAIN LOGIC
// ============================================================================

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("1inch Intent Swap: SOL to JUP on Solana");
  console.log("=".repeat(60));

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1: INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════
  // Load environment variables and create SDK instance.
  // The Solana SDK needs:
  // - API_KEY: Your 1inch API key
  // - SOLANA_PRIVATE_KEY: Base64-encoded 64-byte secret key
  // - SOLANA_RPC_URL: (optional) RPC endpoint
  console.log("\n📋 Loading configuration...");
  const config = loadConfig();
  const { sdk, connection, wallet } = createSolanaSDK(config);

  // Solana addresses are Base58 encoded (different from EVM's hex format)
  console.log(`   Wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`   RPC: ${config.rpcUrl}`);

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2: BALANCE CHECK
  // ═══════════════════════════════════════════════════════════════════════
  // Unlike EVM where Fusion is gasless, Solana requires paying transaction
  // fees to create the escrow. Fees are typically ~0.00001 SOL but we
  // reserve more as a buffer.
  console.log("\n💰 Checking SOL balance...");
  const balance = await connection.getBalance(wallet.publicKey);

  console.log(`   SOL balance: ${formatSol(balance)} SOL`);
  console.log(`   Amount to swap: ${formatSol(SWAP_CONFIG.amount)} SOL`);

  // Reserve for rent (escrow account creation) + transaction fees
  const estimatedFees = BigInt(0.01 * LAMPORTS_PER_SOL);
  const totalNeeded = SWAP_CONFIG.amount + estimatedFees;

  if (BigInt(balance) < totalNeeded) {
    throw new Error(
      `Insufficient SOL balance. Have: ${formatSol(balance)} SOL, ` +
        `Need: ${formatSol(totalNeeded)} SOL (including fees)`
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 3: CREATE FUSION ORDER OBJECT
  // ═══════════════════════════════════════════════════════════════════════
  // The SDK creates a FusionOrder struct containing:
  // - Source token and amount
  // - Destination token and minimum output
  // - Dutch auction parameters (prices decrease over time)
  // - Expiry timestamp
  //
  // NOTE: This is just creating the order DATA, not submitting it yet!
  // The order will be submitted when we create the on-chain escrow.
  console.log("\n📝 Creating Fusion order...");

  // Convert Solana PublicKey to 1inch Address format
  const makerAddress = Address.fromPublicKey(wallet.publicKey);

  // Create the order via SDK - this calls the 1inch API to:
  // 1. Get current pricing information
  // 2. Calculate optimal auction parameters
  // 3. Return a fully-formed FusionOrder struct
  const order = await sdk.createOrder(SWAP_CONFIG.srcToken, SWAP_CONFIG.dstToken, SWAP_CONFIG.amount, makerAddress);

  // Order hash uniquely identifies this order on-chain and off-chain
  console.log(`   Order hash: ${order.getOrderHashBase58()}`);

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 4: BUILD ESCROW CREATION INSTRUCTION
  // ═══════════════════════════════════════════════════════════════════════
  // On Solana, orders are backed by on-chain escrows:
  // - An escrow account is created to hold your funds
  // - Resolvers can see the escrow and fill the order
  // - Once filled, escrow releases tokens to you
  // - If cancelled, escrow returns your funds
  //
  // FusionSwapContract provides methods to interact with the escrow program.
  console.log("\n🔐 Building escrow transaction...");

  // Get the default FusionSwapContract (uses the official 1inch program ID)
  const contract = FusionSwapContract.default();

  // Build the "create escrow" instruction
  // This instruction will:
  // 1. Create a new escrow account (PDA)
  // 2. Transfer your SOL into the escrow
  // 3. Register the order parameters on-chain
  const instruction = contract.create(order, {
    maker: makerAddress,
    // TOKEN_PROGRAM_ID for native SOL/standard SPL tokens
    // For Token-2022 tokens, use TOKEN_2022_PROGRAM_ID
    srcTokenProgram: Address.TOKEN_PROGRAM_ID
  });

  // Convert from 1inch instruction format to Solana Transaction format
  // The SDK uses its own Address type internally, so we need to convert
  const tx = new Transaction().add({
    programId: new PublicKey(instruction.programId.toBuffer()),
    keys: instruction.accounts.map((account) => ({
      pubkey: new PublicKey(account.pubkey.toBuffer()),
      isSigner: account.isSigner, // Whether account must sign the tx
      isWritable: account.isWritable // Whether account state is modified
    })),
    data: Buffer.from(instruction.data) // Serialized instruction data
  });

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 5: SIGN AND SEND TRANSACTION
  // ═══════════════════════════════════════════════════════════════════════
  // Solana transactions require:
  // 1. Recent blockhash (for replay protection)
  // 2. Fee payer designation
  // 3. Signature from all required signers
  console.log("\n📤 Sending transaction...");

  // Get a recent blockhash - transactions expire after ~2 minutes
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = wallet.publicKey; // You pay the ~0.00001 SOL fee

  // Sign with your wallet (this is the only signature needed)
  tx.sign(wallet);

  // Send the serialized transaction to the network
  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false, // Simulate first to catch errors early
    preflightCommitment: "confirmed" // Level of commitment for simulation
  });

  console.log(`   Transaction signature: ${signature}`);
  console.log("   Waiting for confirmation...");

  // Wait for transaction to be confirmed (included in a block)
  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash,
      lastValidBlockHeight
    },
    "confirmed" // "confirmed" = ~2/3 of validators have seen it
  );

  // Check if transaction succeeded
  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  }

  console.log("   ✅ Escrow created on-chain!");

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 6: POLL FOR ORDER COMPLETION
  // ═══════════════════════════════════════════════════════════════════════
  // After escrow creation, resolvers can see your order and compete to fill it.
  // We poll the status API to track when this happens.
  //
  // Unlike EVM which has specific status strings, Solana uses isActive() boolean.
  // When isActive() returns false, the order is complete (filled or cancelled).
  console.log("\n⏳ Waiting for order to be filled...");
  const orderHash = order.getOrderHashBase58();
  const startTime = Date.now();

  while (Date.now() - startTime < SWAP_CONFIG.orderTimeout) {
    try {
      const status = await sdk.getOrderStatus(orderHash);

      // Check if order is no longer active (filled, cancelled, or expired)
      if (!status.isActive()) {
        console.log("\n🎉 Order completed!");
        console.log(`   Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
        return;
      }

      // Order still active - resolvers are evaluating it
      process.stdout.write(".");
      await sleep(SWAP_CONFIG.pollInterval);
    } catch {
      // Network/API error - retry the status check
      console.log("\n   ⚠️ Status check failed, retrying...");
      await sleep(SWAP_CONFIG.pollInterval);
    }
  }

  // Timeout doesn't mean failure - the order might still be filled!
  // It's just taking longer than our wait time.
  console.log("\n⚠️ Order timeout. The order may still be filled later.");
  console.log("   You can check the status or cancel the order using cancel-order.ts");
}

// ============================================================================
// ENTRY POINT
// ============================================================================

main()
  .then(() => {
    console.log("\n✅ Example completed successfully!");
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error("\n❌ Error:", error instanceof Error ? error.message : error);
    if (error && typeof error === "object" && "response" in error) {
      const response = (error as { response?: { data?: unknown } }).response;
      if (response?.data) {
        console.error("   API Response:", JSON.stringify(response.data, null, 2));
      }
    }
    process.exit(1);
  });
