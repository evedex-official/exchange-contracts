// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

interface IPriceOracle {
  error InvalidLengths();
  error IndexNotFound();
  error AssetNotSetUp();
  error InvalidPriceFeedWindow();

  event UpdatedInstrumentId(uint256 indexed index, address indexed asset);
  event UpdatedPythId(address indexed asset, bytes32 pythId);
  event UpdatedConfidenceWindow(bytes32 pythId, uint256 window);

  function getPrice(uint256) external view returns (uint80 price);

  function getOraclePriceSafe(address asset) external view returns (uint256 price);
}
