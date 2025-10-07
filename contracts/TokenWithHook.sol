// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./Token.sol";

interface IERC777Recipient {
    function tokensReceived(address operator, address from, address to, uint256 amount, bytes calldata userData, bytes calldata operatorData) external;
}

contract TokenWithHook is IToken {
    uint256 public totalSupply;
    mapping(address => uint256) balances;
    mapping(address => mapping(address => uint256)) allowed;

    constructor(uint256 _initialAmount) {
        balances[msg.sender] = _initialAmount;
        totalSupply = _initialAmount;
    }

    function balanceOf(address _owner) public view override returns (uint256) {
        return balances[_owner];
    }

    function _callHook(address operator, address from, address to, uint256 amount) internal {
        if (to.code.length > 0) {
            try IERC777Recipient(to).tokensReceived(operator, from, to, amount, "", "") {}
            catch {}
        }
    }

    function transfer(address _to, uint256 _value) public override returns (bool) {
        require(balances[msg.sender] >= _value, "insufficient");
        balances[msg.sender] -= _value;
        balances[_to] += _value;
        _callHook(msg.sender, msg.sender, _to, _value);
        return true;
    }

    function transferFrom(address _from, address _to, uint256 _value) public override returns (bool) {
        require(allowed[_from][msg.sender] >= _value, "allowance");
        require(balances[_from] >= _value, "insufficient");
        balances[_from] -= _value;
        balances[_to] += _value;
        allowed[_from][msg.sender] -= _value;
        _callHook(msg.sender, _from, _to, _value);
        return true;
    }

    function approve(address _spender, uint256 _value) public override returns (bool) {
        allowed[msg.sender][_spender] = _value;
        return true;
    }
}
