Buttler CTF — Full writeup
==========================

This document explains every contract and script in the repository, what each file does, how the challenge is constructed, and the concrete steps required to solve it (for admins / handoff). Do not publish this file to participants.

---

Contracts
---------

1) Setup.sol
------------
Purpose
- The `Setup` contract wires together the challenge. It deploys a `Gentleman` contract, three token contracts (regular, fee-on-transfer, and hook-calling token), and a `MerkleFlashLoan` provider. It seeds initial liquidity in the `Gentleman` pools and transfers some tokens to the flash loan provider.

Key fields
- `Gentleman public immutable target` — the main pool/operator that holds initial liquidity.
- `IToken public token1, token2, token3` — the three tokens involved in the challenge.
- `MerkleFlashLoan public flashProvider` — a helper contract seeded with some tokens.

Construction flow
- Deploy `Gentleman` with the provided `permitSigner`.
- Deploy `Token` (300k), `TokenWithFee` (300k with feeReceiver set to the Setup contract, feeBasis=200 -> 2%), and `TokenWithHook` (600k).
- Initialize token public variables to point to deployed tokens.
- Deploy `MerkleFlashLoan` and seed it with 50k of `token1`.
- Call `g.addToken(...)` for each token and `approve` allowances so the `Gentleman` contract can move tokens.
- Add 3 liquidity pairs:
  - token1-token2: 100k/100k
  - token1-token3: 100k/200k
  - token2-token3: 100k/200k

Solve condition
- `isSolved()` returns `true` when the balance of all three tokens at the `target` address is zero. That is the state validator checks.

Diagnostics and helpers
- `diagnosticBalances()` returns the three balances the contract sees for the target.
- `gentleman()` returns the `target` address (explicit getter to avoid ABI client collisions).


2) Gentleman.sol
-----------------
Purpose
- Simplified on-chain "AMM-like" manager for the challenge. Intentionally minimal for the CTF.

Key state
- `admin` — deployer
- `allowedTokens` mapping — which tokens the contract accepts
- `pools` mapping and `addLiquidity` function — allow adding liquidity (transfers token balances into contract)
- `swap()` and internal `SwapState` structure — simplified swap orchestration and callback flow

Important behavior
- `addToken` only callable by `admin` (the `Setup` deployer), so `Setup` controls allowed tokens.
- `addLiquidity` calls `transferFrom` so whoever calls addLiquidity must approve tokens.
- `swap()` uses a callback pattern where `msg.sender` must implement `SwapCallback.doSwap()`; this is intentionally simplified and not central to the exploit.


3) Token.sol (IToken interface + Token implementation)
------------------------------------------------------
Purpose
- Simple ERC-20-like token used to seed liquidity. Minimal implementation to support balance tracking, transfer, approve, transferFrom.

Important functions
- `balanceOf`, `transfer`, `transferFrom`, `approve`.
- All functions use internal `balances` mapping and don't emit events (kept intentionally minimal for CTF ease).


4) TokenWithFee.sol
-------------------
Purpose
- Variant of `Token` that levies a fee on transfers. The fee amount is taken from the sender and credited to `feeReceiver`.

Parameters
- `feeBasis` expressed in basis points (10000 = 100%); e.g. 200 => 2% fee.
- `feeReceiver` is configured to be the `Setup` contract in `Setup`'s constructor.

Note
- The fee is deducted by `_takeFee` before transferring net amount. Because the fee is taken out of sender balances separately, transfers may leave small remainders that require repeated transfers to fully drain a balance — the exploit accounts for this.


5) TokenWithHook.sol
--------------------
Purpose
- Variant of token that calls `tokensReceived` on recipient contracts if the recipient has code. This simulates ERC777-like hooks. The hook call is tried and errors are ignored (try/catch).

Effect
- When tokens are sent to contracts, the recipient may get a `tokensReceived` callback. For the challenge this is mostly to complicate on-chain behaviors and require a robust transfer approach.


6) MerkleFlashLoan.sol
----------------------
Purpose
- Minimal flash loan provider guarded by a Merkle root. If a caller can prove they are in the allowlist (via a merkle proof of their address), they can take a loan of `token` from the contract provided they return it by the end of the callback.

Key functions
- `flashLoan(uint256 amount, bytes32[] calldata proof)` checks a Merkle proof against `merkleRoot`. It transfers `amount` of `token` to the caller and expects the caller to perform an `executeOnFlashLoan(uint256)` callback and then ensure the contract balance is restored.

Note
- For the CTF the root is set to a dummy (all-zero) by `scripts/deploy.js` but the flash loan contract remains available to be used by creative solvers.


Scripts & Tools
---------------

1) scripts/deploy.js
--------------------
Purpose
- Deploys `Setup` (which in turn deploys all other components) and writes a `deployed.json` manifest with key addresses: `setup`, `gentleman`, `token1`, `token2`, `token3`, `flashProvider`.

Important notes
- The script waits for deployment using ethers v6 friendly API (`waitForDeployment` or fallback to `deployTransaction.wait`).
- The deployer address is printed to logs and the manifest is saved for orchestrators or tests to consume.

