export const runtime = "edge"
export const dynamic = "force-dynamic"

const ETHERSCAN_API = "https://api.etherscan.io/v2/api"
const COINGECKO_RANGE = "https://api.coingecko.com/api/v3/coins/ethereum/market_chart/range"
const MAX_CHUNKS = 1000 // safety stop (≈10M txs worst-case)
const OFFSET = 10000 // Etherscan max per page
const USD_DECIMALS = 2

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  })
}

export async function OPTIONS() {
  return jsonRes({}, 200)
}

function isEthAddress(addr: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(addr.trim())
}

type NormalTx = {
  blockNumber: string
  timeStamp: string
  hash: string
  from: string
  to: string | null
  value: string // wei (string)
  gasPrice: string // wei
  gasUsed: string // units
  txreceipt_status?: string // "1"|"0"
  isError?: string // "0"|"1"
}

type InternalTx = {
  blockNumber: string
  timeStamp: string
  hash: string
  from: string
  to: string | null
  value: string // wei
  isError: string // "0"|"1"
}

async function fetchEtherscan(params: Record<string, string>) {
  const apikey = (process.env.ETHERSCAN_API_KEY || "").trim()
  const url = new URL(ETHERSCAN_API)
  url.searchParams.set("chainid", "1")
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  if (apikey) url.searchParams.set("apikey", apikey)

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } })
  const text = await res.text()
  if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}: ${text.slice(0, 200)}`)

  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Etherscan bad JSON: ${text.slice(0, 200)}`)
  }

  // Etherscan "status" can be "0" for "No transactions found"
  if (json.message === "No transactions found") return [] as any[]
  if (json.status !== "1" && !Array.isArray(json.result)) {
    // Some responses return status "0" with an array anyway
    throw new Error(json.result || json.message || "Unexpected Etherscan response")
  }
  return Array.isArray(json.result) ? json.result : []
}

async function fetchAllByChunks(
  action: "txlist" | "txlistinternal",
  address: string,
): Promise<Array<NormalTx | InternalTx>> {
  const all: Array<any> = []
  let endblock = 99999999
  let chunks = 0

  const TRANSACTION_LIMIT = 1000

  while (chunks < MAX_CHUNKS && all.length < TRANSACTION_LIMIT) {
    const rows = await fetchEtherscan({
      module: "account",
      action,
      address,
      startblock: "0",
      endblock: String(endblock),
      page: "1", // ALWAYS page=1
      offset: String(OFFSET), // max window size
      sort: "desc", // Get newest transactions first
    })

    if (rows.length === 0) break

    const remainingSlots = TRANSACTION_LIMIT - all.length
    const rowsToAdd = rows.slice(0, remainingSlots)
    all.push(...rowsToAdd)

    if (all.length >= TRANSACTION_LIMIT) break

    if (rows.length < OFFSET) break // last chunk

    const last = rows[rows.length - 1]
    const lastBlock = Number(last.blockNumber || 0)
    endblock = lastBlock - 1
    chunks++

    // (Optional) gentle backoff to respect rate limits
    await new Promise((r) => setTimeout(r, 220))
  }

  return all
}

function formatEtherFromWeiStr(weiStr: string, decimals = 6) {
  try {
    const wei = BigInt(weiStr)
    const BASE = 10n ** 18n
    const whole = wei / BASE
    const frac = wei % BASE
    const fracStr = frac.toString().padStart(18, "0").slice(0, decimals).replace(/0+$/, "")
    return fracStr ? `${whole}.${fracStr}` : whole.toString()
  } catch {
    return "0"
  }
}

function computeGasFeeEth(t: NormalTx, decimals = 6) {
  try {
    const feeWei = BigInt(t.gasUsed) * BigInt(t.gasPrice)
    return formatEtherFromWeiStr(feeWei.toString(), decimals)
  } catch {
    return "0"
  }
}

function statusOfNormal(t: NormalTx): "Success" | "Failed" | "Pending" {
  if (t.txreceipt_status === "1" && t.isError !== "1") return "Success"
  if (t.txreceipt_status === "0" || t.isError === "1") return "Failed"
  return "Pending"
}

function statusOfInternal(t: InternalTx): "Success" | "Failed" | "Pending" {
  if (t.isError === "1") return "Failed"
  // Internal traces are by definition executed; if parent pending, Etherscan often omits them.
  return "Success"
}

function classifyType(addressLc: string, from?: string | null, to?: string | null, isInternal = false) {
  const fromLc = (from || "").toLowerCase()
  const toLc = (to || "").toLowerCase()

  const recv = toLc === addressLc && fromLc !== addressLc
  const sent = fromLc === addressLc && toLc !== addressLc
  const self = fromLc === addressLc && toLc === addressLc
  const contractCreation = fromLc === addressLc && (!to || to === "" || to === "0x")

  let base = contractCreation ? "Contract Creation" : self ? "Self" : recv ? "Received" : sent ? "Sent" : "Other"

  if (isInternal)
    base = base.startsWith("Received")
      ? "Internal Received"
      : base.startsWith("Sent")
        ? "Internal Sent"
        : base === "Self"
          ? "Internal Self"
          : base === "Contract Creation"
            ? "Internal Contract Creation"
            : "Internal"
  return base
}

