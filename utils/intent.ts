/**
 * Intent data encoding/decoding utilities
 */

import { Beneficiary } from '@/types'

export interface IntentData {
  intent: string
  beneficiaries: Beneficiary[]
  totalAmount?: string
  inactivityDays: number
  delayDays: number
}

/**
 * Encode intent data to Uint8Array
 */
export function encodeIntentData(data: IntentData): Uint8Array {
  const json = JSON.stringify(data)
  return new TextEncoder().encode(json)
}

/**
 * Decode intent data from Uint8Array
 */
export function decodeIntentData(data: Uint8Array): IntentData | null {
  try {
    const json = new TextDecoder().decode(data)
    return JSON.parse(json)
  } catch (error) {
    console.error('Error decoding intent data:', error)
    return null
  }
}

/**
 * Convert days to seconds
 */
export function daysToSeconds(days: number): number {
  return days * 24 * 60 * 60
}

/**
 * Convert seconds to days
 */
export function secondsToDays(seconds: number): number {
  return seconds / (24 * 60 * 60)
}
