"use client"
import { useCallback, useMemo, useState } from "react"

const ETH_RPC = "https://cloudflare-eth.com"

function isEthAddress(addr: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(addr.trim())
}

function formatEtherFromWei(wei: bigint, decimals = 6) {
  const BASE = 10n ** 18n
  const whole = wei / BASE
  const frac = wei % BASE
  const fracStr = frac.toString().padStart(18, "0").slice(0, decimals).replace(/0+$/, "")
  return fracStr ? `${whole}.${fracStr}` : whole.toString()
}

export default function BalanceExample() {
  const [address, setAddress] = useState<string>("")
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [balanceEth, setBalanceEth] = useState<string | null>(null)

  const canQuery = useMemo(() => isEthAddress(address), [address])

  const getBalance = useCallback(async () => {
    setLoading(true)
    setError(null)
    setBalanceEth(null)

    if (!canQuery) {
      setLoading(false)
      setError("Invalid Ethereum address. Please enter a 0x…40-hex address.")
      return
    }

    try {
      const body = {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [address.trim(), "latest"],
      }

      const res = await fetch(ETH_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error(`RPC HTTP ${res.status}`)
      const json = await res.json()
      if (json.error || typeof json.result !== "string") {
        throw new Error(json.error?.message || "Unexpected RPC response.")
      }

      const wei = BigInt(json.result)
      const eth = formatEtherFromWei(wei, 6)
      setBalanceEth(`${eth} ETH`)
    } catch (e: any) {
      setError(e?.message || "Failed to fetch balance.")
    } finally {
      setLoading(false)
    }
  }, [address, canQuery])

  return (
    <div style={{ maxWidth: 700, margin: "40px auto", fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1>Get Ethereum Wallet Balance</h1>

      <label style={{ display: "block", marginBottom: 12 }}>
        <div>
          <b>Wallet address</b>
        </div>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x..."
          spellCheck={false}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #ddd",
            fontSize: 14,
            marginTop: 6,
          }}
        />
      </label>

      <button
        disabled={loading || !canQuery}
        onClick={getBalance}
        style={{
          padding: "10px 14px",
          borderRadius: 8,
          border: "1px solid #111",
          background: "#111",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        {loading ? "Loading…" : "GET BALANCE"}
      </button>

      {!canQuery && address && (
        <div style={{ marginTop: 8, color: "#666" }}>Enter a valid Ethereum address (0x + 40 hex chars).</div>
      )}

      <div style={{ marginTop: 20, minHeight: 40 }}>
        {balanceEth && (
          <h2 id="balance" style={{ margin: "10px 0 6px 0" }}>
            {balanceEth}
          </h2>
        )}
        {error && (
          <div id="error" style={{ color: "#b00020", whiteSpace: "pre-wrap" }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, color: "#666" }}>
        <small>RPC: Cloudflare Ethereum</small>
      </div>
    </div>
  )
}
