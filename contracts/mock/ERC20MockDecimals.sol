// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20MockDecimals is ERC20 {
  uint8 private _decimals;

  /**
   * @dev Constructor to initialize the token name, symbol, and decimals.
   * @param decimals_ The number of decimals for the token, defaults to 18.
   */
  constructor(uint8 decimals_) ERC20("ERC20MockDecimals", "M") {
    _decimals = decimals_;
  }

  /**
   * @dev Override the decimals function to return the value set in the constructor.
   */
  function decimals() public view virtual override returns (uint8) {
    return _decimals;
  }

  function mint(address account, uint256 value) public {
    _mint(account, value);
  }

  function burn(address account, uint256 value) public {
    _burn(account, value);
  }
}
