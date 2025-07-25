// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {IDepositDEX} from "./IDepositDEX.sol";
import {IMarginCalc} from "./IMarginCalc.sol";
import {ISessionManager} from "./ISessionManager.sol";
import {IMarkPriceOracle} from "./IMarkPriceOracle.sol";

interface IStorageDEX {
  function getStorageSlot(uint256 storageSlot) external view returns (bytes32);
}
