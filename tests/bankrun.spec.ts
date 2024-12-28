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
import { VestingDapp, VestingDappIDL as IDL } from "../app";
import { createMint, getAccount, mintTo } from "spl-token-bankrun";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { TOKEN_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { assert, expect } from "chai";

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

    console.log("Vesting Account Tx:", tx);

    assert.equal(vestingAccountData.mint.toString(), mint.toString());
    expect(vestingAccountData.companyName).equal(companyName);
  });

  it("should fund the treasuryTokenAccount", async () => {
    const amount = 10_000 * LAMPORTS_PER_SOL;
    const mintTx = await mintTo(
      banksClient,
      employer,
      mint,
      treasuryTokenAccount,
      employer,
      amount,
    );

    const treasuryAccount = await getAccount(banksClient, treasuryTokenAccount);

    console.log("Treasury Account Tx: ", mintTx);
    assert.equal(Number(treasuryAccount.amount), amount);
  });

  it("should create employee vesting account", async () => {
    const startTime = new anchor.BN(0);
    const cliffTime = new anchor.BN(100);
    const endTime = new anchor.BN(200);
    const allotedAmount = new anchor.BN(1000);

    const tx2 = await program.methods.createEmployeeAccount(
      startTime,
      endTime,
      allotedAmount,
      cliffTime,
    ).accounts({
      beneficiary: beneficiary.publicKey,
      vestingAccount: vestingAccountKey,
    }).rpc({
      commitment: "confirmed",
      skipPreflight: true,
    });

    const employeeData = await program.account.employeeAccount.fetch(
      employeeAccount,
      "confirmed",
    );

    console.log("Employee vesitng account creation tx: ", tx2);
    expect(employeeData.startTime.toString()).to.equal(startTime.toString());
    expect(employeeData.cliffTime.toString()).to.equal(cliffTime.toString());
    expect(employeeData.endTime.toString()).to.equal(endTime.toString());
    expect(employeeData.beneficiary.toString()).to.equal(
      beneficiary.publicKey.toString(),
    );
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

    const beforeTreasuryBalance = await getAccount(
      banksClient,
      treasuryTokenAccount,
    );
    const beforeBalance = await program.account.employeeAccount.fetch(
      employeeAccount,
      "confirmed",
    );

    await beneficiaryProgram.methods.claimTokens(
      companyName,
    ).accounts({
      tokenProgram: TOKEN_PROGRAM_ID,
    }).rpc({
      commitment: "confirmed",
    });

    const afterTreasuryBalance = await getAccount(
      banksClient,
      treasuryTokenAccount,
    );

    const afterBalance = await program.account.employeeAccount.fetch(
      employeeAccount,
      "confirmed",
    );
    expect(Number(beforeBalance.totalWithdrawn)).to.be.equal(
      Number(0),
    );
    expect(Number(afterBalance.totalWithdrawn)).to.be.equal(
      Number(1000),
    );
    expect(Number(beforeTreasuryBalance.amount)).to.be.equal(
      Number(afterTreasuryBalance.amount) + Number(afterBalance.totalWithdrawn),
    );
  });
});
