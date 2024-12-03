// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "../lib/OrderValidationLib.sol";
import {ISessionManager} from "./ISessionManager.sol";
import {IDepositDEX} from "./IDepositDEX.sol";

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

  error InvalidSession();
  error ZeroPositionLiquidation();
  error InsufficientMargin();
  error SufficientMargin();
  error IncorrectInstrumentIndexes();
  error MaxOpenPositionsExceeded();
  error PriceOfLiquidatedInstrumentNotFirst();
  error OrderIsAlreadyFilled();
  error PriceArrayLengthError();

  function checkMarginWithPrices(
    address account,
    int112 marginLevel,
    FullPrices calldata fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external view returns (bool, int112);
}
