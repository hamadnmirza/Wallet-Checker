export interface TokenBalance {
  address: string
  symbol: string
  name: string
  decimals: number
  balance: string
  balanceFormatted: string
  price?: number
  valueUsd?: number
}

export interface EthereumBalance {
  balance: string
  balanceInEth: string
  nativeBalance: TokenBalance
  tokenBalances: TokenBalance[]
}

export interface EthereumTransaction {
  hash: string
  blockNumber: string
  timeStamp: string
  from: string
  to: string
  value: string
  gas: string
  gasPrice: string
  gasUsed: string
  isError: string
  txreceipt_status: string
}

export interface TatumPortfolioResponse {
  data: {
    address: string
    chain: string
    assets: Array<{
      address: string
      symbol: string
      name: string
      decimals: number
      balance: string
      price?: number
    }>
  }
}

export interface TatumTransactionResponse {
  data: Array<{
    hash: string
    blockNumber: number
    timestamp: number
    from: string
    to: string
    value: string
    gasLimit: string
    gasPrice: string
    gasUsed: string
    status: string
  }>
}

// Mock API functions for development - replace with real API calls
class RateLimiter {
  private lastRequestTime = 0
  private minInterval = 350 // 350ms between requests = ~2.8 req/sec

  async throttle(): Promise<void> {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime

    if (timeSinceLastRequest < this.minInterval) {
      const delay = this.minInterval - timeSinceLastRequest
      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    this.lastRequestTime = Date.now()
  }
}

const rateLimiter = new RateLimiter()

// Tatum API configuration
const TATUM_API_KEY = "t-xxxxxx"

async function tatumRequest(endpoint: string): Promise<any> {
  await rateLimiter.throttle()

  const response = await fetch(`https://api.tatum.io/v4${endpoint}`, {
    headers: {
      "x-api-key": TATUM_API_KEY,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`Tatum API error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

export async function fetchEthereumBalance(address: string): Promise<EthereumBalance> {
  try {
    console.log("[v0] Fetching balance for address:", address)

    // Direct RPC call to Cloudflare Ethereum endpoint
    const ETH_RPC = "https://cloudflare-eth.com"

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
    const ethBalance = formatEtherFromWei(wei, 6)

    console.log("[v0] RPC Balance response:", { wei: wei.toString(), eth: ethBalance })

    // Try to get token balances using direct API call
    let tokenBalances: TokenBalance[] = []
    try {
      const portfolioResponse = await tatumRequest(
        `/data/wallet/portfolio?addresses=${address}&chain=ethereum-mainnet&tokenTypes=fungible&excludeMetadata=true`,
      )
      console.log("[v0] Portfolio response:", portfolioResponse)

      if (portfolioResponse?.data?.assets) {
        tokenBalances = portfolioResponse.data.assets
          .filter((asset: any) => asset.address !== "0x0000000000000000000000000000000000000000") // Exclude native ETH
          .map((asset: any) => ({
            address: asset.address,
            symbol: asset.symbol,
            name: asset.name,
            decimals: asset.decimals,
            balance: asset.balance,
            balanceFormatted: formatTokenBalance(asset.balance, asset.decimals),
            price: asset.price,
            valueUsd: asset.price
              ? Number.parseFloat(formatTokenBalance(asset.balance, asset.decimals)) * asset.price
              : 0,
          }))
      }
    } catch (portfolioError) {
      console.log("[v0] Portfolio API failed, continuing with native balance only:", portfolioError)
    }

    const nativeBalance: TokenBalance = {
      address: "0x0000000000000000000000000000000000000000",
      symbol: "ETH",
      name: "Ethereum",
      decimals: 18,
      balance: wei.toString(),
      balanceFormatted: ethBalance,
      valueUsd: 0, // Will be calculated with ETH price
    }

    return {
      balance: wei.toString(),
      balanceInEth: ethBalance,
      nativeBalance,
      tokenBalances,
    }
  } catch (error) {
    console.error("[v0] Error fetching balance:", error)
    // Return empty balance on error
    return {
      balance: "0",
      balanceInEth: "0",
      nativeBalance: {
        address: "0x0000000000000000000000000000000000000000",
        symbol: "ETH",
        name: "Ethereum",
        decimals: 18,
        balance: "0",
        balanceFormatted: "0",
        valueUsd: 0,
      },
      tokenBalances: [],
    }
  }
}

export async function fetchEthPrice(): Promise<number> {
  try {
    await rateLimiter.throttle()
    const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd")
    const data = await response.json()
    return data.ethereum?.usd || 0
  } catch (error) {
    console.error("Error fetching ETH price:", error)
    return 0
  }
}

export async function fetchEthereumTransactions(address: string): Promise<EthereumTransaction[]> {
  try {
    console.log("[v0] Fetching transactions for address:", address)

    const { TatumSDK, Network } = await import("@tatumio/tatum")

    const tatum = await TatumSDK.init({
      network: Network.ETHEREUM,
      apiKey: {
        v4: TATUM_API_KEY,
      },
    })

    const response = await tatum.address.getTransactions({
      address: address,
    })

    console.log("[v0] Transaction response:", response)

    // Clean up SDK instance
    tatum.destroy()

    if (!response || !response.data) {
      console.error("[v0] No transaction data found")
      return []
    }

    const transactions = response.data || []

    return transactions.map((tx: any) => ({
      hash: tx.hash,
      blockNumber: tx.blockNumber?.toString() || "0",
      timeStamp: tx.timestamp ? Math.floor(tx.timestamp / 1000).toString() : "0",
      from: tx.counterAddress || tx.from || "",
      to: tx.address || tx.to || "",
      value: convertToWei(tx.amount || "0"), // Convert amount to wei format
      gas: "21000", // Default gas limit for simple transfers
      gasPrice: "20000000000", // Default gas price (20 gwei)
      gasUsed: "21000", // Default gas used for simple transfers
      isError: tx.transactionSubtype === "failed" ? "1" : "0",
      txreceipt_status: tx.transactionSubtype === "failed" ? "0" : "1",
    }))
  } catch (error) {
    console.error("[v0] Error fetching transactions:", error)
    return []
  }
}

function formatTokenBalance(balance: string, decimals: number): string {
  const balanceNum = Number.parseFloat(balance) / Math.pow(10, decimals)
  return balanceNum.toFixed(6)
}

export function formatEthValue(weiValue: string): string {
  const ethValue = Number.parseInt(weiValue) / Math.pow(10, 18)
  return ethValue.toFixed(6)
}

export function formatUsdValue(ethAmount: number, ethPrice: number): string {
  return (ethAmount * ethPrice).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatTimestamp(timestamp: string): string {
  const date = new Date(Number.parseInt(timestamp) * 1000)
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  })
}

// Helper function to convert ETH amount to wei
function convertToWei(ethAmount: string): string {
  try {
    const ethValue = Number.parseFloat(ethAmount)
    const weiValue = Math.floor(ethValue * Math.pow(10, 18))
    return weiValue.toString()
  } catch {
    return "0"
  }
}

function formatEtherFromWei(wei: bigint, decimals = 6): string {
  const BASE = 1_000_000_000_000_000_000n // 1e18
  const whole = wei / BASE
  const frac = wei % BASE

  // Pad to 18 decimals, then cut to desired precision, trim right zeros
  const fracStr = frac.toString().padStart(18, "0").slice(0, decimals).replace(/0+$/, "")
  return fracStr ? `${whole}.${fracStr}` : whole.toString()
}
