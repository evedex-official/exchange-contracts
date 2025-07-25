// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Order, WithdrawalOrder} from "../lib/OrderValidationLib.sol";
import {EnumerableMap} from "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";

interface ISessionManager {
  struct SessionData {
    SessionValue values;
    EnumerableMap.AddressToUintMap withdrawalsAllowed; // Limit for withdrawals in asset
  }

  struct SessionValue {
    address user; // Session's owner
    uint64 expiration; // Expiration timestamp
    uint32 ordersAllowed; // Number of allowed orders, decreases with each order
    bool limitAllowance; // Flag to enable check of total trading allowance
    bool limitMaxOrders; // Flag to enable check of allowed order number
    bool limitWithdrawals; // Flag to enable check of allowed withdrawals
    uint128 allowanceAllowed; // Limit for total amount of trading, decreases within check
  }

  struct SessionWithdraw {
    address collateral; // Collateral address
    uint256 amount; // Withdrawable amount of collateral
  }

  /**
   * @notice Returns all stored sessions of the user, including expired ones
   * @dev This function can consume unlimited amount of gas
   * @param user Address of the user to search sessions for
   * @return Array of session addresses of the user
   */
  function getSessions(address user) external view returns (address[] memory);

  /**
   * @notice Returns user's session stored at given index in the list
   * @dev Upper limit of the indices can be obtained with `getSessionsLength`
   * @param user Address of the user to search session for
   * @param index Index of the list to check, must be strictly less than list length
   * @return Address of the session at the index position in the list
   */
  function getSessionsAt(address user, uint256 index) external view returns (address);

  /**
   * @notice Returns the session list length for given user
   * @dev This function can be used to check safe limit for the `getSessionsAt`
   * @param user Address of the user to search for
   * @return The length of the user's session list
   */
  function getSessionsLength(address user) external view returns (uint256);

  /**
   * @notice Returns the stored session data
   * @dev Returns zeroes regardless the session status in the `getSessions` list
   * @param session Address of the user's session to search for
   * @return The SessionValue struct from the storage
   */
  function getSessionData(address session) external view returns (SessionValue memory);

  /**
   * @notice Returns length of the session's list of collaterals allowed to withdraw
   * @param session Address of the user's session to search for
   * @return The length of collaterals list
   */
  function getSessionWithdrawLength(address session) external view returns (uint256);

  /**
   * @notice Returns the session's list of collaterals allowed to withdraw
   * @param session Address of the user's session to search for
   * @return Array of collateral addresses
   */
  function getSessionWithdrawKeys(address session) external view returns (address[] memory);

  /**
   * @notice Returns the session's list of withdraw allowances for given collaterals
   * @param session Address of the user's session to search for
   * @param keys Array of collateral addresses to check withdraw allowance
   * @return Array of withdraw allowances fro given list of collaterals
   */
  function getSessionWithdrawValues(address session, address[] memory keys) external view returns (uint256[] memory);

  /**
   * @notice Function to add or update session's parameters
   * @dev Emits `SessionDataUpdated` on success
   * @param session Address of the session to update data for
   * @param data New data for the session
   * @param config New withdraw configs
   */
  function setSession(address session, SessionValue calldata data, SessionWithdraw[] memory config) external;

  /**
   * @notice Removes data for selected user's session
   * @dev This function reverts if the given session address is not found in the user's list of sessions
   * @param session Address of the session to remove
   */
  function removeSession(address session) external;

  /**
   * @notice Removes all user's stored sessions
   * @dev This function can consume unlimited amount of gas
   */
  function removeAllSessions() external;

  /**
   * @notice Restricted function to check order's parameters and update user's session data
   * @dev Caller must be authorized by having the VALIDATOR_ROLE role
   * @dev Emits `SessionDataUpdated` on success
   * @param order Order struct to check data for
   * @return Address of the user's session that has been used
   */
  function validateUserOrder(Order calldata order) external returns (address);

  /**
   * @notice Restricted function to check withdraw order's parameters and update user's session data
   * @dev Caller must be authorized by having the VALIDATOR_ROLE role
   * @dev Emits `SessionDataUpdated` on success
   * @param order WithdrawalOrder struct to check data for
   * @return Address of the user's session that has been used
   */
  function validateWithdrawalOrder(WithdrawalOrder calldata order) external returns (address);

  /**
   * @notice View function to check withdraw order from session without spending its limits
   * @dev Reverts on failures
   * @param order WithdrawalOrder struct to check data for
   * @return Address of the user's session that has been used
   */
  function validateWithdrawalOrderView(WithdrawalOrder calldata order) external view returns (address);

  /**
   * @dev Event to be emitted on session data update
   * @param user Address of the user to update session for
   * @param session Address of the session to update data for
   * @param data New data stored
   */
  event SessionDataUpdated(address indexed user, address indexed session, SessionValue data);

  /**
   * @dev Event to be emitted on session data being full erased
   * @param session Address of the session to update data for
   */
  event SessionDataCleared(address indexed session);

  /**
   * @dev Event to be emitted on session withdraw mapping update
   * @param session Address of the session to update data for
   * @param configs Collateral addresses and allowed amounts
   */
  event SessionWithdrawUpdated(address indexed session, SessionWithdraw[] configs);

  /**
   * @notice Error to indicate mismatch of new session data and session's user
   * @dev Check `user` of updating data
   */
  error InvalidSessionUser();

  /**
   * @notice Error to revert before math underflow
   * @dev Check user's session allowance
   */
  error SessionAllowanceExceeded();

  /**
   * @notice Error to indicate session is not valid due to expiration is set and met
   * @dev Check user's session expiration date
   */
  error SessionExpired();

  /**
   * @notice Error to indicate that given session is not in the user's list
   * @dev Check user's sessions list
   */
  error SessionNotFound();

  /**
   * @notice Error to indicate that session has reached its limit in total orders
   * @dev Check user's sessions for `limitMaxOrders` and `ordersAllowed`
   */
  error SessionMaxOrdersSettled();

  /**
   * @notice Error to revert before math underflow
   * @dev Check user's session withdrawable amount
   */
  error SessionWithdrawalsExceeded();

  /**
   * @notice Error to deny zer address in input
   * @dev Check input parameters
   */
  error ZeroAddress();
}
