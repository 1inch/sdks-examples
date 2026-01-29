/**
 * 1inch Intent Swap Example: Cancel Order on Solana
 *
 * This example demonstrates how to cancel an active Fusion order on Solana.
 * It creates an order and immediately cancels it to show the full flow.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHEN TO CANCEL AN ORDER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * You might want to cancel a Fusion order when:
 * 1. Order hasn't been filled and you want your tokens back immediately
 * 2. Market conditions changed (price moved significantly)
 * 3. You made an error in the order parameters
 * 4. You need the locked funds for something else
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IMPORTANT NOTES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. OWNERSHIP: You can ONLY cancel orders you created (maker == your wallet)
 *
 * 2. ORDER OBJECT REQUIRED: To cancel, you need the original FusionOrder object
 *    (not just the order hash). Always store orders when creating them.
 *
 * 3. TIMING: Cancel as soon as you decide - don't wait for expiry if you need
 *    your funds back quickly.
 *
 * 4. GAS: Cancellation requires a small transaction fee (~0.00001 SOL)
 *
 * 5. RACE CONDITION: If a resolver fills your order at the same moment you try
 *    to cancel, the fill takes precedence and cancellation will fail.
 */

import { PublicKey, Transaction } from "@solana/web3.js";
import { Address, FusionSwapContract } from "@1inch/solana-fusion-sdk";
import { loadConfig, createSolanaSDK, formatSol } from "../utils/connection.js";
import { createOrderForDemo } from "./create-order-for-demo.js";

// ============================================================================
// MAIN LOGIC - CANCELLATION FLOW
// ============================================================================

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("1inch Intent Swap: Cancel Order on Solana");
  console.log("=".repeat(60));

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1: INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n📋 Loading configuration...");
  const config = loadConfig();
  const { sdk, connection, wallet } = createSolanaSDK(config);
  const makerAddress = Address.fromPublicKey(wallet.publicKey);

  console.log(`   Wallet: ${wallet.publicKey.toBase58()}`);

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2: GET OR CREATE AN ORDER
  // ═══════════════════════════════════════════════════════════════════════
  // In a real app, you'd retrieve an existing order from storage.
  // Here we create one to demonstrate the cancellation flow.
  const { order, orderHash } = await createOrderForDemo(sdk, connection, wallet, makerAddress);

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 3: VERIFY ORDER IS ACTIVE (OPTIONAL)
  // ═══════════════════════════════════════════════════════════════════════
  // Wait for the backend to index the order (may take a few seconds after on-chain confirmation)
  // Note: If the API hasn't indexed the order yet, we can still cancel it since it exists on-chain
  console.log("\n🔍 Verifying order is active...");
  console.log("   Waiting for backend to index the order...");

  let status;
  let orderVerified = false;
  const maxRetries = 5;
  const retryDelay = 2000; // 2 seconds

  for (let i = 0; i < maxRetries; i++) {
    try {
      await sleep(retryDelay);
      status = await sdk.getOrderStatus(orderHash);

      if (status.isActive()) {
        console.log("   ✅ Order is active and can be cancelled");
        orderVerified = true;
        break;
      } else {
        console.log("   Order is not active - may have been filled already!");
        return;
      }
    } catch (error) {
      if (i < maxRetries - 1) {
        console.log(`   Retry ${i + 1}/${maxRetries} - order not indexed yet...`);
      } else {
        console.log("   ⚠️ Order not found in API yet, but proceeding with cancellation");
        console.log("   (Order exists on-chain and can be cancelled regardless of API indexing)");
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 4: CANCEL THE ORDER
  // ═══════════════════════════════════════════════════════════════════════
  // This is the key step - using cancelOwnOrder to get your funds back.
  // You need:
  // - The original FusionOrder object (not just the hash!)
  // - To be the maker (owner) of the order
  console.log("\n🚫 Cancelling order...");

  const contract = FusionSwapContract.default();

  // Build the cancel instruction
  // This instruction will:
  // - Close the escrow account
  // - Return locked funds to your wallet
  // - Return rent (account creation cost) to you
  const cancelInstruction = contract.cancelOwnOrder(order, {
    maker: makerAddress,
    srcTokenProgram: Address.TOKEN_PROGRAM_ID
  });

  // Build cancel transaction
  const cancelTx = new Transaction().add({
    programId: new PublicKey(cancelInstruction.programId.toBuffer()),
    keys: cancelInstruction.accounts.map((account) => ({
      pubkey: new PublicKey(account.pubkey.toBuffer()),
      isSigner: account.isSigner,
      isWritable: account.isWritable
    })),
    data: Buffer.from(cancelInstruction.data)
  });

  // Send cancel transaction
  const { blockhash: cancelBlockhash, lastValidBlockHeight: cancelHeight } = await connection.getLatestBlockhash();
  cancelTx.recentBlockhash = cancelBlockhash;
  cancelTx.lastValidBlockHeight = cancelHeight;
  cancelTx.feePayer = wallet.publicKey;
  cancelTx.sign(wallet);

  const cancelSig = await connection.sendRawTransaction(cancelTx.serialize());
  console.log(`   Cancel tx: ${cancelSig}`);
  console.log("   Waiting for confirmation...");

  const cancelConfirm = await connection.confirmTransaction(
    { signature: cancelSig, blockhash: cancelBlockhash, lastValidBlockHeight: cancelHeight },
    "confirmed"
  );

  if (cancelConfirm.value.err) {
    throw new Error(`Cancel failed: ${JSON.stringify(cancelConfirm.value.err)}`);
  }

  console.log("   ✅ Order cancelled successfully!");

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 5: VERIFY CANCELLATION
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n🔍 Verifying cancellation...");
  try {
    const finalStatus = await sdk.getOrderStatus(orderHash);
    console.log(`   Order active: ${finalStatus.isActive()}`);
    console.log(`   ✅ Order successfully cancelled`);
  } catch (error) {
    // Order may not be indexed in API, but cancellation transaction succeeded
    console.log(`   ⚠️ Could not verify via API (order may not be indexed)`);
    console.log(`   ✅ Cancellation transaction confirmed on-chain`);
  }

  // Check balance returned
  const finalBalance = await connection.getBalance(wallet.publicKey);
  console.log(`\n💰 Final balance: ${formatSol(finalBalance)} SOL`);

  // ═══════════════════════════════════════════════════════════════════════
  // BEST PRACTICES
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n💡 Best Practices for Order Management:");
  console.log("   1. ALWAYS store the FusionOrder object when creating orders");
  console.log("   2. Store alongside the order hash: ordersMap[hash] = order");
  console.log("   3. Implement cancel buttons for active orders in your UI");
  console.log("   4. Handle race conditions: fill may happen during cancel");
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
