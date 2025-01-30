// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

interface IStorageDEX {
  function sessionManager() external view returns (address);

  function withdrawMarginLevel() external view returns (int256);
}
