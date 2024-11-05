// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {IVault} from "../interfaces/IVault.sol";

contract EveVault is IVault, AccessControlEnumerable, Pausable, ReentrancyGuard {
  using SafeERC20 for IERC20;
  using Address for address payable;

  /// @notice Substitute address for native EVM coins
  address public constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  bytes32 public constant WITHDRAWER_ROLE = keccak256("WITHDRAWER_ROLE");
  bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

  constructor(address initialOwner) {
    _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
    _grantRole(PAUSER_ROLE, initialOwner);
  }

  /// @inheritdoc IVault
  function withdrawAuthorized(
    address asset,
    uint256 amount
  ) external onlyRole(WITHDRAWER_ROLE) nonReentrant whenNotPaused {
    address receiver = _msgSender();
    if (asset == ETH_ADDRESS) {
      payable(receiver).sendValue(amount);
    } else {
      IERC20(asset).safeTransfer(receiver, amount);
    }

    emit AuthorizedWithdraw(receiver, asset, amount);
  }

  /// @inheritdoc IVault
  function pause() external onlyRole(PAUSER_ROLE) {
    _pause();
  }

  /// @inheritdoc IVault
  function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
    _unpause();
  }

  receive() external payable {}
}
