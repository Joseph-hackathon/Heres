/**
 * Helius API integration for real-time on-chain monitoring
 * 
 * Updated to use getTransactionsForAddress RPC method for better performance
 * and advanced filtering capabilities.
 * 
 * @see https://www.helius.dev/docs/rpc/gettransactionsforaddress
 */

import { HELIUS_CONFIG, SOLANA_CONFIG } from '@/constants'
import type { WalletActivity } from '@/types'

/**
 * Interface for getTransactionsForAddress request parameters
 */
export interface GetTransactionsForAddressParams {
  transactionDetails?: 'signatures' | 'full'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  paginationToken?: string
  commitment?: 'finalized' | 'confirmed'
  filters?: {
    slot?: {
      gte?: number
      gt?: number
      lte?: number
      lt?: number
    }
    blockTime?: {
      gte?: number
      gt?: number
      lte?: number
      lt?: number
      eq?: number
    }
    signature?: {
      gte?: string
      gt?: string
      lte?: string
      lt?: string
    }
    status?: 'succeeded' | 'failed'
    tokenAccounts?: 'none' | 'balanceChanged' | 'all'
  }
}

/**
 * Interface for getTransactionsForAddress response
 */
export interface GetTransactionsForAddressResponse {
  data: any[]
  paginationToken?: string
}

/**
 * Get transactions for an address using Helius getTransactionsForAddress RPC method
 * 
 * This is a Helius-exclusive RPC method that provides:
 * - Full transaction data in one call (no need for getTransaction)
 * - Associated Token Accounts (ATA) support
 * - Advanced filtering and sorting
 * - Efficient pagination
 * 
 * @param address - Base-58 encoded public key
 * @param params - Query parameters
 * @returns Transaction data with pagination token
 */
export async function getTransactionsForAddress(
  address: string,
  params: GetTransactionsForAddressParams = {}
): Promise<GetTransactionsForAddressResponse | null> {
  try {
    const {
      transactionDetails = 'signatures',
      sortOrder = 'desc',
      limit = 100,
      paginationToken,
      commitment = 'finalized',
      filters = {},
    } = params

    const rpcUrl = HELIUS_CONFIG.RPC_URL
    if (!rpcUrl) {
      throw new Error('Helius RPC URL not configured')
    }

    const requestBody = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getTransactionsForAddress',
      params: [
        address,
        {
          transactionDetails,
          sortOrder,
          limit,
          ...(paginationToken && { paginationToken }),
          commitment,
          ...(Object.keys(filters).length > 0 && { filters }),
        },
      ],
    }

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Helius RPC error: ${response.status} ${response.statusText}`, errorText)
      throw new Error(`Helius RPC error: ${response.statusText}`)
    }

    const data = await response.json()

    if (data.error) {
      console.error('Helius RPC error:', data.error)
      throw new Error(data.error.message || 'Helius RPC error')
    }

    return data.result || null
  } catch (error) {
    console.error('Error fetching transactions from Helius RPC:', error)
    return null
  }
}

/**
 * Get wallet activity information from Helius
 * 
 * Updated to use getTransactionsForAddress RPC method for better performance
 */
export async function getWalletActivity(walletAddress: string): Promise<WalletActivity | null> {
  try {
    // Use new getTransactionsForAddress RPC method
    // Get only successful transactions, sorted newest first
    // Include associated token accounts with balance changes
    const result = await getTransactionsForAddress(walletAddress, {
      transactionDetails: 'signatures', // Use signatures for faster response
      sortOrder: 'desc', // Newest first
      limit: 100,
      filters: {
        status: 'succeeded', // Only successful transactions
        tokenAccounts: 'balanceChanged', // Include token account balance changes
      },
    })

    if (!result || !result.data || result.data.length === 0) {
      console.log('No transactions found for wallet:', walletAddress)
      return {
        wallet: walletAddress,
        lastSignature: '',
        lastActivityTimestamp: 0,
        transactionCount: 0,
      }
    }

    const transactions = result.data

    // Get the latest transaction (first in desc order)
    const latestTx = transactions[0]

    // Extract signature from transaction
    // For signatures mode, the response format is: { signature: string, slot: number, blockTime: number | null, err: any }
    // For full mode, it's the full transaction object
    const signature = latestTx.signature || 
                     latestTx.transaction?.signatures?.[0] ||
                     ''

    // Extract timestamp
    let timestamp = 0
    if (latestTx.blockTime) {
      timestamp = typeof latestTx.blockTime === 'number'
        ? latestTx.blockTime
        : parseInt(String(latestTx.blockTime))
    } else if (latestTx.transaction?.blockTime) {
      timestamp = typeof latestTx.transaction.blockTime === 'number'
        ? latestTx.transaction.blockTime
        : parseInt(String(latestTx.transaction.blockTime))
    }

    // Convert timestamp to milliseconds if it's in seconds (Unix timestamp)
    // Timestamps > 1000000000000 are already in milliseconds
    const timestampMs = timestamp > 1000000000000 ? timestamp : timestamp * 1000

    console.log('Helius RPC response for wallet:', walletAddress, {
      transactionCount: transactions.length,
      latestSignature: signature,
      latestTimestamp: timestampMs,
      latestTimestampFormatted: new Date(timestampMs).toLocaleString(),
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
