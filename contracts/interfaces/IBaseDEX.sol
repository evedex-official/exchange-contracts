// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {IDepositDEX} from "./IDepositDEX.sol";
import {IMarginCalc} from "./IMarginCalc.sol";
import {IMarkPriceOracle} from "./IMarkPriceOracle.sol";
import {ISessionManager} from "./ISessionManager.sol";

struct FundingRateInfo {
  int72 longFRStored; // Accumulator for frLong
  int72 shortFRStored; // Accumulator for frShort
  int72 staticFr; // Static percentage of funding rate
}

struct InstrumentInfo {
  uint16 leverage; // Max available leverage
  string ticker; // Ticker of underlying asset
  uint256[] historyTimestamps;
  mapping(uint256 timestamp => FundingRateInfo fundingRate) fundingRateData;
}

struct BasicParams {
  IDepositDEX depositDex;
  ISessionManager sessionManager;
  IMarginCalc marginCalculator;
  address fundingRateAccount;
  address staticFundingRateAccount;
  address markPriceOracle;
  uint256 maxOpenPositions;
  uint256 allowedOverloadTPSL;
  uint256 maxMatcherFee;
  int112 soLevel;
  int112 withdrawMarginLevel;
  int112 liquidationFeePercent;
}

interface IBaseDEX {
  event InstrumentUpdate(uint256 indexed index, string ticker, uint16 leverage);
  event NewFundingRate(
    uint256 indexed index,
    int72 longFRStored,
    int72 shortFRStored,
    uint72 staticFR,
    uint256 position
  );
  event InstrumentDeleted(uint256 indexed index);
  event BasicParamsUpdate(BasicParams newParams);

  error SearchWithHintFailed(uint256);
  error EmptyArrayToSearch();
  error InvalidFRTimestamp();
  error InvalidIndex();
  error InvalidPositionsRequest(uint256);

  function getFundingRateData(
    uint256 index,
    uint256 start,
    uint256 length
  ) external view returns (FundingRateInfo[] memory, uint256[] memory);

  function setBasicParams(BasicParams calldata params_) external;

  function deleteInstrument() external;

  function changeInstrument(
    uint256 index,
    string calldata ticker,
    uint16 leverage,
    int72 newFRLong,
    int72 newFRShort,
    uint72 newStaticFR,
    uint256 timestamp
  ) external;

  function setFR(uint256 index, int72 newFRLong, int72 newFRShort, uint72 newStaticFR, uint256 timestamp) external;
}
