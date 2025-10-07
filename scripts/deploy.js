// scripts/deploy.js
const hre = require("hardhat");
const { ethers } = hre;

async function main() {
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);

    
           const merkleRoot = "0x0000000000000000000000000000000000000000000000000000000000000000";

            const permitSigner = deployer.address;

    
    const Setup = await ethers.getContractFactory("Setup");
    const setup = await Setup.deploy(merkleRoot, permitSigner);

    
    if (typeof setup.waitForDeployment === 'function') {
        await setup.waitForDeployment();
    } else if (typeof setup.deployed === 'function') {
        
        await setup.deployed();
    } else if (setup.deployTransaction) {
        await setup.deployTransaction.wait();
    }

    const setupAddress = (typeof setup.getAddress === 'function') ? await setup.getAddress() : setup.address;
    const gentlemanAddr = (typeof setup.gentleman === 'function') ? await setup.gentleman() : ((typeof setup.target === 'function') ? await setup.target() : setup.target);
    const token1Addr = await setup.token1();
    const token2Addr = await setup.token2();
    const token3Addr = await setup.token3();
    const flashAddr = await setup.flashProvider();

    const out = {
        setup: setupAddress,
        gentleman: gentlemanAddr,
        token1: token1Addr,
        token2: token2Addr,
        token3: token3Addr,
        flashProvider: flashAddr
    };

    console.log("Deployed Setup at:", setupAddress);
    console.log("gentleman:", gentlemanAddr);
    console.log("token1:", token1Addr);
    console.log("token2:", token2Addr);
    console.log("token3:", token3Addr);
    console.log("flashProvider:", flashAddr);
    
    const fs = require('fs');
    fs.writeFileSync('deployed.json', JSON.stringify(out, null, 2));

    console.log('Deployed addresses written to deployed.json');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
