/**
 * Solana program interaction utilities
 */

import { SystemProgram, PublicKey } from '@solana/web3.js'
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor'
import { WalletContextState } from '@solana/wallet-adapter-react'
import idl from '../idl/lucid_program.json'
import { getSolanaConnection, getProgramId } from '@/config/solana'
import { getCapsulePDA } from './program'
import type { IntentCapsule } from '@/types'

// Re-export connection function
export { getSolanaConnection as getConnection }

/**
 * Get Anchor provider
 */
export function getProvider(wallet: WalletContextState): AnchorProvider | null {
  if (!wallet.publicKey || !wallet.signTransaction) {
    return null
  }

  const connection = getSolanaConnection()
  
  const walletAdapter = {
    publicKey: wallet.publicKey,
    signTransaction: wallet.signTransaction,
    signAllTransactions: wallet.signAllTransactions,
  } as Wallet

  return new AnchorProvider(connection, walletAdapter, {
    commitment: 'confirmed',
  })
}

/**
 * Get Anchor program instance
 */
export function getProgram(wallet: WalletContextState): Program | null {
  const provider = getProvider(wallet)
  if (!provider) return null

  // Anchor 0.30.0+: Program constructor only needs idl and provider
  // The programId is included in the IDL's address field
  return new Program(idl as any, provider)
}

/**
 * Create a new Intent Capsule with retry logic for RPC errors
 */
