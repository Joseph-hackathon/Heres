/**
 * Application constants
 */

// Solana Configuration
export const SOLANA_CONFIG = {
  PROGRAM_ID: process.env.NEXT_PUBLIC_PROGRAM_ID || 'D6ZiV1bkZ6m27iHUsgsrZKV8WVa7bAHaFhC61CtXc5qA',
  NETWORK: process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet',
  HELIUS_API_KEY: process.env.NEXT_PUBLIC_HELIUS_API_KEY || 'a393269c-0295-485d-ba5f-0c8ffc828d0d',
} as const

// Helius API Configuration
export const HELIUS_CONFIG = {
  // Devnet Enhanced Transactions API
  BASE_URL: 'https://api-devnet.helius-rpc.com/v0',
  // Devnet RPC endpoint
  RPC_URL: SOLANA_CONFIG.HELIUS_API_KEY 
    ? `https://devnet.helius-rpc.com/?api-key=${SOLANA_CONFIG.HELIUS_API_KEY}`
    : 'https://api.devnet.solana.com',
  // Alternative RPC endpoints for fallback
  RPC_URL_ALT: 'https://api.devnet.solana.com',
} as const

// Default Values
export const DEFAULT_VALUES = {
  INACTIVITY_DAYS: '365',
  DELAY_DAYS: '30',
} as const

// Local Storage Keys
export const STORAGE_KEYS = {
  CAPSULE_INTENT: (address: string, id: string | number) => `capsule_intent_${address}_${id}`,
  CAPSULE_CREATION_TX: (address: string) => `capsule_creation_tx_${address}`,
  CAPSULE_CREATION_TX_WITH_SIG: (address: string, signature: string) => `capsule_creation_tx_${address}_${signature}`,
  CAPSULE_EXECUTION_TX: (address: string) => `capsule_execution_tx_${address}`,
  CAPSULE_EXECUTION_TX_WITH_SIG: (address: string, signature: string) => `capsule_execution_tx_${address}_${signature}`,
  EXECUTED_CAPSULES: (address: string) => `executed_capsules_${address}`,
} as const
