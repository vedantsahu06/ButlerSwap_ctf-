// Simple validator service for CTFd
// Usage: node scripts/ctfd_validator.js --rpc <RPC_URL> --setup <SETUP_ADDRESS> --port <PORT>
// Exposes POST /validate { flag: 'CTF{...}' } and returns { valid: true|false, reason?: ... }

const express = require('express');
const bodyParser = require('body-parser');
const yargs = require('yargs');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const argv = yargs
  .option('rpc', { type: 'string', demandOption: true })
  .option('setup', { type: 'string', demandOption: true })
  .option('port', { type: 'number', default: 3001 })
  .help().argv;

const RPC_URL = argv.rpc;
const SETUP_ADDR = argv.setup;
const PORT = argv.port;

// load ABI from artifacts
const artifactPath = path.join(__dirname, '..', 'artifacts', 'contracts', 'Setup.sol', 'Setup.json');
if (!fs.existsSync(artifactPath)) {
  console.error('Cannot find artifact at', artifactPath);
  process.exit(1);
}
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const setupAbi = artifact.abi;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const setup = new ethers.Contract(SETUP_ADDR, setupAbi, provider);

// Validator operates purely on the on-chain isSolved() condition.
// Behavior:
// - If FLAG_PHRASE is set in env, the validator will return that phrase when solved.
// - Else if FLAG_SECRET is set, the validator computes a per-instance flag using
//   HMAC-SHA256(FLAG_SECRET, setupAddress) and returns CTF{hex}.
// - Otherwise the validator only returns valid:true when solved (no flag).
const flagPhrase = process.env.FLAG_PHRASE || null;
const flagSecret = process.env.FLAG_SECRET || null;
const crypto = require('crypto');

function computeFlag(setupAddr) {
  if (flagPhrase) return flagPhrase;
  if (!flagSecret) return null;
  const h = crypto.createHmac('sha256', flagSecret).update(setupAddr.toLowerCase()).digest('hex');
  return `CTF{${h}}`;
}

const app = express();
app.use(bodyParser.json());

function parseFlag(flag) {
  // Accept format CTF{...}
  const m = /^CTF\{(.+)\}$/.exec(flag);
  if (!m) return null;
  return m[1];
}

app.post('/validate', async (req, res) => {
  // Body format: { flag: 'flag{0x...}', rpc?: 'http://host:port', setup?: '0x...' }
  const { flag, rpc: bodyRpc, setup: bodySetup } = req.body || {};
  let flagInner = null;
  if (flag) {
    flagInner = parseFlag(flag);
    if (!flagInner) return res.status(400).json({ valid: false, reason: 'invalid flag format' });
  }

  // determine rpc and setup address to use for this validation
  const rpcToUse = bodyRpc || RPC_URL;
  const setupToUse = bodySetup || SETUP_ADDR;
  if (!rpcToUse || !setupToUse) return res.status(400).json({ valid: false, reason: 'no rpc or setup provided' });

  try {
    const provider = new ethers.JsonRpcProvider(rpcToUse);
    const setupContract = new ethers.Contract(setupToUse, setupAbi, provider);

    // If the on-chain isSolved condition is met, accept the submission (organizer chose isSolved flow)
    const solved = await setupContract.isSolved();
    if (solved) {
      return res.json({ valid: true });
    }

    return res.json({ valid: false, reason: 'challenge not solved on chain' });
  } catch (err) {
    console.error('validation error', err);
    return res.status(500).json({ valid: false, reason: 'internal error' });
  }
});

app.listen(PORT, () => {
  console.log(`ctfd-validator listening on http://localhost:${PORT}/validate`);
  console.log('RPC:', RPC_URL);
  console.log('Setup:', SETUP_ADDR);
});
