"use client"
import { useCallback, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Download, Wallet, TrendingUp, Clock, ExternalLink } from "lucide-react"

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

type Row = {
  kind: "normal" | "internal"
  hash: string
  timeStamp: number
  dateTimeUtc: string
  status: "Success" | "Failed" | "Pending"
  type: string
  from: string
  to: string
  valueEth: string
  valueUsd: number | null
  gasFeeEth: string | null
  explorerUrl: string
}

const CHAINS = [
  { id: "ethereum", name: "Ethereum", symbol: "ETH", enabled: true },
  { id: "polygon", name: "Polygon", symbol: "MATIC", enabled: false },
  { id: "arbitrum", name: "Arbitrum", symbol: "ETH", enabled: false },
  { id: "optimism", name: "Optimism", symbol: "ETH", enabled: false },
  { id: "base", name: "Base", symbol: "ETH", enabled: false },
]

export default function Page() {
  const [address, setAddress] = useState("")
  const [selectedChain, setSelectedChain] = useState("ethereum")
  const [includeInternal, setIncludeInternal] = useState(true)

  // balance state
  const [balLoading, setBalLoading] = useState(false)
  const [balanceEth, setBalanceEth] = useState<string | null>(null)
  const [balanceUsd, setBalanceUsd] = useState<string | null>(null)
  const [balError, setBalError] = useState<string | null>(null)

  // txs state
  const [txLoading, setTxLoading] = useState(false)
  const [txError, setTxError] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])

  const canQuery = useMemo(() => isEthAddress(address), [address])
  const selectedChainData = CHAINS.find((c) => c.id === selectedChain)

  const getBalance = useCallback(async () => {
    if (selectedChain !== "ethereum") {
      setBalError("Coming soon! Only Ethereum is currently supported.")
      return
    }

    setBalLoading(true)
    setBalError(null)
    setBalanceEth(null)
    setBalanceUsd(null)

    if (!canQuery) {
      setBalLoading(false)
      setBalError("Invalid Ethereum address. Please enter a 0x…40-hex address.")
      return
    }

    try {
      const res = await fetch(`/api/balance?address=${encodeURIComponent(address.trim())}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      if (typeof json?.result !== "string") throw new Error("Malformed server response")

      const wei = BigInt(json.result)
      const eth = formatEtherFromWei(wei, 6)
      setBalanceEth(`${eth} ETH`)

      // optional USD-now (non-blocking)
      try {
        const p = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", {
          cache: "no-store",
        })
        if (p.ok) {
          const j = await p.json()
          const usd = j?.ethereum?.usd
          if (typeof usd === "number") {
            const usdVal = Number(eth) * usd
            setBalanceUsd(`≈ $${usdVal.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
          }
        }
      } catch {}
    } catch (e: any) {
      setBalError(e?.message || "Failed to fetch balance.")
    } finally {
      setBalLoading(false)
    }
  }, [address, canQuery, selectedChain])

  const getTxs = useCallback(async () => {
    if (selectedChain !== "ethereum") {
      setTxError("Coming soon! Only Ethereum is currently supported.")
      return
    }

    setTxLoading(true)
    setTxError(null)
    setRows([])

    if (!canQuery) {
      setTxLoading(false)
      setTxError("Invalid Ethereum address. Please enter a 0x…40-hex address.")
      return
    }

    try {
      const url = `/api/txs?address=${encodeURIComponent(address.trim())}${includeInternal ? "&includeInternal=1" : ""}`
      const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      if (!Array.isArray(json?.rows)) throw new Error("Malformed server response")
      setRows(json.rows as Row[])
    } catch (e: any) {
      setTxError(e?.message || "Failed to fetch transactions.")
    } finally {
      setTxLoading(false)
    }
  }, [address, canQuery, includeInternal, selectedChain])

  function downloadCSV() {
    if (!rows.length) return
    const headers = [
      "hash",
      "datetime_utc",
      "status",
      "type",
      "from",
      "to",
      "value_eth",
      "value_usd_at_tx",
      "gas_fee_eth",
      "explorer_url",
    ]
    const csvRows = rows.map((r) => {
      const cells = [
        r.hash,
        r.dateTimeUtc.replace("T", " ").replace(".000Z", " UTC"),
        r.status,
        r.type,
        r.from,
        r.to,
        r.valueEth,
        r.valueUsd !== null ? r.valueUsd.toFixed(2) : "",
        r.gasFeeEth ?? "",
        r.explorerUrl,
      ]
      return cells
        .map((c) => {
          const s = String(c ?? "")
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(",")
    })
    const csv = [headers.join(","), ...csvRows].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `transactions_${address.trim()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2 text-balance">Crypto Wallet Viewer</h1>
          <p className="text-muted-foreground text-lg">
            View your wallet balance and transaction history across multiple chains
          </p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Wallet Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="chain">Blockchain Network</Label>
                <Select value={selectedChain} onValueChange={setSelectedChain}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a chain" />
                  </SelectTrigger>
                  <SelectContent>
                    {CHAINS.map((chain) => (
                      <SelectItem key={chain.id} value={chain.id} disabled={!chain.enabled}>
                        <div className="flex items-center justify-between w-full">
                          <span>
                            {chain.name} ({chain.symbol})
                          </span>
                          {!chain.enabled && (
                            <Badge variant="secondary" className="ml-2">
                              Coming Soon
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Wallet Address</Label>
                <Input
                  id="address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="0x..."
                  spellCheck={false}
                  className="font-mono"
                />
                {!canQuery && address && (
                  <p className="text-sm text-muted-foreground">Enter a valid Ethereum address (0x + 40 hex chars)</p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="internal"
                checked={includeInternal}
                onCheckedChange={(checked) => setIncludeInternal(checked as boolean)}
              />
              <Label htmlFor="internal" className="text-sm">
                Include internal transfers in transaction history
              </Label>
            </div>
          </CardContent>
        </Card>

        {(balanceEth || balError) && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Current Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              {balanceEth && (
                <div className="space-y-2">
                  <div className="text-3xl font-bold text-card-foreground">{balanceEth}</div>
                  {balanceUsd && <div className="text-lg text-muted-foreground">{balanceUsd}</div>}
                </div>
              )}
              {balError && <div className="text-destructive">{balError}</div>}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap gap-4 mb-8">
          <Button onClick={getBalance} disabled={balLoading || !canQuery} className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            {balLoading ? "Loading..." : "Get Balance"}
          </Button>

          <Button
            onClick={getTxs}
            disabled={txLoading || !canQuery}
            variant="outline"
            className="flex items-center gap-2 bg-transparent"
          >
            <Clock className="h-4 w-4" />
            {txLoading ? "Loading..." : "Get Transactions"}
          </Button>

          <Button onClick={downloadCSV} disabled={!rows.length} variant="secondary" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Download CSV
          </Button>
        </div>

        {(rows.length > 0 || txError) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Transaction History
              </CardTitle>
              {rows.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {rows.length === 1000
                    ? "Showing most recent 1,000 transactions"
                    : `${rows.length} transaction${rows.length === 1 ? "" : "s"}`}
                </p>
              )}
            </CardHeader>
            <CardContent>
              {txError && <div className="text-destructive mb-4">{txError}</div>}

              {rows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        {[
                          "Hash",
                          "Date/Time (UTC)",
                          "Status",
                          "Type",
                          "From",
                          "To",
                          "Value (ETH)",
                          "Value (USD @ tx)",
                          "Gas Fee (ETH)",
                        ].map((header) => (
                          <th key={header} className="text-left p-3 font-semibold text-sm">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const hashShort = `${row.hash.slice(0, 10)}…${row.hash.slice(-8)}`
                        const fromShort = `${row.from.slice(0, 10)}…${row.from.slice(-8)}`
                        const toShort = row.to ? `${row.to.slice(0, 10)}…${row.to.slice(-8)}` : ""

                        return (
                          <tr
                            key={`${row.kind}-${row.hash}-${row.timeStamp}`}
                            className="border-b border-border/50 hover:bg-muted/50"
                          >
                            <td className="p-3">
                              <a
                                href={row.explorerUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:text-primary/80 font-mono text-sm flex items-center gap-1"
                              >
                                {hashShort}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </td>
                            <td className="p-3 text-sm font-mono">
                              {row.dateTimeUtc.replace("T", " ").replace(".000Z", " UTC")}
                            </td>
                            <td className="p-3">
                              <Badge
                                variant={
                                  row.status === "Success"
                                    ? "default"
                                    : row.status === "Failed"
                                      ? "destructive"
                                      : "secondary"
                                }
                              >
                                {row.status}
                              </Badge>
                            </td>
                            <td className="p-3 text-sm">{row.type}</td>
                            <td className="p-3 font-mono text-sm">{fromShort}</td>
                            <td className="p-3 font-mono text-sm">{toShort}</td>
                            <td className="p-3 font-mono text-sm">{row.valueEth}</td>
                            <td className="p-3 text-sm">
                              {row.valueUsd !== null
                                ? `$${row.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                                : "—"}
                            </td>
                            <td className="p-3 font-mono text-sm">{row.gasFeeEth !== null ? row.gasFeeEth : "—"}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {!rows.length && !txError && txLoading && (
                <div className="text-center py-8 text-muted-foreground">Loading transactions...</div>
              )}

              {!rows.length && !txError && !txLoading && (
                <div className="text-center py-8 text-muted-foreground">No transactions to display.</div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            Balance: Cloudflare/Ankr/PublicNode (fallback) • Tx data: Etherscan (normal
            {includeInternal ? " + internal" : ""}) • USD now: CoinGecko
          </p>
        </div>
      </div>
    </div>
  )
}
