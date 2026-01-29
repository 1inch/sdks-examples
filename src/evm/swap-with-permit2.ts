/**
 * 1inch Intent Swap Example: ERC-20 Swap with Permit2
 *
 * This example demonstrates how to use Permit2 for gasless token approvals
 * with the 1inch Fusion SDK. It uses a provider-agnostic interface.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PROVIDER AGNOSTIC DESIGN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * To switch providers, simply change the import:
 *
 *   // Use ethers.js:
 *   import { createProvider } from "./providers/ethers.js";
 *
 *   // OR use viem:
 *   import { createProvider } from "./providers/viem.js";
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IS PERMIT2?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Permit2 (by Uniswap) is a universal token approval system:
 *
 * - ONE approval to Permit2 contract (can be max uint256)
 * - All subsequent transfers use off-chain signatures (gasless!)
 * - Works across all Permit2-compatible protocols
 *
 * Benefits:
 * 1. COST SAVINGS: After initial approval, no gas for future approvals
 * 2. SECURITY: Permits are time-limited and can specify exact amounts
 * 3. UX: Sign a message instead of submitting a transaction
 *
 * Example: Swap 10 USDC to WETH using Permit2 on Ethereum mainnet
 */

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║ PROVIDER SELECTION - Change this import to switch libraries              ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
import { OrderStatus } from "@1inch/fusion-sdk";
import { createProvider } from "./providers/ethers.js";
// import { createProvider } from "./providers/viem.js";

import { loadConfig, createFusionSDK, TOKENS, CONTRACTS, sleep, formatAmount } from "./shared/types.js";

// Max uint256 for unlimited approval
const MAX_UINT256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

// ============================================================================
// CONFIGURATION - Modify these values for your swap
// ============================================================================

const SWAP_CONFIG = {
  // Source token: USDC
  fromTokenAddress: TOKENS.ethereum.USDC,
  fromTokenDecimals: 6,
  fromTokenSymbol: "USDC",

  // Destination token: WETH
  toTokenAddress: TOKENS.ethereum.WETH,
  toTokenDecimals: 18,
  toTokenSymbol: "WETH",

  // Amount to swap: 10 USDC (6 decimals)
  amount: "10000000",

  // Timing configuration
  orderTimeout: 300_000,
  pollInterval: 3_000
};

