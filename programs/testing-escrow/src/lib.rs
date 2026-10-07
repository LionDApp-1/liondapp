use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{self, Mint, Token, TokenAccount, TransferChecked}};

// Development build identity only. Deployment must bind a new owned program ID
// and the API must verify that ID, config, mint and cluster before enabling funds.
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkgP7n1vQgKR");

const REVIEW_SECONDS: i64 = 72 * 3600;
const APPEAL_SECONDS: i64 = 72 * 3600;

#[program]
pub mod liondapp_testing_escrow {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, fee_receiver: Pubkey) -> Result<()> {
        require!(ctx.accounts.program_data.upgrade_authority_address == Some(ctx.accounts.authority.key()), EscrowError::Unauthorized);
        require!(ctx.accounts.mint.decimals == 6, EscrowError::InvalidTerms);
        ctx.accounts.config.set_inner(Config { authority: ctx.accounts.authority.key(), mint: ctx.accounts.mint.key(), fee_receiver, bump: ctx.bumps.config });
        Ok(())
    }

    pub fn create_campaign(ctx: Context<CreateCampaign>, nonce: [u8; 32], rules_hash: [u8; 32], reward: u64, capacity: u16, deadline: i64, reservation_hours: u8) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(rules_hash != [0; 32] && reward > 0 && capacity > 0 && capacity <= 1000 && reservation_hours > 0 && reservation_hours <= 72, EscrowError::InvalidTerms);
        require!(deadline >= now + 3600 && deadline <= now + 30 * 86400, EscrowError::InvalidTerms);
        let fee = fee_for(reward)?;
        let total = reward.checked_add(fee).and_then(|per| per.checked_mul(u64::from(capacity))).ok_or(EscrowError::Overflow)?;
        ctx.accounts.campaign.set_inner(Campaign { creator: ctx.accounts.creator.key(), config: ctx.accounts.config.key(), nonce, rules_hash, reward, fee, capacity, occupied: 0, unsettled: 0, paid: 0, deadline, reservation_seconds: i64::from(reservation_hours) * 3600, closed: false, refunded: false, bump: ctx.bumps.campaign });
        token::transfer_checked(CpiContext::new(ctx.accounts.token_program.to_account_info(), TransferChecked { from: ctx.accounts.source.to_account_info(), mint: ctx.accounts.mint.to_account_info(), to: ctx.accounts.vault.to_account_info(), authority: ctx.accounts.creator.to_account_info() }), total, 6)?;
        emit!(CampaignFunded { campaign: ctx.accounts.campaign.key(), rules_hash, total });
        Ok(())
    }

    pub fn reserve(ctx: Context<Reserve>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let campaign = &mut ctx.accounts.campaign;
        require!(!campaign.closed && !campaign.refunded && campaign.deadline > now && campaign.occupied < campaign.capacity, EscrowError::Unavailable);
        require!(campaign.creator != ctx.accounts.tester.key(), EscrowError::Unauthorized);
        campaign.occupied = campaign.occupied.checked_add(1).ok_or(EscrowError::Overflow)?;
        campaign.unsettled = campaign.unsettled.checked_add(1).ok_or(EscrowError::Overflow)?;
        ctx.accounts.entry.set_inner(Entry { campaign: campaign.key(), tester: ctx.accounts.tester.key(), state: EntryState::Reserved, report_hash: [0; 32], reason_hash: [0; 32], submit_by: campaign.deadline.min(now + campaign.reservation_seconds), review_by: 0, appeal_by: 0, correction_count: 0, bump: ctx.bumps.entry });
        Ok(())
    }

    pub fn submit(ctx: Context<TesterEntry>, report_hash: [u8; 32]) -> Result<()> {
        let entry = &mut ctx.accounts.entry;
        require!(matches!(entry.state, EntryState::Reserved | EntryState::ChangesRequested) && Clock::get()?.unix_timestamp < entry.submit_by && report_hash != [0; 32], EscrowError::InvalidTransition);
        entry.state = EntryState::Submitted;
        entry.report_hash = report_hash;
        entry.review_by = Clock::get()?.unix_timestamp + REVIEW_SECONDS;
        Ok(())
    }

    pub fn review(ctx: Context<CreatorEntry>, decision: ReviewDecision, reason_hash: [u8; 32]) -> Result<()> {
        let entry = &mut ctx.accounts.entry;
        require!(entry.state == EntryState::Submitted, EscrowError::InvalidTransition);
        let now = Clock::get()?.unix_timestamp;
        require!(now < entry.review_by, EscrowError::InvalidTransition);
        match decision {
            ReviewDecision::Approve => entry.state = EntryState::Approved,
            ReviewDecision::Changes => {
                require!(reason_hash != [0; 32], EscrowError::InvalidTerms);
                require!(entry.correction_count == 0, EscrowError::InvalidTransition);
                entry.correction_count = 1;
                entry.state = EntryState::ChangesRequested;
                entry.submit_by = now + ctx.accounts.campaign.reservation_seconds;
                entry.reason_hash = reason_hash;
            }
            ReviewDecision::Reject => {
                require!(reason_hash != [0; 32], EscrowError::InvalidTerms);
                entry.state = EntryState::Rejected;
                entry.appeal_by = now + APPEAL_SECONDS;
                entry.reason_hash = reason_hash;
            }
        }
        Ok(())
    }

    pub fn appeal(ctx: Context<TesterEntry>, reason_hash: [u8; 32]) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let entry = &mut ctx.accounts.entry;
        require!(reason_hash != [0; 32] && ((entry.state == EntryState::Rejected && now < entry.appeal_by) || (entry.state == EntryState::Submitted && now >= entry.review_by)), EscrowError::InvalidTransition);
        entry.state = EntryState::Disputed;
        entry.reason_hash = reason_hash;
        Ok(())
    }

    pub fn resolve(ctx: Context<Resolve>, approve: bool, reason_hash: [u8; 32]) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!((ctx.accounts.entry.state == EntryState::Disputed || (ctx.accounts.entry.state == EntryState::Submitted && now >= ctx.accounts.entry.review_by)) && reason_hash != [0; 32], EscrowError::InvalidTransition);
        ctx.accounts.entry.reason_hash = reason_hash;
        if approve { ctx.accounts.entry.state = EntryState::Approved; }
        else {
            ctx.accounts.entry.state = EntryState::Released;
            release_slot(&mut ctx.accounts.campaign)?;
        }
        Ok(())
    }

    pub fn withdraw(ctx: Context<TesterEntry>) -> Result<()> {
        require!(matches!(ctx.accounts.entry.state, EntryState::Reserved | EntryState::ChangesRequested), EscrowError::InvalidTransition);
        ctx.accounts.entry.state = EntryState::Released;
        release_slot(&mut ctx.accounts.campaign)
    }

    pub fn release_expired(ctx: Context<EntryAccounts>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let entry = &mut ctx.accounts.entry;
        require!((matches!(entry.state, EntryState::Reserved | EntryState::ChangesRequested) && now >= entry.submit_by) || (entry.state == EntryState::Rejected && now >= entry.appeal_by), EscrowError::InvalidTransition);
        entry.state = EntryState::Released;
        release_slot(&mut ctx.accounts.campaign)
    }

    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        require!(ctx.accounts.entry.state == EntryState::Approved && !ctx.accounts.campaign.refunded, EscrowError::InvalidTransition);
        let campaign = &ctx.accounts.campaign;
        let bump = [campaign.bump];
        let seeds: &[&[u8]] = &[b"campaign", campaign.creator.as_ref(), &campaign.nonce, &bump];
        // Program<Token> pins the CPI to SPL Token. It can change token balances,
        // not this escrow-owned Campaign, so Campaign does not need a CPI reload.
        for (destination, amount) in [(ctx.accounts.reward_account.to_account_info(), campaign.reward), (ctx.accounts.fee_account.to_account_info(), campaign.fee)] {
            token::transfer_checked(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), TransferChecked { from: ctx.accounts.vault.to_account_info(), mint: ctx.accounts.mint.to_account_info(), to: destination, authority: campaign.to_account_info() }, &[seeds]), amount, 6)?;
        }
        let campaign = &mut ctx.accounts.campaign;
        campaign.unsettled = campaign.unsettled.checked_sub(1).ok_or(EscrowError::InvalidTransition)?;
        campaign.paid = campaign.paid.checked_add(1).ok_or(EscrowError::Overflow)?;
        ctx.accounts.entry.state = EntryState::Paid;
        emit!(RewardPaid { campaign: campaign.key(), entry: ctx.accounts.entry.key(), tester: ctx.accounts.entry.tester, reward: campaign.reward, fee: campaign.fee });
        Ok(())
    }

    pub fn close_campaign(ctx: Context<CloseCampaign>) -> Result<()> {
        ctx.accounts.campaign.closed = true;
        Ok(())
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let campaign = &ctx.accounts.campaign;
        require!(campaign.closed && !campaign.refunded && campaign.unsettled == 0, EscrowError::UnsettledEntries);
        let bump = [campaign.bump];
        let seeds: &[&[u8]] = &[b"campaign", campaign.creator.as_ref(), &campaign.nonce, &bump];
        let amount = ctx.accounts.vault.amount;
        token::transfer_checked(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), TransferChecked { from: ctx.accounts.vault.to_account_info(), mint: ctx.accounts.mint.to_account_info(), to: ctx.accounts.destination.to_account_info(), authority: campaign.to_account_info() }, &[seeds]), amount, 6)?;
        ctx.accounts.campaign.refunded = true;
        emit!(BalanceRefunded { campaign: ctx.accounts.campaign.key(), amount });
        Ok(())
    }
}

