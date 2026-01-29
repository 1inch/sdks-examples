/**
 * 1inch Intent Swap Example: Real-Time Order Tracking with WebSocket
 *
 * This example demonstrates how to track Fusion orders in real-time using
 * the WebSocket API instead of polling. WebSocket provides instant notifications
 * when order events occur (created, filled, cancelled, etc.).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WEBSOCKET VS POLLING
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * | Aspect        | Polling (getOrderStatus) | WebSocket               |
 * |---------------|--------------------------|-------------------------|
 * | Latency       | 3-5 second intervals     | Instant (~100ms)        |
 * | API calls     | Many repeated requests   | Single connection       |
 * | Events        | Only final status        | All state changes       |
 * | Use case      | Simple scripts           | Production applications |
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ORDER EVENTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The WebSocket API provides these order events:
 * - order_created: New order submitted to the system
 * - order_filled: Order completely filled by resolver
 * - order_filled_partially: Partial fill occurred
 * - order_invalid: Order became invalid (cancelled, expired, etc.)
 * - order_balance_or_allowance_change: User's token balance/allowance changed
 */

import { WebSocketApi, NetworkEnum } from "@1inch/fusion-sdk";
import { createProvider } from "./providers/ethers.js";
import { loadConfig, createFusionSDK, TOKENS, CONTRACTS, formatAmount } from "./shared/types.js";

// ============================================================================
// CONFIGURATION
// ============================================================================

const SWAP_CONFIG = {
  fromTokenAddress: TOKENS.ethereum.USDC,
  fromTokenDecimals: 6,
  fromTokenSymbol: "USDC",
  toTokenAddress: TOKENS.ethereum["1INCH"],
  toTokenDecimals: 18,
  toTokenSymbol: "1INCH",
  amount: "1000000", // 1 USDC
  timeout: 300_000 // 5 minutes
};

