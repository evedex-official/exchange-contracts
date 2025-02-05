// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Order, OrderWithdrawal} from "../lib/OrderValidationLib.sol";
import "../interfaces/ISessionManager.sol";

contract SessionManager is ISessionManager, AccessControlEnumerable {
  using EnumerableSet for EnumerableSet.AddressSet;
  using EnumerableMap for EnumerableMap.AddressToUintMap;

  bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR");

  mapping(address user => EnumerableSet.AddressSet userSessions) internal _sessions;
  mapping(address session => SessionData data) internal _sessionData;

  constructor(address admin_) {
    admin_ = admin_ == address(0) ? msg.sender : admin_;
    _grantRole(DEFAULT_ADMIN_ROLE, admin_);
  }

  /// @inheritdoc ISessionManager
  function getSessions(address user) external view returns (address[] memory) {
    return _sessions[user].values();
  }

  /// @inheritdoc ISessionManager
  function getSessionsAt(address user, uint256 index) external view returns (address) {
    return _sessions[user].at(index);
  }

  /// @inheritdoc ISessionManager
  function getSessionsLength(address user) external view returns (uint256) {
    return _sessions[user].length();
  }

  /// @inheritdoc ISessionManager
  function getSessionData(address session) external view returns (SessionValue memory) {
    return _sessionData[session].values;
  }

  /// @inheritdoc ISessionManager
  function getSessionWithdrawLength(address session) external view returns (uint256) {
    return _sessionData[session].withdrawalsAllowed.length();
  }

  /// @inheritdoc ISessionManager
  function getSessionWithdrawKeys(address session) external view returns (address[] memory) {
    return _sessionData[session].withdrawalsAllowed.keys();
  }

  /// @inheritdoc ISessionManager
  function getSessionWithdrawValues(address session, address[] memory keys) external view returns (uint256[] memory) {
    uint256 length = keys.length;
    uint256[] memory values = new uint256[](length);
    for (uint256 i; i < length; i++) {
      address key = keys[i];
      (, uint256 value) = _sessionData[session].withdrawalsAllowed.tryGet(key);
      values[i] = value;
    }
    return values;
  }

  /// @inheritdoc ISessionManager
  function setSession(address session, SessionValue calldata data, SessionWithdraw[] memory config) external {
    address user = _msgSender();
    if (data.user != user) revert InvalidSessionUser();
    address currentOwner = _sessionData[session].values.user;
    if (currentOwner != address(0) && currentOwner != user) revert InvalidSessionUser();
    _sessions[user].add(session);
    _updateSessionData(session, data);
    _updateSessionWithdraw(session, config);
  }

  /// @inheritdoc ISessionManager
  function removeSession(address session) external {
    address user = _msgSender() == session ? _sessionData[session].values.user : _msgSender();
    if (!_sessions[user].remove(session)) revert SessionNotFound();
    SessionValue memory data;
    _updateSessionData(session, data);
    _clearSessionWithdraw(session);
  }

  /// @inheritdoc ISessionManager
  function removeAllSessions() external {
    address user = _msgSender();
    address[] memory sessions = _sessions[user].values();
    SessionValue memory data;
    for (uint256 i; i < sessions.length; i++) {
      address session = sessions[i];
      _sessions[user].remove(session);
      _updateSessionData(session, data);
    }
  }

  function _updateSessionData(address _session, SessionValue memory _data) internal {
    _sessionData[_session].values = _data;

    emit SessionDataUpdated(_data.user, _session, _data);
  }

  function _updateSessionWithdraw(address _session, SessionWithdraw[] memory _data) internal {
    uint256 length = _data.length;
    for (uint256 i; i < length; i++) {
      _sessionData[_session].withdrawalsAllowed.set(_data[i].collateral, _data[i].amount);
    }

    emit SessionWithdrawUpdated(_session, _data);
  }

  function _clearSessionWithdraw(address _session) internal {
    address[] memory keys = _sessionData[_session].withdrawalsAllowed.keys();
    uint256 length = keys.length;
    for (uint256 i; i < length; i++) {
      address key = keys[i];
      _sessionData[_session].withdrawalsAllowed.remove(key);
    }

    emit SessionDataCleared(_session);
  }

  /// @inheritdoc ISessionManager
  function validateUserOrder(Order calldata order) external onlyRole(VALIDATOR_ROLE) returns (address) {
    address user = order.senderAddress;
    address session = order.userSession;

    if (session == address(0)) revert ZeroAddress();

    _checkOwnership(order.senderAddress, session);
    _checkAllowance(order, session);
    _checkTimestamp(order.creationTime, session);
    _checkTotalOrders(order, session);

    emit SessionDataUpdated(user, session, _sessionData[session].values);
    return session;
  }

  /// @inheritdoc ISessionManager
  function validateWithdrawalOrder(OrderWithdrawal calldata order) external onlyRole(VALIDATOR_ROLE) returns (address) {
    address user = order.account;
    address session = order.session;
    if (session == address(0)) revert ZeroAddress();

    _checkOwnership(order.account, session);
    _checkWithdrawals(order, session);
    _checkTimestamp(order.expiration, session);

    emit SessionDataUpdated(user, session, _sessionData[session].values);
    return session;
  }

  /// @inheritdoc ISessionManager
  function validateWithdrawalOrderView(OrderWithdrawal calldata order) external view returns (address) {
    address session = order.session;
    if (session == address(0)) revert ZeroAddress();

    _checkOwnership(order.account, session);
    _checkWithdrawalsView(order, session);
    _checkTimestamp(order.expiration, session);

    return session;
  }

  function _checkOwnership(address account, address session) internal view {
    if (!_sessions[account].contains(session)) revert SessionNotFound();
  }

  function _checkTimestamp(uint256 orderCreation, address session) internal view {
    SessionValue storage data = _sessionData[session].values;
    uint256 expiration = data.expiration;
    if (expiration > 0 && orderCreation > expiration) revert SessionExpired();
  }

  function _checkAllowance(Order calldata order, address session) internal {
    SessionValue storage data = _sessionData[session].values;
    if (data.limitAllowance) {
      uint256 allowance = data.allowanceAllowed;
      if (allowance < order.amount) revert SessionAllowanceExceeded();
      unchecked {
        data.allowanceAllowed = uint128(allowance - order.amount);
      }
    }
  }

  function _checkTotalOrders(Order calldata /*order*/, address session) internal {
    SessionValue storage data = _sessionData[session].values;
    if (data.limitMaxOrders) {
      uint32 totalOrders = data.ordersAllowed;
      if (totalOrders == 0) revert SessionMaxOrdersSettled();
      unchecked {
        data.ordersAllowed = totalOrders - 1;
      }
    }
  }

  function _checkWithdrawals(OrderWithdrawal calldata order, address session) internal {
    SessionData storage data = _sessionData[session];
    if (data.values.limitWithdrawals) {
      uint256 allowed = data.withdrawalsAllowed.get(order.collateral);
      if (allowed < order.amount) revert SessionWithdrawalsExceeded();
      unchecked {
        uint256 newAmount = allowed - order.amount;
        data.withdrawalsAllowed.set(order.collateral, newAmount);
        SessionWithdraw[] memory configs = new SessionWithdraw[](1);
        configs[0] = SessionWithdraw({collateral: order.collateral, amount: newAmount});
        emit SessionWithdrawUpdated(session, configs);
      }
    }
  }

  function _checkWithdrawalsView(OrderWithdrawal calldata order, address session) internal view {
    SessionData storage data = _sessionData[session];
    (, uint256 allowed) = data.withdrawalsAllowed.tryGet(order.collateral);
    if (data.values.limitWithdrawals && allowed < order.amount) {
      revert SessionWithdrawalsExceeded();
    }
  }
}