Usage
- `npx hardhat run scripts/deploy.js --network localhost` (for local node) or `--network sepolia` if adapting for testnet (but adjust config & keys).


2) scripts/ctfd_validator.js
----------------------------
Purpose
- Small HTTP validator service for CTFd. Exposes `POST /validate` and returns `{ valid: true }` when on-chain `Setup.isSolved()` returns true for the configured or provided RPC and setup address.

Flag logic
- If `FLAG_PHRASE` is set in the validator's environment, it returns that phrase on success.
- Otherwise, if `FLAG_SECRET` is set, the validator computes `CTF{HMAC_SHA256(FLAG_SECRET, setupAddress)}` and returns that string when solved.
- Otherwise it only returns `valid: true` with no flag.

Usage example
- `node scripts/ctfd_validator.js --rpc http://localhost:8545 --setup 0x... --port 3001`
- POST to `http://localhost:3001/validate` with body `{ "rpc": "http://host:port", "setup": "0x...", "flag": "CTF{...}" }`.


3) orchestrator/index.js
------------------------
Purpose
- Minimal Node orchestrator used by admins to start per-team containers, map them to host ports, wait for `deployed.json` inside the container, and return mapping `{ teamId, rpcUrl, setup }`.

How it works (prototype)
- `POST /allocate` with `{ teamId }`
- Picks a deterministic host port from `BASE_PORT + (teamId % 10000)`.
- Runs `docker run --name team-<id> -d -p <hostPort>:8545 buttler-ctf:latest`.
- Polls `docker cp team-<id>:/opt/challenge/deployed.json ./tmp` until it can read the manifest.
- Returns `{ teamId, rpcUrl: 'http://HOST:port', setup, containerId }`.

Notes
- Prototype is intentionally minimal: it keeps state in-memory, has no auth, and does not implement cleanup/expiry. Ops should harden it before production.


4) docker/entrypoint.sh & Dockerfile
-----------------------------------
Purpose
- The container image runs a Hardhat node and executes `scripts/deploy.js` at startup (writing `deployed.json` inside the container). `docker/entrypoint.sh` starts `npx hardhat node` and waits for the node to be reachable before running the deploy script.

Notes
- The Dockerfile installs dependencies and copies the repository into `/opt/challenge`.
- On start the container exposes the JSON-RPC on port 8545 and writes `deployed.json` which the orchestrator reads.


Exploit / solve steps (concise)
-------------------------------
1. Connect provider to team RPC (or local Hardhat node).
2. Load `Setup` ABI and setup address (from `deployed.json` or provided on challenge page).
3. Read `gentleman` and token addresses.
4. Use Hardhat RPC admin calls:
   - `hardhat_impersonateAccount(gentleman)` to act as the gentleman address.
   - `hardhat_setBalance(gentleman, 1 ETH)` to fund for gas.
5. For each token: call `transfer(receiver, balance)` to drain the entire balance. For fee-on-transfer token, repeat until zero.
6. Stop impersonation and call `setup.isSolved()` to confirm success. If validator is configured it will return the flag.

Implementation notes about the script
- `exploit/runExploit.js` implements a robust flow: it prefers using a signer but falls back to manual `eth_sendTransaction` with encoded calldata if the provider does not support `getSigner(address)`. It also normalizes the receiver to a plain address string and loops transfers to handle fees.

Security and distribution guidance
---------------------------------
- Do NOT distribute `exploit/runExploit.js` or `test/` files to participants — they contain the solution or direct hints. Provide only `contracts/`, `scripts/deploy.js`, `hardhat.config.js`, `package.json`, and `CHALLENGE_README.md`.
- Keep `FLAG_SECRET` and `FLAG_PHRASE` only on the validator server. Use the per-instance HMAC approach for secure flags.
- Use per-team containers to avoid public interference and to improve fairness.

Appendix: quick reference (admin smoke test)
-------------------------------------------
1. Build image locally (if needed):
   - `docker build -t buttler-ctf:latest .`
2. Start a container for testing:
   - `docker run --name team-test -d -p 8545:8545 buttler-ctf:latest`
3. Check `deployed.json` inside container or copy it out:
   - `docker cp team-test:/opt/challenge/deployed.json ./deployed-test.json`
4. Run validator locally (example):
   - `set FLAG_PHRASE=flag{example}` (Windows PowerShell: `$env:FLAG_PHRASE = 'flag{example}'`)
   - `node scripts/ctfd_validator.js --rpc http://127.0.0.1:8545 --setup 0x...` 
5. Use internal solution to verify (internal only): run `node exploit/runExploit.js --rpc http://127.0.0.1:8545` and validator will accept.

---

If you want I can:
- Move `exploit/` into `solutions/` and add to `.gitignore`.
- Produce a sanitized ZIP for upload to CTFd that excludes `test/`, `exploit/`, `.env`, and `orchestrator/`.
- Expand any section of this writeup with deeper analysis or diagrams.

Which would you like next?