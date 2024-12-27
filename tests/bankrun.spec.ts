import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SYSTEM_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/native/system";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { BankrunProvider } from "anchor-bankrun";
import {
  BanksClient,
  Clock,
  ProgramTestContext,
  startAnchor,
} from "solana-bankrun";
import IDL from "../target/idl/vesting_dapp.json";
import { VestingDapp } from "../target/types/vesting_dapp";
import { createMint, mintTo } from "spl-token-bankrun";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { TOKEN_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";

describe("Vesting Smart Contract Tests", () => {
  const companyName = "Company Name";

  let beneficiary: Keypair;
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<VestingDapp>;
  let banksClient: BanksClient;
  let employer: Keypair;
  let mint: PublicKey;
  let beneficiaryProvider: BankrunProvider;
  let beneficiaryProgram: Program<VestingDapp>;
  let vestingAccountKey: PublicKey;
  let treasuryTokenAccount: PublicKey;
  let employeeAccount: PublicKey;

  before(async () => {
    beneficiary = new anchor.web3.Keypair();

    context = await startAnchor(
      "",
      [
        {
          name: IDL.metadata.name,
          programId: new PublicKey(IDL.address),
        },
      ],
      [
        {
          address: beneficiary.publicKey,
          info: {
            lamports: LAMPORTS_PER_SOL,
            data: Buffer.alloc(0),
            owner: SYSTEM_PROGRAM_ID,
            executable: false,
          },
        },
      ],
    );

    provider = new BankrunProvider(context);

    anchor.setProvider(provider);

    program = new Program<VestingDapp>(IDL as VestingDapp);

    banksClient = context.banksClient;

    employer = provider.wallet.payer;

    mint = await createMint(
      banksClient,
      employer,
      employer.publicKey,
      null,
      2,
    );

    beneficiaryProvider = new BankrunProvider(context);

    beneficiaryProvider.wallet = new NodeWallet(beneficiary);

    beneficiaryProgram = new Program<VestingDapp>(
      IDL as VestingDapp,
      beneficiaryProvider,
    );

    [vestingAccountKey] = PublicKey.findProgramAddressSync([
      Buffer.from(companyName),
    ], program.programId);

    [treasuryTokenAccount] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vesting_treasury"),
        Buffer.from(companyName),
      ],
      program.programId,
    );

    [employeeAccount] = PublicKey.findProgramAddressSync([
      Buffer.from("employee_vesting"),
      beneficiary.publicKey.toBuffer(),
      vestingAccountKey.toBuffer(),
    ], program.programId);
  });

  it("should create a vesting account", async () => {
    const tx = await program.methods.createVestingAccount(companyName).accounts(
      {
        signer: employer.publicKey,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    ).rpc({
      commitment: "confirmed",
    });

    const vestingAccountData = await program.account.vestingAccount.fetch(
      vestingAccountKey,
      "confirmed",
    );

    console.log("Creates vesting Account: ", tx);
    console.log(vestingAccountData);
  });

  it("should fund teh treasuryTokenAccount", async () => {
    const amount = 10_000 * LAMPORTS_PER_SOL;
    const mintTx = await mintTo(
      banksClient,
      employer,
      mint,
      treasuryTokenAccount,
      employer,
      amount,
    );

    console.log("Mint treasury token account:", mintTx);
  });

  it("should create employee vesting account", async () => {
    const tx2 = await program.methods.createEmployeeAccount(
      new anchor.BN(0),
      new anchor.BN(100),
      new anchor.BN(200),
      new anchor.BN(0),
    ).accounts({
      beneficiary: beneficiary.publicKey,
      vestingAccount: vestingAccountKey,
    }).rpc({
      commitment: "confirmed",
      skipPreflight: true,
    });

    console.log("Create employee vesting account:", tx2);
    console.log("Employee account:", employeeAccount.toBase58());
  });

  it("should claim tokens", async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const currentClock = await banksClient.getClock();
    context.setClock(
      new Clock(
        currentClock.slot,
        currentClock.epochStartTimestamp,
        currentClock.epoch,
        currentClock.leaderScheduleEpoch,
        BigInt(1000),
      ),
    );

    console.log("Employee account: ", employeeAccount.toBase58());

    const tx3 = await beneficiaryProgram.methods.claimTokens(
      companyName,
    ).accounts({
      tokenProgram: TOKEN_PROGRAM_ID,
    }).rpc({
      commitment: "confirmed",
    });

    console.log("Claim tokens: ", tx3);
  });
});
