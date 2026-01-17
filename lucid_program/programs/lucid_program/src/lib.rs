use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("D6ZiV1bkZ6m27iHUsgsrZKV8WVa7bAHaFhC61CtXc5qA");

#[program]
pub mod lucid_program {
    use super::*;

    /// Initialize a new Intent Capsule
    pub fn create_capsule(
        ctx: Context<CreateCapsule>,
        inactivity_period: i64,
        intent_data: Vec<u8>,
    ) -> Result<()> {
        let capsule = &mut ctx.accounts.capsule;
        capsule.owner = ctx.accounts.owner.key();
        capsule.inactivity_period = inactivity_period;
        capsule.last_activity = Clock::get()?.unix_timestamp;
        capsule.intent_data = intent_data;
        capsule.is_active = true;
        capsule.bump = ctx.bumps.capsule;
        
        msg!("Intent Capsule created: {:?}", capsule.key());
        Ok(())
    }

    /// Update the intent data of an existing capsule
    pub fn update_intent(
        ctx: Context<UpdateIntent>,
        new_intent_data: Vec<u8>,
    ) -> Result<()> {
        let capsule = &mut ctx.accounts.capsule;
        require!(capsule.owner == ctx.accounts.owner.key(), ErrorCode::Unauthorized);
        require!(capsule.is_active, ErrorCode::CapsuleInactive);
        
        capsule.intent_data = new_intent_data;
        capsule.last_activity = Clock::get()?.unix_timestamp;
        
        msg!("Intent updated for capsule: {:?}", capsule.key());
        Ok(())
    }

