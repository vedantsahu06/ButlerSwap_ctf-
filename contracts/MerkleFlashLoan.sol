// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./Token.sol";

contract MerkleFlashLoan {
    bytes32 public merkleRoot;
    address public token;
    address public admin;

    constructor(bytes32 _root, address _token) {
        merkleRoot = _root;
        token = _token;
        admin = msg.sender;
    }

    function setRoot(bytes32 root) external {
        require(msg.sender == admin, "not admin");
        merkleRoot = root;
    }

    function flashLoan(uint256 amount, bytes32[] calldata proof) external {
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender));
        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 p = proof[i];
            if (computed < p) computed = keccak256(abi.encodePacked(computed, p));
            else computed = keccak256(abi.encodePacked(p, computed));
        }
        require(computed == merkleRoot, "invalid proof");

        uint256 balBefore = IToken(token).balanceOf(address(this));
        require(balBefore >= amount, "insufficient liquidity");
        IToken(token).transfer(msg.sender, amount);
        (bool ok,) = msg.sender.call(abi.encodeWithSignature("executeOnFlashLoan(uint256)", amount));
        require(ok, "callback failed");
        uint256 balAfter = IToken(token).balanceOf(address(this));
        require(balAfter >= balBefore, "not repaid");
    }
}