function nearestUsd(tsSec: number, priceSeries: Array<[number, number]>): number | null {
  if (!priceSeries.length) return null
  const target = tsSec * 1000
  let lo = 0,
    hi = priceSeries.length - 1
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (priceSeries[mid][0] < target) lo = mid + 1
    else hi = mid
  }
  const cand = priceSeries[lo]
  const prev = priceSeries[Math.max(0, lo - 1)]
  const best = Math.abs((cand?.[0] ?? 0) - target) <= Math.abs((prev?.[0] ?? 0) - target) ? cand : prev
  return typeof best?.[1] === "number" ? best[1] : null
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const address = (searchParams.get("address") || "").trim()
    const includeInternal = searchParams.get("includeInternal") === "1"

    if (!isEthAddress(address)) return jsonRes({ error: "Invalid Ethereum address." }, 400)
    const addressLc = address.toLowerCase()

    // 1) Pull ALL normal txs in 10k windows by advancing startblock
    const normal = (await fetchAllByChunks("txlist", address)) as NormalTx[]
    // 2) Optionally include internal transfers (also chunked)
    const internal = includeInternal ? ((await fetchAllByChunks("txlistinternal", address)) as InternalTx[]) : []

    // 3) Determine timestamp range for USD pricing
    const allTs = [...normal.map((x) => Number(x.timeStamp)), ...internal.map((x) => Number(x.timeStamp))].filter((n) =>
      Number.isFinite(n),
    )
    const minTs = allTs.length ? Math.min(...allTs) : 0
    const maxTs = allTs.length ? Math.max(...allTs) : 0

    // 4) Fetch historical USD prices once (CoinGecko range)
    let priceSeries: Array<[number, number]> = []
    if (minTs && maxTs) {
      const from = Math.max(0, minTs - 3600) // pad 1h
      const to = maxTs + 3600
      const cgUrl = `${COINGECKO_RANGE}?vs_currency=usd&from=${from}&to=${to}`
      const cgRes = await fetch(cgUrl, { headers: { Accept: "application/json" } })
      if (cgRes.ok) {
        const cgJson: any = await cgRes.json()
        if (Array.isArray(cgJson?.prices)) {
          // prices: [ [ts_ms, price], ... ]
          priceSeries = cgJson.prices as Array<[number, number]>
        }
      }
    }

    // 5) Normalize rows
    const normalRows = normal.map((n) => {
      const status = statusOfNormal(n)
      const type = classifyType(addressLc, n.from, n.to, false)
      const valueEth = formatEtherFromWeiStr(n.value, 8)
      const gasFeeEth = computeGasFeeEth(n, 8)
      const usd = priceSeries.length ? nearestUsd(Number(n.timeStamp), priceSeries) : null
      const valueUsd = usd ? Number(valueEth) * usd : null

      return {
        kind: "normal" as const,
        hash: n.hash,
        timeStamp: Number(n.timeStamp),
        dateTimeUtc: new Date(Number(n.timeStamp) * 1000).toISOString(),
        status,
        type,
        from: n.from,
        to: n.to || "",
        valueEth,
        valueUsd: valueUsd !== null ? Number(valueUsd.toFixed(USD_DECIMALS)) : null,
        gasFeeEth,
        explorerUrl: `https://etherscan.io/tx/${n.hash}`,
      }
    })

    const internalRows = internal.map((n) => {
      const status = statusOfInternal(n)
      const type = classifyType(addressLc, n.from, n.to, true)
      const valueEth = formatEtherFromWeiStr(n.value, 8)
      const usd = priceSeries.length ? nearestUsd(Number(n.timeStamp), priceSeries) : null
      const valueUsd = usd ? Number(valueEth) * usd : null
      // Internal traces don't have an isolated gas fee; show null/empty.
      return {
        kind: "internal" as const,
        hash: n.hash,
        timeStamp: Number(n.timeStamp),
        dateTimeUtc: new Date(Number(n.timeStamp) * 1000).toISOString(),
        status,
        type,
        from: n.from,
        to: n.to || "",
        valueEth,
        valueUsd: valueUsd !== null ? Number(valueUsd.toFixed(USD_DECIMALS)) : null,
        gasFeeEth: null as null | string,
        explorerUrl: `https://etherscan.io/tx/${n.hash}`,
      }
    })

    // 6) Combine and sort desc (newest first)
    const all = [...normalRows, ...internalRows].sort((a, b) => b.timeStamp - a.timeStamp)

    return jsonRes({ address, count: all.length, rows: all })
  } catch (e: any) {
    return jsonRes({ error: e?.message || "Server error" }, 500)
  }
}
