//! Executes the compiled SBF program and real SPL/ATA CPIs in an isolated VM.
//! All keys, tokens and time are synthetic. No RPC, wallet or deployment is used.
use anchor_lang::prelude::{Clock, Pubkey};
use anchor_lang::solana_program::{
    bpf_loader_upgradeable::{self, UpgradeableLoaderState},
    instruction::Instruction,
    program_option::COption,
    program_pack::Pack,
    system_program,
};
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use anchor_spl::{
    associated_token::{self, get_associated_token_address},
    token::spl_token,
};
use liondapp_testing_escrow::{
    self as escrow, accounts, instruction, Campaign, Config, Entry, EntryState, EscrowError,
    ReviewDecision,
};
use litesvm::{types::FailedTransactionMetadata, LiteSVM};
use solana_account::Account;
use solana_instruction::error::InstructionError;
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;
use solana_transaction_error::TransactionError;

const NOW: i64 = 1_800_000_000;
const REWARD: u64 = 11_000_001;
const FEE: u64 = 1_100_001;
const INITIAL: u64 = 1_000_000_000;

fn ix(a: impl ToAccountMetas, data: impl InstructionData) -> Instruction {
    Instruction {
        program_id: escrow::ID,
        accounts: a.to_account_metas(None),
        data: data.data(),
    }
}
fn funded_account(svm: &LiteSVM, owner: Pubkey, data: Vec<u8>, executable: bool) -> Account {
    Account {
        lamports: svm.minimum_balance_for_rent_exemption(data.len()),
        data,
        owner,
        executable,
        rent_epoch: 0,
    }
}
fn token_account(svm: &mut LiteSVM, key: Pubkey, mint: Pubkey, owner: Pubkey, amount: u64) {
    let mut data = vec![0; spl_token::state::Account::LEN];
    spl_token::state::Account::pack(
        spl_token::state::Account {
            mint,
            owner,
            amount,
            delegate: COption::None,
            state: spl_token::state::AccountState::Initialized,
            is_native: COption::None,
            delegated_amount: 0,
            close_authority: COption::None,
        },
        &mut data,
    )
    .unwrap();
    svm.set_account(key, funded_account(svm, spl_token::ID, data, false))
        .unwrap();
}
fn mint_account(svm: &mut LiteSVM, mint: Pubkey, decimals: u8) {
    let mut data = vec![0; spl_token::state::Mint::LEN];
    spl_token::state::Mint::pack(
        spl_token::state::Mint {
            mint_authority: COption::None,
            supply: INITIAL,
            decimals,
            is_initialized: true,
            freeze_authority: COption::None,
        },
        &mut data,
    )
    .unwrap();
    svm.set_account(mint, funded_account(svm, spl_token::ID, data, false))
        .unwrap();
}
fn send(
    svm: &mut LiteSVM,
    payer: &Keypair,
    instructions: &[Instruction],
    others: &[&Keypair],
) -> Result<(), FailedTransactionMetadata> {
    // Repeated negative cases must execute again rather than fail as duplicate signatures.
    svm.expire_blockhash();
    let mut signers = vec![payer];
    signers.extend_from_slice(others);
    svm.send_transaction(Transaction::new_signed_with_payer(
        instructions,
        Some(&payer.pubkey()),
        &signers,
        svm.latest_blockhash(),
    ))
    .map(|_| ())
}
fn custom(result: Result<(), FailedTransactionMetadata>, error: EscrowError) {
    let failed = result.expect_err("invalid operation unexpectedly succeeded");
    assert_eq!(
        failed.err,
        TransactionError::InstructionError(0, InstructionError::Custom(6000 + error as u32)),
        "{:?}",
        failed.meta.logs
    );
}