// ============================================================================
// MAIN LOGIC
// ============================================================================

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("1inch Intent Swap: WebSocket Order Tracking");
  console.log("=".repeat(60));

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n📋 Loading configuration...");
  const config = loadConfig();
  const provider = await createProvider(config);
  const sdk = createFusionSDK(config, provider.web3Like);

  console.log(`   Wallet: ${provider.address}`);
  console.log(`   Network: ${config.networkId}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: SETUP WEBSOCKET CONNECTION
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n🔌 Setting up WebSocket connection...");

  const ws = new WebSocketApi({
    url: "wss://api.1inch.com/fusion/ws",
    network: NetworkEnum.ETHEREUM,
    authKey: config.apiKey
  });

  // Track order completion
  let orderHash: string | null = null;
  let orderCompleted = false;

  // Handle connection events
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
    ws.order.onOrderCreated((event) => {
      if (event.result.orderHash === orderHash) {
        console.log("\n📥 [WebSocket] Order created event received");
        console.log(`   Order hash: ${event.result.orderHash}`);
        console.log(`   Auction start: ${event.result.auctionStartDate}`);
        console.log(`   Auction end: ${event.result.auctionEndDate}`);
      }
    });

    ws.order.onOrderFilled((event) => {
      if (event.result.orderHash === orderHash) {
        console.log("\n🎉 [WebSocket] Order filled!");
        console.log(`   Order hash: ${event.result.orderHash}`);
        clearTimeout(timeout);
        orderCompleted = true;
        resolve();
      }
    });

    ws.order.onOrderFilledPartially((event) => {
      if (event.result.orderHash === orderHash) {
        console.log("\n📊 [WebSocket] Order partially filled");
        console.log(`   Order hash: ${event.result.orderHash}`);
        console.log(`   Remaining: ${event.result.remainingMakerAmount}`);
      }
    });

    ws.order.onOrderInvalid((event) => {
      if (event.result.orderHash === orderHash) {
        console.log("\n❌ [WebSocket] Order invalid/cancelled");
        console.log(`   Order hash: ${event.result.orderHash}`);
        clearTimeout(timeout);
        orderCompleted = true;
        reject(new Error("Order was invalidated or cancelled"));
      }
    });

    ws.order.onOrderBalanceOrAllowanceChange((event) => {
      if (event.result.orderHash === orderHash) {
        console.log("\n💰 [WebSocket] Balance/allowance changed");
        console.log(`   Balance: ${event.result.balance}`);
        console.log(`   Allowance: ${event.result.allowance}`);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: BALANCE & ALLOWANCE CHECK
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n💰 Checking token balance...");
  const balance = await provider.getTokenBalance(SWAP_CONFIG.fromTokenAddress, provider.address);
  const amountBigInt = BigInt(SWAP_CONFIG.amount);

  console.log(`   ${SWAP_CONFIG.fromTokenSymbol} balance: ${formatAmount(balance, SWAP_CONFIG.fromTokenDecimals)}`);
  console.log(`   Amount to swap: ${formatAmount(amountBigInt, SWAP_CONFIG.fromTokenDecimals)}`);

  if (balance < amountBigInt) {
    ws.close();
    throw new Error(
      `Insufficient ${SWAP_CONFIG.fromTokenSymbol} balance. ` +
        `Have: ${formatAmount(balance, SWAP_CONFIG.fromTokenDecimals)}, ` +
        `Need: ${formatAmount(amountBigInt, SWAP_CONFIG.fromTokenDecimals)}`
    );
  }

  console.log("\n🔓 Checking token allowance...");
  const allowance = await provider.getTokenAllowance(
    SWAP_CONFIG.fromTokenAddress,
    provider.address,
    CONTRACTS.AGGREGATION_ROUTER_V6
  );

  if (allowance < amountBigInt) {
    console.log("   Approving tokens...");
    const txHash = await provider.approveToken(
      SWAP_CONFIG.fromTokenAddress,
      CONTRACTS.AGGREGATION_ROUTER_V6,
      amountBigInt
    );
    console.log(`   Approval tx: ${txHash}`);
    await provider.waitForTransaction(txHash);
    console.log("   ✅ Approval confirmed!");
  } else {
    console.log("   ✅ Allowance sufficient");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: CREATE AND SUBMIT ORDER
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n📊 Getting quote...");
  const quoteParams = {
    fromTokenAddress: SWAP_CONFIG.fromTokenAddress,
    toTokenAddress: SWAP_CONFIG.toTokenAddress,
    amount: SWAP_CONFIG.amount,
    walletAddress: provider.address,
    source: "sdk-tutorial"
  };

  const quote = await sdk.getQuote(quoteParams);
  const recommendedPreset = quote.presets[quote.recommendedPreset];

  if (!recommendedPreset) {
    ws.close();
    throw new Error(`Preset "${quote.recommendedPreset}" not found`);
  }

  console.log(`   Preset: ${quote.recommendedPreset}`);
  console.log(
    `   Expected: ${formatAmount(BigInt(recommendedPreset.auctionStartAmount), SWAP_CONFIG.toTokenDecimals)} ${SWAP_CONFIG.toTokenSymbol}`
  );

  console.log("\n📝 Creating order...");
  const preparedOrder = await sdk.createOrder(quoteParams);

  console.log("   Submitting order...");
  const orderInfo = await sdk.submitOrder(preparedOrder.order, preparedOrder.quoteId);

  orderHash = orderInfo.orderHash;
  console.log(`   ✅ Order submitted!`);
  console.log(`   Order hash: ${orderHash}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: WAIT FOR WEBSOCKET EVENTS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n⏳ Waiting for order events via WebSocket...");
  console.log("   (You will see real-time updates as the order progresses)");

  try {
    await orderCompletionPromise;
    console.log("\n✅ Order tracking complete!");
  } finally {
    // Always close the WebSocket connection
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
    process.exit(1);
  });
