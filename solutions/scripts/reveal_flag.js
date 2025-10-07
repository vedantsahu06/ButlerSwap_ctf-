const fs = require('fs');
const { ethers } = require('ethers');
const path = require('path');


const argv = require('yargs/yargs')(process.argv.slice(2)).argv;
const rpc = argv.rpc || process.env.RPC_URL || 'http://127.0.0.1:8545';
const deployedPath = path.join(process.cwd(), 'deployed.json');
let setupAddr = argv.setup;
if (!setupAddr) {
  if (fs.existsSync(deployedPath)) {
    const d = JSON.parse(fs.readFileSync(deployedPath, 'utf8'));
    setupAddr = d.setup;
  }
}
if (!setupAddr) {
  console.error('No setup address provided and deployed.json not found.');
  process.exit(2);
}

const flagPath = path.join(__dirname, 'flag.json');
if (!fs.existsSync(flagPath)) {
  console.error('No solutions/scripts/flag.json found. Place organizer-only flag there.');
  process.exit(2);
}
const flagObj = JSON.parse(fs.readFileSync(flagPath, 'utf8'));
if (!flagObj.flag) {
  console.error('flag.json missing "flag" field');
  process.exit(2);
}

(async ()=>{
  const provider = new ethers.providers.JsonRpcProvider(rpc);
  const abi = ["function isSolved() public view returns (bool)"];
  const setup = new ethers.Contract(setupAddr, abi, provider);
  try {
    const solved = await setup.isSolved();
    console.log('isSolved =', solved);
    if (solved) {
      console.log('FLAG:', flagObj.flag);
    } else {
      console.log('Not solved yet; flag withheld.');
    }
  } catch (e) {
    console.error('Error calling isSolved():', e.message || e);
    process.exit(1);
  }
})();
