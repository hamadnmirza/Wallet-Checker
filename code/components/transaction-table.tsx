"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ExternalLink, History, Download } from "lucide-react"
import { type EthereumTransaction, formatEthValue, formatUsdValue, formatTimestamp } from "@/lib/ethereum-api"

interface TransactionTableProps {
  transactions: EthereumTransaction[]
  isLoading: boolean
  address?: string
  ethPrice: number
  onExportCsv: () => void
}

export function TransactionTable({ transactions, isLoading, address, ethPrice, onExportCsv }: TransactionTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-12 bg-muted rounded mb-2"></div>
              </div>
            ))}
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
            <History className="h-5 w-5" />
            Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Enter a valid address to view transactions</p>
        </CardContent>
      </Card>
    )
  }

  if (transactions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No transactions found for this address.</p>
        </CardContent>
      </Card>
    )
  }

  const getTransactionStatus = (isError: string, txStatus: string) => {
    if (isError === "1") return { label: "Failed", variant: "destructive" as const }
    if (txStatus === "1") return { label: "Success", variant: "default" as const }
    return { label: "Pending", variant: "secondary" as const }
  }

  const getTransactionType = (from: string, to: string, userAddress: string) => {
    if (from.toLowerCase() === userAddress.toLowerCase()) return "Sent"
    if (to.toLowerCase() === userAddress.toLowerCase()) return "Received"
    return "Contract"
  }

  const calculateGasFee = (gasUsed: string, gasPrice: string) => {
    const gasFeeWei = (Number.parseInt(gasUsed) * Number.parseInt(gasPrice)).toString()
    return formatEthValue(gasFeeWei)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Transaction History
            <Badge variant="outline" className="ml-2">
              {transactions.length} transactions
            </Badge>
          </CardTitle>
          <Button onClick={onExportCsv} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Download CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Hash</TableHead>
                <TableHead>Date & Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Value (ETH)</TableHead>
                <TableHead>Value (USD)</TableHead>
                <TableHead>Gas Fee</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx) => {
                const status = getTransactionStatus(tx.isError, tx.txreceipt_status)
                const type = getTransactionType(tx.from, tx.to, address)
                const ethValue = formatEthValue(tx.value)
                const usdValue = formatUsdValue(Number.parseFloat(ethValue), ethPrice)
                const gasFee = calculateGasFee(tx.gasUsed, tx.gasPrice)
                const gasFeeUsd = formatUsdValue(Number.parseFloat(gasFee), ethPrice)

                return (
                  <TableRow key={tx.hash}>
                    <TableCell>
                      <Button
                        variant="link"
                        className="p-0 h-auto font-mono text-xs"
                        onClick={() => window.open(`https://etherscan.io/tx/${tx.hash}`, "_blank")}
                      >
                        {tx.hash.slice(0, 8)}...{tx.hash.slice(-6)}
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                    </TableCell>
                    <TableCell className="text-sm">{formatTimestamp(tx.timeStamp)}</TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={type === "Received" ? "default" : type === "Sent" ? "secondary" : "outline"}>
                        {type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{ethValue}</TableCell>
                    <TableCell className="text-sm">${usdValue}</TableCell>
                    <TableCell className="text-sm">
                      <div>
                        <div className="font-mono">{gasFee} ETH</div>
                        <div className="text-xs text-muted-foreground">${gasFeeUsd}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="link"
                        className="p-0 h-auto font-mono text-xs"
                        onClick={() => window.open(`https://etherscan.io/address/${tx.from}`, "_blank")}
                      >
                        {tx.from.slice(0, 6)}...{tx.from.slice(-4)}
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="link"
                        className="p-0 h-auto font-mono text-xs"
                        onClick={() => window.open(`https://etherscan.io/address/${tx.to}`, "_blank")}
                      >
                        {tx.to.slice(0, 6)}...{tx.to.slice(-4)}
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
