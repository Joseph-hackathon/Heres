/**
 * Helius API integration for real-time on-chain monitoring
 */

import { HELIUS_CONFIG, SOLANA_CONFIG } from '@/constants'
import type { WalletActivity } from '@/types'

/**
 * Get wallet activity information from Helius
 */
export async function getWalletActivity(walletAddress: string): Promise<WalletActivity | null> {
  try {
    // Use Helius Enhanced Transactions API for better data
    // This endpoint returns transactions in a more structured format
    const response = await fetch(
      `${HELIUS_CONFIG.BASE_URL}/addresses/${walletAddress}/transactions?api-key=${SOLANA_CONFIG.HELIUS_API_KEY}&limit=100`
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Helius API error: ${response.status} ${response.statusText}`, errorText)
      throw new Error(`Helius API error: ${response.statusText}`)
    }
    
    const data = await response.json()
    
    // Handle different response formats from Helius API
    let transactions: any[] = []
    
    if (Array.isArray(data)) {
      // Direct array response
      transactions = data
    } else if (data && Array.isArray(data.transactions)) {
      // Wrapped in transactions property
      transactions = data.transactions
    } else if (data && data.result && Array.isArray(data.result)) {
      // Wrapped in result property
      transactions = data.result
    } else if (data && data.data && Array.isArray(data.data)) {
      // Wrapped in data property
      transactions = data.data
    } else {
      console.warn('Unexpected Helius API response format:', data)
    }
    
    if (!transactions || transactions.length === 0) {
      console.log('No transactions found for wallet:', walletAddress)
      return {
        wallet: walletAddress,
        lastSignature: '',
        lastActivityTimestamp: 0,
        transactionCount: 0,
      }
    }
    
    // Sort transactions by timestamp (newest first) if available
    transactions.sort((a, b) => {
      const timeA = a.timestamp || a.blockTime || a.tx?.blockTime || 0
      const timeB = b.timestamp || b.blockTime || b.tx?.blockTime || 0
      return timeB - timeA
    })
    
    // Get the latest transaction
    const latestTx = transactions[0]
    
    // Extract signature from different possible response formats
    const signature = latestTx.signature || 
                     latestTx.transactionSignature ||
                     latestTx.transaction?.signatures?.[0] ||
                     latestTx.tx?.signature ||
                     latestTx.signatures?.[0] ||
                     ''
    
    // Extract timestamp from different possible response formats
    let timestamp = 0
    if (latestTx.timestamp) {
      timestamp = typeof latestTx.timestamp === 'number' 
        ? latestTx.timestamp 
        : parseInt(String(latestTx.timestamp))
    } else if (latestTx.blockTime) {
      timestamp = typeof latestTx.blockTime === 'number'
        ? latestTx.blockTime
        : parseInt(String(latestTx.blockTime))
    } else if (latestTx.tx?.blockTime) {
      timestamp = typeof latestTx.tx.blockTime === 'number'
        ? latestTx.tx.blockTime
        : parseInt(String(latestTx.tx.blockTime))
    } else if (latestTx.nativeTransfers && latestTx.nativeTransfers.length > 0) {
      // Try to get timestamp from native transfers
      const transfer = latestTx.nativeTransfers[0]
      if (transfer.timestamp) {
        timestamp = typeof transfer.timestamp === 'number'
          ? transfer.timestamp
          : parseInt(String(transfer.timestamp))
      }
    }
    
    // Convert timestamp to milliseconds if it's in seconds (Unix timestamp)
    // Timestamps > 1000000000000 are already in milliseconds
    const timestampMs = timestamp > 1000000000000 ? timestamp : timestamp * 1000
    
    console.log('Helius API response for wallet:', walletAddress, {
      transactionCount: transactions.length,
      latestSignature: signature,
      latestTimestamp: timestampMs,
      latestTimestampFormatted: new Date(timestampMs).toLocaleString(),
      sampleTx: {
        signature: latestTx.signature,
        timestamp: latestTx.timestamp,
        blockTime: latestTx.blockTime,
      }
    })
    
    return {
      wallet: walletAddress,
      lastSignature: signature,
      lastActivityTimestamp: timestampMs,
      transactionCount: transactions.length,
    }
  } catch (error) {
    console.error('Error fetching wallet activity from Helius:', error)
    return null
  }
}

/**
 * Subscribe to wallet activity webhooks (for production use)
 */
export async function createWebhook(
  walletAddress: string,
  webhookUrl: string
): Promise<string | null> {
  try {
    // Note: Webhooks might use different endpoint, but keeping BASE_URL for consistency
    const response = await fetch(`${HELIUS_CONFIG.BASE_URL}/webhooks?api-key=${SOLANA_CONFIG.HELIUS_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhookURL: webhookUrl,
        transactionTypes: ['Any'],
        accountAddresses: [walletAddress],
        webhookType: 'enhanced',
      }),
    })
    
    if (!response.ok) {
      throw new Error(`Helius webhook creation error: ${response.statusText}`)
    }
    
    const data = await response.json()
    return data.webhookID
  } catch (error) {
    console.error('Error creating webhook:', error)
    return null
  }
}

/**
 * Check if wallet has been inactive for a given period
 */
export function isWalletInactive(
  lastActivityTimestamp: number,
  inactivityPeriodSeconds: number
): boolean {
  const now = Date.now()
  const timeSinceActivity = (now - lastActivityTimestamp) / 1000 // Convert to seconds
  return timeSinceActivity >= inactivityPeriodSeconds
}
