// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

struct MarginLevel {
  uint128 accumulatedMarginLowerLevels;
  uint128 marginCoefficient;
}

struct MarginLevelView {
  uint128 accumulatedMarginLowerLevels;
  uint256 positionVolumeLowerBound;
  uint128 marginCoefficient;
}

struct MarginLimit {
  uint128 maxMargin;
  uint128 minMargin;
}

interface IMarginCalc {
  error InvalidIndex();
  error InvalidLength();
  error MarginLimitExceeded();
  error NonSmoothMargin();
  error UnsortedLevels();

  event MarginLevelUpdated(uint256 indexed positionVolume, MarginLevelView[] levels);

  function PRECISION() external view returns (uint256);

  function MARGIN_LIMIT() external view returns (MarginLimit calldata);

  function getMarginLevels(uint256 instrumentIndex) external view returns (MarginLevelView[] memory levels);

  function getMargin(uint256 instrumentIndex, uint256 positionVolume) external view returns (int256 marginLevel);

  function setLevels(uint256 instrumentIndex, MarginLevelView[] memory levels) external;
}
