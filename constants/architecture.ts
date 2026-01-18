import { Step, ComparisonRow } from '@/types'

export const ARCHITECTURE_STEPS: Step[] = [
  { id: 1, label: 'Define Intent', description: 'User defines intent in Lucid UI (e.g., Transfer asset after X days of inactivity).', from: 'Client', to: 'Server' },
  { id: 2, label: 'Silence Required (402)', description: 'Lucid Capsule stores intent in Idle State. Conditions not yet met.', from: 'Server', to: 'Client' },
  { id: 3, label: 'Passive Observation', description: 'Lucid monitors activity silently. No tracking, only presence/absence of Txs.', from: 'Client', to: 'Client', sideEffect: 'Timer starts...' },
  { id: 4, label: 'Threshold Reached', description: 'Inactivity period exceeded. Proof Request Header included.', from: 'Client', to: 'Server' },
  { id: 5, label: '/generate_proof', description: 'Request Noir ZK to prove valid silence without revealing details.', from: 'Server', to: 'Facilitator' },
  { id: 6, label: 'Proof: Valid/Invalid', description: 'Noir returns an encrypted proof of silence. Content remains secret.', from: 'Facilitator', to: 'Server' },
  { id: 7, label: '/verify_on_chain', description: 'Lucid Capsule submits ZK proof to Solana for verification.', from: 'Server', to: 'Blockchain' },
  { id: 8, label: 'Proof Accepted', description: 'Solana confirms proof validity. Intent is now executable.', from: 'Blockchain', to: 'Server' },
  { id: 9, label: 'Execute Intent', description: 'Lucid triggers the defined action (Asset transfer, permission revoking, etc.).', from: 'Server', to: 'Server' },
  { id: 10, label: 'Submit Transaction', description: 'Final result written to Solana. Why it happened is hidden.', from: 'Server', to: 'Blockchain' },
  { id: 11, label: 'Confirmed (Settled)', description: 'Transaction confirmed. Intent state set to Settled.', from: 'Blockchain', to: 'Server' },
  { id: 12, label: 'Return Response', description: 'UI displays "Execution Completed" to the user/recipient.', from: 'Server', to: 'Client' },
]

export const ARCHITECTURE_COMPARISONS: ComparisonRow[] = [
  { x402: 'Payment Required', lucid: 'Silence Required', relatedStepIds: [2] },
  { x402: 'Payment Payload', lucid: 'Silence Proof Request', relatedStepIds: [4, 5] },
  { x402: 'Facilitator', lucid: 'Noir ZK', relatedStepIds: [6] },
  { x402: 'Verify Payment', lucid: 'Verify Silence Proof', relatedStepIds: [7, 8] },
  { x402: 'Fulfill Request', lucid: 'Execute Intent', relatedStepIds: [9] },
  { x402: 'Tx Confirmed', lucid: 'Intent Finalized', relatedStepIds: [10, 11] },
]
