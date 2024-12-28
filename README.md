# Token Vesting App:

***This program is built based on the Solana bootcamp***

Deployed Program ID: `8RBLvGLkXZkTXuA6WJhKTC1F7raEqfhBL69BkcaYTZL1` (Devnet)

### Features:
1. Employers can come and create there account.
 a. A treasury account is created which holds all the tokens sent to program
2. Employers then can mint there Tokens into the Treasury Account.
3. Employers then can add the Employee and specify information such as AllotedAmount, Start Time, End Time, and Cliff period.
4. Based on the information provided on Employee Account, the tokens can be vested from the treasury account by employee

### Code:
To use Smart Contract in your application:
```js
// Add the exports from app/ folder to your project fro types
import { IDL, VestingDapp } from "../app";
```
Then to use it in your react example:
```js
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Program, AnchorProvider } from '@coral-xyz/anchor';

function YourComponent() {
  const { connection } = useConnection();
  const wallet = useWallet();
  
  const provider = new AnchorProvider(
    connection, 
    wallet,
    AnchorProvider.defaultOptions()
  );

  const program = new Program<VestingDapp>(
    IDL,
    "8RBLvGLkXZkTXuA6WJhKTC1F7raEqfhBL69BkcaYTZL1", // PROGRAM ID mentioned in top section for DevNet
    provider
  );
}
```
To add employee account, call the method
```js
import { TOKEN_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
// CompanyName: string | is the name of the company for whcih this account is created
// employer: KeyPair | credentials of the employer
// mint: PublicKey | It is the publicKey of the mint to verify the tokens recieved are from correct mint
await program.methods.createVestingAccount(companyName).accounts(
  {
    signer: employer.publicKey,
    mint,
    tokenProgram: TOKEN_PROGRAM_ID,
  },
).rpc({
  commitment: "confirmed",
});
```

Then mint tokens in the treasury of the account
```js
// treasuryTokenAccount: PublicKey | PublicKey of the treasury token account

[treasuryTokenAccount] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("vesting_treasury"),
    Buffer.from(companyName),
  ],
  program.programId,
);
// Mint tokens into the the treasury token account using the treasuryTokenAccount publicKey
```
then add employees to the program for vesring;
```js
[vestingAccountKey] = PublicKey.findProgramAddressSync([
  Buffer.from(companyName),
], program.programId);

await program.methods.createEmployeeAccount(
  startTime,
  endTime,
  allotedAmount,
  cliffTime,
).accounts({
  beneficiary: employeePublicKey,
  vestingAccount: vestingAccountKey,
}).rpc({
  commitment: "confirmed",
});
```

To vest tokens in the employee account:
```js
await program.methods.claimTokens(
  companyName,
).accounts({
  tokenProgram: TOKEN_PROGRAM_ID,
}).rpc({
  commitment: "confirmed",
});
```