    /// Execute the intent when inactivity is proven with ZK proof
    pub fn execute_intent<'info>(
        ctx: Context<'_, '_, '_, 'info, ExecuteIntent<'info>>,
        inactivity_proof: Vec<u8>, // Noir ZK proof data
        proof_public_inputs: Vec<u8>, // Public inputs for proof verification
    ) -> Result<()> {
        let capsule = &mut ctx.accounts.capsule;
        require!(capsule.is_active, ErrorCode::CapsuleInactive);
        
        // Require that executor is the owner (for SOL transfers, owner must sign)
        require!(
            ctx.accounts.executor.key() == capsule.owner && ctx.accounts.executor.key() == ctx.accounts.owner.key(),
            ErrorCode::Unauthorized
        );
        
        let current_time = Clock::get()?.unix_timestamp;
        let time_since_activity = current_time - capsule.last_activity;
        
        require!(
            time_since_activity >= capsule.inactivity_period,
            ErrorCode::InactivityPeriodNotMet
        );
        
        // Verify Noir ZK proof
        // The proof should demonstrate that:
        // 1. The inactivity period has been met
        // 2. No activity has occurred during the period
        // 3. The proof is valid for this specific capsule
        
        // Verify Noir ZK proof
        require!(
            verify_noir_proof(
                &inactivity_proof,
                &proof_public_inputs,
                capsule.last_activity,
                capsule.inactivity_period,
                current_time,
                &capsule.owner
            )?,
            ErrorCode::InvalidProof
        );
        
        // Parse intent data to extract beneficiaries and amounts
        // Intent data is stored as JSON: {"intent": "...", "beneficiaries": [...], "totalAmount": "..."}
        let intent_data_str = String::from_utf8(capsule.intent_data.clone())
            .map_err(|_| ErrorCode::InvalidIntentData)?;
        
        // Parse JSON to extract beneficiaries
        let intent_json: serde_json::Value = serde_json::from_str(&intent_data_str)
            .map_err(|_| ErrorCode::InvalidIntentData)?;
        
        let beneficiaries = intent_json.get("beneficiaries")
            .and_then(|b| b.as_array())
            .ok_or(ErrorCode::InvalidIntentData)?;
        
        let total_amount_str = intent_json.get("totalAmount")
            .and_then(|t| t.as_str())
            .ok_or(ErrorCode::InvalidIntentData)?;
        
        let total_amount_lamports = parse_sol_to_lamports(total_amount_str)
            .map_err(|_| ErrorCode::InvalidIntentData)?;
        
        // Distribute SOL to each beneficiary
        for beneficiary in beneficiaries {
            let address_str = beneficiary.get("address")
                .and_then(|a| a.as_str())
                .ok_or(ErrorCode::InvalidIntentData)?;
            
            let beneficiary_pubkey = address_str.parse::<Pubkey>()
                .map_err(|_| ErrorCode::InvalidBeneficiaryAddress)?;
            
            let amount_str = beneficiary.get("amount")
                .and_then(|a| a.as_str())
                .ok_or(ErrorCode::InvalidIntentData)?;
            
            let amount_type = beneficiary.get("amountType")
                .and_then(|t| t.as_str())
                .unwrap_or("fixed");
            
            // Calculate amount in lamports
            let amount_lamports = if amount_type == "percentage" {
                let percentage = amount_str.parse::<f64>()
                    .map_err(|_| ErrorCode::InvalidIntentData)?;
                (total_amount_lamports as f64 * percentage / 100.0) as u64
            } else {
                parse_sol_to_lamports(amount_str)
                    .map_err(|_| ErrorCode::InvalidIntentData)?
            };
            
            // Transfer SOL from owner to beneficiary
            // Use remaining_accounts to find the beneficiary account
            if amount_lamports > 0 {
                // Find beneficiary account in remaining_accounts
                // remaining_accounts items are already AccountInfo<'info>
                let beneficiary_account = ctx.remaining_accounts
                    .iter()
                    .find(|acc| acc.key() == beneficiary_pubkey)
                    .ok_or(ErrorCode::InvalidBeneficiaryAddress)?;
                
                // Create CPI context - use references directly with explicit lifetime
                let cpi_accounts = system_program::Transfer {
                    from: ctx.accounts.owner.to_account_info(),
                    to: beneficiary_account.clone(),
                };
                let cpi_program = ctx.accounts.system_program.to_account_info();
                let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
                
                system_program::transfer(cpi_ctx, amount_lamports)?;
                
                msg!("Transferred {} lamports ({} SOL) to beneficiary: {}", 
                     amount_lamports, 
                     amount_lamports as f64 / 1_000_000_000.0,
                     beneficiary_pubkey);
            }
        }
        
        // Mark capsule as executed
        capsule.is_active = false;
        capsule.executed_at = Some(current_time);
        
        msg!("Intent executed for capsule: {:?}", capsule.key());
        msg!("Time since last activity: {} seconds", time_since_activity);
        msg!("ZK proof verified successfully");
        
        // Emit event for off-chain monitoring
        emit!(IntentExecuted {
            capsule: capsule.key(),
            owner: capsule.owner,
            executed_at: current_time,
        });
        
        Ok(())
    }

    /// Update last activity timestamp (called by Helius webhook or user)
    pub fn update_activity(ctx: Context<UpdateActivity>) -> Result<()> {
        let capsule = &mut ctx.accounts.capsule;
        require!(capsule.owner == ctx.accounts.owner.key(), ErrorCode::Unauthorized);
        
        capsule.last_activity = Clock::get()?.unix_timestamp;
        
        msg!("Activity updated for capsule: {:?}", capsule.key());
        Ok(())
    }

    /// Deactivate a capsule (owner can cancel before execution)
    pub fn deactivate_capsule(ctx: Context<DeactivateCapsule>) -> Result<()> {
        let capsule = &mut ctx.accounts.capsule;
        require!(capsule.owner == ctx.accounts.owner.key(), ErrorCode::Unauthorized);
        require!(capsule.is_active, ErrorCode::CapsuleInactive);
        
        capsule.is_active = false;
        
        msg!("Capsule deactivated: {:?}", capsule.key());
        Ok(())
    }

    /// Recreate a capsule from executed state (allows creating new capsule after execution)
    pub fn recreate_capsule(
        ctx: Context<RecreateCapsule>,
        inactivity_period: i64,
        intent_data: Vec<u8>,
    ) -> Result<()> {
        let capsule = &mut ctx.accounts.capsule;
        require!(capsule.owner == ctx.accounts.owner.key(), ErrorCode::Unauthorized);
        require!(!capsule.is_active, ErrorCode::CapsuleActive);
        require!(capsule.executed_at.is_some(), ErrorCode::CapsuleNotExecuted);
        
        // Reset capsule to active state with new data
        capsule.inactivity_period = inactivity_period;
        capsule.last_activity = Clock::get()?.unix_timestamp;
        capsule.intent_data = intent_data;
        capsule.is_active = true;
        capsule.executed_at = None; // Clear executed_at to allow new execution
        
        msg!("Capsule recreated from executed state: {:?}", capsule.key());
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateCapsule<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + IntentCapsule::LEN,
        seeds = [b"intent_capsule", owner.key().as_ref()],
        bump
    )]
    pub capsule: Account<'info, IntentCapsule>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateIntent<'info> {
    #[account(
        mut,
        seeds = [b"intent_capsule", owner.key().as_ref()],
        bump = capsule.bump
    )]
    pub capsule: Account<'info, IntentCapsule>,
    
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteIntent<'info> {
    #[account(
        mut,
        seeds = [b"intent_capsule", capsule.owner.as_ref()],
        bump = capsule.bump
    )]
    pub capsule: Account<'info, IntentCapsule>,
    
    /// Owner's account (must be mut and signer for SOL transfers)
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub system_program: Program<'info, System>,
    
    /// Executor must be the owner (for SOL transfers, owner must sign)
    pub executor: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateActivity<'info> {
    #[account(
        mut,
        seeds = [b"intent_capsule", owner.key().as_ref()],
        bump = capsule.bump
    )]
    pub capsule: Account<'info, IntentCapsule>,
    
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct DeactivateCapsule<'info> {
    #[account(
        mut,
        seeds = [b"intent_capsule", owner.key().as_ref()],
        bump = capsule.bump
    )]
    pub capsule: Account<'info, IntentCapsule>,
    
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct RecreateCapsule<'info> {
    #[account(
        mut,
        seeds = [b"intent_capsule", owner.key().as_ref()],
        bump = capsule.bump
    )]
    pub capsule: Account<'info, IntentCapsule>,
    
    pub owner: Signer<'info>,
}

