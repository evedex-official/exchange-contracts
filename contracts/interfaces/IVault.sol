// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

interface IVault {
  /**
   * @notice Restricted function to withdraw any stored assets (IERC20 or native coins)
   * @dev Caller must be authorized
   * @param asset Address of the asset to withdraw, `ETH_ADDRESS` for native
   * @param amount Amount to withdraw without decimals
   */
  function withdrawAuthorized(address asset, uint256 amount) external;

  /**
   * @notice Restricted function to enable pause mode
   * @dev Caller must be in the `pausers` mapping
   * @dev Only the owner can unpause the contract
   */
  function pause() external;

  /**
   * @notice Restricted function to unpause the contract
   * @dev Caller must be the contract's owner
   */
  function unpause() external;

  /**
   * @dev Event to be emitted on successful withdraw
   * @param receiver Address of funds' requester (and receiver)
   * @param asset Address of withdrawn asset
   * @param amount Withdrawn amount
   */
  event AuthorizedWithdraw(address indexed receiver, address asset, uint256 amount);
}