struct Fixture {
    svm: LiteSVM,
    creator: Keypair,
    tester: Keypair,
    authority: Keypair,
    fee_receiver: Pubkey,
    mint: Pubkey,
    config: Pubkey,
    program_data: Pubkey,
    source: Pubkey,
    campaign: Pubkey,
    vault: Pubkey,
    entry: Pubkey,
    nonce: [u8; 32],
}
impl Fixture {
    fn uninitialized(decimals: u8) -> Self {
        let mut svm = LiteSVM::new();
        let creator = Keypair::new();
        let tester = Keypair::new();
        let authority = Keypair::new();
        for key in [&creator, &tester, &authority] {
            svm.airdrop(&key.pubkey(), 10_000_000_000).unwrap();
        }
        let mut clock = svm.get_sysvar::<Clock>();
        clock.unix_timestamp = NOW;
        svm.set_sysvar(&clock);
        let bytes = std::fs::read(std::env::var("SBF_PROGRAM_PATH").expect(
            "SBF_PROGRAM_PATH must identify the compiled escrow .so; never skip runtime tests",
        ))
        .unwrap();
        let program_data =
            Pubkey::find_program_address(&[escrow::ID.as_ref()], &bpf_loader_upgradeable::ID).0;
        let mut data = bincode::serialize(&UpgradeableLoaderState::ProgramData {
            slot: 0,
            upgrade_authority_address: Some(authority.pubkey()),
        })
        .unwrap();
        data.resize(UpgradeableLoaderState::size_of_programdata_metadata(), 0);
        data.extend(bytes);
        svm.set_account(
            program_data,
            funded_account(&svm, bpf_loader_upgradeable::ID, data, false),
        )
        .unwrap();
        let data = bincode::serialize(&UpgradeableLoaderState::Program {
            programdata_address: program_data,
        })
        .unwrap();
        svm.set_account(
            escrow::ID,
            funded_account(&svm, bpf_loader_upgradeable::ID, data, true),
        )
        .unwrap();
        let mint = Pubkey::new_unique();
        mint_account(&mut svm, mint, decimals);
        let source = Pubkey::new_unique();
        token_account(&mut svm, source, mint, creator.pubkey(), INITIAL);
        let config = Pubkey::find_program_address(&[b"config"], &escrow::ID).0;
        let nonce = [7; 32];
        let campaign = Pubkey::find_program_address(
            &[b"campaign", creator.pubkey().as_ref(), &nonce],
            &escrow::ID,
        )
        .0;
        let vault = Pubkey::find_program_address(&[b"vault", campaign.as_ref()], &escrow::ID).0;
        let entry = Pubkey::find_program_address(
            &[b"entry", campaign.as_ref(), tester.pubkey().as_ref()],
            &escrow::ID,
        )
        .0;
        Self {
            svm,
            creator,
            tester,
            authority,
            fee_receiver: Pubkey::new_unique(),
            mint,
            config,
            program_data,
            source,
            campaign,
            vault,
            entry,
            nonce,
        }
    }
    fn new(capacity: u16) -> Self {
        let mut f = Self::uninitialized(6);
        let init = f.initialize(f.authority.pubkey());
        send(&mut f.svm, &f.authority, &[init], &[]).unwrap();
        let create = f.create(REWARD, capacity);
        send(&mut f.svm, &f.creator, &[create], &[]).unwrap();
        f
    }
    fn initialize(&self, authority: Pubkey) -> Instruction {
        ix(
            accounts::InitializeConfig {
                authority,
                program: escrow::ID,
                program_data: self.program_data,
                mint: self.mint,
                config: self.config,
                system_program: system_program::ID,
            },
            instruction::InitializeConfig {
                fee_receiver: self.fee_receiver,
            },
        )
    }
    fn create(&self, reward: u64, capacity: u16) -> Instruction {
        ix(
            accounts::CreateCampaign {
                creator: self.creator.pubkey(),
                config: self.config,
                mint: self.mint,
                campaign: self.campaign,
                source: self.source,
                vault: self.vault,
                token_program: spl_token::ID,
                system_program: system_program::ID,
            },
            instruction::CreateCampaign {
                nonce: self.nonce,
                rules_hash: [1; 32],
                reward,
                capacity,
                deadline: NOW + 86400,
                reservation_hours: 1,
            },
        )
    }
    fn reserve_ix(&self, tester: Pubkey) -> Instruction {
        ix(
            accounts::Reserve {
                tester,
                campaign: self.campaign,
                entry: Pubkey::find_program_address(
                    &[b"entry", self.campaign.as_ref(), tester.as_ref()],
                    &escrow::ID,
                )
                .0,
                system_program: system_program::ID,
            },
            instruction::Reserve {},
        )
    }
    fn reserve(&mut self) {
        let i = self.reserve_ix(self.tester.pubkey());
        send(&mut self.svm, &self.tester, &[i], &[]).unwrap();
    }
    fn tester_ix(&self, data: impl InstructionData) -> Instruction {
        ix(
            accounts::TesterEntry {
                tester: self.tester.pubkey(),
                campaign: self.campaign,
                entry: self.entry,
            },
            data,
        )
    }
    fn submit(&mut self) {
        let i = self.tester_ix(instruction::Submit {
            report_hash: [2; 32],
        });
        send(&mut self.svm, &self.tester, &[i], &[]).unwrap();
    }
    fn review_ix(&self, decision: ReviewDecision, reason_hash: [u8; 32]) -> Instruction {
        ix(
            accounts::CreatorEntry {
                creator: self.creator.pubkey(),
                campaign: self.campaign,
                entry: self.entry,
            },
            instruction::Review {
                decision,
                reason_hash,
            },
        )
    }
    fn review(&mut self, decision: ReviewDecision) {
        let i = self.review_ix(decision, [3; 32]);
        send(&mut self.svm, &self.creator, &[i], &[]).unwrap();
    }
    fn resolve_ix(&self, authority: Pubkey, approve: bool) -> Instruction {
        ix(
            accounts::Resolve {
                authority,
                config: self.config,
                campaign: self.campaign,
                entry: self.entry,
            },
            instruction::Resolve {
                approve,
                reason_hash: [4; 32],
            },
        )
    }
    fn release_ix(&self) -> Instruction {
        ix(
            accounts::EntryAccounts {
                campaign: self.campaign,
                entry: self.entry,
            },
            instruction::ReleaseExpired {},
        )
    }
    fn settle_ix(&self) -> Instruction {
        ix(
            accounts::Settle {
                payer: self.creator.pubkey(),
                config: self.config,
                campaign: self.campaign,
                entry: self.entry,
                tester: self.tester.pubkey(),
                fee_receiver: self.fee_receiver,
                mint: self.mint,
                vault: self.vault,
                reward_account: get_associated_token_address(&self.tester.pubkey(), &self.mint),
                fee_account: get_associated_token_address(&self.fee_receiver, &self.mint),
                token_program: spl_token::ID,
                associated_token_program: associated_token::ID,
                system_program: system_program::ID,
            },
            instruction::Settle {},
        )
    }
    fn close_ix(&self) -> Instruction {
        ix(
            accounts::CloseCampaign {
                creator: self.creator.pubkey(),
                campaign: self.campaign,
            },
            instruction::CloseCampaign {},
        )
    }
    fn refund_ix(&self) -> Instruction {
        ix(
            accounts::Refund {
                creator: self.creator.pubkey(),
                config: self.config,
                campaign: self.campaign,
                mint: self.mint,
                vault: self.vault,
                destination: self.source,
                token_program: spl_token::ID,
            },
            instruction::Refund {},
        )
    }
    fn read<T: AccountDeserialize>(&self, key: Pubkey) -> T {
        T::try_deserialize(&mut self.svm.get_account(&key).unwrap().data.as_slice()).unwrap()
    }
    fn campaign(&self) -> Campaign {
        self.read(self.campaign)
    }
    fn entry(&self) -> Entry {
        self.read(self.entry)
    }
    fn balance(&self, key: Pubkey) -> u64 {
        self.svm
            .get_account(&key)
            .map(|a| spl_token::state::Account::unpack(&a.data).unwrap().amount)
            .unwrap_or(0)
    }
    fn time(&mut self, now: i64) {
        let mut c = self.svm.get_sysvar::<Clock>();
        c.unix_timestamp = now;
        self.svm.set_sysvar(&c);
    }
}

