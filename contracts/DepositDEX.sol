// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./interfaces/IDepositDEX.sol";

contract DepositDEX is IDepositDEX, UUPSUpgradeable {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.AddressSet;

  uint256 internal constant _WITHDRAW_DELAY = 7 days;
  bytes32 internal constant _WITHDRAW_GUARDIAN_ROLE = keccak256("WITHDRAW_GUARDIAN_ROLE");
  bytes32 internal constant _MATCHER_ROLE = keccak256("MATCHER_ROLE");
  bytes32 internal constant _DEFAULT_ADMIN_ROLE = 0x00;
  int112 internal constant _INT_PRECISION = 1e8;
  address internal constant _NATIVE_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  address public baseDex;
  address public vault;

  EnumerableSet.AddressSet internal _collaterals;

  mapping(bytes32 requestHashed => WithdrawRequest requestStatus) internal _withdrawRequests;
  mapping(address account => mapping(address collateral => int112 balance)) internal _balances;

  uint256[49] private __gap;

  constructor() {
    _disableInitializers();
  }

  function initialize(address baseDex_, address vault_) external initializer {
    _setBasicParams(baseDex_, vault_);
  }

  function getWithdrawRequest(bytes32 orderHash) external view returns (WithdrawRequest memory) {
    return _withdrawRequests[orderHash];
  }

  function depositCollateral(address collateral, uint112 amount) external {
    depositCollateralTo(collateral, amount, msg.sender);
  }

  function depositCollateralTo(address collateral, uint112 amount, address to) public {
    if (!_collaterals.contains(collateral)) revert UnsupportedCollateral();
    IERC20(collateral).safeTransferFrom(msg.sender, vault, amount);
    int112 balance = _balances[to][collateral] + int112(amount);

    _balances[to][collateral] = balance;

    emit DepositBalanceChanged(to, collateral, int112(amount), balance);
  }

  function withdrawRequest(OrderWithdrawal calldata order) external {
    _checkWithdrawOrderView(order);
    _registerWithdrawRequest(order);
  }

  function _checkWithdrawOrder(OrderWithdrawal calldata _order) internal {
    address withdrawalOrderSigner = _order.account;
    if (_order.session != address(0)) {
      withdrawalOrderSigner = _validateWithdrawalOrder(_order);
      if (withdrawalOrderSigner == address(0)) revert InvalidSession();
    }
    OrderValidationLib.checkWithdrawalOrder(_order, withdrawalOrderSigner);
  }

  function _checkWithdrawOrderView(OrderWithdrawal calldata _order) internal view {
    address withdrawalOrderSigner = _order.account;
    if (_order.session != address(0)) {
      withdrawalOrderSigner = _validateWithdrawalOrderView(_order);
      if (withdrawalOrderSigner == address(0)) revert InvalidSession();
    }
    OrderValidationLib.checkWithdrawalOrder(_order, withdrawalOrderSigner);
  }

  function _validateWithdrawalOrder(OrderWithdrawal calldata _order) internal returns (address) {
    return ISessionManager(IStorageDEX(baseDex).sessionManager()).validateWithdrawalOrder(_order);
  }

  function _validateWithdrawalOrderView(OrderWithdrawal calldata _order) internal view returns (address) {
    return ISessionManager(IStorageDEX(baseDex).sessionManager()).validateWithdrawalOrderView(_order);
  }

  function _registerWithdrawRequest(OrderWithdrawal calldata _order) internal {
    bytes32 orderHash = getWithdrawOrderHash(_order);

    if (_withdrawRequests[orderHash].status != RequestStatus.NotCreated)
      revert InvalidWithdrawOrderStatus(uint8(RequestStatus.NotCreated));

    _withdrawRequests[orderHash].timestamp = uint64(block.timestamp);
    _requestStatusChange(orderHash, RequestStatus.Open);

    emit WithdrawRequestRegistered(_order.account, _order);
  }

  function _requestStatusChange(bytes32 _orderHash, RequestStatus _status) internal {
    _withdrawRequests[_orderHash].status = _status;
    emit WithdrawRequestStatusUpdated(_orderHash, uint8(_status));
  }

  function getWithdrawOrderHash(OrderWithdrawal calldata order) public pure returns (bytes32) {
    return keccak256(abi.encode(order));
  }

  function withdrawRequestCancel(OrderWithdrawal calldata order) external {
    address sender = msg.sender;
    if (!(sender == order.account || _hasRole(_WITHDRAW_GUARDIAN_ROLE, sender))) revert UnauthorizedAccount(sender);

    bytes32 orderHash = getWithdrawOrderHash(order);
    if (_withdrawRequests[orderHash].status != RequestStatus.Open)
      revert InvalidWithdrawOrderStatus(uint8(RequestStatus.Open));

    _requestStatusChange(orderHash, RequestStatus.Cancelled);
  }

  // function withdrawComplete(OrderWithdrawal calldata order) external {
  //   _checkWithdrawOrder(order);

  //   bytes32 orderHash = getWithdrawOrderHash(order);
  //   if (_withdrawRequests[orderHash].timestamp + _WITHDRAW_DELAY < block.timestamp) revert SelfWithdrawIsNotReady();

  //   _requestStatusChange(orderHash, RequestStatus.Completed);
  //   _withdrawCollateralTo(order.collateral, uint112(order.amount), order.account, order.account, new uint112[](0), 0, 0);
  // }

  function withdrawComplete(
    OrderWithdrawal calldata order,
    uint112[] memory fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external onlyRole(_MATCHER_ROLE) {
    _checkWithdrawOrder(order);
    bytes32 orderHash = getWithdrawOrderHash(order);
    _requestStatusChange(orderHash, RequestStatus.Completed);
    _withdrawCollateralTo(
      order.collateral,
      uint112(order.amount),
      order.account,
      order.account,
      fullPrices,
      historyTimestamp,
      historySearchHint
    );
  }

  error Debug(uint256 a);
  function _withdrawCollateralTo(
    address collateral,
    uint112 amount,
    address from,
    address to,
    uint112[] memory fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) internal {
    int112 balance = _balances[from][collateral];
    if (int112(amount) > balance) revert WithdrawMoreThanBalance();
    balance -= int112(amount);
    _balances[from][collateral] = balance;

    (bool validMargin, ) = IEveDEX(baseDex).checkMarginWithPrices(
      from,
      IStorageDEX(baseDex).withdrawMarginLevel(),
      fullPrices,
      historyTimestamp,
      historySearchHint
    );
    if (!validMargin) revert InsufficientMargin();

    IVault(vault).withdrawAuthorized(collateral, amount);
    IERC20(collateral).safeTransfer(to, amount);
    emit DepositBalanceChanged(msg.sender, collateral, -int112(amount), balance);
  }

  function getBalance(address account, address collateral, uint256 price) public view returns (int112 balance) {
    balance = (_balances[account][collateral] * int112(int256(price))) / _INT_PRECISION;
  }

  function getTotalBalance(address account, PriceData[] memory prices) public view returns (int112 balance) {
    uint256 len = prices.length;
    if (len != _collaterals.length()) revert IncompletePrices(len, _collaterals.length());
    for (uint256 i; i < len; i++) {
      address collateral = _collaterals.at(i);
      balance += (_balances[account][collateral] * int112(int256(prices[i].price))) / _INT_PRECISION;
    }
  }

  function setBalance(address account_, address collateral_, int112 balance_) external onlyBaseDex {
    _balances[account_][collateral_] = balance_;
  }

  function setBasicParams(address baseDex_, address vault_) external onlyRole(_DEFAULT_ADMIN_ROLE) {
    _setBasicParams(baseDex_, vault_);
  }

  function setCollateralConfigs(
    address[] calldata collaterals_,
    bool[] calldata statuses_
  ) external onlyRole(_DEFAULT_ADMIN_ROLE) {
    uint256 len = collaterals_.length;
    if (len != statuses_.length) revert ArrayLengthError();

    for (uint256 i; i < len; i++) {
      address collateral = collaterals_[i];
      if (statuses_[i]) {
        if (_collaterals.add(collateral)) emit CollateralListUpdate(collateral, true);
      } else {
        if (_collaterals.remove(collateral)) emit CollateralListUpdate(collateral, false);
      }
    }
  }

  function _setBasicParams(address baseDex_, address vault_) internal {
    vault = vault_;
    baseDex = baseDex_;
    emit BasicParamsUpdate(baseDex_, vault_);
  }

  function _hasRole(bytes32 role_, address account_) internal view returns (bool) {
    return IAccessControl(baseDex).hasRole(role_, account_);
  }

  modifier onlyRole(bytes32 role_) {
    if (!_hasRole(role_, msg.sender)) revert UnauthorizedAccount(msg.sender);
    _;
  }

  modifier onlyBaseDex() {
    if (msg.sender != baseDex) revert UnauthorizedAccount(msg.sender);
    _;
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyRole(_DEFAULT_ADMIN_ROLE) {}

  function collateralLength() public view returns (uint256) {
    return _collaterals.length();
  }
}
