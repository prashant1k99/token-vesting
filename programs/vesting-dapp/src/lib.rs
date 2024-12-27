#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken, token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked}
};

declare_id!("8RBLvGLkXZkTXuA6WJhKTC1F7raEqfhBL69BkcaYTZL1");

const ANCHOR_DISCRIMINATOR_SIZE: usize = 8;

#[program]
pub mod tokenvesting {

    use anchor_spl::token_interface;

    use super::*;

    pub fn create_vesting_account(
        ctx: Context<CreateVestingAccount>,
        company_name: String,
    ) -> Result<()> {
        // Load in the vesting account as we want to update all the information
        *ctx.accounts.vesting_account = VestingAccount {
            owner: ctx.accounts.signer.key(),
            mint: ctx.accounts.mint.key(),
            treasury_token_account: ctx.accounts.treasury_token_account.key(),
            company_name,
            treasury_bump: ctx.bumps.treasury_token_account,
            bump: ctx.bumps.vesting_account,
        };
        Ok(())
    }

    pub fn create_employee_account(
        ctx: Context<CreateEmployeeAccount>,
        start_time: u64,
        end_time: u64,
        total_amount: u64,
        cliff_time: u64,
    ) -> Result<()> {
        *ctx.accounts.employee_account = EmployeeAccount {
            beneficiary: ctx.accounts.beneficiary.key(),
            start_time,
            end_time,
            cliff_time,
            total_amount,
            vesting_account: ctx.accounts.vesting_account.key(),
            total_withdrawn: 0,
            bump: ctx.bumps.employee_account,
        };
        Ok(())
    }

    pub fn claim_tokens(ctx: Context<ClaimTokens>, _company_name: String) -> Result<()> {
        let employee_account = &mut ctx.accounts.employee_account;

        let now = Clock::get().unwrap().unix_timestamp;

        if now < (employee_account.cliff_time as i64) {
            return Err(ErrorCode::ClaimNotAvailableYet.into())
        }

        let time_since_start = now.saturating_sub(employee_account.start_time as i64);
        let total_vesting_time = (employee_account.end_time as i64).saturating_sub(employee_account.start_time as i64);
        
        if total_vesting_time == 0 {
            return Err(ErrorCode::InvalidVestingPeriod.into())
        }

        // If current time is after the end time then all tokens are unlocked
        let vested_amount = if now >= (employee_account.end_time as i64) {
            employee_account.total_amount
        } else {
            match employee_account.total_amount.checked_mul(time_since_start as u64){
                Some(product) => {
                    product / total_vesting_time as u64
                }
                None => {
                    return Err(ErrorCode::CalculationOverflow.into())
                }
            }
        };

        // Check how many tokens are remaining which employee can claim
        let claimable_amount = vested_amount.saturating_sub(employee_account.total_withdrawn);

        if claimable_amount == 0 {
            return Err(ErrorCode::NothingToClaim.into())
        }

        // Process claim, transfer SPL token from treasury account to employee token account
        let transfer_cpi_account = TransferChecked {
            from: ctx.accounts.treasury_token_account.to_account_info(), // treasury account
            mint: ctx.accounts.mint.to_account_info(),
            to: employee_account.to_account_info(),
            authority: ctx.accounts.treasury_token_account.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();

        let signer_seeds: &[&[&[u8]]] = &[
            &[b"vesting_treasury",
            ctx.accounts.vesting_account.company_name.as_ref(),
            &[ctx.accounts.vesting_account.treasury_bump]]
        ];

        let cpi_context = CpiContext::new(cpi_program, transfer_cpi_account).with_signer(signer_seeds);

        let decimals = ctx.accounts.mint.decimals;

        token_interface::transfer_checked(cpi_context, claimable_amount, decimals)?;

        employee_account.total_withdrawn += claimable_amount;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(company_name: String)]
pub struct CreateVestingAccount<'info> {
    // It is mutable account as it will be paying rent
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        init,
        payer = signer,
        space = ANCHOR_DISCRIMINATOR_SIZE + VestingAccount::INIT_SPACE,
        seeds = [company_name.as_ref()],
        bump,
    )]
    pub vesting_account: Account<'info, VestingAccount>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        token::mint = mint,
        token::authority = treasury_token_account,
        payer = signer,
        seeds = [b"vesting_treasury", company_name.as_bytes()],
        bump,
    )]
    pub treasury_token_account: InterfaceAccount<'info, TokenAccount>,

    // Needed for Account creation
    pub system_program: Program<'info, System>,
    // Needed for Token Creation
    pub token_program: Interface<'info, TokenInterface>,
}

#[account]
#[derive(InitSpace)]
pub struct VestingAccount {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub treasury_token_account: Pubkey,
    #[max_len(50)]
    pub company_name: String,
    pub treasury_bump: u8,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct CreateEmployeeAccount<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    pub beneficiary: SystemAccount<'info>,

    #[account(
        has_one = owner,
    )]
    pub vesting_account: Account<'info, VestingAccount>,

    #[account(
        init,
        payer = owner,
        seeds = [b"employee_vesting", beneficiary.key().as_ref(), vesting_account.key().as_ref()],
        space = ANCHOR_DISCRIMINATOR_SIZE + EmployeeAccount::INIT_SPACE,
        bump,
    )]
    pub employee_account: Account<'info, EmployeeAccount>,

    pub system_program: Program<'info, System>,
}

// Employee Vesting Accounts
#[account]
#[derive(InitSpace)]
pub struct EmployeeAccount {
    pub beneficiary: Pubkey,
    pub start_time: u64,
    pub end_time: u64,
    pub cliff_time: u64,
    pub vesting_account: Pubkey,
    pub total_amount: u64,
    pub total_withdrawn: u64,
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(company_name: String)]
pub struct ClaimTokens<'info> {
    #[account(mut)]
    pub beneficiary: Signer<'info>,

    #[account(
        mut,
        seeds = [b"employee_vesting", beneficiary.key().as_ref(), vesting_account.key().as_ref()],
        bump = employee_account.bump,
        has_one = beneficiary, // Check for It has correct beneficiary
        has_one = vesting_account, // It is connected to correct account
    )]
    pub employee_account: Account<'info, EmployeeAccount>,

    #[account(
        mut,
        seeds = [company_name.as_ref()],
        bump = vesting_account.bump,
        has_one = treasury_token_account,
        has_one = mint,
    )]
    pub vesting_account: Account<'info, VestingAccount>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub treasury_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed, 
        payer = beneficiary, 
        associated_token::mint = mint, 
        associated_token::authority = beneficiary, 
        associated_token::token_program = token_program,
    )]
    pub employee_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Claiming is not available yet.")]
    ClaimNotAvailableYet,
    #[msg("There is nothing to claim.")]
    NothingToClaim,
    #[msg("Invalid vesting period provided.")]
    InvalidVestingPeriod,
    #[msg("Calculation Overflow")]
    CalculationOverflow,
}