// ============================================================================
// MAIN LOGIC
// ============================================================================

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("1inch Intent Swap: ERC-20 with Permit2");
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
  // STEP 2: BALANCE CHECK
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n💰 Checking token balance...");
  const balance = await provider.getTokenBalance(SWAP_CONFIG.fromTokenAddress, provider.address);
  const amountBigInt = BigInt(SWAP_CONFIG.amount);

  console.log(`   ${SWAP_CONFIG.fromTokenSymbol} balance: ${formatAmount(balance, SWAP_CONFIG.fromTokenDecimals)}`);
  console.log(`   Amount to swap: ${formatAmount(amountBigInt, SWAP_CONFIG.fromTokenDecimals)}`);

  if (balance < amountBigInt) {
    throw new Error(
      `Insufficient ${SWAP_CONFIG.fromTokenSymbol} balance. ` +
        `Have: ${formatAmount(balance, SWAP_CONFIG.fromTokenDecimals)}, ` +
        `Need: ${formatAmount(amountBigInt, SWAP_CONFIG.fromTokenDecimals)}`
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: PERMIT2 ALLOWANCE (ONE-TIME APPROVAL)
  // ═══════════════════════════════════════════════════════════════════════════
  // IMPORTANT: Approve the Permit2 contract, NOT the 1inch router!
  console.log("\n🔓 Checking Permit2 allowance...");
  const permit2Allowance = await provider.getTokenAllowance(
    SWAP_CONFIG.fromTokenAddress,
    provider.address,
    CONTRACTS.PERMIT2
  );

  console.log(`   Current Permit2 allowance: ${formatAmount(permit2Allowance, SWAP_CONFIG.fromTokenDecimals)}`);

  if (permit2Allowance < amountBigInt) {
    console.log("   Approving tokens to Permit2 contract...");
    console.log("   (This is a one-time approval - future swaps won't need this)");

    // Approve MAX amount to Permit2 for best UX
    const txHash = await provider.approveToken(SWAP_CONFIG.fromTokenAddress, CONTRACTS.PERMIT2, MAX_UINT256);

    console.log(`   Approval tx: ${txHash}`);
    console.log("   Waiting for confirmation...");
    await provider.waitForTransaction(txHash);
    console.log("   ✅ Permit2 approval confirmed!");
  } else {
    console.log("   ✅ Permit2 allowance sufficient");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: GET QUOTE WITH PERMIT2 FLAG
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n📊 Getting quote (with Permit2)...");
  const quoteParams = {
    fromTokenAddress: SWAP_CONFIG.fromTokenAddress,
    toTokenAddress: SWAP_CONFIG.toTokenAddress,
    amount: SWAP_CONFIG.amount,
    walletAddress: provider.address,
    source: "sdk-tutorial",
    isPermit2: true // Enable Permit2 mode
  };

  const quote = await sdk.getQuote(quoteParams);
  const recommendedPreset = quote.presets[quote.recommendedPreset];

  if (!recommendedPreset) {
    throw new Error(`Preset "${quote.recommendedPreset}" not found in quote response`);
  }

  console.log(`   Recommended preset: ${quote.recommendedPreset}`);
  console.log(
    `   Expected output (start): ${formatAmount(BigInt(recommendedPreset.auctionStartAmount), SWAP_CONFIG.toTokenDecimals)} ${SWAP_CONFIG.toTokenSymbol}`
  );
  console.log(
    `   Expected output (end): ${formatAmount(BigInt(recommendedPreset.auctionEndAmount), SWAP_CONFIG.toTokenDecimals)} ${SWAP_CONFIG.toTokenSymbol}`
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: CREATE AND SUBMIT ORDER WITH PERMIT2
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n📝 Creating order with Permit2...");

  const preparedOrder = await sdk.createOrder({
    ...quoteParams,
    isPermit2: true // Must include here too
  });

  console.log("   Order created with Permit2 signature");
  console.log("   Submitting order to relayer...");

  const orderInfo = await sdk.submitOrder(preparedOrder.order, preparedOrder.quoteId);

  console.log(`   ✅ Order submitted!`);
  console.log(`   Order hash: ${orderInfo.orderHash}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 6: POLL FOR COMPLETION
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n⏳ Waiting for order to be filled...");
  const startTime = Date.now();

  while (Date.now() - startTime < SWAP_CONFIG.orderTimeout) {
    try {
      const status = await sdk.getOrderStatus(orderInfo.orderHash);

      switch (status.status) {
        case OrderStatus.Filled:
          console.log("\n🎉 Order filled successfully!");
          console.log("   Fills:", JSON.stringify(status.fills, null, 2));
          console.log(`   Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
          return;

        case OrderStatus.Expired:
          throw new Error("Order expired without being filled");

        case OrderStatus.Cancelled:
          throw new Error("Order was cancelled");

        default:
          process.stdout.write(".");
          await sleep(SWAP_CONFIG.pollInterval);
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("Order")) {
        throw error;
      }
      console.log("\n   ⚠️ Status check failed, retrying...");
      await sleep(SWAP_CONFIG.pollInterval);
    }
  }

  throw new Error(`Order timeout after ${SWAP_CONFIG.orderTimeout / 1000}s`);
}

// ============================================================================
// ENTRY POINT
// ============================================================================

main()
  .then(() => {
    console.log("\n✅ Example completed successfully!");
    console.log("\n💡 Permit2 Benefits:");
    console.log("   - Your next swap won't require any approval transaction");
    console.log("   - Just sign the Permit2 message (off-chain, gasless)");
    console.log("   - Works across all Permit2-compatible protocols");
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
