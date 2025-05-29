// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {InstrumentInfo} from "../interfaces/IBaseDEX.sol";
import {PositionInfo} from "../interfaces/IEVEDEX.sol";
import "../interfaces/IStorageDEX.sol";

abstract contract StorageDEX is IStorageDEX {
  int72 internal constant _FR_PRECISION = 1e11;
  int256 internal constant _INT_1DAY = 1e8;
  int256 internal constant _INT_PRECISION = 1e8;
  int256 internal constant _COLLATERAL_PRECISION = 1e12;
  uint256 internal constant _UINT_COLLATERAL_PRECISION = 1e12;
  uint256 internal constant _UINT_PRECISION = 1e8;
  int256 internal constant _MARGIN_LEVEL_PRECISION = 1e2;
  uint256 internal constant _WITHDRAW_DELAY = 7 days;

  bytes32 public constant MATCHER_ROLE = keccak256("MATCHER_ROLE");

  IMarginCalc public marginCalculator;
  IDepositDEX public depositDex;
  ISessionManager public sessionManager;

  address public staticFundingRateAccount;
  address public fundingRateAccount;

  int256 public soLevel; // Minimal sufficient percent of margin at which a position can not be liquidated
  int256 public withdrawMarginLevel; // Minimal sufficient percent of margin after withdraw when account has open position
  uint256 public liquidationFeePercent; // Percent of margin for position which is taken as liquidation fee. 10**8 = 100%
  uint256 public instrumentsLength;
  uint256 public maxOpenPositions;
  uint256 public totalOpenedOrders;
  uint256 public totalSettledOrders;

  mapping(uint256 index => InstrumentInfo config) internal _instrumentInfo;
  mapping(address account => uint256 settledOrdersForAccount) public settledOrders;

  mapping(address account => EnumerableSet.UintSet instruments) internal _activeInstruments;

  EnumerableSet.AddressSet internal _accountsWithOpenPositions;
  mapping(uint256 instrumentIndex => mapping(address account => PositionInfo position)) internal _positionInfo;
  mapping(bytes32 orderHash => uint256 orderAmount) public filledAmounts;
  mapping(bytes32 settlementHash => bytes32 orderHash) public filledSettlements;

  uint256[50] private __gap;
}

/**
 *  struct PositionInfo {
 *  int112 position; // Signed position size (10^8 = 1 collateral token). position < 0 - short, position > 0 long
 *  int112 frAccumulated; // Accumulated funding rate from position start till positionLastUpdate
 *  uint32 positionLastUpdate; // Last time position was updated
 *  uint80 positionAvgPrice; // Average position price with 10**8 precision
 *  int72 positionLongFRStored; // longFRStored at positionLastUpdate
 *  int72 positionShortFRStored; // shortFRStored at positionLastUpdate
 *  uint16 leverage;
 *  }
 *
 *  struct FundingRateInfo {
 *    int72 longFRStored; // Accumulator for frLong
 *    int72 shortFRStored; // Accumulator for frShort
 *    int72 staticFr; // Static percentage of funding rate
 *    uint40 lastFRUpdateTime; // Last funding rate update time
 *  }

 *  struct InstrumentInfo {
 *    InstrumentData instrumentData;
 *    FundingRateInfo[] fundingRateData;
 *  }
 *
 *  struct InstrumentData {
 *    uint8 leverage; // Max available leverage
 *    string ticker; // Ticker of underlying asset
 *  }
 */