#[test]
fn initialization_binds_upgrade_authority_and_six_decimal_mint() {
    let mut f = Fixture::uninitialized(6);
    let i = f.initialize(f.creator.pubkey());
    custom(
        send(&mut f.svm, &f.creator, &[i], &[]),
        EscrowError::Unauthorized,
    );
    assert!(f.svm.get_account(&f.config).is_none());
    let i = f.initialize(f.authority.pubkey());
    send(&mut f.svm, &f.authority, &[i], &[]).unwrap();
    let c: Config = f.read(f.config);
    assert_eq!(c.authority, f.authority.pubkey());
    assert_eq!(c.mint, f.mint);
    assert_eq!(c.fee_receiver, f.fee_receiver);
    let i = f.initialize(f.authority.pubkey());
    assert!(send(&mut f.svm, &f.authority, &[i], &[]).is_err());
    let mut wrong = Fixture::uninitialized(9);
    let i = wrong.initialize(wrong.authority.pubkey());
    custom(
        send(&mut wrong.svm, &wrong.authority, &[i], &[]),
        EscrowError::InvalidTerms,
    );
}

#[test]
fn deposit_settlement_and_unused_refund_conserve_tokens() {
    let mut f = Fixture::new(2);
    assert_eq!(f.balance(f.vault), (REWARD + FEE) * 2);
    assert_eq!(f.balance(f.source), INITIAL - (REWARD + FEE) * 2);
    let c = f.campaign();
    assert_eq!(c.rules_hash, [1; 32]);
    assert_eq!(c.fee, FEE);
    f.reserve();
    f.submit();
    f.review(ReviewDecision::Approve);
    let i = f.close_ix();
    send(&mut f.svm, &f.creator, &[i], &[]).unwrap();
    let i = f.refund_ix();
    custom(
        send(&mut f.svm, &f.creator, &[i], &[]),
        EscrowError::UnsettledEntries,
    );
    // Closing recruitment does not cancel an approved tester's reward.
    let i = f.settle_ix();
    send(&mut f.svm, &f.creator, &[i], &[]).unwrap();
    assert_eq!(
        f.balance(get_associated_token_address(&f.tester.pubkey(), &f.mint)),
        REWARD
    );
    assert_eq!(
        f.balance(get_associated_token_address(&f.fee_receiver, &f.mint)),
        FEE
    );
    assert!(matches!(f.entry().state, EntryState::Paid));
    assert_eq!(f.campaign().paid, 1);
    assert_eq!(f.campaign().unsettled, 0);
    let i = f.settle_ix();
    custom(
        send(&mut f.svm, &f.creator, &[i], &[]),
        EscrowError::InvalidTransition,
    );
    let i = f.refund_ix();
    send(&mut f.svm, &f.creator, &[i], &[]).unwrap();
    assert_eq!(f.balance(f.vault), 0);
    assert_eq!(f.balance(f.source), INITIAL - REWARD - FEE);
    let i = f.refund_ix();
    custom(
        send(&mut f.svm, &f.creator, &[i], &[]),
        EscrowError::UnsettledEntries,
    );
    let i = f.reserve_ix(f.authority.pubkey());
    custom(
        send(&mut f.svm, &f.authority, &[i], &[]),
        EscrowError::Unavailable,
    );
}

