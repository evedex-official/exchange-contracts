// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

struct MarginLevel {
  uint256 accumulatedMarginLowerLevels;
  uint128 positionVolumeLowerBound;
  uint128 marginCoefficient;
}

struct MarginLimit {
  uint128 maxMargin;
  uint128 minMargin;
}

interface IMarginCalc {
  error InvalidLength();
  error MarginLimitExceeded();
  error NonSmoothMargin();
  error UnsortedLevels();

  event MarginLevelUpdated(uint256 indexed positionVolume, MarginLevel[] levels);

  function PRECISION() external view returns (uint256);

  function getMargin(uint256 instrumentIndex, uint256 positionVolume) external view returns (uint256 marginLevel);

  function setLevels(uint256 instrumentIndex, MarginLevel[] calldata levels) external;
}
