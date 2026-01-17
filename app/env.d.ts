/// <reference types="next" />
/// <reference types="next/image-types/global" />

declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_SOLANA_NETWORK?: string
    NEXT_PUBLIC_HELIUS_API_KEY?: string
    NEXT_PUBLIC_PROGRAM_ID?: string
  }
}
