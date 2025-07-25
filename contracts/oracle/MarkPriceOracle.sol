// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.26;

import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {ArraySearch} from "../lib/ArraySearch.sol";
import "../interfaces/IMarkPriceOracle.sol";

contract MarkPriceOracle is AccessControlEnumerable, IMarkPriceOracle {
  uint8 public constant DECIMALS = 8;
  bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
  bytes32 public constant MONITOR_ROLE = keccak256("MONITOR_ROLE");

  uint256 internal constant _DEFAULT_SAFE_WINDOW = uint256(keccak256("DEFAULT_SAFE_WINDOW"));

  mapping(uint256 index => uint256 period) internal _safeWindows;
  mapping(uint256 index => uint256[] timestamps) internal _timestampHistory;
  mapping(uint256 index => mapping(uint256 timestamp => PriceData price)) internal _priceHistory;

  constructor(address owner_, address operator_, uint256 defaultSafeWindow_) {
    _grantRole(DEFAULT_ADMIN_ROLE, owner_);
    _grantRole(OPERATOR_ROLE, operator_);
    _setSafeWindow(_DEFAULT_SAFE_WINDOW, defaultSafeWindow_);
  }

  /// @inheritdoc IMarkPriceOracle
  function getMarkPriceUnsafe(uint256 index, uint256 timestamp) external view returns (uint256 price) {
    uint256 nextEpoch = ArraySearch.upperBound(_timestampHistory[index], timestamp);
    if (nextEpoch == 0) revert InvalidTimestamp();

    unchecked {
      price = _priceHistory[index][_timestampHistory[index][nextEpoch - 1]].price;
    }
  }

  /// @inheritdoc IMarkPriceOracle
  function getMarkPriceSafe(uint256 index, uint256 timestamp) external view returns (uint256 price) {
    uint256 nextEpoch = ArraySearch.upperBound(_timestampHistory[index], timestamp);
    if (nextEpoch == 0) revert InvalidTimestamp();

    uint256 epochStart;
    unchecked {
      epochStart = _timestampHistory[index][nextEpoch - 1];
    }
    if (epochStart + getSafeWindow(index) > block.timestamp) revert PriceIsNotValidated();

    PriceData memory data = _priceHistory[index][epochStart];
    if (data.status == PriceStatus.Contested) revert PriceContested();

    price = data.price;
  }

  /// @inheritdoc IMarkPriceOracle
  function getMarkPriceSafeHint(
    uint256 index,
    uint256 timestamp,
    uint256 searchHint
  ) external view returns (int256 price) {
    uint256 nextEpoch = ArraySearch.upperBoundHint(_timestampHistory[index], timestamp, searchHint);
    if (nextEpoch == 0) revert InvalidTimestamp();

    uint256 epochStart;
    unchecked {
      epochStart = _timestampHistory[index][nextEpoch - 1];
    }
    if (epochStart + getSafeWindow(index) > block.timestamp) revert PriceIsNotValidated();

    PriceData memory data = _priceHistory[index][epochStart];
    if (data.status == PriceStatus.Contested) revert PriceContested();

    price = int256(uint256(data.price));
  }

  /// @inheritdoc IMarkPriceOracle
  function getHistoryTimestamps(uint256 index, uint256 start, uint256 length) external view returns (uint256[] memory) {
    uint256 max = _timestampHistory[index].length;
    if (start >= max) revert InvalidPositionsRequest(max);
    length = start + length < max ? length : max - start;
    uint256 finish = start + length;
    uint256[] memory history = new uint256[](length);
    for (uint256 i = start; i < finish; i++) {
      history[i] = _timestampHistory[index][i];
    }
    return history;
  }

  /// @inheritdoc IMarkPriceOracle
  function getHistoryPrices(uint256 index, uint256 start, uint256 length) external view returns (PriceData[] memory) {
    uint256 max = _timestampHistory[index].length;
    if (start >= max) revert InvalidPositionsRequest(max);
    length = start + length < max ? length : max - start;
    uint256 finish = start + length;
    PriceData[] memory history = new PriceData[](length);
    for (uint256 i = start; i < finish; i++) {
      history[i] = _priceHistory[index][_timestampHistory[index][i]];
    }
    return history;
  }

  /// @inheritdoc IMarkPriceOracle
  function getSafeWindow(uint256 index) public view returns (uint256 safeWindow) {
    uint256 customWindow = _safeWindows[index];
    safeWindow = customWindow == 0 ? _safeWindows[_DEFAULT_SAFE_WINDOW] : customWindow;
  }

  /// @inheritdoc IMarkPriceOracle
  function getDefaultSafeWindow() external view returns (uint256) {
    return _safeWindows[_DEFAULT_SAFE_WINDOW];
  }

  /// @inheritdoc IMarkPriceOracle
  function updatePrice(uint256 index, uint256 timestamp, uint248 price) external onlyRole(OPERATOR_ROLE) {
    uint256 len = _timestampHistory[index].length;
    unchecked {
      if (len > 0 && _timestampHistory[index][len - 1] >= timestamp) revert InvalidTimeline();
    }
    _timestampHistory[index].push(timestamp);
    _priceHistory[index][timestamp].price = price;
    emit UpdatedPrice(index, price);
  }

  /// @inheritdoc IMarkPriceOracle
  function forceUpdatePrice(
    uint256 index,
    uint256 timestampIndex,
    uint248 price
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (timestampIndex >= _timestampHistory[index].length) revert InvalidTimestampIndex();
    PriceData storage data = _priceHistory[index][_timestampHistory[index][timestampIndex]];
    if (data.status != PriceStatus.Contested) revert PriceNotContested();
    data.price = price;
    data.status = PriceStatus.Normal;
    emit ForceUpdatedPrice(index, timestampIndex, price);
  }

  /// @inheritdoc IMarkPriceOracle
  function contestPrice(uint256 index, uint256 timestampIndex) external onlyRole(MONITOR_ROLE) {
    if (timestampIndex >= _timestampHistory[index].length) revert InvalidTimestampIndex();
    PriceData storage data = _priceHistory[index][_timestampHistory[index][timestampIndex]];
    if (data.status != PriceStatus.Normal) revert PriceNotContestable();
    data.status = PriceStatus.Contested;
    emit ContestedPrice(index, timestampIndex, data.price);
  }

  /// @inheritdoc IMarkPriceOracle
  function setSafeWindows(
    uint256[] calldata indices,
    uint256[] calldata windows
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    uint256 len = indices.length;
    if (windows.length != len) revert LengthMismatch();
    for (uint256 i; i < len; i++) {
      _setSafeWindow(indices[i], windows[i]);
    }
  }

  /// @inheritdoc IMarkPriceOracle
  function setDefaultSafeWindow(uint256 window) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _setSafeWindow(_DEFAULT_SAFE_WINDOW, window);
  }

  function _setSafeWindow(uint256 index, uint256 window) internal {
    if (index == _DEFAULT_SAFE_WINDOW) {
      if (window == 0) revert ZeroInput();
      emit DefaultSafeWindowUpdated(window);
    } else {
      emit SafeWindowUpdated(index, window);
    }

    _safeWindows[index] = window;
  }
}
