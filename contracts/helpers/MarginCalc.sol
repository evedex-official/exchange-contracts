// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import "../interfaces/IMarginCalc.sol";

contract MarginCalc is OwnableUpgradeable, UUPSUpgradeable, IMarginCalc {
  uint256 public constant PRECISION = 1e4;
  MarginLimit internal _MARGIN_LIMIT;

  mapping(uint256 instrumentIndex => MarginLevel[] levels) internal _marginLevels;

  constructor() {
    _disableInitializers();
  }

  function initialize(address initialOwner_, uint128 maxMargin_, uint128 minMargin_) external initializer {
    __Ownable_init(initialOwner_);
    _MARGIN_LIMIT.maxMargin = maxMargin_;
    _MARGIN_LIMIT.minMargin = minMargin_;
  }

  function MARGIN_LIMIT() external view returns (MarginLimit memory) {
    return _MARGIN_LIMIT;
  }

  function getMarginLevels(uint256 index) external view returns (MarginLevel[] memory) {
    uint256 len = _marginLevels[index].length;
    if (len == 0) revert InvalidIndex();
    MarginLevel[] memory levels = new MarginLevel[](len);
    levels = _marginLevels[index];
    return levels;
  }

  function getMargin(uint256 instrumentIndex, uint256 positionVolume) external view returns (uint256) {
    uint256 low = 0;
    uint256 high = _marginLevels[instrumentIndex].length;

    if (high == 0) {
      return 0;
    }

    while (low < high) {
      uint256 mid = Math.average(low, high);

      // Note that mid will always be strictly less than high (i.e. it will be a valid array index)
      // because Math.average rounds towards zero (it does integer division with truncation).
      if (_marginLevels[instrumentIndex][mid].positionVolumeLowerBound < positionVolume) {
        // this cannot overflow because mid < high
        unchecked {
          low = mid + 1;
        }
      } else {
        high = mid;
      }
    }

    if (low == 0) return 0;
    MarginLevel memory lev = _marginLevels[instrumentIndex][low - 1];
    return
      lev.accumulatedMarginLowerLevels +
      (lev.marginCoefficient * (positionVolume - lev.positionVolumeLowerBound)) /
      PRECISION;
  }

  function setLevels(uint256 instrumentIndex, MarginLevel[] calldata levels) external onlyOwner {
    uint256 len = levels.length;

    MarginLevel memory previousLevel;
    uint256 pos = levels[0].positionVolumeLowerBound;
    for (uint256 i = 1; i < len; i++) {
      uint128 currentLowerBound = levels[i].positionVolumeLowerBound;
      if (currentLowerBound <= pos) revert UnsortedLevels();
      previousLevel = levels[i - 1];
      if (
        previousLevel.accumulatedMarginLowerLevels +
          (previousLevel.marginCoefficient * (currentLowerBound - previousLevel.positionVolumeLowerBound)) /
          PRECISION !=
        levels[i].accumulatedMarginLowerLevels
      ) revert NonSmoothMargin();
      pos = currentLowerBound;
    }
    MarginLimit memory lim = _MARGIN_LIMIT;
    if (levels[0].marginCoefficient > lim.maxMargin || levels[len - 1].marginCoefficient < lim.minMargin)
      revert MarginLimitExceeded();
    _marginLevels[instrumentIndex] = levels;

    emit MarginLevelUpdated(instrumentIndex, levels);
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
