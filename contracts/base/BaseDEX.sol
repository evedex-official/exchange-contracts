// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlEnumerableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {StorageDEX} from "./StorageDEX.sol";
import {ArraySearch} from "../lib/ArraySearch.sol";
import "../lib/OrderValidationLib.sol";
import "../interfaces/IBaseDEX.sol";

abstract contract BaseDEX is
  StorageDEX,
  ReentrancyGuardUpgradeable,
  AccessControlEnumerableUpgradeable,
  UUPSUpgradeable,
  IBaseDEX
{
  constructor() {
    _disableInitializers();
  }

  function __BaseDEX_init(address initialOwner_, BasicParams calldata params_) internal onlyInitializing {
    _setBasicParams(params_);
    __ReentrancyGuard_init();
    __AccessControlEnumerable_init();
    _grantRole(DEFAULT_ADMIN_ROLE, initialOwner_);
  }

  function getInstrumentData(uint256 index) external view returns (InstrumentData memory retVal) {
    return InstrumentData(_instrumentInfo[index].leverage, _instrumentInfo[index].ticker);
  }

  function getFundingRateData(
    uint256 index,
    uint256 start,
    uint256 length
  ) external view returns (FundingRateInfo[] memory, uint256[] memory) {
    InstrumentInfo storage instrument = _instrumentInfo[index];
    uint256 max = instrument.historyTimestamps.length;
    if (start >= max) revert InvalidPositionsRequest(max);
    length = start + length < max ? length : max - start;
    uint256 finish = start + length;
    FundingRateInfo[] memory fundingRates = new FundingRateInfo[](length);
    uint256[] memory startingTimestamps = new uint256[](length);
    for (uint256 i = start; i < finish; i++) {
      uint256 timestamp = instrument.historyTimestamps[i];
      fundingRates[i] = instrument.fundingRateData[timestamp];
      startingTimestamps[i] = timestamp;
    }
    return (fundingRates, startingTimestamps);
  }

  function _getInstrumentLeverage(uint256 index) internal view returns (uint8) {
    return _instrumentInfo[index].leverage;
  }

  function setBasicParams(BasicParams calldata params_) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _setBasicParams(params_);
  }

  function _setBasicParams(BasicParams calldata params_) internal {
    depositDex = params_.depositDex;
    sessionManager = params_.sessionManager;
    marginCalculator = params_.marginCalculator;
    fundingRateAccount = params_.fundingRateAccount;
    staticFundingRateAccount = params_.staticFundingRateAccount;
    withdrawMarginLevel = params_.withdrawMarginLevel;
    soLevel = params_.soLevel;
    maxOpenPositions = params_.maxOpenPositions;
    liquidationFeePercent = params_.liquidationFeePercent;
    markPriceOracle = params_.markPriceOracle;
    emit BasicParamsUpdate(params_);
  }

  function deleteInstrument() external onlyRole(DEFAULT_ADMIN_ROLE) {
    InstrumentInfo storage instrument = _instrumentInfo[--instrumentsLength];
    delete instrument.leverage;
    delete instrument.ticker;
    delete instrument.historyTimestamps;
    emit InstrumentDeleted(instrumentsLength);
  }

  function changeInstrument(
    uint256 index,
    string calldata ticker,
    uint8 leverage,
    int72 newFRLong,
    int72 newFRShort,
    uint72 newStaticFR,
    uint256 timestamp
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    uint256 len = instrumentsLength;
    if (len < index) revert InvalidIndex();
    if (len == index) instrumentsLength = len + 1;
    _changeInstrument(index, ticker, leverage, newFRLong, newFRShort, newStaticFR, timestamp);
  }

  function _changeInstrument(
    uint256 index,
    string memory ticker,
    uint8 leverage,
    int72 newFRLong,
    int72 newFRShort,
    uint72 newStaticFR,
    uint256 timestamp
  ) internal {
    InstrumentInfo storage instrument = _instrumentInfo[index];
    instrument.ticker = ticker;
    instrument.leverage = leverage;
    _setFR(index, newFRLong, newFRShort, newStaticFR, timestamp);
    emit InstrumentUpdate(index, ticker, leverage);
  }

  //  100% = 10^11
  function setFR(
    uint256 index,
    int72 newFRLong,
    int72 newFRShort,
    uint72 newStaticFR,
    uint256 timestamp
  ) external onlyRole(MATCHER_ROLE) {
    _setFR(index, newFRLong, newFRShort, newStaticFR, timestamp);
  }

  function _setFR(uint256 index, int72 newFRLong, int72 newFRShort, uint72 newStaticFR, uint256 timestamp) internal {
    InstrumentInfo storage instrument = _instrumentInfo[index];
    uint256 len = instrument.historyTimestamps.length;
    if (len > 0) {
      unchecked {
        if (timestamp <= instrument.historyTimestamps[len - 1]) revert InvalidFRTimestamp();
      }
    }
    FundingRateInfo memory newFundingRateInfo;
    newFundingRateInfo.longFRStored = newFRLong;
    newFundingRateInfo.shortFRStored = newFRShort;
    newFundingRateInfo.staticFr = int72(newStaticFR);
    instrument.historyTimestamps.push(timestamp);
    instrument.fundingRateData[timestamp] = newFundingRateInfo;
    emit NewFundingRate(index, newFRLong, newFRShort, newStaticFR, len);
  }

  function _getFundingRateInfo(
    uint256 index,
    uint256 timestamp,
    uint256 searchHint
  ) internal view returns (FundingRateInfo memory) {
    InstrumentInfo storage instrument = _instrumentInfo[index];
    uint256 found = ArraySearch.upperBoundHint(instrument.historyTimestamps, timestamp, searchHint);
    if (found == searchHint) revert SearchWithHintFailed(searchHint);

    return instrument.fundingRateData[instrument.historyTimestamps[--found]];
  }

  function _getBalance(address account_, address collateral_) internal view returns (int256 balance) {
    balance = IDepositDEX(depositDex).getBalance(account_, collateral_);
  }

  function _setBalance(address account_, address collateral_, int256 balance_) internal {
    IDepositDEX(depositDex).setBalance(account_, collateral_, balance_);
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
