// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {IDepositDEX} from "./IDepositDEX.sol";
import {IMarginCalc} from "./IMarginCalc.sol";
import {ISessionManager} from "./ISessionManager.sol";

interface IStorageDEX {
  function MATCHER_ROLE() external view returns (bytes32);

  function marginCalculator() external view returns (IMarginCalc);

  function depositDex() external view returns (IDepositDEX);

  function sessionManager() external view returns (ISessionManager);

  function staticFundingRateAccount() external view returns (address);

  function fundingRateAccount() external view returns (address);

  function soLevel() external view returns (int256);

  function withdrawMarginLevel() external view returns (int256);

  function liquidationFeePercent() external view returns (uint256);

  function instrumentsLength() external view returns (uint256);

  function maxOpenPositions() external view returns (uint256);

  function settledOrders(address account) external view returns (uint256 settledOrdersFortAccount);

  function filledAmounts(bytes32 orderHash) external view returns (uint256 orderAmount);
}
