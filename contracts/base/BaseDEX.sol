// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlEnumerableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {StorageDEX} from "./StorageDEX.sol";
import {OrderValidationLib, OrderWithdrawal} from "../lib/OrderValidationLib.sol";
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

  function __BaseDEX_init(
    address initialOwner_,
    address depositDex_,
    address sessionManager_,
    address marginCalculator_,
    address fundingRateAccount_,
    uint256 maxOpenPositions_,
    int112 soLevel_,
    int112 withdrawMarginLevel_,
    uint112 liquidationFeePercent_
  ) internal onlyInitializing {
    _setBasicParams(
      depositDex_,
      sessionManager_,
      marginCalculator_,
      fundingRateAccount_,
      soLevel_,
      withdrawMarginLevel_,
      maxOpenPositions_,
      liquidationFeePercent_
    );
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

  function setBasicParams(
    address depositDex_,
    address sessionManager_,
    address marginCalculator_,
    address fundingRateAccount_,
    int112 soLevel_,
    int112 withdrawMarginLevel_,
    uint256 maxOpenPositions_,
    uint256 liquidationFeePercent_
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _setBasicParams(
      depositDex_,
      sessionManager_,
      marginCalculator_,
      fundingRateAccount_,
      soLevel_,
      withdrawMarginLevel_,
      maxOpenPositions_,
      liquidationFeePercent_
    );
  }

  function _setBasicParams(
    address depositDex_,
    address sessionManager_,
    address marginCalculator_,
    address fundingRateAccount_,
    int112 soLevel_,
    int112 withdrawMarginLevel_,
    uint256 maxOpenPositions_,
    uint256 liquidationFeePercent_
  ) internal {
    depositDex = depositDex_;
    sessionManager = sessionManager_;
    marginCalculator = marginCalculator_;
    fundingRateAccount = fundingRateAccount_;
    withdrawMarginLevel = withdrawMarginLevel_;
    soLevel = soLevel_;
    maxOpenPositions = maxOpenPositions_;
    liquidationFeePercent = liquidationFeePercent_;
    emit BasicParamsUpdate(
      depositDex_,
      sessionManager_,
      marginCalculator_,
      fundingRateAccount_,
      soLevel_,
      withdrawMarginLevel_,
      maxOpenPositions_,
      liquidationFeePercent_
    );
  }

  function addInstrument(
    string calldata ticker,
    uint8 leverage,
    int72 newFRLong,
    int72 newFRShort,
    uint48 timestamp
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _changeInstrument(instrumentsLength++, ticker, leverage, newFRLong, newFRShort, timestamp);
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
    uint48 timestamp
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _changeInstrument(index, ticker, leverage, newFRLong, newFRShort, timestamp);
  }

  function _changeInstrument(
    uint256 index,
    string memory ticker,
    uint8 leverage,
    int72 newFRLong,
    int72 newFRShort,
    uint48 timestamp
  ) internal {
    if (instrumentsLength <= index) revert InstrumentDoesNotExist();

    InstrumentInfo storage instrumentInfo_ = _instrumentInfo[index];
    instrumentInfo_.instrumentData.ticker = ticker;
    instrumentInfo_.instrumentData.leverage = leverage;
    _setFR(index, newFRLong, newFRShort, timestamp);
    emit InstrumentUpdate(index, ticker, leverage);
  }

  //  100% = 10^11
  function setFR(uint256 index, int72 newFRLong, int72 newFRShort, uint48 timestamp) external onlyRole(MATCHER_ROLE) {
    _setFR(index, newFRLong, newFRShort, timestamp);
  }

  function _setFR(uint256 index, int72 newFRLong, int72 newFRShort, uint48 timestamp) internal {
    uint256 len = _instrumentInfo[index].fundingRateData.length;
    if (len > 0) {
      if (timestamp <= _instrumentInfo[index].fundingRateData[len - 1].lastFRUpdateTime) revert InvalidFRTimestamp();
    }
    FundingRateInfo memory newFundingRateInfo;
    newFundingRateInfo.lastFRUpdateTime = timestamp;
    newFundingRateInfo.longFRStored = newFRLong;
    newFundingRateInfo.shortFRStored = newFRShort;
    _instrumentInfo[index].fundingRateData.push(newFundingRateInfo);
    emit NewFundingRate(index, newFRLong, newFRShort, len);
  }

  //  100% = 10^11
  function setStaticFR(uint72 newStaticFr, uint48 timestamp) external onlyRole(MATCHER_ROLE) {
    _setStaticFR(newStaticFr, timestamp);
  }

  function _setStaticFR(uint72 newStaticFr, uint48 timestamp) internal {
    uint256 len = _staticFundingRateData.length;
    if (len > 0) {
      if (timestamp <= _staticFundingRateData[len - 1].lastFRUpdateTime) revert InvalidFRTimestamp();
    }
    StaticFundingRateInfo memory newFundingRateInfo;
    newFundingRateInfo.staticFr = newStaticFr;
    newFundingRateInfo.lastFRUpdateTime = timestamp;
    _staticFundingRateData.push(newFundingRateInfo);
    emit NewStaticFundingRate(newStaticFr);
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

  function _getStaticFundingRateInfo(
    uint256 timestamp,
    uint256 searchHint
  ) internal view returns (StaticFundingRateInfo memory) {
    uint256 len = _staticFundingRateData.length;
    if (len == 0) revert EmptyArrayToSearch();
    if (_staticFundingRateData[searchHint].lastFRUpdateTime > timestamp) revert SearchWithHintFailed(searchHint);

    uint256 low = searchHint;
    uint256 high = len;
    while (low < high) {
      uint256 mid = Math.average(low, high);
      if (_staticFundingRateData[mid].lastFRUpdateTime > timestamp) {
        high = mid;
      } else {
        unchecked {
          low = mid + 1;
        }
      }
    }
    return _staticFundingRateData[--low];
  }

  function _getBalance(address account_, address collateral_) internal view returns (int112 balance) {
    balance = IDepositDEX(depositDex).getBalance(account_, collateral_);
  }

  function _setBalance(address account_, address collateral_, int112 balance_) internal {
    IDepositDEX(depositDex).setBalance(account_, collateral_, balance_);
  }

  function getTotalLongFR(uint256 index, uint256 timestamp, uint256 searchHint) public view virtual returns (int72) {}

  function getTotalShortFR(uint256 index, uint256 timestamp, uint256 searchHint) public view virtual returns (int72) {}

  function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
