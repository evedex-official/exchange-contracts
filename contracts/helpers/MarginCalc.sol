// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import "../interfaces/IMarginCalc.sol";

contract MarginCalc is OwnableUpgradeable, UUPSUpgradeable, IMarginCalc {
  uint256 public constant PRECISION = 1e4;
  MarginLimit public MARGIN_LIMIT;

  mapping(uint256 instrumentIndex => MarginLevel[] levels) public marginLevels;

  constructor() {
    _disableInitializers();
  }

  function initialize(address initialOwner_, uint128 maxMargin_, uint128 minMargin_) external initializer {
    __Ownable_init(initialOwner_);
    MARGIN_LIMIT.maxMargin = maxMargin_;
    MARGIN_LIMIT.minMargin = minMargin_;
  }

  function getMargin(uint256 instrumentIndex, uint256 positionVolume) external view returns (uint256) {
    uint256 low = 0;
    uint256 high = marginLevels[instrumentIndex].length;

    if (high == 0) {
      return 0;
    }

    while (low < high) {
      uint256 mid = Math.average(low, high);

      // Note that mid will always be strictly less than high (i.e. it will be a valid array index)
      // because Math.average rounds towards zero (it does integer division with truncation).
      if (marginLevels[instrumentIndex][mid].positionVolumeLowerBound < positionVolume) {
        // this cannot overflow because mid < high
        unchecked {
          low = mid + 1;
        }
      } else {
        high = mid;
      }
    }

    if (low == 0) return 0;
    MarginLevel memory lev = marginLevels[instrumentIndex][low - 1];
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
    MarginLimit memory lim = MARGIN_LIMIT;
    if (levels[0].marginCoefficient > lim.maxMargin || levels[len - 1].marginCoefficient < lim.minMargin)
      revert MarginLimitExceeded();
    marginLevels[instrumentIndex] = levels;

    emit MarginLevelUpdated(instrumentIndex, levels);
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
