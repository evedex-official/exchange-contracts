// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Mock is ERC20 {
  constructor() ERC20("ERC20Mock", "M") {}

  function mint(address account, uint256 value) public {
    _mint(account, value);
  }

  function burn(address account, uint256 value) public {
    _burn(account, value);
  }
}
