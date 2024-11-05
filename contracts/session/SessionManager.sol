// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Order, OrderWithdrawal} from "../lib/OrderValidationLib.sol";
import {ISessionManager} from "../interfaces/ISessionManager.sol";

contract SessionManager is ISessionManager, AccessControlEnumerable {
  using EnumerableSet for EnumerableSet.AddressSet;

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
  function getSessionData(address session) external view returns (SessionData memory) {
    return _sessionData[session];
  }

  /// @inheritdoc ISessionManager
  function setSession(address session, SessionData memory data) external {
    address user = _msgSender();
    if (data.user != user) revert InvalidSessionUser();
    _sessions[user].add(session);
    _updateSessionData(session, data);
  }

  /// @inheritdoc ISessionManager
  function removeSession(address session) external {
    address user = _msgSender() == session ? _sessionData[session].user : _msgSender();
    if (!_sessions[user].remove(session)) revert SessionNotFound();
    SessionData memory data;
    _updateSessionData(session, data);
  }

  /// @inheritdoc ISessionManager
  function removeAllSessions() external {
    address user = _msgSender();
    address[] memory sessions = _sessions[user].values();
    SessionData memory data;
    for (uint256 i; i < sessions.length; i++) {
      address session = sessions[i];
      _sessions[user].remove(session);
      _updateSessionData(session, data);
    }
  }

  function _updateSessionData(address _session, SessionData memory _data) internal {
    _sessionData[_session] = _data;

    emit SessionDataUpdated(_data.user, _session, _data);
  }

  /// @inheritdoc ISessionManager
  function validateUserOrder(Order calldata order) external onlyRole(VALIDATOR_ROLE) returns (address) {
    address user = order.senderAddress;
    address session = order.userSession;

    if (session == address(0)) revert ZeroAddress();

    _checkOwnership(order.senderAddress, session);
    _checkAllowance(order, session);
    _checkTimestamp(order.expiration, session);
    _checkTotalOrders(order, session);

    emit SessionDataUpdated(user, session, _sessionData[session]);
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

    emit SessionDataUpdated(user, session, _sessionData[session]);
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

  function _checkTimestamp(uint256 orderExpiration, address session) internal view {
    SessionData storage data = _sessionData[session];
    uint256 expiration = data.expiration;
    if (expiration > 0 && orderExpiration > expiration) revert SessionExpired();
  }

  function _checkAllowance(Order calldata order, address session) internal {
    SessionData storage data = _sessionData[session];
    if (data.limitAllowance) {
      uint256 allowance = data.allowanceAllowed;
      if (allowance < order.amount) revert SessionAllowanceExceeded();
      unchecked {
        data.allowanceAllowed = uint128(allowance - order.amount);
      }
    }
  }

  function _checkTotalOrders(Order calldata /*order*/, address session) internal {
    SessionData storage data = _sessionData[session];
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
    if (data.limitWithdrawals) {
      uint256 withdrawalsAllowed = data.withdrawalsAllowed;
      if (withdrawalsAllowed < order.amount) revert SessionWithdrawalsExceeded();
      unchecked {
        data.withdrawalsAllowed = uint128(withdrawalsAllowed - order.amount);
      }
    }
  }

  function _checkWithdrawalsView(OrderWithdrawal calldata order, address session) internal view {
    SessionData storage data = _sessionData[session];
    if (data.limitWithdrawals && data.withdrawalsAllowed < order.amount) {
      revert SessionWithdrawalsExceeded();
    }
  }
}
