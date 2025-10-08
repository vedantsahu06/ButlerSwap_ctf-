// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./Token.sol";
import "./TokenWithFee.sol";
import "./TokenWithHook.sol";
import "./MerkleFlashLoan.sol";
import "./Gentleman.sol";

contract Setup {
    Gentleman public immutable target;
    IToken public token1;
    IToken public token2;
    IToken public token3;
    MerkleFlashLoan public flashProvider;
    string private flag;

    constructor(bytes32 merkleRoot, address permitSigner, string memory flag_) {
        Gentleman g = new Gentleman(permitSigner);
        target = g;
        flag = flag_;

        Token t1 = new Token(300_000);
        TokenWithFee t2 = new TokenWithFee(300_000, address(this), 200);
        TokenWithHook t3 = new TokenWithHook(600_000);

        token1 = IToken(address(t1));
        token2 = IToken(address(t2));
        token3 = IToken(address(t3));

        flashProvider = new MerkleFlashLoan(merkleRoot, address(token1));

        g.addToken(address(token1));
        g.addToken(address(token2));
        g.addToken(address(token3));

        t1.approve(address(g), 300_000);
        t2.approve(address(g), 300_000);
        t3.approve(address(g), 600_000);

        g.addLiquidity(address(token1), address(token2), 100_000, 100_000, "");
        g.addLiquidity(address(token1), address(token3), 100_000, 200_000, "");
        g.addLiquidity(address(token2), address(token3), 100_000, 200_000, "");

        t1.transfer(address(flashProvider), 50_000);
    }

    function isSolved() public view returns (bool) {
        return (
            IToken(token1).balanceOf(address(target)) == 0 &&
            IToken(token2).balanceOf(address(target)) == 0 &&
            IToken(token3).balanceOf(address(target)) == 0
        );
    }


    function getFlag() public view returns (string memory) {
        require(isSolved(), "not solved");
        return flag;
    }

    // Diagnostic: return the three balances the contract sees for the target
    function diagnosticBalances() public view returns (uint256, uint256, uint256) {
        return (
            IToken(token1).balanceOf(address(target)),
            IToken(token2).balanceOf(address(target)),
            IToken(token3).balanceOf(address(target))
        );
    }

    // explicit getter to avoid name collisions in client libraries
    function gentleman() public view returns (address) {
        return address(target);
    }
}