#[test]
fn audit_refund_alias_is_rejected_without_changing_balances_or_state() {
    let mut f = Fixture::new(1);
    let close = f.close_ix();
    send(&mut f.svm, &f.creator, &[close], &[]).unwrap();
    let before = f.balance(f.vault);
    let mut refund = f.refund_ix();
    refund.accounts[5].pubkey = f.vault;
    assert!(send(&mut f.svm, &f.creator, &[refund], &[]).is_err());
    assert_eq!(f.balance(f.vault), before);
    assert!(!f.campaign().refunded);
    let refund = f.refund_ix();
    send(&mut f.svm, &f.creator, &[refund], &[]).unwrap();
    assert_eq!(f.balance(f.vault), 0);
    assert_eq!(f.balance(f.source), INITIAL);
}

#[test]
fn audit_program_data_must_belong_to_the_upgradeable_loader() {
    let mut f = Fixture::uninitialized(6);
    let mut forged = f.svm.get_account(&f.program_data).unwrap();
    forged.owner = system_program::ID;
    f.svm.set_account(f.program_data, forged).unwrap();
    let initialize = f.initialize(f.authority.pubkey());
    assert!(send(&mut f.svm, &f.authority, &[initialize], &[]).is_err());
    assert!(f.svm.get_account(&f.config).is_none());
}

