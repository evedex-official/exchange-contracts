// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {IDepositDEX} from "./IDepositDEX.sol";
import {IMarginCalc} from "./IMarginCalc.sol";
import {ISessionManager} from "./ISessionManager.sol";

interface IStorageDEX {
  function sessionManager() external view returns (ISessionManager);

  function withdrawMarginLevel() external view returns (int256);
}
