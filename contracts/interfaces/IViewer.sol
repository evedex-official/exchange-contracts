// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {PositionInfo} from "./IEVEDEX.sol";
import {Order} from "../lib/OrderValidationLib.sol";
import "../interfaces/IStorageDEX.sol";

struct InstrumentData {
  uint16 leverage; // Max available leverage
  string ticker; // Ticker of underlying asset
}

struct AccountPositions {
  address account;
  PositionInfo[] positions;
}

interface IViewer {
  function MATCHER_ROLE() external view returns (bytes32);

  function marginCalculator() external view returns (address);

  function depositDex() external view returns (address);

  function sessionManager() external view returns (address);

  function markPriceOracle() external view returns (address);

  function staticFundingRateAccount() external view returns (address);

  function fundingRateAccount() external view returns (address);

  function soLevel() external view returns (int256);

  function withdrawMarginLevel() external view returns (int256);

  function liquidationFeePercent() external view returns (int256);

  function instrumentsLength() external view returns (uint256);

  function maxOpenPositions() external view returns (uint256);

  function settledOrders(address account) external view returns (uint256);

  function totalOpenedOrders() external view returns (uint256);

  function totalSettledOrders() external view returns (uint256);

  // function liquidationDenominator()
  //     external
  //     view
  //     returns (LiquidationDenominator memory);

  // function liquidationStatuses(
  //     address account
  // ) external view returns (LiquidationStatus);

  // function liquidationPrices(
  //     address account,
  //     uint256 timestamp,
  //     uint256 instrumentIndex
  // ) external view returns (int256);

  function filledAmounts(uint256 orderId, address orderSender) external view returns (uint256);

  function filledSettlements(bytes32 settlementHash) external view returns (bytes32);

  function getInstrumentData(uint256 index) external view returns (InstrumentData memory);

  function getActiveInstrumentsIndices(address account) external view returns (uint256[] memory);

  function getActiveInstrumentsPositions(
    address account
  ) external view returns (uint256[] memory indices, PositionInfo[] memory positions);

  function getAccountWithOpenPositionsAt(uint256 index) external view returns (address);

  function getAccountsWithOpenPositionLength() external view returns (uint256);

  function getAccountsWithOpenPositions(uint256 offset, uint256 limit) external view returns (address[] memory res);

  function getOpenPositions(uint256 offset, uint256 limit) external view returns (AccountPositions[] memory positions);

  function getPositionInfo(uint256 index, address account) external view returns (PositionInfo memory position);

  function getOrderHash(Order calldata order) external pure returns (bytes32);
}
