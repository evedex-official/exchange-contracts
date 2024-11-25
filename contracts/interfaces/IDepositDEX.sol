// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {OrderValidationLib, OrderWithdrawal, PriceData} from "../lib/OrderValidationLib.sol";
import {ISessionManager} from "./ISessionManager.sol";
import {IEveDEX} from "./IEveDEX.sol";
import {IStorageDEX} from "./IStorageDEX.sol";
import {IVault} from "./IVault.sol";

struct WithdrawRequest {
  uint64 timestamp;
  RequestStatus status;
}

enum RequestStatus {
  NotCreated,
  Open,
  Cancelled,
  Completed
}

interface IDepositDEX {
  error InvalidSession();
  error InvalidWithdrawOrderStatus(uint8);
  error WithdrawMoreThanBalance();
  error SelfWithdrawIsNotReady();
  error InvalidFRTimestamp();
  error UnauthorizedAccount(address);
  error InsufficientMargin();
  error ArrayLengthError();
  error UnsupportedCollateral();
  error IncompletePrices(uint256 a, uint256 b);

  event WithdrawRequestRegistered(address indexed account, OrderWithdrawal order);

  event WithdrawRequestStatusUpdated(bytes32 indexed request, uint8 status);

  event DepositBalanceChanged(address indexed account, address indexed collateral, int112 amount, int112 finalBalance);

  event BasicParamsUpdate(address baseDex, address vault);

  event CollateralListUpdate(address indexed collateral, bool status);

  function setBalance(address account, address collateral, int112 balance) external;

  function getBalance(address account, address collateral, uint256 price) external view returns (int112 balance);

  function getTotalBalance(address account, PriceData[] memory prices) external view returns (int112 balance);
}
