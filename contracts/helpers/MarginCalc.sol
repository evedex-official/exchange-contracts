// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import "../lib/ArraySearch.sol";
import "../interfaces/IMarginCalc.sol";

contract MarginCalc is OwnableUpgradeable, UUPSUpgradeable, IMarginCalc {
  uint256 public constant PRECISION = 1e4;
  MarginLimit internal _MARGIN_LIMIT;

  mapping(uint256 instrumentIndex => uint256[] lowerBoundByPosVolume) internal _positionVolumeLowerBounds;
  mapping(uint256 instrumentIndex => mapping(uint256 lowerBound => MarginLevel level)) internal _marginLevels;

  uint256[50] private __gap;

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

  function getMarginLevels(uint256 index) external view returns (MarginLevelView[] memory) {
    uint256 len = _positionVolumeLowerBounds[index].length;
    if (len == 0) revert InvalidIndex();
    MarginLevelView[] memory levels = new MarginLevelView[](len);
    for (uint256 i; i < len; i++) {
      uint256 lowerBound = _positionVolumeLowerBounds[index][i];
      MarginLevel memory lev = _marginLevels[index][lowerBound];
      levels[i] = MarginLevelView({
        accumulatedMarginLowerLevels: lev.accumulatedMarginLowerLevels,
        marginCoefficient: lev.marginCoefficient,
        positionVolumeLowerBound: lowerBound
      });
    }
    return levels;
  }

  function getMargin(uint256 instrumentIndex, uint256 positionVolume) external view returns (int256) {
    uint256 nextLevel = ArraySearch.upperBound(_positionVolumeLowerBounds[instrumentIndex], positionVolume);
    if (nextLevel == 0) return 0;
    uint256 lowerBound = _positionVolumeLowerBounds[instrumentIndex][nextLevel - 1];
    MarginLevel memory lev = _marginLevels[instrumentIndex][lowerBound];
    return
      int256(((positionVolume - lowerBound) * lev.marginCoefficient) / PRECISION + lev.accumulatedMarginLowerLevels);
  }

  function setLevels(uint256 instrumentIndex, MarginLevelView[] calldata levels) external onlyOwner {
    uint256 len = levels.length;

    MarginLevelView memory previousLevel;
    uint256 pos = levels[0].positionVolumeLowerBound;
    for (uint256 i = 1; i < len; i++) {
      uint256 currentLowerBound = levels[i].positionVolumeLowerBound;
      if (currentLowerBound <= pos) revert UnsortedLevels();
      previousLevel = levels[i - 1];
      if (
        ((currentLowerBound - previousLevel.positionVolumeLowerBound) * previousLevel.marginCoefficient) /
          PRECISION +
          previousLevel.accumulatedMarginLowerLevels !=
        levels[i].accumulatedMarginLowerLevels
      ) revert NonSmoothMargin();
      pos = currentLowerBound;
    }
    MarginLimit memory lim = _MARGIN_LIMIT;
    if (levels[0].marginCoefficient > lim.maxMargin || levels[len - 1].marginCoefficient < lim.minMargin)
      revert MarginLimitExceeded();
    delete _positionVolumeLowerBounds[instrumentIndex];
    for (uint256 i = 0; i < len; i++) {
      uint256 lowerBound = levels[i].positionVolumeLowerBound;
      _positionVolumeLowerBounds[instrumentIndex].push(lowerBound);
      _marginLevels[instrumentIndex][lowerBound] = MarginLevel({
        accumulatedMarginLowerLevels: levels[i].accumulatedMarginLowerLevels,
        marginCoefficient: levels[i].marginCoefficient
      });
    }

    emit MarginLevelUpdated(instrumentIndex, levels);
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
