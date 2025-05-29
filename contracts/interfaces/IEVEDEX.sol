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
  int80 positionAvgPrice; // Average position price with 10**8 precision
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
  uint256 price;
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
    int256 balance,
    PositionInfo position,
    int256 realizedPNL,
    int256 realizedFR
  );

  event PositionLiquidated(
    address indexed account,
    uint256 liquidatedInstrument,
    uint256 liquidationFee,
    int256 balance,
    int256 realizedPNL,
    int256 realizedFR
  );

  event NewTrade(
    uint256 indexed index,
    address indexed buyer,
    address indexed seller,
    uint256 filledPrice,
    uint256 filledAmount
  );

  event FrCollected(
    uint256 indexed index,
    address indexed account,
    address collateral,
    int256 accountNewBalance,
    int256 staticCollateralFee
  );

  event OrderSettled(
    bytes32 settlementId,
    uint256 indexed orderId,
    uint256 indexed matchedOrderId,
    bool settledBothSides
  );

  error InvalidSession();
  error ZeroPositionLiquidation();
  error InsufficientMargin();
  error SufficientMargin();
  error IncorrectInstrumentIndexes();
  error MaxOpenPositionsExceeded();
  error PriceOfLiquidatedInstrumentNotFirst();
  error OrderIsAlreadyFilled();
  error PriceArrayLengthError();
  error UnprofitableTrade();
  error SettlementMismatch();

  function getActiveInstrumentsIndexes(address account) external view returns (uint256[] memory);

  function getActiveInstrumentsPositions(
    address account
  ) external view returns (uint256[] memory indexes, PositionInfo[] memory positions);

  function getTotalFR(
    uint256 index,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external view returns (int72 longFR, int72 shortFR);

  function getAccountFR(
    address account,
    uint256 index,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external view returns (int256, int256);

  function getPNL(address account, uint256 index, int256 price) external view returns (int256);

  function getAccountsWithOpenPositionLength() external view returns (uint256);

  function getAccountsWithOpenPositions(uint256 offset, uint256 limit) external view returns (address[] memory res);

  function getOpenPositions(uint256 offset, uint256 limit) external view returns (AccountPositions[] memory positions);

  function checkMarginWithPrices(
    address account,
    int256 marginLevel,
    FullPrices calldata fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external view returns (bool, int256);

  function calculateMarginLevel(
    address account,
    PriceData[] memory prices,
    CollateralPriceData[] memory collateralPrices,
    bool checkPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external view returns (int256 marginLevel, int256 equity, int256 margin, int256[] memory pnls, int256[] memory frs);

  function liquidatePositions(
    MultiOrderLiquidation memory liquidationOrder,
    FullPrices calldata fullPrices,
    LiquidationCollaterals calldata collateralIndices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external;

  function adlLiquidation(
    AdlOrderLiquidation memory liquidationOrder,
    FullPrices calldata fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external;

  function fillOrder(
    OrderExtended memory buyOrder,
    OrderExtended memory sellOrder,
    uint256 filledPrice,
    uint256 filledAmount,
    FullPrices calldata fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external;

  function collectFr(
    address account,
    FullPrices calldata fullPrices,
    uint256 collateralIndex,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external;
}
