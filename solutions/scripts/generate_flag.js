// Organizer-only flag generator (moved from scripts/generate_flag.js)

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Generates a random salt and flag, prints targetHash and writes secret_salt.txt
function randHex(len) {
  return crypto.randomBytes(len).toString('hex');
}

const salt = randHex(8);
const phrase = ['you', 'found', randHex(4)].join('-');
const flag = `CTF{${phrase}}`;
const ethers = require('ethers');
const targetHash = ethers.keccak256(ethers.toUtf8Bytes(salt + flag));

console.log('salt:', salt);
console.log('flag:', flag);
console.log('targetHash:', targetHash);

// write secret salt file for the validator
const secretPath = path.join(__dirname, 'secret_salt.txt');
fs.writeFileSync(secretPath, salt, { encoding: 'utf8' });
console.log('Wrote secret salt to', secretPath);
console.log('Use targetHash and a short hint when deploying Setup: e.g. "salt starts with ' + salt.slice(0,4) + '"');