#[test]
fn audit_cpi_target_cannot_be_replaced_by_an_arbitrary_program() {
    let mut f = Fixture::new(1);
    f.reserve();
    f.submit();
    f.review(ReviewDecision::Approve);
    let before = f.balance(f.vault);
    let mut settle = f.settle_ix();
    settle.accounts[10].pubkey = system_program::ID;
    assert!(send(&mut f.svm, &f.creator, &[settle], &[]).is_err());
    assert_eq!(f.balance(f.vault), before);
    assert!(matches!(f.entry().state, EntryState::Approved));
    assert_eq!(f.campaign().unsettled, 1);
    let settle = f.settle_ix();
    send(&mut f.svm, &f.creator, &[settle], &[]).unwrap();
    let close = f.close_ix();
    send(&mut f.svm, &f.creator, &[close], &[]).unwrap();
    let mut refund = f.refund_ix();
    refund.accounts[6].pubkey = system_program::ID;
    assert!(send(&mut f.svm, &f.creator, &[refund], &[]).is_err());
    assert!(!f.campaign().refunded);
}

#[test]
fn failed_deposit_rolls_back_accounts_and_source_balance() {
    let mut f = Fixture::uninitialized(6);
    let i = f.initialize(f.authority.pubkey());
    send(&mut f.svm, &f.authority, &[i], &[]).unwrap();
    let i = f.create(INITIAL, 2);
    assert!(send(&mut f.svm, &f.creator, &[i], &[]).is_err());
    assert_eq!(f.balance(f.source), INITIAL);
    assert!(f.svm.get_account(&f.campaign).is_none());
    assert!(f.svm.get_account(&f.vault).is_none());
    let i = f.create(u64::MAX, 2);
    custom(
        send(&mut f.svm, &f.creator, &[i], &[]),
        EscrowError::Overflow,
    );
    let i = f.create(1, 1001);
    custom(
        send(&mut f.svm, &f.creator, &[i], &[]),
        EscrowError::InvalidTerms,
    );
}

#[test]
fn capacity_uniqueness_self_testing_and_paid_places_are_enforced() {
    let mut f = Fixture::new(1);
    let i = f.reserve_ix(f.creator.pubkey());
    custom(
        send(&mut f.svm, &f.creator, &[i], &[]),
        EscrowError::Unauthorized,
    );
    f.reserve();
    let i = f.reserve_ix(f.tester.pubkey());
    assert!(send(&mut f.svm, &f.tester, &[i], &[]).is_err());
    let i = f.reserve_ix(f.authority.pubkey());
    custom(
        send(&mut f.svm, &f.authority, &[i], &[]),
        EscrowError::Unavailable,
    );
    f.submit();
    f.review(ReviewDecision::Approve);
    let i = f.settle_ix();
    send(&mut f.svm, &f.creator, &[i], &[]).unwrap();
    let i = f.reserve_ix(f.authority.pubkey());
    custom(
        send(&mut f.svm, &f.authority, &[i], &[]),
        EscrowError::Unavailable,
    );
    assert_eq!(f.campaign().occupied, 1);
}

