// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";

interface IPriceOracle {
  /// @notice Thrown when arrays are mismatched in length
  error InvalidLengths();

  /// @notice Thrown when index is not set up
  error IndexNotFound();

  /// @notice Thrown when asset is not set up
  error AssetNotSetUp();

  /// @notice Thrown when window exceeds max allowed
  error InvalidPriceFeedWindow();

  /// @notice Emitted when indexToAsset[] mapping is updated
  event UpdatedInstrumentId(uint256 indexed index, address indexed asset);

  /// @notice Emitted when assetToId[] mapping is updated
  event UpdatedPythId(address indexed asset, bytes32 pythId);

  /// @notice Emitted when confidenceWindows[] mapping is updated
  event UpdatedConfidenceWindow(bytes32 pythId, uint256 window);

  /// @notice Immutable address of Pyth feed
  function PYTH() external view returns (IPyth);

  /// @notice Immutable address the base asset
  function BASE_ASSET() external view returns (address);

  /// @notice Immutable max confidence window for safety checks
  function MAX_WINDOW() external view returns (uint256);

  /**
   * @notice Mapping of allowed time frames by Pyth ID
   * @param pythId ID to query
   * @return window allowed timeframe in seconds
   */
  function confidenceWindows(bytes32 pythId) external view returns (uint256 window);

  /**
   * @notice Mapping of Pyth IDs by asset
   * @param asset address to query
   * @return pythId bytes32 ID for the Pyth feed
   */
  function assetToId(address asset) external view returns (bytes32 pythId);

  /**
   * @notice Mapping of asset addresses by instrument
   * @param index of the instrument to query
   * @return asset address for given instrument
   */
  function indexToAsset(uint256 index) external view returns (address asset);

  /**
   * @notice returns price of an instrument in BASE_ASSET
   * @param index of the instrument to query price of
   * @return price scaled with _USD_DECIMALS precision
   */
  function getPrice(uint256 index) external view returns (uint80 price);

  /**
   * @notice returns price of an asset in BASE_ASSET
   * @param asset address to query price of
   * @return price scaled with _USD_DECIMALS precision
   */
  function getPrice(address asset) external view returns (uint80 price);

  /**
   * @notice returns price of an asset
   * @dev reverts in case of stale price
   * @param asset address to query price of
   * @return price of underlying with 18 decimal places
   */
  function getOraclePriceSafe(address asset) external view returns (uint256 price);

  /**
   * @notice updates instrument ID to asset address
   * @param indices array to update
   * @param assets array of assets
   */
  function updateInstrumentIndices(uint256[] calldata indices, address[] calldata assets) external;

  /**
   * @notice updates Pyth feeds for given addresses
   * @param assets array to update
   * @param ids array of Pyth IDs of price feeds
   */
  function updatePythPriceIds(address[] calldata assets, bytes32[] calldata ids) external;

  /**
   * @notice updates timeframes for given Pyth IDs
   * @param ids array to update
   * @param windows array of timeframes for price requests
   */
  function updateTimeWindows(bytes32[] calldata ids, uint256[] calldata windows) external;
}