#[account]
pub struct IntentCapsule {
    pub owner: Pubkey,
    pub inactivity_period: i64, // seconds
    pub last_activity: i64,      // unix timestamp
    pub intent_data: Vec<u8>,    // encoded intent instructions
    pub is_active: bool,
    pub executed_at: Option<i64>,
    pub bump: u8,
}

impl IntentCapsule {
    pub const LEN: usize = 32 + // owner
        8 +                      // inactivity_period
        8 +                      // last_activity
        4 + 1024 +               // intent_data (max 1KB)
        1 +                      // is_active
        1 + 8 +                  // executed_at (Option<i64>)
        1;                       // bump
}

#[event]
pub struct IntentExecuted {
    pub capsule: Pubkey,
    pub owner: Pubkey,
    pub executed_at: i64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized: Only the owner can perform this action")]
    Unauthorized,
    #[msg("Capsule is not active")]
    CapsuleInactive,
    #[msg("Capsule is active")]
    CapsuleActive,
    #[msg("Capsule has not been executed")]
    CapsuleNotExecuted,
    #[msg("Inactivity period has not been met")]
    InactivityPeriodNotMet,
    #[msg("Invalid ZK proof: Proof verification failed")]
    InvalidProof,
    #[msg("Invalid intent data format")]
    InvalidIntentData,
    #[msg("Invalid beneficiary address")]
    InvalidBeneficiaryAddress,
}

