// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {OrderValidationLib, OrderWithdrawal, PriceData} from "../lib/OrderValidationLib.sol";
import {ISessionManager} from "./ISessionManager.sol";
import {IEVEDEX, FullPrices, CollateralPriceData} from "./IEVEDEX.sol";
import {IStorageDEX} from "./IStorageDEX.sol";
import {IPriceOracle} from "./IPriceOracle.sol";
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
  error IncompletePrices();
  error InvalidPrice(address);
  error InvalidPrices();
  error InvalidSlippage();

  event WithdrawRequestRegistered(address indexed account, OrderWithdrawal order);

  event WithdrawRequestStatusUpdated(bytes32 indexed request, uint8 status);

  event DepositBalanceChanged(address indexed account, address indexed collateral, int112 amount, int112 finalBalance);

  event BasicParamsUpdate(address baseDex, address vault, address oracle, uint256 allowedSlippage);

  event CollateralListUpdate(address indexed collateral, bool status);

  event ForcedSwap(
    address indexed account,
    address collateralFrom,
    address collateralTo,
    uint256 amount,
    uint256 priceFrom,
    uint256 priceTo
  );

  function WITHDRAW_GUARDIAN_ROLE() external view returns (bytes32);

  function CONVERTER_ROLE() external view returns (bytes32);

  function MATCHER_ROLE() external view returns (bytes32);

  function baseDex() external view returns (address);

  function vault() external view returns (address);

  function oracle() external view returns (address);

  function allowedSlippage() external view returns (uint256);

  function getCollaterals() external view returns (address[] memory);

  function getCollateralsAt(uint256 index) external view returns (address);

  function getCollateralsLength() external view returns (uint256);

  function getWithdrawRequest(bytes32 orderHash) external view returns (WithdrawRequest memory);

  function getWithdrawOrderHash(OrderWithdrawal calldata order) external pure returns (bytes32);

  function depositCollateral(address collateral, uint112 amount) external;

  function depositCollateralTo(address collateral, uint112 amount, address to) external;

  function withdrawRequest(OrderWithdrawal calldata order) external;

  function withdrawRequestCancel(OrderWithdrawal calldata order) external;

  function withdrawComplete(
    OrderWithdrawal calldata order,
    FullPrices calldata fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external;

  function convertBalance(
    address account,
    uint256 amount,
    address collateralFrom,
    address collateralTo,
    CollateralPriceData calldata priceFrom,
    CollateralPriceData calldata priceTo
  ) external;

  function setBalance(address account, address collateral, int256 balance) external;

  function getBalance(address account, address collateral) external view returns (int256 balance);

  function getTotalBalance(address account, CollateralPriceData[] memory prices) external view returns (int112 balance);

  function setBasicParams(address baseDex_, address vault_, address oracle_, uint256 allowedSlippage_) external;

  function setCollateralConfigs(address[] calldata collaterals_, bool[] calldata statuses_) external;
}
