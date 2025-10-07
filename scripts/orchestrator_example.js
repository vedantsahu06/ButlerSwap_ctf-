// Very small example orchestrator to launch per-team containers using Docker CLI.
// Requires: docker available and the project built into an image named `butler-challenge`
// Usage: node scripts/orchestrator_example.js create TEAM_ID

const { execSync } = require('child_process');
const fs = require('fs');

const cmd = process.argv[2];
const team = process.argv[3] || 'team1';

if (cmd === 'create') {
  // choose a random host port (simple approach)
  const port = 30000 + Math.floor(Math.random() * 10000);
  console.log('Spawning container for', team, 'on host port', port);
  // run container detached, mount a tmp dir to read deployed.json
  const tmpdir = `/tmp/${team}-${Date.now()}`;
  fs.mkdirSync(tmpdir, { recursive: true });
  const run = `docker run -d -p ${port}:8545 -v ${tmpdir}:/opt/challenge/out --name ${team}-${Date.now()} butler-challenge`;
  console.log('Running:', run);
  const cid = execSync(run).toString().trim();
  console.log('container id', cid);
  // wait a little and try to copy /opt/challenge/deployed.json from container
  console.log('waiting 3s for deploy to finish...');
  execSync('sleep 3');
  try {
    // docker cp from container to tmpdir (find the file inside container)
    const cp = `docker cp ${cid}:/opt/challenge/deployed.json ${tmpdir}/deployed.json`;
    execSync(cp);
    const deployed = JSON.parse(fs.readFileSync(`${tmpdir}/deployed.json`, 'utf8'));
    console.log('deployed:', deployed);
    console.log('RPC:', `http://<host>:${port}`);
  } catch (e) {
    console.error('failed to read deployed.json yet, check container logs');
  }
} else {
  console.log('Usage: node scripts/orchestrator_example.js create TEAM_ID');
}
