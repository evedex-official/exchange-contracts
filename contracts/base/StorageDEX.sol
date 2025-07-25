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
  int256 internal constant _INT_COLLATERAL_PRECISION = 1e12;
  uint256 internal constant _UINT_PRECISION = 1e8;
  int256 internal constant _MARGIN_LEVEL_PRECISION = 1e2;
  uint256 internal constant _WITHDRAW_DELAY = 7 days;

  bytes32 internal constant _MATCHER_ROLE = keccak256("MATCHER_ROLE");

  IMarginCalc internal _marginCalculator;
  IDepositDEX internal _depositDex;
  ISessionManager internal _sessionManager;
  IMarkPriceOracle internal _markPriceOracle;

  address internal _staticFundingRateAccount;
  address internal _fundingRateAccount;

  int256 internal _soLevel; // Minimal sufficient percent of margin at which a position can not be liquidated
  int256 internal _withdrawMarginLevel; // Minimal sufficient percent of margin after withdraw when account has open position
  int256 internal _liquidationFeePercent; // Percent of margin for position which is taken as liquidation fee. 10**8 = 100%
  int256 internal _allowedOverloadTPSL; // Percent of active position that is allowed to be reverted in side with TPSL closing. 10**8 = 100%.
  uint256 internal _instrumentsLength;
  uint256 internal _maxOpenPositions;
  uint256 internal _totalOpenedOrders;
  uint256 internal _totalSettledOrders;
  uint256 internal _maxMatcherFee; // Immutable, can't be modified without implementation change

  bytes32 internal _RESERVED_FOR_LIQUIDATION1;
  EnumerableSet.AddressSet internal _accountsWithOpenPositions;

  mapping(uint256 index => InstrumentInfo config) internal _instrumentInfo;
  mapping(address account => uint256 settledOrdersForAccount) internal _settledOrders;
  mapping(address account => EnumerableSet.UintSet instruments) internal _activeInstruments;
  mapping(address => bool) internal _RESERVED_FOR_LIQUIDATION2;
  mapping(address => bool) internal _RESERVED_FOR_LIQUIDATION3;
  mapping(uint256 instrumentIndex => mapping(address account => PositionInfo position)) internal _positionInfo;
  mapping(bytes32 orderHash => uint256 orderAmount) internal _filledAmounts;
  mapping(bytes32 settlementHash => bytes32 orderHash) internal _filledSettlements;

  uint256[50] private __gap;

  function getStorageSlot(uint256 storageSlot) external view returns (bytes32 value) {
    assembly {
      value := sload(storageSlot)
    }
  }
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
