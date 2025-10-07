const fs = require('fs');
const hre = require('hardhat');

async function main(){
  const data = JSON.parse(fs.readFileSync('deployed.json','utf8'));
  const provider = hre.ethers.provider;
  const keys = ['setup','gentleman','token1','token2','token3','flashProvider'];
  for (const k of keys){
    const a = data[k];
    const code = await provider.getCode(a);
    console.log(k, a, code === '0x' ? 'no-code' : `${code.length} bytes`);
  }
}

main().catch(e=>{console.error(e); process.exit(1)});
