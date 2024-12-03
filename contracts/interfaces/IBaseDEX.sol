// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {IDepositDEX} from "./IDepositDEX.sol";

struct FundingRateInfo {
  int40 frLong; // Funding rate for long position - percentage of position per second. frLong = 10**11 => 100% per second
  int40 frShort; // Funding rate for short position - percentage of position per second. frShort = 10**11 => 100% per second
  int72 longFRStored; // Accumulator for frLong
  int72 shortFRStored; // Accumulator for frShort
  uint32 lastFRUpdateTime; // Last funding rate update time
}

struct InstrumentInfo {
  InstrumentData instrumentData;
  FundingRateInfo[] fundingRateData;
}

struct InstrumentData {
  uint8 leverage; // Max available leverage
  string ticker; // Ticker of underlying asset
}

interface IBaseDEX {
  event InstrumentUpdate(uint256 indexed index, string ticker, uint8 leverage);
  event NewFundingRate(
    uint256 indexed index,
    int48 frLongPerSecond,
    int48 frShortPerSecond,
    int72 longFRStored,
    int72 shortFRStored,
    uint256 position
  );
  event InstrumentDeleted(uint256 indexed index);
  event BasicParamsUpdate(
    address depositDex,
    address sessionManager,
    address fundingRateAccount,
    int112 soLevel,
    int112 withdrawMarginLevel,
    uint256 maxOpenPositions,
    uint256 liquidationFeePercent
  );

  error SearchWithHintFailed(uint256);
  error EmptyArrayToSearch();
  error InvalidFRTimestamp();
  error InstrumentDoesNotExist();
  error InvalidPositionsRequest(uint256);
}