#[test]
fn unauthorized_testers_hosts_resolvers_and_recipients_cannot_change_state() {
    let mut f = Fixture::new(1);
    f.reserve();
    let i = ix(
        accounts::TesterEntry {
            tester: f.authority.pubkey(),
            campaign: f.campaign,
            entry: f.entry,
        },
        instruction::Submit {
            report_hash: [2; 32],
        },
    );
    assert!(send(&mut f.svm, &f.authority, &[i], &[]).is_err());
    assert!(matches!(f.entry().state, EntryState::Reserved));
    f.submit();
    let i = ix(
        accounts::CreatorEntry {
            creator: f.authority.pubkey(),
            campaign: f.campaign,
            entry: f.entry,
        },
        instruction::Review {
            decision: ReviewDecision::Approve,
            reason_hash: [0; 32],
        },
    );
    assert!(send(&mut f.svm, &f.authority, &[i], &[]).is_err());
    f.review(ReviewDecision::Reject);
    let i = f.tester_ix(instruction::Appeal {
        reason_hash: [4; 32],
    });
    send(&mut f.svm, &f.tester, &[i], &[]).unwrap();
    let i = f.resolve_ix(f.creator.pubkey(), true);
    assert!(send(&mut f.svm, &f.creator, &[i], &[]).is_err());
    let i = f.resolve_ix(f.authority.pubkey(), true);
    send(&mut f.svm, &f.authority, &[i], &[]).unwrap();
    let other_mint = Pubkey::new_unique();
    mint_account(&mut f.svm, other_mint, 6);
    for (index, wrong_account) in [
        (4, f.authority.pubkey()),
        (5, f.authority.pubkey()),
        (6, other_mint),
        (8, f.source),
        (9, f.source),
    ] {
        // Existing, valid accounts: failure must enforce identity/Mint/ATA
        // constraints, rather than merely reject missing account data.
        let mut i = f.settle_ix();
        i.accounts[index].pubkey = wrong_account;
        assert!(send(&mut f.svm, &f.creator, &[i], &[]).is_err());
        assert_eq!(f.balance(f.vault), REWARD + FEE);
        assert!(matches!(f.entry().state, EntryState::Approved));
    }
}

#[test]
fn settlement_second_transfer_failure_rolls_back_first_transfer() {
    let mut f = Fixture::new(1);
    f.reserve();
    f.submit();
    f.review(ReviewDecision::Approve);
    // Insufficient vault after reward CPI: no partial tester payout may survive.
    token_account(&mut f.svm, f.vault, f.mint, f.campaign, REWARD);
    let i = f.settle_ix();
    assert!(send(&mut f.svm, &f.creator, &[i], &[]).is_err());
    assert_eq!(f.balance(f.vault), REWARD);
    assert_eq!(
        f.balance(get_associated_token_address(&f.tester.pubkey(), &f.mint)),
        0
    );
    assert!(matches!(f.entry().state, EntryState::Approved));
    assert_eq!(f.campaign().paid, 0);
    assert_eq!(f.campaign().unsettled, 1);
}

#[test]
fn correction_is_limited_to_one_and_expired_reservations_release_a_place() {
    let mut f = Fixture::new(1);
    f.reserve();
    f.submit();
    f.review(ReviewDecision::Changes);
    f.submit();
    let i = f.review_ix(ReviewDecision::Changes, [3; 32]);
    custom(
        send(&mut f.svm, &f.creator, &[i], &[]),
        EscrowError::InvalidTransition,
    );
    assert!(matches!(f.entry().state, EntryState::Submitted));
    let mut f = Fixture::new(1);
    f.reserve();
    f.time(NOW + 3600);
    let i = f.tester_ix(instruction::Submit {
        report_hash: [2; 32],
    });
    custom(
        send(&mut f.svm, &f.tester, &[i], &[]),
        EscrowError::InvalidTransition,
    );
    let i = f.release_ix();
    send(&mut f.svm, &f.authority, &[i], &[]).unwrap();
    assert_eq!(f.campaign().occupied, 0);
    assert_eq!(f.campaign().unsettled, 0);
    let i = f.release_ix();
    custom(
        send(&mut f.svm, &f.authority, &[i], &[]),
        EscrowError::InvalidTransition,
    );
    let i = f.reserve_ix(f.tester.pubkey());
    assert!(send(&mut f.svm, &f.tester, &[i], &[]).is_err());
    let i = f.reserve_ix(f.authority.pubkey());
    send(&mut f.svm, &f.authority, &[i], &[]).unwrap();
}

