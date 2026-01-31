/**
 * 1inch Intent Swap - Solana Quick Start
 *
 * Minimal example: SOL → JUP swap using only 1inch products:
 * - 1inch Solana Fusion SDK for intent-based swaps
 * - 1inch Web3 node for RPC access
 *
 * Prerequisites:
 * - Sufficient SOL balance (swap amount + ~0.01 SOL for fees)
 */
import { Connection, Keypair, PublicKey, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Sdk, Address, FusionSwapContract } from "@1inch/solana-fusion-sdk";
import axios from "axios";
import bs58 from "bs58";
import "dotenv/config";

// 1. Config from environment
const API_KEY = process.env.API_KEY;
const PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY;

if (!API_KEY || !PRIVATE_KEY) {
  throw new Error("Missing API_KEY or SOLANA_PRIVATE_KEY in environment");
}

// 2. Setup connection using 1inch Web3 node
const rpcUrl = "https://api.1inch.com/web3/501";
const connection = new Connection(rpcUrl, {
  commitment: "confirmed",
  httpHeaders: { Authorization: `Bearer ${API_KEY}` }
});

// Decode private key (supports base58 or base64, 32 or 64 bytes)
let secretKey: Uint8Array;
try {
  secretKey = bs58.decode(PRIVATE_KEY);
} catch {
  secretKey = Buffer.from(PRIVATE_KEY, "base64");
}

// Support both 32-byte seeds and 64-byte full keypairs
let wallet: Keypair;
if (secretKey.length === 32) {
  wallet = Keypair.fromSeed(secretKey);
} else if (secretKey.length === 64) {
  wallet = Keypair.fromSecretKey(secretKey);
} else {
  throw new Error(`Invalid private key length: ${secretKey.length} bytes (expected 32 or 64)`);
}

// 3. Create Fusion SDK (with axios HTTP provider)
const sdk = new Sdk(
  {
    async get<T>(url: string, headers: Record<string, string>): Promise<T> {
      return (await axios.get<T>(url, { headers })).data;
    },
    async post<T>(url: string, data: unknown, headers: Record<string, string>): Promise<T> {
      return (await axios.post<T>(url, data, { headers })).data;
    }
  },
  { baseUrl: "https://api.1inch.com/fusion", authKey: API_KEY, version: "v1.0" }
);

// 4. Execute swap
async function main() {
  const amount = BigInt(0.1 * LAMPORTS_PER_SOL); // 0.1 SOL
  const makerAddress = Address.fromPublicKey(wallet.publicKey);

  console.log("Creating order...");
  const order = await sdk.createOrder(
    Address.NATIVE, // SOL
    new Address("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"), // JUP
    amount,
    makerAddress
  );
  console.log(`Order hash: ${order.getOrderHashBase58()}`);

  console.log("Building escrow transaction...");
  const contract = FusionSwapContract.default();
  const instruction = contract.create(order, {
    maker: makerAddress,
    srcTokenProgram: Address.TOKEN_PROGRAM_ID
  });

  const tx = new Transaction().add({
    programId: new PublicKey(instruction.programId.toBuffer()),
    keys: instruction.accounts.map((a) => ({
      pubkey: new PublicKey(a.pubkey.toBuffer()),
      isSigner: a.isSigner,
      isWritable: a.isWritable
    })),
    data: Buffer.from(instruction.data)
  });

  console.log("Sending transaction...");
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = wallet.publicKey;
  tx.sign(wallet);

  const signature = await connection.sendRawTransaction(tx.serialize());
  console.log(`Transaction: ${signature}`);

  // Poll for confirmation (HTTP-only, no WebSocket needed)
  console.log("Waiting for confirmation...");
  for (let i = 0; i < 30; i++) {
    const { value } = await connection.getSignatureStatuses([signature]);
    if (value[0]?.confirmationStatus === "confirmed") {
      console.log("Order submitted successfully!");
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

main().catch(console.error);
