// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {IDepositDEX} from "./IDepositDEX.sol";
import {IMarginCalc} from "./IMarginCalc.sol";
import {ISessionManager} from "./ISessionManager.sol";
import {IMarkPriceOracle} from "./IMarkPriceOracle.sol";
import "../lib/OrderValidationLib.sol";

struct PositionInfo {
  int112 position; // Signed position size (10^8 = 1 collateral token). position < 0 - short, position > 0 long
  int112 frAccumulated; // Accumulated funding rate from position start till positionLastUpdate
  uint32 positionLastUpdate; // Last time position was updated
  int80 positionAvgPrice; // Average position price with 10**8 precision
  int72 positionLongFRStored; // longFRStored at positionLastUpdate
  int72 positionShortFRStored; // shortFRStored at positionLastUpdate
  uint16 leverage;
}

// struct PriceData {
//   uint256 index;
//   uint256 price;
// }

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
    int256 liquidationFee,
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
  error InsufficientMargin();
  error SufficientMargin();
  error IncorrectInstrumentIndexes();
  error MaxOpenPositionsExceeded();
  error PriceOfLiquidatedInstrumentNotFirst();
  error OrderIsAlreadyFilled();
  error PriceArrayLengthError();
  error SettlementMismatch();
  error IncreasingPositionWithTPSL();
  error RevertingPositionWithTPSL();
  error InvalidLiquidationStatus();
  error ActiveADLLiquidation();
  error MatcherFeeLimitExceeded();
  error ZeroPositionLiquidation();
  error UnprofitableTrade();

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

  function checkMarginWithPrices(
    address account,
    int256 marginLevel,
    FullPrices calldata fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external view returns (bool);

  function calculateMarginLevel(
    address account,
    PriceData[] memory prices,
    CollateralPriceData[] memory collateralPrices,
    bool checkPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  )
    external
    view
    returns (
      int256 marginLevel,
      int256 equity,
      int256 margin,
      int256[] memory margins,
      int256[] memory pnls,
      int256[] memory frs
    );

  function fillOrder(
    OrderExtended calldata buyOrder,
    OrderExtended calldata sellOrder,
    uint256 filledPrice,
    uint256 filledAmount,
    int256 matcherFee,
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