#[test]
fn review_timeout_never_silently_releases_submitted_work() {
    let mut f = Fixture::new(1);
    f.reserve();
    f.submit();
    f.time(NOW + 72 * 3600);
    let i = f.review_ix(ReviewDecision::Approve, [0; 32]);
    custom(
        send(&mut f.svm, &f.creator, &[i], &[]),
        EscrowError::InvalidTransition,
    );
    let i = f.release_ix();
    custom(
        send(&mut f.svm, &f.creator, &[i], &[]),
        EscrowError::InvalidTransition,
    );
    let i = f.close_ix();
    send(&mut f.svm, &f.creator, &[i], &[]).unwrap();
    let i = f.refund_ix();
    custom(
        send(&mut f.svm, &f.creator, &[i], &[]),
        EscrowError::UnsettledEntries,
    );
    let i = f.tester_ix(instruction::Appeal {
        reason_hash: [4; 32],
    });
    send(&mut f.svm, &f.tester, &[i], &[]).unwrap();
    let i = f.resolve_ix(f.authority.pubkey(), false);
    send(&mut f.svm, &f.authority, &[i], &[]).unwrap();
    let i = f.refund_ix();
    send(&mut f.svm, &f.creator, &[i], &[]).unwrap();
    assert_eq!(f.balance(f.source), INITIAL);
}

#[test]
fn appeal_window_boundaries_and_voluntary_withdrawal_preserve_funds() {
    let mut f = Fixture::new(1);
    f.reserve();
    f.submit();
    f.review(ReviewDecision::Reject);
    f.time(NOW + 72 * 3600 - 1);
    let i = f.release_ix();
    custom(
        send(&mut f.svm, &f.creator, &[i], &[]),
        EscrowError::InvalidTransition,
    );
    f.time(NOW + 72 * 3600);
    let i = f.tester_ix(instruction::Appeal {
        reason_hash: [4; 32],
    });
    custom(
        send(&mut f.svm, &f.tester, &[i], &[]),
        EscrowError::InvalidTransition,
    );
    let i = f.release_ix();
    send(&mut f.svm, &f.authority, &[i], &[]).unwrap();
    assert_eq!(f.campaign().unsettled, 0);
    assert_eq!(f.balance(f.vault), REWARD + FEE);
    let mut f = Fixture::new(1);
    f.reserve();
    let i = f.tester_ix(instruction::Withdraw {});
    send(&mut f.svm, &f.tester, &[i], &[]).unwrap();
    let i = f.tester_ix(instruction::Withdraw {});
    custom(
        send(&mut f.svm, &f.tester, &[i], &[]),
        EscrowError::InvalidTransition,
    );
    assert_eq!(f.campaign().occupied, 0);
    assert_eq!(f.balance(f.vault), REWARD + FEE);
}

#[test]
fn deposit_and_refund_reject_wrong_mint_owner_and_forged_campaign() {
    let mut f = Fixture::uninitialized(6);
    let i = f.initialize(f.authority.pubkey());
    send(&mut f.svm, &f.authority, &[i], &[]).unwrap();
    let other_mint = Pubkey::new_unique();
    mint_account(&mut f.svm, other_mint, 6);
    let wrong_source = Pubkey::new_unique();
    token_account(
        &mut f.svm,
        wrong_source,
        other_mint,
        f.creator.pubkey(),
        INITIAL,
    );
    let mut i = f.create(REWARD, 1);
    i.accounts[4].pubkey = wrong_source;
    assert!(send(&mut f.svm, &f.creator, &[i], &[]).is_err());
    token_account(
        &mut f.svm,
        wrong_source,
        f.mint,
        f.authority.pubkey(),
        INITIAL,
    );
    let mut i = f.create(REWARD, 1);
    i.accounts[4].pubkey = wrong_source;
    assert!(send(&mut f.svm, &f.creator, &[i], &[]).is_err());
    let mut i = f.create(REWARD, 1);
    i.accounts[3].pubkey = Pubkey::new_unique();
    assert!(send(&mut f.svm, &f.creator, &[i], &[]).is_err());
    assert_eq!(f.balance(f.source), INITIAL);
    let i = f.create(REWARD, 1);
    send(&mut f.svm, &f.creator, &[i], &[]).unwrap();
    let i = f.refund_ix();
    custom(
        send(&mut f.svm, &f.creator, &[i], &[]),
        EscrowError::UnsettledEntries,
    );
    let i = f.close_ix();
    send(&mut f.svm, &f.creator, &[i], &[]).unwrap();
    let mut i = f.refund_ix();
    i.accounts[5].pubkey = wrong_source;
    assert!(send(&mut f.svm, &f.creator, &[i], &[]).is_err());
    let i = f.refund_ix();
    send(&mut f.svm, &f.creator, &[i], &[]).unwrap();
    assert_eq!(f.balance(f.source), INITIAL);
}