pub fn fee_for(reward: u64) -> Result<u64> { reward.checked_add(9).map(|amount| amount / 10).ok_or(error!(EscrowError::Overflow)) }
fn release_slot(campaign: &mut Account<Campaign>) -> Result<()> {
    campaign.occupied = campaign.occupied.checked_sub(1).ok_or(EscrowError::InvalidTransition)?;
    campaign.unsettled = campaign.unsettled.checked_sub(1).ok_or(EscrowError::InvalidTransition)?;
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)] pub authority: Signer<'info>,
    #[account(constraint = program.programdata_address()? == Some(program_data.key()))] pub program: Program<'info, crate::program::LiondappTestingEscrow>,
    pub program_data: Account<'info, ProgramData>,
    pub mint: Account<'info, Mint>,
    #[account(init,payer=authority,space=8+Config::INIT_SPACE,seeds=[b"config"],bump)] pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
#[instruction(nonce: [u8;32])]
pub struct CreateCampaign<'info> {
    #[account(mut)] pub creator: Signer<'info>,
    #[account(seeds=[b"config"],bump=config.bump)] pub config: Account<'info, Config>,
    #[account(address=config.mint)] pub mint: Account<'info, Mint>,
    #[account(init,payer=creator,space=8+Campaign::INIT_SPACE,seeds=[b"campaign",creator.key().as_ref(),&nonce],bump)] pub campaign: Account<'info, Campaign>,
    #[account(mut,token::mint=mint,token::authority=creator)] pub source: Account<'info, TokenAccount>,
    #[account(init,payer=creator,seeds=[b"vault",campaign.key().as_ref()],bump,token::mint=mint,token::authority=campaign)] pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct Reserve<'info> {
    #[account(mut)] pub tester: Signer<'info>,
    #[account(mut,seeds=[b"campaign",campaign.creator.as_ref(),&campaign.nonce],bump=campaign.bump)] pub campaign: Account<'info, Campaign>,
    #[account(init,payer=tester,space=8+Entry::INIT_SPACE,seeds=[b"entry",campaign.key().as_ref(),tester.key().as_ref()],bump)] pub entry: Account<'info, Entry>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct TesterEntry<'info> {
    pub tester: Signer<'info>,
    #[account(mut,seeds=[b"campaign",campaign.creator.as_ref(),&campaign.nonce],bump=campaign.bump)] pub campaign: Account<'info, Campaign>,
    #[account(mut,has_one=campaign,has_one=tester,seeds=[b"entry",campaign.key().as_ref(),entry.tester.as_ref()],bump=entry.bump)] pub entry: Account<'info, Entry>,
}
#[derive(Accounts)]
pub struct CreatorEntry<'info> {
    pub creator: Signer<'info>,
    #[account(has_one=creator,seeds=[b"campaign",creator.key().as_ref(),&campaign.nonce],bump=campaign.bump)] pub campaign: Account<'info, Campaign>,
    #[account(mut,has_one=campaign,seeds=[b"entry",campaign.key().as_ref(),entry.tester.as_ref()],bump=entry.bump)] pub entry: Account<'info, Entry>,
}
#[derive(Accounts)]
pub struct EntryAccounts<'info> {
    #[account(mut,seeds=[b"campaign",campaign.creator.as_ref(),&campaign.nonce],bump=campaign.bump)] pub campaign: Account<'info, Campaign>,
    #[account(mut,has_one=campaign,seeds=[b"entry",campaign.key().as_ref(),entry.tester.as_ref()],bump=entry.bump)] pub entry: Account<'info, Entry>,
}
#[derive(Accounts)]
pub struct Resolve<'info> {
    pub authority: Signer<'info>,
    #[account(has_one=authority,seeds=[b"config"],bump=config.bump)] pub config: Account<'info, Config>,
    #[account(mut,has_one=config,seeds=[b"campaign",campaign.creator.as_ref(),&campaign.nonce],bump=campaign.bump)] pub campaign: Account<'info, Campaign>,
    #[account(mut,has_one=campaign,seeds=[b"entry",campaign.key().as_ref(),entry.tester.as_ref()],bump=entry.bump)] pub entry: Account<'info, Entry>,
}
#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut)] pub payer: Signer<'info>,
    #[account(seeds=[b"config"],bump=config.bump)] pub config: Box<Account<'info, Config>>,
    #[account(mut,has_one=config,seeds=[b"campaign",campaign.creator.as_ref(),&campaign.nonce],bump=campaign.bump)] pub campaign: Box<Account<'info, Campaign>>,
    #[account(mut,has_one=campaign,seeds=[b"entry",campaign.key().as_ref(),entry.tester.as_ref()],bump=entry.bump)] pub entry: Box<Account<'info, Entry>>,
    /// CHECK: Locked to the immutable entry recipient, never supplied as an arbitrary payee.
    #[account(address=entry.tester)] pub tester: UncheckedAccount<'info>,
    /// CHECK: Locked to the immutable platform fee recipient.
    #[account(address=config.fee_receiver)] pub fee_receiver: UncheckedAccount<'info>,
    #[account(address=config.mint)] pub mint: Account<'info, Mint>,
    #[account(mut,seeds=[b"vault",campaign.key().as_ref()],bump,token::mint=mint,token::authority=campaign)] pub vault: Account<'info, TokenAccount>,
    #[account(init_if_needed,payer=payer,associated_token::mint=mint,associated_token::authority=tester)] pub reward_account: Account<'info, TokenAccount>,
    #[account(init_if_needed,payer=payer,associated_token::mint=mint,associated_token::authority=fee_receiver)] pub fee_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct CloseCampaign<'info> {
    pub creator: Signer<'info>,
    #[account(mut,has_one=creator,seeds=[b"campaign",creator.key().as_ref(),&campaign.nonce],bump=campaign.bump)] pub campaign: Account<'info, Campaign>,
}
#[derive(Accounts)]
pub struct Refund<'info> {
    pub creator: Signer<'info>,
    #[account(seeds=[b"config"],bump=config.bump)] pub config: Account<'info, Config>,
    #[account(mut,has_one=config,has_one=creator,seeds=[b"campaign",creator.key().as_ref(),&campaign.nonce],bump=campaign.bump)] pub campaign: Account<'info, Campaign>,
    #[account(address=config.mint)] pub mint: Account<'info, Mint>,
    #[account(mut,seeds=[b"vault",campaign.key().as_ref()],bump,token::mint=mint,token::authority=campaign)] pub vault: Account<'info, TokenAccount>,
    // The different token authorities already prevent aliasing. Keep that
    // invariant explicit if account constraints are changed in a later version.
    #[account(mut,token::mint=mint,token::authority=creator,constraint=destination.key()!=vault.key() @ EscrowError::InvalidTerms)] pub destination: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct Config { pub authority: Pubkey, pub mint: Pubkey, pub fee_receiver: Pubkey, pub bump: u8 }
