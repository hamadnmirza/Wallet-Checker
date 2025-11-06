"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, Wallet, Coins } from "lucide-react"
import type { TokenBalance } from "@/lib/ethereum-api"

interface BalanceCardProps {
  nativeBalance?: TokenBalance
  tokenBalances?: TokenBalance[]
  isLoading: boolean
  address?: string
}

export function BalanceCard({ nativeBalance, tokenBalances = [], isLoading, address }: BalanceCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Wallet Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="animate-pulse">
              <div className="h-8 bg-muted rounded w-32 mb-2"></div>
              <div className="h-6 bg-muted rounded w-24"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!address) {
    return (
      <Card className="opacity-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Wallet Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Enter a valid address to view balance</p>
        </CardContent>
      </Card>
    )
  }

  const totalUsdValue =
    (nativeBalance?.valueUsd || 0) + tokenBalances.reduce((sum, token) => sum + (token.valueUsd || 0), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Wallet Balance
          <Badge variant="secondary" className="ml-auto">
            Ethereum
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="text-3xl font-bold text-foreground mb-1">{nativeBalance?.balanceFormatted || "0"} ETH</div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              <span className="text-lg">
                $
                {nativeBalance?.valueUsd?.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }) || "0.00"}{" "}
                USD
              </span>
            </div>
          </div>

          {tokenBalances.length > 0 && (
            <div className="pt-4 border-t border-border">
              <div className="flex items-center gap-2 mb-3">
                <Coins className="h-4 w-4" />
                <span className="font-medium">Token Balances</span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {tokenBalances.map((token) => (
                  <div key={token.address} className="flex justify-between items-center p-2 rounded-lg bg-muted/50">
                    <div>
                      <div className="font-medium text-sm">{token.symbol}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-32">{token.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{token.balanceFormatted}</div>
                      {token.valueUsd && token.valueUsd > 0 && (
                        <div className="text-xs text-muted-foreground">
                          $
                          {token.valueUsd.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {totalUsdValue > 0 && tokenBalances.length > 0 && (
            <div className="pt-4 border-t border-border">
              <div className="flex justify-between items-center">
                <span className="font-medium">Total Portfolio Value</span>
                <span className="text-lg font-bold">
                  $
                  {totalUsdValue.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-border">
            <div className="text-sm text-muted-foreground">
              Address: <span className="font-mono text-xs break-all">{address}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