export async function createCapsule(
  wallet: WalletContextState,
  inactivityPeriodSeconds: number,
  intentData: Uint8Array
): Promise<string> {
  const program = getProgram(wallet)
  if (!program) throw new Error('Wallet not connected')

  const [capsulePDA] = getCapsulePDA(wallet.publicKey!)

  // Convert Uint8Array to Buffer for Anchor (required by Blob.encode)
  // In browser environment, use Buffer polyfill or convert to number array
  let intentDataBuffer: Buffer | number[]
  if (typeof Buffer !== 'undefined') {
    intentDataBuffer = Buffer.from(intentData)
  } else {
    // Fallback for environments without Buffer
    intentDataBuffer = Array.from(intentData)
  }

  // Retry logic for RPC errors (503, service unavailable, etc.)
  const maxRetries = 5
  let lastError: any

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const tx = await program.methods
        .createCapsule(new BN(inactivityPeriodSeconds), intentDataBuffer)
        .accounts({
          capsule: capsulePDA,
          owner: wallet.publicKey!,
          systemProgram: SystemProgram.programId,
        })
        .rpc()

      return tx
    } catch (error: any) {
      lastError = error
      
      // Check if it's a retryable RPC error
      const errorMessage = error?.message || ''
      const isRetryableError = 
        errorMessage.includes('503') ||
        errorMessage.includes('Service unavailable') ||
        errorMessage.includes('failed to get recent blockhash') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('network')
      
      if (isRetryableError && attempt < maxRetries - 1) {
        // Wait before retry (exponential backoff: 2s, 4s, 8s, 16s)
        const delay = Math.min(2000 * Math.pow(2, attempt), 16000)
        console.log(`RPC error (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      
      // If it's not a retryable error or max retries reached, throw
      throw error
    }
  }

  // If all retries failed, throw with a user-friendly message
  if (lastError?.message?.includes('503') || lastError?.message?.includes('Service unavailable')) {
    throw new Error('RPC 서버가 일시적으로 사용 불가능합니다. 잠시 후 다시 시도해주세요.\nRPC server is temporarily unavailable. Please try again in a few moments.')
  }
  
  throw lastError
}

/**
 * Update intent data
 */
export async function updateIntent(
  wallet: WalletContextState,
  newIntentData: Uint8Array
): Promise<string> {
  const program = getProgram(wallet)
  if (!program) throw new Error('Wallet not connected')

  const [capsulePDA] = getCapsulePDA(wallet.publicKey!)

  // Convert Uint8Array to Buffer for Anchor (required by Blob.encode)
  let intentDataBuffer: Buffer | number[]
  if (typeof Buffer !== 'undefined') {
    intentDataBuffer = Buffer.from(newIntentData)
  } else {
    // Fallback for environments without Buffer
    intentDataBuffer = Array.from(newIntentData)
  }

  const tx = await program.methods
    .updateIntent(intentDataBuffer)
    .accounts({
      capsule: capsulePDA,
      owner: wallet.publicKey!,
    })
    .rpc()

  return tx
}

/**
 * Execute intent (when inactivity is proven with ZK proof)
 */
export async function executeIntent(
  wallet: WalletContextState,
  ownerPublicKey: PublicKey,
  inactivityProof: Uint8Array,
  proofPublicInputs: Uint8Array,
  beneficiaries?: Array<{ address: string; amount: string; amountType: string }>
): Promise<string> {
  const program = getProgram(wallet)
  if (!program) throw new Error('Wallet not connected')

  // Owner must be the executor (signer) for SOL transfers
  if (!wallet.publicKey || !wallet.publicKey.equals(ownerPublicKey)) {
    throw new Error('Owner must be the executor to transfer SOL')
  }

  const [capsulePDA] = getCapsulePDA(ownerPublicKey)

  // Convert Uint8Array to Buffer for Anchor (required by Blob.encode)
  // In browser environment, use Buffer polyfill or convert to number array
  let proofBuffer: Buffer | number[]
  let inputsBuffer: Buffer | number[]
  
  if (typeof Buffer !== 'undefined') {
    proofBuffer = Buffer.from(inactivityProof)
    inputsBuffer = Buffer.from(proofPublicInputs)
  } else {
    // Fallback for environments without Buffer
    proofBuffer = Array.from(inactivityProof)
    inputsBuffer = Array.from(proofPublicInputs)
  }

  // Build accounts object
  // Owner and executor are the same (owner must sign to transfer SOL)
  const accounts = {
    capsule: capsulePDA,
    owner: ownerPublicKey, // Owner must sign to transfer SOL
    systemProgram: SystemProgram.programId,
    executor: wallet.publicKey!, // Executor is the same as owner
  }

  // Add beneficiary accounts as remaining accounts if provided
  const remainingAccounts = beneficiaries?.map(b => ({
    pubkey: new PublicKey(b.address),
    isSigner: false,
    isWritable: true,
  })) || []

  const tx = await program.methods
    .executeIntent(proofBuffer, inputsBuffer)
    .accounts(accounts)
    .remainingAccounts(remainingAccounts)
    .rpc()

  return tx
}

/**
 * Update activity timestamp
 */
export async function updateActivity(wallet: WalletContextState): Promise<string> {
  const program = getProgram(wallet)
  if (!program) throw new Error('Wallet not connected')

  const [capsulePDA] = getCapsulePDA(wallet.publicKey!)

  const tx = await program.methods
    .updateActivity()
    .accounts({
      capsule: capsulePDA,
      owner: wallet.publicKey!,
    })
    .rpc()

  return tx
}

/**
 * Deactivate capsule
 */
export async function deactivateCapsule(wallet: WalletContextState): Promise<string> {
  const program = getProgram(wallet)
  if (!program) throw new Error('Wallet not connected')

  const [capsulePDA] = getCapsulePDA(wallet.publicKey!)

  const tx = await program.methods
    .deactivateCapsule()
    .accounts({
      capsule: capsulePDA,
      owner: wallet.publicKey!,
    })
    .rpc()

  return tx
}

/**
 * Recreate capsule from executed state
 */
export async function recreateCapsule(
  wallet: WalletContextState,
  inactivityPeriodSeconds: number,
  intentData: Uint8Array
): Promise<string> {
  const program = getProgram(wallet)
  if (!program) throw new Error('Wallet not connected')

  const [capsulePDA] = getCapsulePDA(wallet.publicKey!)

  // Convert Uint8Array to Buffer for Anchor (required by Blob.encode)
  let intentDataBuffer: Buffer | number[]
  if (typeof Buffer !== 'undefined') {
    intentDataBuffer = Buffer.from(intentData)
  } else {
    // Fallback for environments without Buffer
    intentDataBuffer = Array.from(intentData)
  }

  const tx = await program.methods
    .recreateCapsule(new BN(inactivityPeriodSeconds), intentDataBuffer)
    .accounts({
      capsule: capsulePDA,
      owner: wallet.publicKey!,
    })
    .rpc()

  return tx
}

/**
 * Fetch capsule data
 */
export async function getCapsule(owner: PublicKey): Promise<IntentCapsule | null> {
  const connection = getSolanaConnection()
  const [capsulePDA] = getCapsulePDA(owner)

  try {
    console.log('Fetching capsule for owner:', owner.toString())
    console.log('Capsule PDA:', capsulePDA.toString())
    
    // Retry logic for RPC errors
    const maxRetries = 3
    let accountInfo = null
    let lastError: any
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Use Anchor's account decoder to parse the account
        // We need a provider to use Program.account, but we can decode manually
        accountInfo = await connection.getAccountInfo(capsulePDA)
        console.log(`Account info (attempt ${attempt + 1}):`, accountInfo ? 'Found' : 'Not found')
        break // Success, exit retry loop
      } catch (error: any) {
        lastError = error
        const errorMessage = error?.message || ''
        const isRetryableError = 
          errorMessage.includes('503') ||
          errorMessage.includes('401') ||
          errorMessage.includes('32401') ||
          errorMessage.includes('Bad request') ||
          errorMessage.includes('Service unavailable') ||
          errorMessage.includes('timeout') ||
          errorMessage.includes('network') ||
          errorMessage.includes('Unauthorized')
        
        if (isRetryableError && attempt < maxRetries - 1) {
          const delay = Math.min(2000 * Math.pow(2, attempt), 10000)
          console.log(`RPC error (attempt ${attempt + 1}/${maxRetries}): ${errorMessage}, retrying in ${delay}ms...`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        throw error // Not retryable or max retries reached
      }
    }
    
    if (!accountInfo || !accountInfo.data) {
      console.log('No account info or data found for PDA:', capsulePDA.toString())
      return null
    }

    // Anchor accounts start with an 8-byte discriminator
    // Skip the discriminator and parse the account data
    const data = accountInfo.data
    
    // Discriminator is 8 bytes, skip it
    let offset = 8
    
    // owner: Pubkey (32 bytes)
    const ownerBytes = data.slice(offset, offset + 32)
    const ownerPubkey = new PublicKey(ownerBytes)
    offset += 32
    
    // Helper function to read i64 (little-endian)
    const readI64 = (bytes: Uint8Array, start: number): bigint => {
      let result = 0n
      for (let i = 0; i < 8; i++) {
        result |= BigInt(bytes[start + i]) << BigInt(i * 8)
      }
      // Handle signed integer (two's complement)
      if (result & (1n << 63n)) {
        result = result - (1n << 64n)
      }
      return result
    }
    
    // Helper function to read u32 (little-endian)
    const readU32 = (bytes: Uint8Array, start: number): number => {
      return bytes[start] | (bytes[start + 1] << 8) | (bytes[start + 2] << 16) | (bytes[start + 3] << 24)
    }
    
    // inactivity_period: i64 (8 bytes, little-endian)
    const inactivityPeriod = readI64(data, offset)
    offset += 8
    
    // last_activity: i64 (8 bytes, little-endian)
    const lastActivity = readI64(data, offset)
    offset += 8
    
    // intent_data: Vec<u8> (4 bytes length + data)
    const intentDataLength = readU32(data, offset)
    offset += 4
    const intentDataBytes = data.slice(offset, offset + intentDataLength)
    offset += intentDataLength
    
    // is_active: bool (1 byte)
    const isActive = data[offset] === 1
    offset += 1
    
    // executed_at: Option<i64> (1 byte for Some/None + 8 bytes if Some)
    let executedAt: number | null = null
    const hasExecutedAt = data[offset] === 1
    offset += 1
    if (hasExecutedAt) {
      executedAt = Number(readI64(data, offset))
      offset += 8
    }
    
    // bump: u8 (1 byte) - we don't need this for the return value

    const capsule = {
      owner: ownerPubkey,
      inactivityPeriod: Number(inactivityPeriod),
      lastActivity: Number(lastActivity),
      intentData: new Uint8Array(intentDataBytes),
      isActive,
      executedAt,
    }
    
    console.log('Successfully fetched capsule:', {
      owner: capsule.owner.toString(),
      isActive: capsule.isActive,
      executedAt: capsule.executedAt,
      inactivityPeriod: capsule.inactivityPeriod,
    })
    
    return capsule
  } catch (error) {
    console.error('Error fetching capsule:', error)
    console.error('Owner:', owner.toString())
    console.error('PDA:', capsulePDA.toString())
    // Re-throw error so caller can handle it
    throw error
  }
}

// Re-export types
export type { IntentCapsule } from '@/types'
