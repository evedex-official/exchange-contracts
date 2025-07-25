// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../lib/OrderValidationLib.sol";
import "../interfaces/IViewer.sol";

contract EVEDEXViewer is UUPSUpgradeable, IViewer {
  address public evedex;

  uint256 internal constant _MARGIN_CALC_SLOT = 0;
  uint256 internal constant _DEPOSIT_DEX_SLOT = _MARGIN_CALC_SLOT + 1;
  uint256 internal constant _SESSION_MANAGER_SLOT = _DEPOSIT_DEX_SLOT + 1;
  uint256 internal constant _MARK_PRICE_ORACLE_SLOT = _SESSION_MANAGER_SLOT + 1;
  uint256 internal constant _STATIC_FR_ACCOUNT_SLOT = _MARK_PRICE_ORACLE_SLOT + 1;
  uint256 internal constant _FR_ACCOUNT_SLOT = _STATIC_FR_ACCOUNT_SLOT + 1;
  uint256 internal constant _SO_LEVEL_SLOT = _FR_ACCOUNT_SLOT + 1;
  uint256 internal constant _WITHDRAW_MARGIN_LEVEL_SLOT = _SO_LEVEL_SLOT + 1;
  uint256 internal constant _LIQUIDATION_FEE_PERCENT_SLOT = _WITHDRAW_MARGIN_LEVEL_SLOT + 1;
  uint256 internal constant _ALLOWED_OVERLOAD_TPSL_SLOT = _LIQUIDATION_FEE_PERCENT_SLOT + 1;
  uint256 internal constant _INSTRUMENT_LENGTH_SLOT = _ALLOWED_OVERLOAD_TPSL_SLOT + 1;
  uint256 internal constant _MAX_OPEN_POSITIONS_SLOT = _INSTRUMENT_LENGTH_SLOT + 1;
  uint256 internal constant _TOTAL_OPENED_ORDERS_SLOT = _MAX_OPEN_POSITIONS_SLOT + 1;
  uint256 internal constant _TOTAL_SETTLED_ORDERS_SLOT = _TOTAL_OPENED_ORDERS_SLOT + 1;
  uint256 internal constant _MAX_MATCHER_FEE_SLOT = _TOTAL_SETTLED_ORDERS_SLOT + 1;
  uint256 internal constant _LIQUIDATION_DENOMINATOR_SLOT = _MAX_MATCHER_FEE_SLOT + 1;
  uint256 internal constant _ACCOUNTS_WITH_OPEN_POSITIONS_SLOT = _LIQUIDATION_DENOMINATOR_SLOT + 1;

  uint256 internal constant _INSTRUMENT_INFO_MAPPING = _ACCOUNTS_WITH_OPEN_POSITIONS_SLOT + 2;
  uint256 internal constant _SETTLED_ORDERS_MAPPING = _INSTRUMENT_INFO_MAPPING + 1;
  uint256 internal constant _ACTIVE_INSTRUMENTS_MAPPING = _SETTLED_ORDERS_MAPPING + 1;
  uint256 internal constant _LIQUIDATION_STATUSES_MAPPING = _ACTIVE_INSTRUMENTS_MAPPING + 1;
  uint256 internal constant _LIQUIDATION_PRICES_MAPPING = _LIQUIDATION_STATUSES_MAPPING + 1;
  uint256 internal constant _POSITION_INFO_MAPPING = _LIQUIDATION_PRICES_MAPPING + 1;
  uint256 internal constant _FILLED_AMOUNTS_MAPPING = _POSITION_INFO_MAPPING + 1;
  uint256 internal constant _FILLED_SETTLEMENTS_MAPPING = _FILLED_AMOUNTS_MAPPING + 1;

  function MATCHER_ROLE() external pure returns (bytes32) {
    return keccak256("MATCHER_ROLE");
  }

  function marginCalculator() external view returns (address) {
    bytes32 data = IStorageDEX(evedex).getStorageSlot(_MARGIN_CALC_SLOT);
    return address(uint160(uint256(data)));
  }

  function depositDex() external view returns (address) {
    bytes32 data = IStorageDEX(evedex).getStorageSlot(_DEPOSIT_DEX_SLOT);
    return address(uint160(uint256(data)));
  }

  function sessionManager() external view returns (address) {
    bytes32 data = IStorageDEX(evedex).getStorageSlot(_SESSION_MANAGER_SLOT);
    return address(uint160(uint256(data)));
  }

  function markPriceOracle() external view returns (address) {
    bytes32 data = IStorageDEX(evedex).getStorageSlot(_MARK_PRICE_ORACLE_SLOT);
    return address(uint160(uint256(data)));
  }

  function staticFundingRateAccount() external view returns (address) {
    bytes32 data = IStorageDEX(evedex).getStorageSlot(_STATIC_FR_ACCOUNT_SLOT);
    return address(uint160(uint256(data)));
  }

  function fundingRateAccount() external view returns (address) {
    bytes32 data = IStorageDEX(evedex).getStorageSlot(_FR_ACCOUNT_SLOT);
    return address(uint160(uint256(data)));
  }

  function soLevel() external view returns (int256) {
    bytes32 data = IStorageDEX(evedex).getStorageSlot(_SO_LEVEL_SLOT);
    return int256(uint256(data));
  }

  function withdrawMarginLevel() external view returns (int256) {
    bytes32 data = IStorageDEX(evedex).getStorageSlot(_WITHDRAW_MARGIN_LEVEL_SLOT);
    return int256(uint256(data));
  }

  function liquidationFeePercent() external view returns (int256) {
    bytes32 data = IStorageDEX(evedex).getStorageSlot(_LIQUIDATION_FEE_PERCENT_SLOT);
    return int256(uint256(data));
  }

  function allowedOverloadTPSL() external view returns (int256) {
    bytes32 data = IStorageDEX(evedex).getStorageSlot(_ALLOWED_OVERLOAD_TPSL_SLOT);
    return int256(uint256(data));
  }

  function instrumentsLength() external view returns (uint256) {
    bytes32 data = IStorageDEX(evedex).getStorageSlot(_INSTRUMENT_LENGTH_SLOT);
    return uint256(data);
  }

  function maxOpenPositions() external view returns (uint256) {
    bytes32 data = IStorageDEX(evedex).getStorageSlot(_MAX_OPEN_POSITIONS_SLOT);
    return uint256(data);
  }

  function totalOpenedOrders() external view returns (uint256) {
    bytes32 data = IStorageDEX(evedex).getStorageSlot(_TOTAL_OPENED_ORDERS_SLOT);
    return uint256(data);
  }

  function totalSettledOrders() external view returns (uint256) {
    bytes32 data = IStorageDEX(evedex).getStorageSlot(_TOTAL_SETTLED_ORDERS_SLOT);
    return uint256(data);
  }

  function maxMatcherFee() external view returns (uint256) {
    bytes32 data = IStorageDEX(evedex).getStorageSlot(_MAX_MATCHER_FEE_SLOT);
    return uint256(data);
  }

  function settledOrders(address account) external view returns (uint256) {
    bytes32 data = IStorageDEX(evedex).getStorageSlot(uint256(keccak256(abi.encode(account, _SETTLED_ORDERS_MAPPING))));
    return uint256(data);
  }

  // function liquidationDenominator()
  //     external
  //     view
  //     returns (LiquidationDenominator memory value)
  // {
  //     bytes32 data = IStorageDEX(evedex).getStorageSlot(
  //         _LIQUIDATION_DENOMINATOR_SLOT
  //     );
  //     value.buyFee = int128(uint128(uint256(data)));
  //     value.sellFee = int128(int256(uint256(data >> 128)));
  // }

  // function liquidationStatuses(
  //     address account
  // ) external view returns (LiquidationStatus) {
  //     bytes32 data = IStorageDEX(evedex).getStorageSlot(
  //         uint256(
  //             keccak256(abi.encode(account, _LIQUIDATION_STATUSES_MAPPING))
  //         )
  //     );
  //     return LiquidationStatus(uint8(uint256(data)));
  // }

  // function liquidationPrices(
  //     address account,
  //     uint256 timestamp,
  //     uint256 instrumentIndex
  // ) external view returns (int256) {
  //     bytes32 data = IStorageDEX(evedex).getStorageSlot(
  //         uint256(
  //             keccak256(
  //                 abi.encode(
  //                     account,
  //                     keccak256(
  //                         abi.encode(
  //                             timestamp,
  //                             keccak256(
  //                                 abi.encode(
  //                                     instrumentIndex,
  //                                     _LIQUIDATION_PRICES_MAPPING
  //                                 )
  //                             )
  //                         )
  //                     )
  //                 )
  //             )
  //         )
  //     );
  //     return int256(uint256(data));
  // }

  function filledAmounts(uint256 orderId, address orderSender) external view returns (uint256) {
    bytes32 orderHash = keccak256(abi.encode(orderId, orderSender));
    bytes32 data = IStorageDEX(evedex).getStorageSlot(
      uint256(keccak256(abi.encode(orderHash, _FILLED_AMOUNTS_MAPPING)))
    );
    return uint256(data);
  }

  function filledSettlements(bytes32 settlementHash) external view returns (bytes32) {
    bytes32 data = IStorageDEX(evedex).getStorageSlot(
      uint256(keccak256(abi.encode(settlementHash, _FILLED_SETTLEMENTS_MAPPING)))
    );
    return data;
  }

  function getInstrumentData(uint256 index) external view returns (InstrumentData memory) {
    uint256 slot = uint256(keccak256(abi.encode(index, _INSTRUMENT_INFO_MAPPING)));
    bytes32 dataL = IStorageDEX(evedex).getStorageSlot(slot);
    bytes32 dataT = IStorageDEX(evedex).getStorageSlot(slot + 1);
    uint256 len = uint256(dataT) & 0xFF;
    require(len % 2 == 0, "Not a short string");
    string memory str = new string(32);
    assembly ("memory-safe") {
      mstore(str, len)
      mstore(add(str, 0x20), dataT)
    }
    return InstrumentData(uint16(uint256(dataL)), str);
  }

  function getPositionInfo(uint256 index, address account) public view returns (PositionInfo memory position) {
    uint256 slot = uint256(keccak256(abi.encode(account, keccak256(abi.encode(index, _POSITION_INFO_MAPPING)))));
    bytes32 data = IStorageDEX(evedex).getStorageSlot(slot);
    position.positionLastUpdate = uint32(uint256(data >> 224));
    position.frAccumulated = int112(uint112(uint256(data >> 112)));
    position.position = int112(uint112(uint256(data)));
    data = IStorageDEX(evedex).getStorageSlot(slot + 1);
    position.leverage = uint16(uint256(data >> 224));
    position.positionShortFRStored = int72(uint72(uint256(data >> 152)));
    position.positionLongFRStored = int72(uint72(uint256(data >> 80)));
    position.positionAvgPrice = int80(uint80(uint256(data)));
  }

  function getActiveInstrumentsPositions(
    address account
  ) external view returns (uint256[] memory indices, PositionInfo[] memory positions) {
    uint256 slot = uint256(keccak256(abi.encode(account, _ACTIVE_INSTRUMENTS_MAPPING)));
    uint256 len = uint256(IStorageDEX(evedex).getStorageSlot(slot));
    indices = new uint256[](len);
    positions = new PositionInfo[](len);
    for (uint256 i; i < len; i++) {
      uint256 index = uint256(IStorageDEX(evedex).getStorageSlot(uint256(keccak256(abi.encode(slot))) + i));
      indices[i] = index;
      positions[i] = getPositionInfo(index, account);
    }
  }

  function getActiveInstrumentsIndices(address account) public view returns (uint256[] memory) {
    uint256 slot = uint256(keccak256(abi.encode(account, _ACTIVE_INSTRUMENTS_MAPPING)));
    uint256 len = uint256(IStorageDEX(evedex).getStorageSlot(slot));
    uint256[] memory indices = new uint256[](len);
    for (uint256 i; i < len; i++) {
      indices[i] = uint256(IStorageDEX(evedex).getStorageSlot(uint256(keccak256(abi.encode(slot))) + i));
    }
    return indices;
  }

  function getAccountsWithOpenPositionLength() public view returns (uint256) {
    bytes32 data = IStorageDEX(evedex).getStorageSlot(_ACCOUNTS_WITH_OPEN_POSITIONS_SLOT);
    return uint256(data);
  }

  function getAccountWithOpenPositionsAt(uint256 index) public view returns (address) {
    if (index >= getAccountsWithOpenPositionLength()) return address(0);
    uint256 slot = uint256(keccak256(abi.encode(_ACCOUNTS_WITH_OPEN_POSITIONS_SLOT))) + index;
    bytes32 data = IStorageDEX(evedex).getStorageSlot(slot);
    return address(uint160(uint256(data)));
  }

  function getAccountsWithOpenPositions(uint256 offset, uint256 limit) external view returns (address[] memory res) {
    uint256 len = getAccountsWithOpenPositionLength();
    if (offset >= len) return res;
    uint256 size = len - offset < limit ? len - offset : limit;
    res = new address[](size);
    for (uint256 i = offset; i < offset + size; i++) {
      res[i] = getAccountWithOpenPositionsAt(i);
    }
  }

  function getOpenPositions(uint256 offset, uint256 limit) external view returns (AccountPositions[] memory positions) {
    uint256 len = getAccountsWithOpenPositionLength();
    if (offset >= len) return (positions);
    uint256 size = len - offset < limit ? len - offset : limit;
    positions = new AccountPositions[](size);
    for (uint256 i = offset; i < offset + size; i++) {
      address account = getAccountWithOpenPositionsAt(i);
      uint256[] memory indices = getActiveInstrumentsIndices(account);
      uint256 indexLen = indices.length;
      positions[i].positions = new PositionInfo[](indexLen);
      for (uint256 j = 0; j < indexLen; ++j) {
        positions[i].positions[j] = getPositionInfo(indices[j], account);
      }
      positions[i].account = account;
    }
  }

  function getOrderHash(Order calldata order) external pure returns (bytes32) {
    return OrderValidationLib._getOrderHash(order);
  }

  constructor() {
    _disableInitializers();
  }

  function initialize(address evedex_) external initializer {
    evedex = evedex_;
  }

  function _authorizeUpgrade(address /*newImplementation*/) internal view override {
    if (!IAccessControl(evedex).hasRole(0x00, msg.sender))
      revert IAccessControl.AccessControlUnauthorizedAccount(msg.sender, 0x00);
  }
}
