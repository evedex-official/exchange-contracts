// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlEnumerableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {StorageDEX} from "./StorageDEX.sol";
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

  function getInstrumentData(uint256 index) external view returns (InstrumentData memory) {
    return _instrumentInfo[index].instrumentData;
  }

  function getFundingRateData(
    uint256 index,
    uint256 start,
    uint256 length
  ) external view returns (FundingRateInfo[] memory) {
    InstrumentInfo storage instrument = _instrumentInfo[index];
    uint256 max = instrument.fundingRateData.length;
    if (start >= max) revert InvalidPositionsRequest(max);
    length = start + length < max ? length : max - start;
    uint256 finish = start + length;
    FundingRateInfo[] memory fundingRates = new FundingRateInfo[](length);
    for (uint256 i = start; i < finish; i++) {
      fundingRates[i] = instrument.fundingRateData[i];
    }
    return fundingRates;
  }

  function _getInstrumentLeverage(uint256 index) internal view returns (uint8) {
    return _instrumentInfo[index].instrumentData.leverage;
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
    emit BasicParamsUpdate(params_);
  }

  function deleteInstrument() external onlyRole(DEFAULT_ADMIN_ROLE) {
    InstrumentInfo memory empty;
    _instrumentInfo[--instrumentsLength] = empty;
    emit InstrumentDeleted(instrumentsLength);
  }

  function changeInstrument(
    uint256 index,
    string calldata ticker,
    uint8 leverage,
    int72 newFRLong,
    int72 newFRShort,
    uint72 newStaticFR,
    uint40 timestamp
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
    uint40 timestamp
  ) internal {
    InstrumentInfo storage instrumentInfo_ = _instrumentInfo[index];
    instrumentInfo_.instrumentData.ticker = ticker;
    instrumentInfo_.instrumentData.leverage = leverage;
    _setFR(index, newFRLong, newFRShort, newStaticFR, timestamp);
    emit InstrumentUpdate(index, ticker, leverage);
  }

  //  100% = 10^11
  function setFR(
    uint256 index,
    int72 newFRLong,
    int72 newFRShort,
    uint72 newStaticFR,
    uint40 timestamp
  ) external onlyRole(MATCHER_ROLE) {
    _setFR(index, newFRLong, newFRShort, newStaticFR, timestamp);
  }

  function _setFR(uint256 index, int72 newFRLong, int72 newFRShort, uint72 newStaticFR, uint40 timestamp) internal {
    uint256 len = _instrumentInfo[index].fundingRateData.length;
    if (len > 0) {
      if (timestamp <= _instrumentInfo[index].fundingRateData[len - 1].lastFRUpdateTime) revert InvalidFRTimestamp();
    }
    FundingRateInfo memory newFundingRateInfo;
    newFundingRateInfo.lastFRUpdateTime = timestamp;
    newFundingRateInfo.longFRStored = newFRLong;
    newFundingRateInfo.shortFRStored = newFRShort;
    newFundingRateInfo.staticFr = int72(newStaticFR);
    _instrumentInfo[index].fundingRateData.push(newFundingRateInfo);
    emit NewFundingRate(index, newFRLong, newFRShort, newStaticFR, len);
  }

  function _getFundingRateInfo(
    uint256 index,
    uint256 timestamp,
    uint256 searchHint
  ) internal view returns (FundingRateInfo memory) {
    uint256 len = _instrumentInfo[index].fundingRateData.length;
    if (len == 0) revert EmptyArrayToSearch();
    if (_instrumentInfo[index].fundingRateData[searchHint].lastFRUpdateTime > timestamp)
      revert SearchWithHintFailed(searchHint);

    uint256 low = searchHint;
    uint256 high = len;
    while (low < high) {
      uint256 mid = Math.average(low, high);
      if (_instrumentInfo[index].fundingRateData[mid].lastFRUpdateTime > timestamp) {
        high = mid;
      } else {
        unchecked {
          low = mid + 1;
        }
      }
    }
    return _instrumentInfo[index].fundingRateData[--low];
  }

  function _getBalance(address account_, address collateral_) internal view returns (int256 balance) {
    balance = IDepositDEX(depositDex).getBalance(account_, collateral_);
  }

  function _setBalance(address account_, address collateral_, int256 balance_) internal {
    IDepositDEX(depositDex).setBalance(account_, collateral_, balance_);
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
