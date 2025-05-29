// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.26;

import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "../interfaces/IPriceOracle.sol";

contract PriceOraclePyth is Ownable, IPriceOracle {
  using SafeCast for int256;
  using SafeCast for uint256;

  uint8 internal constant _USD_DECIMALS = 8;
  uint8 internal constant _DEFAULT_DECIMALS = 18;

  /// @inheritdoc IPriceOracle
  IPyth public immutable PYTH;
  /// @inheritdoc IPriceOracle
  address public immutable BASE_ASSET;
  /// @inheritdoc IPriceOracle
  uint256 public immutable MAX_WINDOW;

  /// @inheritdoc IPriceOracle
  mapping(bytes32 pythId => uint256 window) public confidenceWindows;
  /// @inheritdoc IPriceOracle
  mapping(address asset => bytes32 pythId) public assetToId;
  /// @inheritdoc IPriceOracle
  mapping(uint256 index => address asset) public indexToAsset;

  constructor(
    address pythContract_,
    address baseAsset_,
    bytes32 basePythId_,
    uint256 maxWindow_,
    address owner_
  ) Ownable(owner_) {
    PYTH = IPyth(pythContract_);
    BASE_ASSET = baseAsset_;
    MAX_WINDOW = maxWindow_;
    _setPythId(baseAsset_, basePythId_);
  }

  /// @inheritdoc IPriceOracle
  function getPrice(uint256 index) public view returns (uint80 price) {
    address asset = indexToAsset[index];
    if (asset == address(0)) revert IndexNotFound();
    price = getPrice(asset);
  }

  /// @inheritdoc IPriceOracle
  function getPrice(address asset) public view returns (uint80 price) {
    uint256 assetPrice256 = getOraclePriceSafe(asset);
    uint256 basePrice256 = getOraclePriceSafe(BASE_ASSET);

    assetPrice256 = (assetPrice256 * 10 ** _USD_DECIMALS) / basePrice256;
    price = assetPrice256.toUint80();
  }

  /// @inheritdoc IPriceOracle
  function getOraclePriceSafe(address asset) public view returns (uint256 price) {
    bytes32 id = assetToId[asset];
    if (id == bytes32(0)) revert AssetNotSetUp();
    PythStructs.Price memory assetPrice = PYTH.getPriceNoOlderThan(id, confidenceWindows[id]);
    price = _priceToUint256(assetPrice.price, assetPrice.expo, _DEFAULT_DECIMALS);
  }

  function _priceToUint256(int64 price, int32 expo, uint8 decimals) internal pure returns (uint256 price256) {
    price256 = int256(price).toUint256();
    int256 expDelta = int256(uint256(decimals)) + expo;
    price256 = expDelta > 0
      ? price256 * (10 ** uint256(int256(expDelta)))
      : price256 / (10 ** uint256(int256(-expDelta)));
  }

  /// @inheritdoc IPriceOracle
  function updateInstrumentIndices(uint256[] calldata indices, address[] calldata assets) external onlyOwner {
    uint256 len = indices.length;
    if (len != assets.length) revert InvalidLengths();
    for (uint256 i = 0; i < len; i++) {
      _setInstrumentId(indices[i], assets[i]);
    }
  }

  /// @inheritdoc IPriceOracle
  function updatePythPriceIds(address[] calldata assets, bytes32[] calldata ids) external onlyOwner {
    uint256 len = assets.length;
    if (len != ids.length) revert InvalidLengths();
    for (uint256 i = 0; i < len; i++) {
      _setPythId(assets[i], ids[i]);
    }
  }

  /// @inheritdoc IPriceOracle
  function updateTimeWindows(bytes32[] calldata ids, uint256[] calldata windows) external onlyOwner {
    uint256 len = ids.length;
    if (len != windows.length) revert InvalidLengths();
    for (uint256 i = 0; i < len; i++) {
      _setWindow(ids[i], windows[i], MAX_WINDOW);
    }
  }

  function _setPythId(address asset, bytes32 id) internal {
    assetToId[asset] = bytes32(id);
    emit UpdatedPythId(asset, id);
  }

  function _setWindow(bytes32 id, uint256 window, uint256 maxWindow) internal {
    if (window > maxWindow) revert InvalidPriceFeedWindow();
    confidenceWindows[id] = window;
    emit UpdatedConfidenceWindow(id, window);
  }

  function _setInstrumentId(uint256 index, address asset) internal {
    indexToAsset[index] = asset;
    emit UpdatedInstrumentId(index, asset);
  }
}