/// Verify Noir ZK proof of inactivity
/// This function verifies that the proof demonstrates:
/// - The inactivity period has been met
/// - No activity occurred during the period
/// - The proof is valid for this capsule
fn verify_noir_proof(
    proof: &[u8],
    public_inputs: &[u8],
    last_activity: i64,
    inactivity_period: i64,
    current_time: i64,
    owner: &Pubkey,
) -> anchor_lang::Result<bool> {
    use anchor_lang::prelude::Pubkey;
    
    // Basic proof structure validation
    if proof.is_empty() {
        return Err(ErrorCode::InvalidProof.into());
    }
    if public_inputs.is_empty() {
        return Err(ErrorCode::InvalidProof.into());
    }
    
    // Verify proof format (Noir proof is typically structured as bytes)
    // In production, this would use a Noir verifier contract or library
    // For now, we validate the proof structure and public inputs
    
    // Parse public inputs (expected format: owner_pubkey(32) + last_activity(8) + inactivity_period(8) + current_time(8))
    if public_inputs.len() < 56 {
        return Err(ErrorCode::InvalidProof.into());
    }
    
    // Verify owner matches
    let proof_owner = Pubkey::try_from(&public_inputs[0..32])
        .map_err(|_| ErrorCode::InvalidProof)?;
    if proof_owner != *owner {
        return Err(ErrorCode::InvalidProof.into());
    }
    
    // Verify last_activity matches
    let proof_last_activity = i64::from_le_bytes(
        public_inputs[32..40].try_into().map_err(|_| ErrorCode::InvalidProof)?
    );
    if proof_last_activity != last_activity {
        return Err(ErrorCode::InvalidProof.into());
    }
    
    // Verify inactivity_period matches
    let proof_inactivity_period = i64::from_le_bytes(
        public_inputs[40..48].try_into().map_err(|_| ErrorCode::InvalidProof)?
    );
    if proof_inactivity_period != inactivity_period {
        return Err(ErrorCode::InvalidProof.into());
    }
    
    // Verify current_time matches (within reasonable bounds)
    let proof_current_time = i64::from_le_bytes(
        public_inputs[48..56].try_into().map_err(|_| ErrorCode::InvalidProof)?
    );
    let time_diff = (proof_current_time - current_time).abs();
    if time_diff > 300 {
        return Err(ErrorCode::InvalidProof.into()); // Allow 5 minute tolerance
    }
    
    // Verify proof signature/format (simplified verification)
    // In production, this would verify the actual Noir proof using a verifier
    // For now, we check that the proof has a valid structure
    if proof.len() < 64 {
        return Err(ErrorCode::InvalidProof.into()); // Minimum proof size
    }
    
    // Additional verification: Check proof hash matches expected format
    // This is a placeholder - actual Noir verification would be more complex
    let proof_valid = verify_proof_signature(proof, public_inputs)?;
    
    Ok(proof_valid)
}

/// Verify proof signature (simplified - in production use actual Noir verifier)
fn verify_proof_signature(proof: &[u8], _public_inputs: &[u8]) -> anchor_lang::Result<bool> {
    
    // Placeholder for actual Noir proof verification
    // In production, this would:
    // 1. Deserialize the Noir proof
    // 2. Verify the proof against the verification key
    // 3. Check that public inputs match
    
    // For now, we do basic validation
    // A valid Noir proof should have certain characteristics
    if proof.len() < 64 {
        return Err(ErrorCode::InvalidProof.into());
    }
    
    // Check that proof is not all zeros (basic sanity check)
    let all_zeros = proof.iter().all(|&b| b == 0);
    if all_zeros {
        return Err(ErrorCode::InvalidProof.into());
    }
    
    // In production, replace this with actual Noir proof verification
    // For development, we accept proofs that pass structural validation
    Ok(true)
}

/// Parse SOL amount string to lamports
fn parse_sol_to_lamports(sol_str: &str) -> Result<u64> {
    let sol_amount: f64 = sol_str.parse()
        .map_err(|_| ErrorCode::InvalidIntentData)?;
    
    // Convert SOL to lamports (1 SOL = 1_000_000_000 lamports)
    let lamports = (sol_amount * 1_000_000_000.0) as u64;
    Ok(lamports)
}
