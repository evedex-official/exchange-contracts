// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {InstrumentInfo} from "../interfaces/IBaseDEX.sol";
import {PositionInfo} from "../interfaces/IEVEDEX.sol";
import "../interfaces/IStorageDEX.sol";

abstract contract StorageDEX is IStorageDEX {
  int256 internal constant _FR_PRECISION = 1e11;
  int256 internal constant _INT_1DAY = 1e8;
  int112 internal constant _INT_PRECISION = 1e8;
  uint112 internal constant _UINT_PRECISION = 1e8;
  int112 internal constant _MARGIN_LEVEL_PRECISION = 1e2;
  uint256 internal constant _WITHDRAW_DELAY = 7 days;

  bytes32 public constant MATCHER_ROLE = keccak256("MATCHER_ROLE");
  bytes32 public constant WITHDRAW_GUARDIAN_ROLE = keccak256("WITHDRAW_GUARDIAN_ROLE");

  address public fundingRateAccount;
  address public sessionManager;
  address public depositDex;
  address public marginCalculator;

  int112 public soLevel; // Minimal sufficient percent of margin at which a position can not be liquidated
  int112 public withdrawMarginLevel; // Minimal sufficient percent of margin after withdraw when account has open position
  uint256 public liquidationFeePercent; // Percent of margin for position which is taken as liquidation fee. 10**8 = 100%
  uint256 public instrumentsLength;
  uint256 public maxOpenPositions;

  mapping(uint256 index => InstrumentInfo config) internal _instrumentInfo;
  mapping(address account => uint256 settledOrdersFortAccount) public settledOrders;

  mapping(address account => EnumerableSet.UintSet instruments) internal _activeInstruments;

  EnumerableSet.AddressSet internal _accountsWithOpenPositions;
  mapping(uint256 instrumentIndex => mapping(address account => PositionInfo position)) internal _positionInfo;
  mapping(bytes32 orderHash => uint96 orderAmount) public filledAmounts;

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
 *    int40 frLong; // Funding rate for long position - percentage of position per second. frLong = 10**11 => 100% per second
 *    int40 frShort; // Funding rate for short position - percentage of position per second. frShort = 10**11 => 100% per second
 *    int72 longFRStored; // Accumulator for frLong
 *    int72 shortFRStored; // Accumulator for frShort
 *    uint32 lastFRUpdateTime; // Last funding rate update time
 *  }

 *  struct InstrumentInfo {
 *    InstrumentData instrumentData;
 *    FundingRateInfo[] fundingRateData;
 *  }
 *
 *  struct InstrumentData {
 *    uint8 leverage; // Max available leverage
 *    string[12] ticker; // Ticker of underlying asset
 *  }
 *
 *  struct WithdrawRequest {
 *    uint64 timestamp;
 *    RequestStatus status;
 *  }
 */
