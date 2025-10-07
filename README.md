# Butler CTF — Participant & Admin Guide

This repository contains a CTF challenge (Butler) built with Solidity and Hardhat. Below are concise instructions for both participants (players) and admins (organizers) on how to run, solve, deploy, and validate the challenge.

## For Participants (Players)

- Objective: trigger the on-chain win condition (drain the `Gentleman` target's token balances). Once the target's three token balances are zero, the challenge is considered solved on-chain.
- Tools you'll need:
  - Node.js (16+), npm/yarn
  - Hardhat (the repo includes the config)

Quick local run (recommended for learning / testing against the challenge locally):

1. Install dependencies

```powershell
npm install
```

2. Run the tests (this spins up a Hardhat node and runs scripted interactions)

```powershell
npx hardhat test --show-stack-traces
```

3. Start a local Hardhat node and interact manually (advanced)

```powershell
npx hardhat node
# then in another terminal, run scripts or a console (not included) to interact
```

Notes for participants
- The challenge has three tokens and uses a `Gentleman` contract; your task is to exploit or interact with the contracts to reduce the `Gentleman`'s token balances to zero.
- The challenge no longer uses any secret salt on-chain — the authoritative win is `Setup.isSolved()`.
- To submit on a CTF platform, the platform's validator will query the chain and check `isSolved()` for the deployed instance.

## For Admins (Organizers)

This section explains how to prepare and deploy the challenge, and how to run the validator for automatic scoring.

1) Prepare the environment

```powershell
npm install
# Create a .env file (this file should NEVER be committed)
# Example .env contents:
# FLAG_PHRASE=CTF{...}
```

2) Deploy the challenge locally (or to a testnet)

- The `Setup` constructor now takes two parameters: `merkleRoot` and `permitSigner`.
- Example (local Hardhat network):

```powershell
# start a local node in one terminal
npx hardhat node

# in another terminal deploy (uses the first available signer)
node scripts/deploy.js
```

Note: The repo previously supported a salt+hash scheme; that flow was removed. If you prefer to reintroduce hash-based flag verification, keep a private salt and compute targetHash locally, or contact the maintainer to restore the generator in an organizer-only area.

3) Validator (CTFd integration)

- A simple validator is provided at `scripts/ctfd_validator.js`.
- It checks the on-chain `isSolved()` view and returns `{ valid: true }` when the challenge is solved.
- Optionally, you can set `FLAG_PHRASE` in `.env` on the validator host to have the validator include the flag in responses (only recommended for closed/private setups).

Example validator run (replace RPC and SETUP address):

```powershell
node scripts/ctfd_validator.js --rpc http://127.0.0.1:8545 --setup 0xYourSetupAddress --port 3001
```

The validator exposes a POST /validate endpoint that CTFd can call. It will respond with `{ valid: true }` if `isSolved()` returns true for the provided `setup` address.

4) Secrets & distribution

- Do NOT commit `.env` or any secret files. Keep them on the validator/organizer machine only.
- For participant distribution, produce a sanitized release that excludes `scripts/generate_flag.js` (if you keep it), any secret files, and `.env`.

## Security & hardening notes

- The validator script is intentionally minimal for demonstration. For production use, add:
  - Authentication (API key) so random callers can't query and leak the flag
  - Rate limiting and HTTPS
  - Proper error handling and logging

## Where to look in the code
- `contracts/Setup.sol` — challenge anchor and `isSolved()` check
- `contracts/Gentleman.sol` — main contract participants will interact with
- `scripts/deploy.js` — deploy script
- `scripts/ctfd_validator.js` — simple validator service
- `test/exploit.test.js` — example test that simulates draining the target for verification

If you want, I can create a small `release/` script that packages only the participant-facing files into a zip. Want me to do that? 
(Buttler CTF challenge - minimal repo)

Owner deployment & validator
---------------------------

This section explains how the challenge owner should generate the flag, deploy the `Setup` contract with the corresponding `targetHash`, and run the validator service.

1) Generate a salt + flag locally (recommended)

	node scripts/generate_flag.js

	- Prints a randomly generated salt and flag (CTF{...}) and the computed targetHash.
	- Writes `scripts/secret_salt.txt` with the salt. Keep this file private and do not commit it.

2) Deploy the challenge

	Preferred approach: set environment variables and run deploy script (avoids writing secrets to disk):

	PowerShell example:

		 $env:SECRET_SALT = 'your-secret-salt'
		 $env:FLAG_PHRASE = 'CTF{your-real-flag}'
		 node scripts/deploy.js

	Or, if you used `generate_flag.js`, ensure `scripts/secret_salt.txt` exists and then run:

		 node scripts/deploy.js

	- `deploy.js` computes keccak256(salt + flag) and deploys `Setup` with `targetHash` and a short `saltHint`.
	- Keep `deployed.json` and any local keys off the public repo.

3) Start the validator service (server-side)

	- Place the same secret salt on the machine running the validator as `scripts/secret_salt.txt` or set `SECRET_SALT` env var.
	- Start the validator (this exposes POST /validate):

		 node scripts/ctfd_validator.js --rpc <RPC_URL> --setup <SETUP_ADDRESS>

	- The validator expects POST body { flag: 'CTF{...}' } and will call `Setup.verify(secretSalt, candidate)` on-chain.

4) Public info for contestants

	- Provide the `Setup` contract address and the `saltHint` (a short hint) and any challenge instructions.

Security notes

 - Never commit `scripts/secret_salt.txt` or `.env` to source control. `.gitignore` already contains these entries.
 - The validator must be secured: limit requests, require authentication from the CTF platform, and store secrets safely.

Testing locally

 - Run tests: `npx hardhat test` (the repo includes a unit test verifying the `verify()` logic).

Cleanup / publishing

 - We moved orchestration/docker files to `deprecated/removed-for-cleanup/` during cleanup. Remove this folder before publishing if you want a minimal public release.

