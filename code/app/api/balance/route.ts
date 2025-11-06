export const runtime = "edge"
export const dynamic = "force-dynamic"

const RPCS = ["https://cloudflare-eth.com", "https://rpc.ankr.com/eth", "https://ethereum.publicnode.com"]

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
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

async function fetchBalanceFromAny(address: string) {
  const body = { jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }
  const headers = { "Content-Type": "application/json", Accept: "application/json" }
  let lastErr = "All RPCs failed"
  for (const url of RPCS) {
    try {
      const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), cache: "no-store" })
      const text = await r.text()
      if (!r.ok) {
        lastErr = `RPC ${url} HTTP ${r.status}: ${text.slice(0, 200)}`
        continue
      }
      let json: any
      try {
        json = JSON.parse(text)
      } catch {
        lastErr = `RPC ${url} bad JSON: ${text.slice(0, 200)}`
        continue
      }
      if (json?.error || typeof json?.result !== "string") {
        lastErr = `RPC ${url} error: ${JSON.stringify(json?.error || json).slice(0, 200)}`
        continue
      }
      return { ok: true as const, result: json.result }
    } catch (e: any) {
      lastErr = `RPC threw: ${e?.message || String(e)}`
    }
  }
  return { ok: false as const, error: lastErr }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const address = (searchParams.get("address") || "").trim()
  if (!isEthAddress(address)) return jsonRes({ error: "Invalid Ethereum address." }, 400)
  const out = await fetchBalanceFromAny(address)
  return out.ok ? jsonRes({ result: out.result }) : jsonRes({ error: out.error }, 502)
}
