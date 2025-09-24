"use client";

import { useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance, useChainId, useSwitchChain } from "wagmi";
import { TOKENS, Token } from "../types/swap";
import { monad } from "../providers/WalletProviders";

type Props = {
  controlled?: boolean;
  fromToken?: Token;
  toToken?: Token;
  amount?: string;
  onChange?: (next: { fromToken: Token; toToken: Token; amount: string }) => void;
};

export default function SwapPanel(props: Props) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [uncontrolledFrom, setUncontrolledFrom] = useState<Token>(TOKENS[0]);
  const [uncontrolledTo, setUncontrolledTo] = useState<Token>(TOKENS[1]);
  const [uncontrolledAmount, setUncontrolledAmount] = useState<string>("");

  const fromToken = props.controlled ? (props.fromToken ?? TOKENS[0]) : uncontrolledFrom;
  const toToken = props.controlled ? (props.toToken ?? TOKENS[1]) : uncontrolledTo;
  const amount = props.controlled ? (props.amount ?? "") : uncontrolledAmount;

  const { data: fromBalance } = useBalance({
    address,
    token: fromToken.address ?? undefined,
    query: { enabled: Boolean(address) },
  });

  const isWrongNetwork = typeof chainId === "number" && chainId !== monad.id;

  return (
    <div className="sticky top-6 w-[360px] ml-auto glass-card rounded-2xl p-5 md:p-6 flex flex-col gap-4 shadow-glass">
      <div className="flex items-center justify-between">
        <h3 className="m-0 text-lg md:text-xl font-medium tracking-tight text-[#9488FC]">Swap</h3>
        <ConnectButton accountStatus="address" chainStatus="none" showBalance={false} />
      </div>

      {isWrongNetwork && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span>
              You are connected to chain ID {chainId}. Please switch to Monad (ID {monad.id}).
            </span>
            <button
              disabled={isSwitching}
              onClick={() => switchChain?.({ chainId: monad.id })}
              className="px-3 py-1 rounded-full bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-50"
            >
              {isSwitching ? "Switching…" : "Switch to Monad"}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label className="text-xs opacity-80">From</label>
        <div className="flex gap-2">
          <select
            value={fromToken.symbol}
            onChange={(e) => {
              const next = TOKENS.find(t => t.symbol === e.target.value)!;
              if (props.controlled && props.onChange) props.onChange({ fromToken: next, toToken, amount });
              else setUncontrolledFrom(next);
            }}
            className="flex-1 px-3 py-2 rounded-xl border border-[var(--gray-alpha-200)] bg-[var(--background)] focus:outline-none"
          >
            {TOKENS.map(t => (
              <option key={t.symbol} value={t.symbol}>{t.symbol}</option>
            ))}
          </select>
          <input
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => {
              if (props.controlled && props.onChange) props.onChange({ fromToken, toToken, amount: e.target.value });
              else setUncontrolledAmount(e.target.value);
            }}
            className="flex-1 px-3 py-2 rounded-xl border border-[var(--gray-alpha-200)] bg-[var(--background)] focus:outline-none"
          />
        </div>
        <div className="text-xs opacity-70">
          Balance: {fromBalance ? fromBalance.formatted : "-"} {fromToken.symbol}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs opacity-80">To</label>
        <select
          value={toToken.symbol}
          onChange={(e) => {
            const next = TOKENS.find(t => t.symbol === e.target.value)!;
            if (props.controlled && props.onChange) props.onChange({ fromToken, toToken: next, amount });
            else setUncontrolledTo(next);
          }}
          className="px-3 py-2 rounded-xl border border-[var(--gray-alpha-200)] bg-[var(--background)] focus:outline-none"
        >
          {TOKENS.map(t => (
            <option key={t.symbol} value={t.symbol}>{t.symbol}</option>
          ))}
        </select>
      </div>
    </div>
  );
}


