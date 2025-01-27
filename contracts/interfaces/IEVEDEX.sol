// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "../lib/OrderValidationLib.sol";
import {IDepositDEX} from "./IDepositDEX.sol";
import {IMarginCalc} from "./IMarginCalc.sol";
import {ISessionManager} from "./ISessionManager.sol";

struct PositionInfo {
  int112 position; // Signed position size (10^8 = 1 collateral token). position < 0 - short, position > 0 long
  int112 frAccumulated; // Accumulated funding rate from position start till positionLastUpdate
  uint32 positionLastUpdate; // Last time position was updated
  uint80 positionAvgPrice; // Average position price with 10**8 precision
  int72 positionLongFRStored; // longFRStored at positionLastUpdate
  int72 positionShortFRStored; // shortFRStored at positionLastUpdate
  uint16 leverage;
}

struct AccountPositions {
  address account;
  PositionInfo[] positions;
}

struct CollateralPriceData {
  address collateral;
  uint112 price;
}

struct FullPrices {
  PriceData[] instrumentPrices;
  CollateralPriceData[] collateralPrices;
}

struct OrderExtended {
  uint256 collateralIndex;
  Order order;
}

struct LiquidationCollaterals {
  uint256 liquidatorIndex;
  uint256[] indicesToLiquidate;
}

interface IEVEDEX {
  event PositionUpdate(
    uint256 indexed index,
    address indexed account,
    int112 balance,
    PositionInfo position,
    int112 realizedPNL,
    int112 realizedFR
  );

  event PositionLiquidated(
    address indexed account,
    uint256 liquidatedInstrument,
    uint112 liquidationFee,
    int112 balance,
    int112 realizedPNL,
    int112 realizedFR
  );

  event NewTrade(
    uint256 indexed index,
    address indexed buyer,
    address indexed seller,
    uint80 filledPrice,
    uint192 filledAmount
  );

  event FrCollected(uint256 indexed index, address indexed account, uint256 collateralIndex, int112 accountNewBalance);

  error InvalidSession();
  error ZeroPositionLiquidation();
  error InsufficientMargin();
  error SufficientMargin();
  error IncorrectInstrumentIndexes();
  error MaxOpenPositionsExceeded();
  error PriceOfLiquidatedInstrumentNotFirst();
  error OrderIsAlreadyFilled();
  error PriceArrayLengthError();
  error PriceBelowLiquidatorPositionAvgPrice();

  function getActiveInstrumentsIndexes(address account) external view returns (uint256[] memory);

  function getActiveInstrumentsPositions(
    address account
  ) external view returns (uint256[] memory indexes, PositionInfo[] memory positions);

  function getTotalShortFR(
    uint256 index,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external view returns (int72);

  function getTotalLongFR(
    uint256 index,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external view returns (int72);

  function getAccountFR(
    address account,
    uint256 index,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external view returns (int112);

  function getPNL(address account, uint256 index, int112 price) external view returns (int112);

  function getAccountsWithOpenPositionLength() external view returns (uint256);

  function getAccountsWithOpenPositions(uint256 offset, uint256 limit) external view returns (address[] memory res);

  function getOpenPositions(uint256 offset, uint256 limit) external view returns (AccountPositions[] memory positions);

  function checkMarginWithPrices(
    address account,
    int112 marginLevel,
    FullPrices calldata fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external view returns (bool, int112);

  function calculateMarginLevel(
    address account,
    PriceData[] memory prices,
    CollateralPriceData[] memory collateralPrices,
    bool checkPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external view returns (int112 marginLevel, int112 equity, int112 margin, int112[] memory pnls, int112[] memory frs);

  function liquidatePositions(
    MultiOrderLiquidation memory liquidationOrder,
    FullPrices calldata fullPrices,
    LiquidationCollaterals calldata collateralIndices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external;

  function liquidatePosition(
    OrderLiquidation memory liquidationOrder,
    FullPrices calldata fullPrices,
    LiquidationCollaterals calldata collateralIndices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external;

  function fillOrders(
    OrderExtended memory buyOrder,
    OrderExtended memory sellOrder,
    uint80 filledPrice,
    uint96 filledAmount,
    FullPrices calldata fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external;
}
