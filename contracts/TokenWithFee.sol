// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./Token.sol";

contract TokenWithFee is IToken {
    uint256 public totalSupply;
    mapping(address => uint256) balances;
    mapping(address => mapping(address => uint256)) allowed;
    address public feeReceiver;
    uint256 public feeBasis; // 100 = 1%

    constructor(uint256 _initialAmount, address _feeReceiver, uint256 _feeBasis) {
        balances[msg.sender] = _initialAmount;
        totalSupply = _initialAmount;
        feeReceiver = _feeReceiver;
        feeBasis = _feeBasis;
    }

    function balanceOf(address _owner) public view override returns (uint256) {
        return balances[_owner];
    }

    function _takeFee(address from, uint256 amount) internal returns (uint256) {
        if (feeBasis == 0 || feeReceiver == address(0)) return amount;
        uint256 fee = (amount * feeBasis) / 10000;
        if (fee > 0) {
            balances[from] -= fee;
            balances[feeReceiver] += fee;
        }
        return amount - fee;
    }

    function transfer(address _to, uint256 _value) public override returns (bool) {
        require(balances[msg.sender] >= _value, "insufficient");
        uint256 net = _takeFee(msg.sender, _value);
        balances[msg.sender] -= net;
        balances[_to] += net;
        return true;
    }

    function transferFrom(address _from, address _to, uint256 _value) public override returns (bool) {
        require(allowed[_from][msg.sender] >= _value, "allowance");
        require(balances[_from] >= _value, "insufficient");
        uint256 net = _takeFee(_from, _value);
        balances[_from] -= net;
        balances[_to] += net;
        allowed[_from][msg.sender] -= _value;
        return true;
    }

    function approve(address _spender, uint256 _value) public override returns (bool) {
        allowed[msg.sender][_spender] = _value;
        return true;
    }
}
