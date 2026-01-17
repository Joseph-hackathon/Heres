/**
 * Solana program utilities
 */

import { PublicKey } from '@solana/web3.js'
import { getProgramId } from '@/config/solana'

/**
 * Derive capsule PDA (Program Derived Address)
 */
export function getCapsulePDA(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('intent_capsule'), owner.toBuffer()],
    getProgramId()
  )
}
