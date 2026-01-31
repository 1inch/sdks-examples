/**
 * 1inch Intent Swap - Quick Start
 *
 * Minimal example: USDC → 1INCH swap on Ethereum using only 1inch products:
 * - 1inch Fusion SDK for intent-based swaps
 * - 1inch Web3 node for RPC access
 *
 * Prerequisites:
 * - Sufficient USDC balance in wallet
 */
import { FusionSDK, NetworkEnum, PrivateKeyProviderConnector } from "@1inch/fusion-sdk";
import { ethers } from "ethers";
import "dotenv/config";

// Constants
const AGGREGATION_ROUTER_V6 = "0x111111125421ca6dc452d289314280a0f8842a65";
const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

// 1. Config from environment
const API_KEY = process.env.API_KEY;
const PRIVATE_KEY = process.env.EVM_PRIVATE_KEY;

if (!API_KEY || !PRIVATE_KEY) {
  throw new Error("Missing API_KEY or EVM_PRIVATE_KEY in environment");
}

// 2. Setup provider using 1inch Web3 node
const rpcUrl = "https://api.1inch.com/web3/1";
const fetchReq = new ethers.FetchRequest(rpcUrl);
fetchReq.setHeader("Authorization", `Bearer ${API_KEY}`);
const provider = new ethers.JsonRpcProvider(fetchReq, 1, { staticNetwork: true });
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// 3. Create Fusion SDK
const sdk = new FusionSDK({
  url: "https://api.1inch.com/fusion",
  network: NetworkEnum.ETHEREUM,
  blockchainProvider: new PrivateKeyProviderConnector(PRIVATE_KEY, {
    eth: { call: (tx) => provider.call(tx) },
    extend() {
      // No-op: required by Web3Like interface
    }
  }),
  authKey: API_KEY
});

// 4. Execute swap
async function main() {
  const params = {
    fromTokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
    toTokenAddress: "0x111111111117dC0aa78b770fA6A738034120C302", // 1INCH
    amount: "1000000", // 1 USDC (6 decimals)
    walletAddress: wallet.address
  };

  // Check and set allowance
  console.log("Checking allowance...");
  const token = new ethers.Contract(params.fromTokenAddress, ERC20_ABI, wallet);
  const allowance = await token.allowance(wallet.address, AGGREGATION_ROUTER_V6);

  if (allowance < BigInt(params.amount)) {
    console.log("Approving USDC...");
    const tx = await token.approve(AGGREGATION_ROUTER_V6, params.amount);
    await tx.wait();
    console.log("Approved!");
  }

  console.log("Getting quote...");
  const quote = await sdk.getQuote(params);
  console.log(
    `Quote: ${quote.fromTokenAmount} USDC → ~${quote.presets[quote.recommendedPreset]?.auctionStartAmount} 1INCH`
  );

  console.log("Creating order...");
  const order = await sdk.createOrder(params);

  console.log("Submitting order...");
  const result = await sdk.submitOrder(order.order, order.quoteId);

  console.log("Order submitted:", result.orderHash);
}

main().catch(console.error);
