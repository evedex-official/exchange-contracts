// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

enum PriceStatus {
  // Invalid prices can be marked as contested by MONITOR_ROLE.
  Normal, // Default state.
  Contested // Contested prices can't be obtained via safe getter.
}

struct PriceData {
  uint248 price;
  PriceStatus status;
}

interface IMarkPriceOracle {
  /// @notice Thrown when starting index exceeds length of array.
  error InvalidPositionsRequest(uint256 length);

  /// @notice Thrown when disrupting sorted array of timestamps
  error InvalidTimeline();

  /// @notice Thrown when given timestamp is prior to first available
  error InvalidTimestamp();

  /// @notice Thrown when given index is out of bounds
  error InvalidTimestampIndex();

  /// @notice Thrown when price is contested and can't be trusted via safe getters
  error PriceContested();

  /// @notice Thrown when modifying price that's not in contest
  error PriceNotContested();

  /// @notice Thrown when contesting price that's not in default status
  error PriceNotContestable();

  /// @notice Thrown when the safe window time period is not passed since price report
  error PriceIsNotValidated();

  /// @notice Thrown when given arrays are mismatched in lengths
  error LengthMismatch();

  /// @notice Thrown when updating with zero input
  error ZeroInput();

  /// @notice Emitted when OPERATOR_ROLE reports new price data
  /// @param index Instrument index
  /// @param price Freshly reported  data
  event UpdatedPrice(uint256 indexed index, uint256 price);

  /// @notice Emitted when DEFAULT_ADMIN_ROLE corrects contested price
  /// @param index Instrument index
  /// @param timestampIndex Index of history timestamp array that's corrected
  /// @param price Freshly reported  data
  event ForceUpdatedPrice(uint256 indexed index, uint256 timestampIndex, uint256 price);

  /// @notice Emitted when MONITOR_ROLE contests price data
  /// @param index Instrument index
  /// @param timestampIndex Index of history timestamp array that's contested
  /// @param price Contested price
  event ContestedPrice(uint256 indexed index, uint256 timestampIndex, uint256 price);

  /// @notice Emitted when DEFAULT_ADMIN_ROLE updates individual safe window
  /// @param index Instrument index
  /// @param safeWindow Updated value
  event SafeWindowUpdated(uint256 indexed index, uint256 safeWindow);

  /// @notice Emitted when DEFAULT_ADMIN_ROLE updates default safe window
  /// @param safeWindow Updated value
  event DefaultSafeWindowUpdated(uint256 safeWindow);

  /// @notice Get precision of stored prices.
  /// @return Decimals places of prices.
  function DECIMALS() external view returns (uint8);

  /// @notice Get stored price active for given timestamp.
  ///         Reverts if requested timestamp isn't included into historical data.
  /// @param index Instrument index to request price for.
  /// @param timestamp Unix time in seconds.
  /// @return price Price with `DECIMALS` precision.
  function getMarkPriceUnsafe(uint256 index, uint256 timestamp) external view returns (uint256 price);

  /// @notice Get stored price active for given timestamp.
  ///         Reverts if no active and validated price was found.
  /// @param index Instrument index to request price for.
  /// @param timestamp Unix time in seconds.
  /// @return price Price with `DECIMALS` precision.
  function getMarkPriceSafe(uint256 index, uint256 timestamp) external view returns (uint256 price);

  /// @notice Get stored price active for given timestamp with search optimization.
  ///         Reverts if no active and validated price was found or search hint is incorrect.
  /// @param index Instrument index to request price for.
  /// @param timestamp Unix time in seconds.
  /// @param searchHint Starting index to search in `timestampHistory` array.
  /// @return price Price with `DECIMALS` precision.
  function getMarkPriceSafeHint(
    uint256 index,
    uint256 timestamp,
    uint256 searchHint
  ) external view returns (uint256 price);

  /// @notice Get timestamps historical data for given instrument.
  /// @param index Instrument index to request data for.
  /// @param start Starting index in `timestampHistory` array.
  /// @param length Maximum length of returned data.
  /// @return `timestampHistory[start..min(start+length, timestampHistory.length)]`
  function getHistoryTimestamps(uint256 index, uint256 start, uint256 length) external view returns (uint256[] memory);

  /// @notice Get prices historical data for given instrument.
  /// @param index Instrument index to request data for.
  /// @param start Starting index in `priceHistory` array.
  /// @param length Maximum length of returned data.
  /// @return `priceHistory[timestampHistory[start]..timestampHistory[min(start+length, timestampHistory.length)]]`
  function getHistoryPrices(uint256 index, uint256 start, uint256 length) external view returns (PriceData[] memory);

  /// @notice Get validation safe window for given instrument. Default value is returned if no custom is found.
  ///         Safe window is used to allow MONITOR_ROLE to contest submitted prices.
  /// @param index Instrument index to request data for.
  /// @return safeWindow Default window is returned unless custom value is set for given index.
  function getSafeWindow(uint256 index) external view returns (uint256 safeWindow);

  /// @notice Get default validation safe window that's used for all instrument without custom windows.
  /// @return Default window in seconds.
  function getDefaultSafeWindow() external view returns (uint256);

  /// @notice Function for OPERATOR_ROLE to submit new price data with start of its epoch.
  /// @param index Instrument index to update price for.
  /// @param timestamp Starting unix time of an epoch for updating price. Must be greater than last stored.
  /// @param price New price with `DECIMALS` precision.
  function updatePrice(uint256 index, uint256 timestamp, uint248 price) external;

  /// @notice Function for DEFAULT_ADMIN_ROLE to update contested price. Reverts if not contested.
  /// @param index Instrument index to update price for.
  /// @param timestampIndex Index in `timestampHistory` array.
  /// @param price New price with `DECIMALS` precision.
  function forceUpdatePrice(uint256 index, uint256 timestampIndex, uint248 price) external;

  /// @notice Function for MONITOR_ROLE to contest price and prevent safe getters for it.
  ///         Reverts if already contested.
  /// @param index Instrument index to update price for.
  /// @param timestampIndex Index in `timestampHistory` array.
  function contestPrice(uint256 index, uint256 timestampIndex) external;

  /// @notice Function for DEFAULT_ADMIN_ROLE to update safe window configs.
  ///         Reverts if given arrays are mismatched in lengths.
  /// @param indices Instrument indices to update configs for.
  /// @param windows Update configs for instruments.
  function setSafeWindows(uint256[] calldata indices, uint256[] calldata windows) external;

  /// @notice Function for DEFAULT_ADMIN_ROLE to update default safe window.
  /// @param window New default window in seconds.
  function setDefaultSafeWindow(uint256 window) external;
}