#[test]
fn empty_report_and_missing_decision_reasons_cannot_advance_state() {
    let mut f = Fixture::new(1);
    f.reserve();
    let i = f.tester_ix(instruction::Submit {
        report_hash: [0; 32],
    });
    custom(
        send(&mut f.svm, &f.tester, &[i], &[]),
        EscrowError::InvalidTransition,
    );
    assert!(matches!(f.entry().state, EntryState::Reserved));
    // Another signer cannot impersonate the real tester with an unsigned meta.
    let mut i = f.tester_ix(instruction::Submit {
        report_hash: [2; 32],
    });
    i.accounts[0].is_signer = false;
    assert!(send(&mut f.svm, &f.creator, &[i], &[]).is_err());
    f.submit();
    for decision in [ReviewDecision::Changes, ReviewDecision::Reject] {
        let i = f.review_ix(decision, [0; 32]);
        custom(
            send(&mut f.svm, &f.creator, &[i], &[]),
            EscrowError::InvalidTerms,
        );
        assert!(matches!(f.entry().state, EntryState::Submitted));
    }
    f.review(ReviewDecision::Reject);
    let i = f.tester_ix(instruction::Appeal {
        reason_hash: [0; 32],
    });
    custom(
        send(&mut f.svm, &f.tester, &[i], &[]),
        EscrowError::InvalidTransition,
    );
    assert!(matches!(f.entry().state, EntryState::Rejected));
}

#[test]
fn admission_rejects_out_of_bounds_terms_before_deposit() {
    let mut f = Fixture::uninitialized(6);
    let i = f.initialize(f.authority.pubkey());
    send(&mut f.svm, &f.authority, &[i], &[]).unwrap();
    for (reward, capacity, deadline, reservation_hours, rules_hash) in [
        (0, 1, NOW + 86400, 1, [1; 32]),
        (1, 0, NOW + 86400, 1, [1; 32]),
        (1, 1, NOW + 3599, 1, [1; 32]),
        (1, 1, NOW + 30 * 86400 + 1, 1, [1; 32]),
        (1, 1, NOW + 86400, 0, [1; 32]),
        (1, 1, NOW + 86400, 73, [1; 32]),
        (1, 1, NOW + 86400, 1, [0; 32]),
    ] {
        let mut i = f.create(reward, capacity);
        i.data = instruction::CreateCampaign {
            nonce: f.nonce,
            rules_hash,
            reward,
            capacity,
            deadline,
            reservation_hours,
        }
        .data();
        custom(
            send(&mut f.svm, &f.creator, &[i], &[]),
            EscrowError::InvalidTerms,
        );
        assert_eq!(f.balance(f.source), INITIAL);
        assert!(f.svm.get_account(&f.campaign).is_none());
        assert!(f.svm.get_account(&f.vault).is_none());
    }
}

#[test]
fn forged_existing_entry_and_wrong_close_refund_signers_are_rejected() {
    let mut f = Fixture::new(1);
    f.reserve();
    f.submit();
    let forged_entry = Pubkey::new_unique();
    // Valid escrow-owned bytes with the right campaign/tester, but wrong PDA.
    f.svm
        .set_account(forged_entry, f.svm.get_account(&f.entry).unwrap())
        .unwrap();
    let mut i = f.review_ix(ReviewDecision::Approve, [0; 32]);
    i.accounts[2].pubkey = forged_entry;
    assert!(send(&mut f.svm, &f.creator, &[i], &[]).is_err());
    assert!(matches!(f.entry().state, EntryState::Submitted));
    let mut i = f.close_ix();
    i.accounts[0].pubkey = f.authority.pubkey();
    assert!(send(&mut f.svm, &f.authority, &[i], &[]).is_err());
    assert!(!f.campaign().closed);
    let mut i = f.refund_ix();
    i.accounts[0].pubkey = f.authority.pubkey();
    assert!(send(&mut f.svm, &f.authority, &[i], &[]).is_err());
    assert_eq!(f.balance(f.vault), REWARD + FEE);
}
