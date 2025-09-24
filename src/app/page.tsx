"use client";

import { useCallback, useMemo, useState } from "react";
import SwapPanel from "../components/SwapPanel";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";
import { parseUnits } from "viem";
import { TOKENS, Token } from "../types/swap";
import { monad } from "../providers/WalletProviders";

type CellState = "hidden" | "miss" | "diamond";

export default function Home() {
  const { address } = useAccount();
  const { switchChain } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const [fromToken, setFromToken] = useState<Token>(TOKENS[0]);
  const [toToken, setToToken] = useState<Token>(TOKENS[1]);
  const [amount, setAmount] = useState<string>("");
  const [diamondIndex, setDiamondIndex] = useState<number>(() => Math.floor(Math.random() * 9));
  const [cells, setCells] = useState<CellState[]>(Array(9).fill("hidden"));
  const [triesLeft, setTriesLeft] = useState<number>(3);
  const [status, setStatus] = useState<"playing" | "won" | "lost">("playing");
  const [swapResult, setSwapResult] = useState<null | { txHash: string; message: string }>(null);
  const [isSwapping, setIsSwapping] = useState<boolean>(false);

  const revealCell = useCallback(
    (index: number) => {
      if (status !== "playing") return;
      if (cells[index] !== "hidden") return;

      const isDiamond = index === diamondIndex;
      const newCells = [...cells];
      newCells[index] = isDiamond ? "diamond" : "miss";
      setCells(newCells);

      if (isDiamond) {
        setStatus("won");
        triggerSwap();
        return;
      }

      const nextTries = triesLeft - 1;
      setTriesLeft(nextTries);
      if (nextTries <= 0) {
        setStatus("lost");
      }
    },
    [cells, diamondIndex, status, triesLeft]
  );

  const resetGame = useCallback(() => {
    setDiamondIndex(Math.floor(Math.random() * 9));
    setCells(Array(9).fill("hidden"));
    setTriesLeft(3);
    setStatus("playing");
    setSwapResult(null);
    setIsSwapping(false);
  }, []);

  const triggerSwap = useCallback(async () => {
    try {
      if (!address || !walletClient) {
        setSwapResult({ txHash: "0x", message: "Connect wallet to swap." });
        return;
      }

      setIsSwapping(true);

      // Enforce Monad chain for both wallet and quote
      const zeroExChainId = Number(process.env.NEXT_PUBLIC_ZEROEX_CHAIN_ID || process.env.NEXT_PUBLIC_MONAD_CHAIN_ID || 10143);
      // Attempt to switch user wallet to Monad if not already
      try {
        await switchChain({ chainId: zeroExChainId });
      } catch {
        // If switch fails, still attempt, but warn in result
      }
      // 0x expects addresses or the canonical native sentinel address (ETH)
      const NATIVE_SENTINEL = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
      // Guard BEFORE requesting a quote: require USDC address when swapping to USDC
      if (toToken.symbol === "USDC" && !toToken.address) {
        throw new Error("USDC address not configured. Set NEXT_PUBLIC_USDC_ADDRESS in .env.local");
      }
      const sellTokenParam = fromToken.address ? fromToken.address : NATIVE_SENTINEL;
      const buyTokenParam = toToken.address ? toToken.address : NATIVE_SENTINEL;
      // Strictly use the user's input amount; do not fallback
      const numericAmount = Number(amount);
      if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
        setSwapResult({ txHash: "0x", message: "Enter a valid amount greater than 0." });
        return;
      }
      const sellAmount = parseUnits(amount, fromToken.decimals).toString();

      const params = new URLSearchParams({
        chainId: String(zeroExChainId),
        sellToken: String(sellTokenParam),
        buyToken: String(buyTokenParam),
        sellAmount,
        taker: address,
      });

      // Call our server proxy to avoid CORS and keep keys server-side
      const quoteRes = await fetch(`/api/swap?${params.toString()}`, { cache: "no-store" });

      if (!quoteRes.ok) {
        const errText = await quoteRes.text();
        // Try to parse server error for clarity
        try {
          const errJson = JSON.parse(errText);
          const msg = typeof errJson?.error === "string" ? errJson.error : JSON.stringify(errJson);
          throw new Error(`Quote failed (${quoteRes.status}): ${msg}`);
        } catch {
          throw new Error(`Quote failed (${quoteRes.status}): ${errText}`);
        }
      }

      const quote = await quoteRes.json();

      // Quote obtained successfully; proceed to approvals and send

      // If selling an ERC20, ensure allowance is set for the AllowanceHolder spender
      if (fromToken.address && quote.allowanceTarget && quote.issues?.allowance) {
        const currentAllowance = BigInt(quote.issues.allowance.actual || "0");
        const required = BigInt(sellAmount);
        if (currentAllowance < required) {
          const erc20ApproveAbi = [
            {
              type: "function",
              name: "approve",
              stateMutability: "nonpayable",
              inputs: [
                { name: "spender", type: "address" },
                { name: "amount", type: "uint256" },
              ],
              outputs: [{ name: "", type: "bool" }],
            },
          ] as const;
          await walletClient.writeContract({
            address: fromToken.address,
            abi: erc20ApproveAbi,
            functionName: "approve",
            args: [quote.allowanceTarget, required],
          });
        }
      }

      const tx = quote.transaction ?? quote; // v2 returns { transaction: { to, data, value, gas, gasPrice } }
      const hash = await walletClient.sendTransaction({
        account: address,
        chain: monad,
        to: tx.to,
        data: tx.data,
        value: tx.value ? BigInt(tx.value) : undefined,
        gas: tx.gas ? BigInt(tx.gas) : undefined,
        gasPrice: tx.gasPrice ? BigInt(tx.gasPrice) : undefined,
      });

      setSwapResult({ txHash: hash, message: "Swap submitted via 0x Swap API." });
    } catch (e: any) {
      const message = typeof e?.message === "string" ? e.message : "Swap failed.";
      const userRejected = /User rejected|User rejected the request|Request rejected/i.test(message);
      setSwapResult({ txHash: "0x", message: userRejected ? "User rejected the request." : message });
    } finally {
      setIsSwapping(false);
    }
  }, [address, walletClient, amount, fromToken, toToken]);

  const statusText = useMemo(() => {
    if (status === "playing") return `Tries left: ${triesLeft}`;
    if (status === "won") return "You found the 💎! Swapping on Monad...";
    return "No tries left. You lost.";
  }, [status, triesLeft]);

  return (
    <div className="flex gap-6 p-10 min-h-svh items-center justify-center mx-auto w-full max-w-5xl">
      <div className="flex flex-col gap-8 flex-1">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold m-0">Monad Mines</h1>
          <p className="m-0 opacity-80">{statusText}</p>
        </div>

        <div className="grid grid-cols-3 gap-5 mt-3 w-80">
          {cells.map((cell, idx) => (
            <button
              key={idx}
              onClick={() => revealCell(idx)}
              disabled={status !== "playing" || cell !== "hidden"}
              className={
                "w-20 h-20 text-2xl rounded-lg border select-none " +
                (status === "playing" && cell === "hidden" ? "cursor-pointer" : "cursor-default") +
                " " + (cell === "hidden" ? "bg-[var(--background)] border-[var(--gray-alpha-200)]" : "bg-[var(--gray-alpha-100)] border-[var(--gray-alpha-200)]")
              }
            >
              {cell === "hidden" ? "?" : cell === "diamond" ? "💎" : "❌"}
            </button>
          ))}
        </div>

        <div className="flex gap-4">
          <a className="inline-flex items-center justify-center h-12 px-5 rounded-full border border-[var(--gray-alpha-200)] hover:bg-[var(--gray-alpha-100)] transition-colors text-base font-medium min-w-40" onClick={resetGame} href="#">
            Reset
          </a>
        </div>

        {swapResult && (
          <div className="font-[var(--font-geist-mono)] break-all whitespace-pre-wrap max-w-full">
            <div><strong>Message:</strong> {swapResult.message}</div>
            <div><strong>Tx Hash:</strong> {swapResult.txHash}</div>
          </div>
        )}
      </div>
      <div className="w-[360px]">
        <SwapPanel
          controlled
          fromToken={fromToken}
          toToken={toToken}
          amount={amount}
          onChange={({ fromToken, toToken, amount }) => {
            setFromToken(fromToken);
            setToToken(toToken);
            setAmount(amount);
          }}
        />
      </div>
    </div>
  );
}
