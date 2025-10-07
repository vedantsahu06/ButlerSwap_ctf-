Buttler CTF - How to play

This file explains what participants need to do to solve the challenge and submit the flag.

1) Obtain your instance RPC and Setup address
- The platform will provide an RPC URL and a Setup contract address for your team (or a single shared address for public instances).

2) Clone the repo (optional starter code)
```
git clone <repo-url>
cd Buttler-CTF
npm install
```

3) Run the exploit or craft your own
- Use the provided `test/exploit.test.js` as a reference. Connect an ethers provider to the given RPC and send transactions that cause `Setup.isSolved()` to return `true`.

4) Submit the flag
- Once `Setup.isSolved()` returns true on your instance, the validator will accept your submission.
- Flag format: the validator will return a flag automatically if the instance is solved. If the organizer provided a `FLAG_SECRET` the flag has the form `CTF{hex...}` where the hex is an HMAC-SHA256 of the setup address using the secret.

5) Help and rules
- Do not share your instance RPC with other teams.
- Report issues to organizers.