#[account]
#[derive(InitSpace)]
pub struct Campaign { pub creator: Pubkey, pub config: Pubkey, pub nonce: [u8;32], pub rules_hash: [u8;32], pub reward: u64, pub fee: u64, pub capacity: u16, pub occupied: u16, pub unsettled: u16, pub paid: u16, pub deadline: i64, pub reservation_seconds: i64, pub closed: bool, pub refunded: bool, pub bump: u8 }
#[account]
#[derive(InitSpace)]
pub struct Entry { pub campaign: Pubkey, pub tester: Pubkey, pub state: EntryState, pub report_hash: [u8;32], pub reason_hash: [u8;32], pub submit_by: i64, pub review_by: i64, pub appeal_by: i64, pub correction_count: u8, pub bump: u8 }
#[derive(AnchorSerialize,AnchorDeserialize,Clone,PartialEq,Eq,InitSpace)]
pub enum EntryState { Reserved, Submitted, ChangesRequested, Approved, Rejected, Disputed, Paid, Released }
#[derive(AnchorSerialize,AnchorDeserialize,Clone)]
pub enum ReviewDecision { Approve, Changes, Reject }
#[event] pub struct CampaignFunded { pub campaign: Pubkey, pub rules_hash: [u8;32], pub total: u64 }
#[event] pub struct RewardPaid { pub campaign: Pubkey, pub entry: Pubkey, pub tester: Pubkey, pub reward: u64, pub fee: u64 }
#[event] pub struct BalanceRefunded { pub campaign: Pubkey, pub amount: u64 }
#[error_code]
pub enum EscrowError { Unauthorized, InvalidTerms, Overflow, Unavailable, InvalidTransition, UnsettledEntries }

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn fee_is_ten_percent_rounded_up_in_token_units() {
        assert_eq!(fee_for(10_000_000).unwrap(),1_000_000);
        assert_eq!(fee_for(1).unwrap(),1);
        assert_eq!(fee_for(11).unwrap(),2);
        assert!(fee_for(u64::MAX).is_err());
    }
}
