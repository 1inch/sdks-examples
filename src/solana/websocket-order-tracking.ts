/**
 * 1inch Intent Swap Example: Real-Time Order Tracking with WebSocket on Solana
 *
 * This example demonstrates how to track Fusion orders in real-time using
 * the WebSocket API on Solana. Unlike polling, WebSocket provides instant
 * notifications when order events occur (created, filled, cancelled).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WEBSOCKET VS POLLING ON SOLANA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * | Aspect        | Polling (getOrderStatus) | WebSocket               |
 * |---------------|--------------------------|-------------------------|
 * | Latency       | 2-3 second intervals     | Instant (~100ms)        |
 * | API calls     | Many repeated requests   | Single connection       |
 * | Events        | Only active/inactive     | Create, fill, cancel    |
 * | Use case      | Simple scripts           | Production applications |
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SOLANA ORDER EVENTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The Solana WebSocket API provides these events:
 * - create: Order escrow created on-chain
 * - fill: Order filled by resolver
 * - cancel: Order cancelled (by maker or resolver)
 *
 * Each event includes transaction signature, slot number, and order details.
 */

import { PublicKey, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Address, FusionSwapContract, WebSocketApi } from "@1inch/solana-fusion-sdk";
import { loadConfig, createSolanaSDK, TOKENS, formatSol } from "./utils/connection.js";

// ============================================================================
// CONFIGURATION
// ============================================================================

const SWAP_CONFIG = {
  srcToken: Address.NATIVE,
  srcTokenDecimals: 9,
  srcTokenSymbol: "SOL",
  dstToken: new Address(TOKENS.JUP),
  dstTokenDecimals: 6,
  dstTokenSymbol: "JUP",
  amount: BigInt(0.1 * LAMPORTS_PER_SOL), // 0.1 SOL (minimum for reliable quotes)
  timeout: 300_000 // 5 minutes
};

// ============================================================================
// MAIN LOGIC
// ============================================================================

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("1inch Intent Swap: WebSocket Order Tracking on Solana");
  console.log("=".repeat(60));

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n📋 Loading configuration...");
  const config = loadConfig();
  const { sdk, connection, wallet } = createSolanaSDK(config);

  console.log(`   Wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`   RPC: ${config.rpcUrl}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: SETUP WEBSOCKET CONNECTION
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n🔌 Setting up WebSocket connection...");

  // Track order completion
  let orderHash: string | null = null;
  let orderCompleted = false;

  // Create WebSocket connection (connects automatically)
  const ws = WebSocketApi.fromConfig({
    url: "wss://api.1inch.com/fusion/ws",
    authKey: config.apiKey
  });

  // Handle connection events first
  ws.onOpen(() => {
    console.log("   ✅ WebSocket connected");
  });

  ws.onError((error) => {
    console.error("   ❌ WebSocket error:", error);
  });

  ws.onClose(() => {
    if (!orderCompleted) {
      console.log("   ⚠️ WebSocket connection closed");
    }
  });

  // Promise to wait for order completion via WebSocket
  const orderCompletionPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Order timeout after ${SWAP_CONFIG.timeout / 1000}s`));
    }, SWAP_CONFIG.timeout);

    // Subscribe to order events
    ws.order.onOrderCreated((data) => {
      if (data.result.orderHash === orderHash) {
        console.log("\n📥 [WebSocket] Order created event received");
        console.log(`   Order hash: ${data.result.orderHash}`);
        console.log(`   Transaction: ${data.result.transactionSignature}`);
        console.log(`   Slot: ${data.result.slotNumber}`);
      }
    });

    ws.order.onOrderFilled((data) => {
      if (data.result.orderHash === orderHash) {
        console.log("\n🎉 [WebSocket] Order filled!");
        console.log(`   Order hash: ${data.result.orderHash}`);
        console.log(`   Transaction: ${data.result.transactionSignature}`);
        console.log(`   Resolver: ${data.result.resolver}`);
        console.log(`   Filled maker amount: ${data.result.filledMakerAmount}`);
        clearTimeout(timeout);
        orderCompleted = true;
        resolve();
      }
    });

    ws.order.onOrderCancelled((data) => {
      if (data.result.orderHash === orderHash) {
        console.log("\n❌ [WebSocket] Order cancelled");
        console.log(`   Order hash: ${data.result.orderHash}`);
        console.log(`   Transaction: ${data.result.transactionSignature}`);
        clearTimeout(timeout);
        orderCompleted = true;
        reject(new Error("Order was cancelled"));
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: BALANCE CHECK
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n💰 Checking SOL balance...");
  const balance = await connection.getBalance(wallet.publicKey);

  console.log(`   SOL balance: ${formatSol(balance)} SOL`);
  console.log(`   Amount to swap: ${formatSol(SWAP_CONFIG.amount)} SOL`);

  const estimatedFees = BigInt(0.01 * LAMPORTS_PER_SOL);
  const totalNeeded = SWAP_CONFIG.amount + estimatedFees;

  if (BigInt(balance) < totalNeeded) {
    ws.close();
    throw new Error(
      `Insufficient SOL balance. Have: ${formatSol(balance)} SOL, ` +
        `Need: ${formatSol(totalNeeded)} SOL (including fees)`
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: CREATE AND SUBMIT ORDER
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n📝 Creating Fusion order...");
  const makerAddress = Address.fromPublicKey(wallet.publicKey);

  const order = await sdk.createOrder(SWAP_CONFIG.srcToken, SWAP_CONFIG.dstToken, SWAP_CONFIG.amount, makerAddress);

  orderHash = order.getOrderHashBase58();
  console.log(`   Order hash: ${orderHash}`);

  console.log("\n🔐 Building escrow transaction...");
  const contract = FusionSwapContract.default();

  const instruction = contract.create(order, {
    maker: makerAddress,
    srcTokenProgram: Address.TOKEN_PROGRAM_ID
  });

  const tx = new Transaction().add({
    programId: new PublicKey(instruction.programId.toBuffer()),
    keys: instruction.accounts.map((account) => ({
      pubkey: new PublicKey(account.pubkey.toBuffer()),
      isSigner: account.isSigner,
      isWritable: account.isWritable
    })),
    data: Buffer.from(instruction.data)
  });

  console.log("\n📤 Sending transaction...");
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = wallet.publicKey;
  tx.sign(wallet);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed"
  });

  console.log(`   Transaction signature: ${signature}`);
  console.log("   Waiting for confirmation...");

  const confirmation = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

  if (confirmation.value.err) {
    ws.close();
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  }

  console.log("   ✅ Escrow created on-chain!");

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: WAIT FOR WEBSOCKET EVENTS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n⏳ Waiting for order events via WebSocket...");
  console.log("   (You will see real-time updates as the order progresses)");

  try {
    await orderCompletionPromise;
    console.log("\n✅ Order tracking complete!");
  } finally {
    ws.close();
    console.log("\n🔌 WebSocket connection closed");
  }
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
    // Show API response details if available (axios errors)
    if (error && typeof error === "object" && "response" in error) {
      const response = (error as { response?: { data?: unknown } }).response;
      if (response?.data) {
        console.error("   API Response:", JSON.stringify(response.data, null, 2));
      }
    }
    process.exit(1);
  });
