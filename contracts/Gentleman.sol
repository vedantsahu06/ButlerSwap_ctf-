// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./Token.sol";

interface SwapCallback {
    function doSwap() external;
}

contract Gentleman {
    struct Pool { uint256 leftReserves; uint256 rightReserves; }
    struct SavedBalance { bool initiated; uint256 balance; }
    struct SwapState {
        bool hasBegun;
        uint256 unsettledTokens;
        mapping(address => int256) positions;
        mapping(address => SavedBalance) savedBalances;
    }

    address public admin;
    uint256 nonce = 0;
    mapping(address => bool) public allowedTokens;
    mapping(uint256 => SwapState) private swapStates;
    mapping(address => mapping(address => Pool)) private pools;
    address public permitSigner;

    constructor(address _permitSigner) {
        admin = msg.sender;
        permitSigner = _permitSigner;
    }

    function addToken(address token) public {
        require(msg.sender == admin, "not admin");
        allowedTokens[token] = true;
    }

    function getSwapState() internal view returns (SwapState storage) {
        return swapStates[nonce];
    }

    function addLiquidity(address left, address right, uint256 amountLeft, uint256 amountRight, bytes calldata permitSig) public {
        require(allowedTokens[left] && allowedTokens[right], "token not allowed");
        IToken(left).transferFrom(msg.sender, address(this), amountLeft);
        IToken(right).transferFrom(msg.sender, address(this), amountRight);
        
    }

    function swap() external {
        SwapState storage swapState = getSwapState();
        require(!swapState.hasBegun, "swap already in progress");
        swapState.hasBegun = true;
        SwapCallback(msg.sender).doSwap();
        nonce += 1;
    }

    function withdrawTokens(address[] calldata tokens, address to) public {
        SwapState storage swapState = getSwapState();
        require(swapState.hasBegun, "not in swap");
        for (uint256 i = 0; i < tokens.length; i++) {
            address tk = tokens[i];
            uint256 bal = IToken(tk).balanceOf(address(this));
            if (bal > 0) {
                IToken(tk).transfer(to, bal);
            }
        }
    }
}
